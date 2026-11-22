package app.wake11

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationManager
import android.content.Intent
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.PermissionState
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import org.json.JSONObject
import java.lang.ref.WeakReference

/**
 * Bridge API (BLUEPRINT §4). Every method catches errors and rejects with a clear code (rule 5):
 * INVALID, NOT_FOUND, EXACT_ALARM_DENIED, NOTIFICATIONS_DENIED, NOT_IMPLEMENTED, ERROR.
 */
class NotificationsDeniedException : SecurityException("Notifications are disabled")

@CapacitorPlugin(
    name = "AlarmPlugin",
    permissions = [
        Permission(alias = "notifications", strings = [Manifest.permission.POST_NOTIFICATIONS]),
    ],
)
class AlarmPlugin : Plugin() {
    private val store by lazy { AlarmStore(context) }
    private var preview: MediaPlayer? = null

    override fun load() {
        synchronized(instances) { instances.add(WeakReference(this)) }
        RingService.ensureChannel(context)
    }

    private inline fun guard(call: PluginCall, block: () -> Unit) {
        try {
            block()
        } catch (e: NotificationsDeniedException) {
            call.reject("Notifications are off, so a ringing alarm could not show its stop screen. Allow notifications first.", "NOTIFICATIONS_DENIED")
        } catch (e: ExactAlarmDeniedException) {
            call.reject("Exact alarms are not allowed. Open the Reliability screen.", "EXACT_ALARM_DENIED")
        } catch (e: IllegalArgumentException) {
            call.reject(e.message ?: "Invalid input", "INVALID")
        } catch (e: Exception) {
            call.reject(e.message ?: "Unexpected error", "ERROR", e)
        }
    }

    /** An alarm that rings without a visible stop screen is worse than no alarm: refuse to schedule. */
    private fun requireCanRing() {
        if (!AlarmScheduler.canScheduleExact(context)) throw ExactAlarmDeniedException()
        if (!notificationsOk()) throw NotificationsDeniedException()
    }

    private fun notificationsOk() = RingService.notificationsAllowed(context)

    private fun alarmsArray() = JSArray().apply { store.all().forEach { put(it.toJson()) } }

    @PluginMethod
    fun listAlarms(call: PluginCall) = guard(call) {
        call.resolve(JSObject().put("alarms", alarmsArray()))
    }

    @PluginMethod
    fun upsertAlarm(call: PluginCall) = guard(call) {
        val input = call.getObject("alarm") ?: throw IllegalArgumentException("alarm is required")
        val existing = input.optString("id").takeIf { it.isNotBlank() }?.let { store.get(it) }
        val alarm = Alarm.fromJson(input, existing)
        if (alarm.enabled) requireCanRing()
        val saved = AlarmScheduler.refresh(context, alarm)
        emit("alarmsChanged", JSONObject())
        call.resolve(JSObject.fromJSONObject(saved.toJson()))
    }

    @PluginMethod
    fun deleteAlarm(call: PluginCall) = guard(call) {
        val id = call.getString("id") ?: throw IllegalArgumentException("id is required")
        store.ringState()?.takeIf { it.alarmId == id }?.let { RingController.dismiss(context, id) }
        store.delete(id)
        AlarmScheduler.cancel(context, id)
        AlarmScheduler.cancelResume(context, id)
        emit("alarmsChanged", JSONObject())
        call.resolve()
    }

    @PluginMethod
    fun setEnabled(call: PluginCall) = guard(call) {
        val id = call.getString("id") ?: throw IllegalArgumentException("id is required")
        val on = call.getBoolean("on") ?: throw IllegalArgumentException("on is required")
        val a = store.get(id) ?: return@guard call.reject("Alarm not found", "NOT_FOUND")
        if (on) requireCanRing()
        val saved = AlarmScheduler.refresh(context, a.copy(enabled = on, updatedAt = System.currentTimeMillis()))
        emit("alarmsChanged", JSONObject())
        call.resolve(JSObject.fromJSONObject(saved.toJson()))
    }

    @PluginMethod
    fun getRingState(call: PluginCall) = guard(call) {
        call.resolve(JSObject().put("state", store.ringState()?.toJson() ?: JSONObject.NULL))
    }

    @PluginMethod
    fun snooze(call: PluginCall) = guard(call) {
        val id = call.getString("id") ?: throw IllegalArgumentException("id is required")
        val r = RingController.snooze(context, id)
        call.resolve(JSObject().put("allowed", r.allowed).put("nextRingAt", r.nextRingAt ?: JSONObject.NULL).put("snoozesLeft", r.snoozesLeft))
    }

    @PluginMethod
    fun dismiss(call: PluginCall) = guard(call) {
        val id = call.getString("id") ?: throw IllegalArgumentException("id is required")
        val fails = call.getObject("proof")?.optInt("fails", 0) ?: 0
        RingController.dismiss(context, id, fails = fails.coerceIn(0, 1000))
        call.resolve()
    }

    /** Everything the web ring screen needs: state, alarm, snooze/budget info. */
    @PluginMethod
    fun getRingContext(call: PluginCall) = guard(call) {
        call.resolve(JSObject().put("context", RingController.context(context) ?: JSONObject.NULL))
    }

    /** The web ring screen has drawn itself: cancel the 4-second native fallback. */
    @PluginMethod
    fun ringReady(call: PluginCall) {
        RingActivity.webReady = true
        call.resolve()
    }

    @PluginMethod
    fun confirmAwake(call: PluginCall) = guard(call) {
        call.resolve(JSObject().put("ok", WakeCheck.confirm(context)))
    }

    /** Timer / focus phase that must ring even when the app is closed (§6.3). */
    @PluginMethod
    fun scheduleTimer(call: PluginCall) = guard(call) {
        val id = call.getString("id") ?: throw IllegalArgumentException("id is required")
        val endAt = call.getLong("endAt") ?: call.getDouble("endAt")?.toLong() ?: throw IllegalArgumentException("endAt is required")
        if (!notificationsOk()) throw NotificationsDeniedException()
        TimerAlarms.schedule(context, id, endAt, call.getString("label") ?: "")
        call.resolve()
    }

    @PluginMethod
    fun cancelTimer(call: PluginCall) = guard(call) {
        val id = call.getString("id") ?: throw IllegalArgumentException("id is required")
        TimerAlarms.cancel(context, id)
        call.resolve()
    }

    /** Which timers native still has scheduled or ringing (the web reconciles on start / resume). */
    @PluginMethod
    fun getTimerState(call: PluginCall) = guard(call) {
        call.resolve(
            JSObject()
                .put("scheduled", JSArray(TimerAlarms.all(context).map { it.id }))
                .put("ringing", JSArray(TimerRingService.ringing.keys.toList())),
        )
    }

    /** Stops the sound of a finished timer (from the in-app Done screen). */
    @PluginMethod
    fun stopTimerRing(call: PluginCall) = guard(call) {
        val id = call.getString("id")
        if (id == null) TimerRingService.stopAll() else TimerRingService.stop(id)
        call.resolve()
    }

    @PluginMethod
    fun getLogs(call: PluginCall) = guard(call) {
        call.resolve(JSObject().put("logs", store.logs()))
    }

    @PluginMethod
    fun getReliabilityStatus(call: PluginCall) = guard(call) {
        val nm = context.getSystemService(NotificationManager::class.java)
        val pm = context.getSystemService(PowerManager::class.java)
        val fsi = Build.VERSION.SDK_INT < 34 || nm.canUseFullScreenIntent()
        call.resolve(
            JSObject()
                .put("exactAlarm", AlarmScheduler.canScheduleExact(context))
                .put("fullScreenIntent", fsi)
                .put("notifications", notificationsOk())
                .put("batteryUnrestricted", pm.isIgnoringBatteryOptimizations(context.packageName))
                .put("manufacturer", Build.MANUFACTURER)
                .put("model", Build.MODEL)
                .put("sdk", Build.VERSION.SDK_INT)
                .put("nextSystemAlarm", context.getSystemService(AlarmManager::class.java).nextAlarmClock?.triggerTime ?: JSONObject.NULL),
        )
    }

    @PluginMethod
    fun openSetting(call: PluginCall) = guard(call) {
        val pkg = Uri.parse("package:${context.packageName}")
        val intent = when (call.getString("which")) {
            "exactAlarm" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, pkg) else null
            "fullScreen" -> if (Build.VERSION.SDK_INT >= 34) Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, pkg) else null
            "battery" -> Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, pkg)
            "notifications" -> Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
            "appDetails" -> Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg)
            else -> throw IllegalArgumentException("unknown setting")
        } ?: Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            context.startActivity(intent)
        } catch (e: Exception) {
            context.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
        call.resolve()
    }

    @PluginMethod
    fun requestNotifications(call: PluginCall) {
        if (Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED) {
            call.resolve(JSObject().put("granted", NotificationManagerCompat.from(context).areNotificationsEnabled()))
        } else {
            requestPermissionForAlias("notifications", call, "notificationsCallback")
        }
    }

    @PermissionCallback
    private fun notificationsCallback(call: PluginCall) {
        call.resolve(JSObject().put("granted", NotificationManagerCompat.from(context).areNotificationsEnabled()))
    }

    @PluginMethod
    fun previewSound(call: PluginCall) = guard(call) {
        val id = call.getString("soundId") ?: throw IllegalArgumentException("soundId is required")
        if (id !in Alarm.SOUNDS) throw IllegalArgumentException("unknown soundId")
        val vol = (call.getDouble("volume") ?: 0.6).coerceIn(0.0, 1.0).toFloat()
        stopPreviewInternal()
        preview = RingService.createPlayer(context, id).apply { setVolume(vol, vol); isLooping = false; start() }
        call.resolve()
    }

    @PluginMethod
    fun setTimerSound(call: PluginCall) = guard(call) {
        TimerAlarms.setSound(context, call.getString("soundId") ?: throw IllegalArgumentException("soundId is required"))
        call.resolve()
    }

    /** Web → native copy of world clocks and countdowns for the home-screen widgets (validated). */
    @PluginMethod
    fun setWidgetData(call: PluginCall) = guard(call) {
        Widgets.setData(context, call.getArray("worldClocks") ?: JSArray(), call.getArray("countdowns") ?: JSArray())
        call.resolve()
    }

    /** Shows the sunrise glow now for [seconds] (5..120) so the owner can see it (editor "Preview"). */
    @PluginMethod
    fun previewSunrise(call: PluginCall) = guard(call) {
        val secs = (call.getInt("seconds") ?: 30).coerceIn(5, 120)
        val now = System.currentTimeMillis()
        val i = android.content.Intent(context, SunriseActivity::class.java)
            .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
            .putExtra(Sunrise.EXTRA_START, now).putExtra(Sunrise.EXTRA_END, now + secs * 1000L)
        context.startActivity(i)
        call.resolve()
    }

    @PluginMethod
    fun stopPreview(call: PluginCall) {
        stopPreviewInternal()
        call.resolve()
    }

    private fun stopPreviewInternal() {
        preview?.let { try { it.stop() } catch (_: Exception) { }; it.release() }
        preview = null
    }

    override fun handleOnDestroy() {
        stopPreviewInternal()
        synchronized(instances) { instances.removeAll { it.get() == null || it.get() === this } }
        super.handleOnDestroy()
    }

    fun send(event: String, data: JSONObject) = notifyListeners(event, JSObject.fromJSONObject(data))

    companion object {
        /** One plugin per WebView: the main app and the ring screen can both be alive. */
        private val instances = mutableListOf<WeakReference<AlarmPlugin>>()

        /** Sends an event to every running web layer; no-op when none is running. */
        fun emit(event: String, data: JSONObject) {
            val alive = synchronized(instances) { instances.mapNotNull { it.get() } }
            alive.forEach { p -> p.bridge?.executeOnMainThread { p.send(event, data) } }
        }
    }
}
