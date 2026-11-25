package app.epoch

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * SharedPreferences JSON store: alarms, ringState, alarmLogs (last 200), ring queue.
 * Writes use commit() (synchronous) so state is on disk before any side effect (rule 4).
 */
class AlarmStore(context: Context) {
    private val app = context.applicationContext
    private val prefs = context.applicationContext.getSharedPreferences("wake_alarms", Context.MODE_PRIVATE)

    @Synchronized
    fun all(): List<Alarm> {
        val arr = JSONArray(prefs.getString(KEY_ALARMS, "[]"))
        return (0 until arr.length()).mapNotNull {
            try { Alarm.fromStored(arr.getJSONObject(it)) } catch (e: Exception) { null }
        }
    }

    fun get(id: String): Alarm? = all().firstOrNull { it.id == id }

    @Synchronized
    fun put(alarm: Alarm) {
        val list = all().filter { it.id != alarm.id } + alarm
        save(list)
    }

    @Synchronized
    fun delete(id: String) = save(all().filter { it.id != id })

    /** Import: replaces every alarm and the whole log in one go (already validated). */
    @Synchronized
    fun replaceAll(alarms: List<Alarm>, logs: JSONArray) {
        save(alarms)
        val trimmed = JSONArray()
        for (i in maxOf(0, logs.length() - MAX_LOGS) until logs.length()) trimmed.put(logs.get(i))
        prefs.edit().putString(KEY_LOGS, trimmed.toString()).commit()
    }

    private fun save(list: List<Alarm>) {
        val arr = JSONArray()
        list.sortedWith(compareBy({ it.hour }, { it.minute })).forEach { arr.put(it.toJson()) }
        prefs.edit().putString(KEY_ALARMS, arr.toString()).commit()
        Widgets.refreshAll(app) // next-alarm widgets follow every change
    }

    // ---------- ring state ----------

    @Synchronized
    fun ringState(): RingState? = prefs.getString(KEY_RING, null)?.let {
        try { RingState.fromJson(JSONObject(it)) } catch (e: Exception) { null }
    }

    @Synchronized
    fun setRingState(state: RingState?) {
        val e = prefs.edit()
        if (state == null) e.remove(KEY_RING) else e.putString(KEY_RING, state.toJson().toString())
        e.commit()
        Widgets.refreshAll(app) // "Snoozed until …"
    }

    // ---------- queue (alarms that fired while another one was ringing) ----------

    @Synchronized
    fun queue(): MutableList<String> {
        val arr = JSONArray(prefs.getString(KEY_QUEUE, "[]"))
        return (0 until arr.length()).map { arr.getString(it) }.toMutableList()
    }

    @Synchronized
    fun setQueue(ids: List<String>) {
        prefs.edit().putString(KEY_QUEUE, JSONArray(ids.distinct()).toString()).commit()
    }

    // ---------- logs ----------

    @Synchronized
    fun logs(): JSONArray = JSONArray(prefs.getString(KEY_LOGS, "[]"))

    /** Merges [fields] into the log entry of [instanceId] (e.g. wake-check result). */
    @Synchronized
    fun updateLog(instanceId: String, fields: JSONObject) {
        val arr = logs()
        for (i in arr.length() - 1 downTo 0) {
            val o = arr.getJSONObject(i)
            if (o.optString("instanceId") == instanceId) {
                fields.keys().forEach { k -> o.put(k, fields.get(k)) }
                prefs.edit().putString(KEY_LOGS, arr.toString()).commit()
                return
            }
        }
    }

    /** Snoozes used in the last 7 days (for the weekly budget). */
    fun snoozesSince(since: Long): Int {
        val arr = logs()
        var n = 0
        for (i in 0 until arr.length()) {
            val o = arr.getJSONObject(i)
            if (o.optLong("firstRangAt") >= since) n += o.optInt("snoozes", 0)
        }
        return n
    }

    @Synchronized
    fun appendLog(log: JSONObject) {
        val old = logs()
        val arr = JSONArray()
        val start = maxOf(0, old.length() - (MAX_LOGS - 1))
        for (i in start until old.length()) arr.put(old.get(i))
        arr.put(log)
        prefs.edit().putString(KEY_LOGS, arr.toString()).commit()
    }

    companion object {
        private const val KEY_ALARMS = "alarms"
        private const val KEY_RING = "ringState"
        private const val KEY_QUEUE = "ringQueue"
        private const val KEY_LOGS = "alarmLogs"
        private const val MAX_LOGS = 200
    }
}

data class RingState(
    val alarmId: String,
    val instanceId: String,
    val phase: String, // RINGING | SNOOZED
    val firstRangAt: Long,
    val scheduledFor: Long,
    val snoozeCount: Int,
    val nextRingAt: Long?,
    val challengeLevel: Int,
    /** Re-ring after a missed wake-check: snooze locked, hardest challenge, max volume. */
    val escalated: Boolean = false,
    /** WAKE_CHECK_PENDING: when the prompt appears. WAKE_CHECK_PROMPT: when the prompt times out. */
    val wakeCheckAt: Long? = null,
    val challengeFails: Int = 0,
) {
    fun toJson(): JSONObject = JSONObject()
        .put("alarmId", alarmId).put("instanceId", instanceId).put("phase", phase)
        .put("firstRangAt", firstRangAt).put("scheduledFor", scheduledFor)
        .put("snoozeCount", snoozeCount).put("nextRingAt", nextRingAt ?: JSONObject.NULL)
        .put("challengeLevel", challengeLevel)
        .put("escalated", escalated)
        .put("wakeCheckAt", wakeCheckAt ?: JSONObject.NULL)
        .put("challengeFails", challengeFails)

    companion object {
        const val RINGING = "RINGING"
        const val SNOOZED = "SNOOZED"
        const val WAKE_CHECK_PENDING = "WAKE_CHECK_PENDING"
        const val WAKE_CHECK_PROMPT = "WAKE_CHECK_PROMPT"

        fun fromJson(o: JSONObject) = RingState(
            alarmId = o.getString("alarmId"),
            instanceId = o.getString("instanceId"),
            phase = o.getString("phase"),
            firstRangAt = o.getLong("firstRangAt"),
            scheduledFor = o.optLong("scheduledFor", o.getLong("firstRangAt")),
            snoozeCount = o.optInt("snoozeCount", 0),
            nextRingAt = if (o.isNull("nextRingAt")) null else o.optLong("nextRingAt"),
            challengeLevel = o.optInt("challengeLevel", 1),
            escalated = o.optBoolean("escalated", false),
            wakeCheckAt = if (o.isNull("wakeCheckAt") || !o.has("wakeCheckAt")) null else o.optLong("wakeCheckAt"),
            challengeFails = o.optInt("challengeFails", 0),
        )
    }
}
