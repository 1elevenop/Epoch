package app.wake11

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.SystemClock
import android.view.View
import android.widget.RemoteViews
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.ChronoUnit
import java.util.Calendar
import java.util.Locale

/**
 * Home-screen widgets (Phase 6). Plain RemoteViews, no extra library (rule 7). Clocks use
 * TextClock / AnalogClock and timers use Chronometer, so they tick on their own without waking the
 * app. Everything else is redrawn when alarms or timers change, at midnight, and every 30 min.
 * World clocks and countdowns live in the web settings; the web mirrors them here (validated).
 */
object Widgets {
    private const val PREFS = "wake_widgets"
    const val ACTION_NAP = "app.wake11.widget.NAP"
    const val ACTION_MIDNIGHT = "app.wake11.widget.MIDNIGHT"
    const val EXTRA_MIN = "minutes"
    val ROUTES = setOf("clock", "alarm", "timer", "tool-countdowns")
    private val ZONE_IDS: Set<String> by lazy { ZoneId.getAvailableZoneIds() }

    enum class Kind(val cls: Class<*>) {
        DIGITAL(DigitalWidget::class.java), ANALOG(AnalogWidget::class.java), WORLD(WorldWidget::class.java),
        ALARM(AlarmWidget::class.java), TIMER(TimerWidget::class.java), COUNTDOWN(CountdownWidget::class.java),
    }

    private fun prefs(ctx: Context) = ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    // ---------- data mirrored from the web (rule 6: validated here too) ----------

    fun setData(ctx: Context, worldClocks: JSONArray, countdowns: JSONArray, hour12: Boolean? = null) {
        val wc = JSONArray()
        for (i in 0 until minOf(worldClocks.length(), 10)) {
            val c = worldClocks.optJSONObject(i) ?: throw IllegalArgumentException("worldClocks[$i] is not an object")
            val name = c.optString("name").trim()
            val zone = c.optString("zone")
            if (name.isEmpty() || name.length > 80) throw IllegalArgumentException("worldClocks[$i].name")
            if (zone !in ZONE_IDS) throw IllegalArgumentException("worldClocks[$i].zone")
            wc.put(JSONObject().put("name", name).put("zone", zone))
        }
        val cd = JSONArray()
        for (i in 0 until minOf(countdowns.length(), 50)) {
            val c = countdowns.optJSONObject(i) ?: throw IllegalArgumentException("countdowns[$i] is not an object")
            val title = c.optString("title").trim()
            if (title.isEmpty() || title.length > 60) throw IllegalArgumentException("countdowns[$i].title")
            try { LocalDate.parse(c.optString("date")) } catch (e: Exception) { throw IllegalArgumentException("countdowns[$i].date") }
            cd.put(JSONObject().put("title", title).put("date", c.optString("date")))
        }
        prefs(ctx).edit().putString("worldClocks", wc.toString()).putString("countdowns", cd.toString())
            .apply { if (hour12 == null) remove("hourFmt") else putString("hourFmt", if (hour12) "12" else "24") }.commit()
        refreshAll(ctx)
    }

    private fun array(ctx: Context, key: String) = try { JSONArray(prefs(ctx).getString(key, "[]")) } catch (e: Exception) { JSONArray() }

    // ---------- refresh ----------

    fun refreshAll(ctx: Context) {
        val app = ctx.applicationContext
        val mgr = AppWidgetManager.getInstance(app) ?: return
        for (k in Kind.values()) {
            val ids = mgr.getAppWidgetIds(ComponentName(app, k.cls))
            if (ids.isNotEmpty()) update(app, mgr, k, ids)
        }
        scheduleMidnight(app)
    }

    fun update(ctx: Context, mgr: AppWidgetManager, kind: Kind, ids: IntArray) {
        val views = try {
            when (kind) {
                Kind.DIGITAL -> digital(ctx)
                Kind.ANALOG -> RemoteViews(ctx.packageName, R.layout.widget_analog).apply { setOnClickPendingIntent(R.id.w_root, open(ctx, "clock")) }
                Kind.WORLD -> world(ctx)
                Kind.ALARM -> alarm(ctx)
                Kind.TIMER -> timer(ctx)
                Kind.COUNTDOWN -> countdown(ctx)
            }
        } catch (e: Exception) {
            android.util.Log.w("WAKE11", "widget ${kind.name} failed: ${e.message}")
            return
        }
        mgr.updateAppWidget(ids, views)
    }

    /** Next midnight (and every 30 min via updatePeriodMillis): day labels and "47 days" change. */
    private fun scheduleMidnight(ctx: Context) {
        val c = Calendar.getInstance().apply {
            add(Calendar.DAY_OF_YEAR, 1); set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 5); set(Calendar.MILLISECOND, 0)
        }
        val pi = PendingIntent.getBroadcast(
            ctx, 9100, Intent(ctx, WidgetActionReceiver::class.java).setAction(ACTION_MIDNIGHT),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        // Inexact on purpose: a few minutes late is fine and costs no battery.
        ctx.getSystemService(AlarmManager::class.java).set(AlarmManager.RTC, c.timeInMillis, pi)
    }

    /** Opens WAKE11 on one screen (route checked against [ROUTES] in MainActivity). */
    fun open(ctx: Context, route: String): PendingIntent {
        val i = Intent(ctx, MainActivity::class.java)
            .setAction("app.wake11.OPEN.$route")
            .putExtra(MainActivity.EXTRA_ROUTE, route)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        return PendingIntent.getActivity(ctx, route.hashCode(), i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }

    // ---------- next alarm text ----------

    /** "Tue 07:00", "Snoozed until 07:05" or null. */
    fun nextAlarmText(ctx: Context, now: Long = System.currentTimeMillis()): String? {
        val store = AlarmStore(ctx)
        val rs = store.ringState()
        if (rs != null && rs.phase == RingState.SNOOZED && rs.nextRingAt != null && rs.nextRingAt > now) {
            return "Snoozed until ${time(ctx, rs.nextRingAt)}"
        }
        val next = store.all().filter { it.enabled }.mapNotNull { it.nextTriggerAt }.filter { it > now }.minOrNull() ?: return null
        return "${dayLabel(next, now)} ${time(ctx, next)}"
    }

    /** The app's own 12/24 h setting (mirrored from the web); the phone's setting until the app has sent one. */
    private fun use24(ctx: Context): Boolean =
        prefs(ctx).getString("hourFmt", null)?.let { it == "24" } ?: android.text.format.DateFormat.is24HourFormat(ctx)

    private fun time(ctx: Context, at: Long): String {
        val pattern = if (use24(ctx)) "HH:mm" else "h:mm a"
        return SimpleDateFormat(pattern, Locale.getDefault()).format(at)
    }

    private fun dayLabel(at: Long, now: Long): String {
        val zone = ZoneId.systemDefault()
        val days = ChronoUnit.DAYS.between(
            java.time.Instant.ofEpochMilli(now).atZone(zone).toLocalDate(),
            java.time.Instant.ofEpochMilli(at).atZone(zone).toLocalDate(),
        )
        return when (days) {
            0L -> "Today"
            1L -> "Tomorrow"
            else -> SimpleDateFormat("EEE", Locale.getDefault()).format(at)
        }
    }

    // ---------- views ----------

    private fun digital(ctx: Context) = RemoteViews(ctx.packageName, R.layout.widget_digital).apply {
        val next = nextAlarmText(ctx)
        val clock = if (use24(ctx)) "HH:mm" else "h:mm"
        setCharSequence(R.id.w_clock, "setFormat12Hour", clock)
        setCharSequence(R.id.w_clock, "setFormat24Hour", clock)
        setTextViewText(R.id.w_next, next?.let { "Alarm $it" } ?: "")
        setViewVisibility(R.id.w_next, if (next == null) View.GONE else View.VISIBLE)
        setOnClickPendingIntent(R.id.w_root, open(ctx, "clock"))
    }

    private val WORLD_ROWS = intArrayOf(R.id.w_row1, R.id.w_row2, R.id.w_row3)
    private val WORLD_NAMES = intArrayOf(R.id.w_name1, R.id.w_name2, R.id.w_name3)
    private val WORLD_TIMES = intArrayOf(R.id.w_time1, R.id.w_time2, R.id.w_time3)

    private fun world(ctx: Context) = RemoteViews(ctx.packageName, R.layout.widget_world).apply {
        val list = array(ctx, "worldClocks")
        for (i in 0 until 3) {
            val c = list.optJSONObject(i)
            setViewVisibility(WORLD_ROWS[i], if (c == null) View.GONE else View.VISIBLE)
            if (c != null) {
                setTextViewText(WORLD_NAMES[i], c.optString("name"))
                setString(WORLD_TIMES[i], "setTimeZone", c.optString("zone"))
                val fmt = if (use24(ctx)) "HH:mm" else "h:mm a"
                setCharSequence(WORLD_TIMES[i], "setFormat12Hour", fmt)
                setCharSequence(WORLD_TIMES[i], "setFormat24Hour", fmt)
            }
        }
        setViewVisibility(R.id.w_empty, if (list.length() == 0) View.VISIBLE else View.GONE)
        setOnClickPendingIntent(R.id.w_root, open(ctx, "clock"))
    }

    private fun alarm(ctx: Context) = RemoteViews(ctx.packageName, R.layout.widget_alarm).apply {
        setTextViewText(R.id.w_next, nextAlarmText(ctx) ?: "No alarm set")
        setOnClickPendingIntent(R.id.w_head, open(ctx, "alarm"))
        for ((id, min) in listOf(R.id.w_nap10 to 10, R.id.w_nap30 to 30, R.id.w_nap60 to 60)) {
            val i = Intent(ctx, WidgetActionReceiver::class.java).setAction(ACTION_NAP).putExtra(EXTRA_MIN, min)
            setOnClickPendingIntent(id, PendingIntent.getBroadcast(ctx, 9200 + min, i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
        }
    }

    private fun timer(ctx: Context) = RemoteViews(ctx.packageName, R.layout.widget_timer).apply {
        val now = System.currentTimeMillis()
        val all = TimerAlarms.all(ctx).sortedBy { it.endAt }
        val t = all.firstOrNull { it.endAt > now } ?: all.lastOrNull()
        if (t == null) {
            setViewVisibility(R.id.w_chrono, View.GONE)
            setViewVisibility(R.id.w_idle, View.VISIBLE)
            setTextViewText(R.id.w_label, "Timer")
        } else {
            setViewVisibility(R.id.w_chrono, View.VISIBLE)
            setViewVisibility(R.id.w_idle, View.GONE)
            setChronometerCountDown(R.id.w_chrono, true)
            setChronometer(R.id.w_chrono, SystemClock.elapsedRealtime() + (t.endAt - now), null, true)
            val more = if (all.size > 1) " +${all.size - 1}" else ""
            setTextViewText(R.id.w_label, t.runningName() + more)
        }
        setOnClickPendingIntent(R.id.w_root, open(ctx, "timer"))
    }

    private fun countdown(ctx: Context) = RemoteViews(ctx.packageName, R.layout.widget_countdown).apply {
        val today = LocalDate.now()
        val list = array(ctx, "countdowns")
        val upcoming = (0 until list.length()).mapNotNull { list.optJSONObject(it) }
            .mapNotNull { c -> try { c to ChronoUnit.DAYS.between(today, LocalDate.parse(c.optString("date"))) } catch (e: Exception) { null } }
            .filter { it.second >= 0 }
            .minByOrNull { it.second }
        if (upcoming == null) {
            setTextViewText(R.id.w_title, "No events")
            setTextViewText(R.id.w_days, "Add one")
        } else {
            setTextViewText(R.id.w_title, upcoming.first.optString("title"))
            setTextViewText(R.id.w_days, when (upcoming.second) { 0L -> "Today"; 1L -> "Tomorrow"; else -> "${upcoming.second} days" })
        }
        setOnClickPendingIntent(R.id.w_root, open(ctx, "tool-countdowns"))
    }
}
