package app.wake11

import android.app.Activity
import android.content.Intent
import androidx.activity.result.ActivityResult
import androidx.core.app.NotificationManagerCompat
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONArray
import org.json.JSONObject

/**
 * Backup (BLUEPRINT §7 export file, Phase 5b): native alarms + logs out/in, and saving / opening the
 * JSON file through Android's system file picker (Storage Access Framework, no storage permission).
 * Import is all-or-nothing: everything is validated before anything is written (rule 6).
 */
@CapacitorPlugin(name = "BackupPlugin")
class BackupPlugin : Plugin() {
    private val store by lazy { AlarmStore(context) }

    @PluginMethod
    fun exportAlarms(call: PluginCall) {
        val arr = JSArray()
        store.all().forEach { arr.put(it.toJson()) }
        call.resolve(JSObject().put("alarms", arr).put("alarmLogs", store.logs()))
    }

    @PluginMethod
    fun importAlarms(call: PluginCall) {
        val alarmsIn = call.getArray("alarms") ?: return call.reject("alarms is required", "INVALID")
        val logsIn = call.getArray("alarmLogs") ?: JSArray()
        if (store.ringState() != null) return call.reject("An alarm is ringing or snoozed — finish it first.", "BUSY")

        val errors = mutableListOf<String>()
        val alarms = mutableListOf<Alarm>()
        for (i in 0 until alarmsIn.length()) {
            try {
                alarms += Alarm.fromStored(alarmsIn.getJSONObject(i))
            } catch (e: Exception) {
                errors += "alarm ${i + 1}: ${e.message}"
            }
        }
        if (alarms.map { it.id }.toSet().size != alarms.size) errors += "duplicate alarm ids"
        val logs = JSONArray()
        val outcomes = setOf("dismissed", "missed", "auto_silenced", "killed")
        for (i in 0 until logsIn.length()) {
            val o = logsIn.optJSONObject(i)
            val ok = o != null && o.optString("instanceId").isNotBlank() && o.optString("alarmId").isNotBlank() &&
                o.optLong("firstRangAt", -1) > 0 && o.optString("outcome") in outcomes && o.optInt("snoozes", -1) >= 0
            if (ok) logs.put(o) else errors += "log ${i + 1}: missing or bad fields"
        }
        if (errors.isNotEmpty()) return call.reject(errors.take(5).joinToString("; "), "INVALID")
        val needsRing = alarms.any { it.enabled }
        if (needsRing && !AlarmScheduler.canScheduleExact(context)) return call.reject("Exact alarms are not allowed", "EXACT_ALARM_DENIED")
        if (needsRing && !(NotificationManagerCompat.from(context).areNotificationsEnabled() && RingService.channelEnabled(context))) {
            return call.reject("Notifications are off", "NOTIFICATIONS_DENIED")
        }

        // State first (rule 4): cancel old schedules, write the new set, then schedule each one.
        store.all().forEach {
            AlarmScheduler.cancel(context, it.id)
            AlarmScheduler.cancelResume(context, it.id)
        }
        store.setQueue(emptyList())
        store.replaceAll(alarms, logs)
        var scheduled = 0
        for (a in store.all()) {
            try {
                if (AlarmScheduler.refresh(context, a).nextTriggerAt != null) scheduled++
            } catch (_: SecurityException) { }
        }
        AlarmPlugin.emit("alarmsChanged", JSONObject())
        call.resolve(JSObject().put("alarms", alarms.size).put("alarmLogs", logs.length()).put("scheduled", scheduled))
    }

    // ---------- files (system picker) ----------

    @PluginMethod
    fun saveFile(call: PluginCall) {
        val name = call.getString("name") ?: "wake11-backup.json"
        if (call.getString("text") == null) return call.reject("text is required", "INVALID")
        val intent = Intent(Intent.ACTION_CREATE_DOCUMENT)
            .addCategory(Intent.CATEGORY_OPENABLE)
            .setType("application/json")
            .putExtra(Intent.EXTRA_TITLE, name)
        startActivityForResult(call, intent, "onSaved")
    }

    @ActivityCallback
    private fun onSaved(call: PluginCall, result: ActivityResult) {
        val uri = result.data?.data
        if (result.resultCode != Activity.RESULT_OK || uri == null) return call.resolve(JSObject().put("saved", false))
        try {
            context.contentResolver.openOutputStream(uri, "wt")!!.use { it.write(call.getString("text")!!.toByteArray()) }
            call.resolve(JSObject().put("saved", true))
        } catch (e: Exception) {
            call.reject("Could not write the file: ${e.message}", "ERROR")
        }
    }

    @PluginMethod
    fun openFile(call: PluginCall) {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT)
            .addCategory(Intent.CATEGORY_OPENABLE)
            .setType("*/*")
            .putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("application/json", "text/plain", "application/octet-stream"))
        startActivityForResult(call, intent, "onOpened")
    }

    @ActivityCallback
    private fun onOpened(call: PluginCall, result: ActivityResult) {
        val uri = result.data?.data
        if (result.resultCode != Activity.RESULT_OK || uri == null) return call.resolve(JSObject().put("text", JSONObject.NULL))
        try {
            val bytes = context.contentResolver.openInputStream(uri)!!.use { it.readBytes() }
            if (bytes.size > MAX_BYTES) return call.reject("File is larger than 5 MB", "INVALID")
            call.resolve(JSObject().put("text", String(bytes)))
        } catch (e: Exception) {
            call.reject("Could not read the file: ${e.message}", "ERROR")
        }
    }

    companion object {
        private const val MAX_BYTES = 5 * 1024 * 1024
    }
}
