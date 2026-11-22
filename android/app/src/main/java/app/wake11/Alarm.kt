package app.wake11

import org.json.JSONArray
import org.json.JSONObject

/**
 * Alarm (BLUEPRINT §7). Native is the source of truth (D2).
 * Fields used by later phases (challenge, wakeCheck, sunriseMin) are kept untouched in [extras].
 */
data class Alarm(
    val id: String,
    val hour: Int,
    val minute: Int,
    val days: List<Int>,
    val label: String,
    val enabled: Boolean,
    val soundId: String,
    val vibrate: Boolean,
    val volume: Double,
    val rampSec: Int,
    val snoozeLengthMin: Int,
    val snoozeMax: Int,
    val deleteAfterUse: Boolean,
    val skipNext: Boolean,
    /** Fixed one-shot time (nap alarms, the 10-second test alarm). Overrides hour/minute. */
    val oneShotAt: Long?,
    val nextTriggerAt: Long?,
    val createdAt: Long,
    val updatedAt: Long,
    val extras: JSONObject = JSONObject(),
) {
    val isRepeating get() = days.isNotEmpty() && oneShotAt == null

    // ---- Phase 3 fields (stored in extras, validated in fromJson) ----
    private val snoozeObj get() = extras.optJSONObject("snooze")
    private val challengeObj get() = extras.optJSONObject("challenge")
    private val wakeObj get() = extras.optJSONObject("wakeCheck")

    val shrink: Boolean get() = snoozeObj?.optBoolean("shrink", true) ?: true
    val weeklyBudget: Int? get() = snoozeObj?.let { if (!it.has("weeklyBudget") || it.isNull("weeklyBudget")) null else it.optInt("weeklyBudget") }
    val challengeChain: List<String> get() = challengeObj?.optJSONArray("chain")?.let { a -> (0 until a.length()).map { a.getString(it) } } ?: listOf("math")
    val challengeLevel: Int get() = challengeObj?.optInt("level", 1) ?: 1
    val wakeCheckEnabled: Boolean get() = wakeObj?.optBoolean("enabled", true) ?: true
    val wakeCheckDelayMin: Int get() = wakeObj?.optInt("delayMin", 4) ?: 4
    val wakeCheckWindowSec: Int get() = wakeObj?.optInt("windowSec", 60) ?: 60
    /** Sunrise pre-alarm length in minutes, 0 = off (BLUEPRINT §5.5). */
    val sunriseMin: Int get() = extras.optInt("sunriseMin", 0)

    fun toJson(): JSONObject {
        val o = JSONObject(extras.toString())
        o.put("id", id).put("hour", hour).put("minute", minute)
        o.put("days", JSONArray(days)).put("label", label).put("enabled", enabled)
        o.put("soundId", soundId).put("vibrate", vibrate).put("volume", volume).put("rampSec", rampSec)
        val snooze = o.optJSONObject("snooze") ?: JSONObject()
        snooze.put("lengthMin", snoozeLengthMin).put("max", snoozeMax)
        o.put("snooze", snooze)
        o.put("deleteAfterUse", deleteAfterUse).put("skipNext", skipNext)
        o.put("oneShotAt", oneShotAt ?: JSONObject.NULL)
        o.put("nextTriggerAt", nextTriggerAt ?: JSONObject.NULL)
        o.put("createdAt", createdAt).put("updatedAt", updatedAt)
        return o
    }

    companion object {
        val CHALLENGES = setOf("math", "type", "memory", "shake", "qr", "steps")
        val SOUNDS = listOf("gentle_bells", "gentle_rise", "gentle_marimba", "hard_classic", "hard_siren", "hard_buzzer")
        private val CORE = setOf(
            "id", "hour", "minute", "days", "label", "enabled", "soundId", "vibrate", "volume", "rampSec",
            "deleteAfterUse", "skipNext", "oneShotAt", "nextTriggerAt", "createdAt", "updatedAt",
        )

        /** Parses and validates. Throws IllegalArgumentException with a readable message on bad input. */
        fun fromJson(o: JSONObject, existing: Alarm? = null, now: Long = System.currentTimeMillis()): Alarm {
            fun int(key: String, def: Int?, range: IntRange): Int {
                if (!o.has(key) || o.isNull(key)) return def ?: throw IllegalArgumentException("$key is required")
                val v = o.get(key)
                if (v !is Number || v.toDouble() != Math.floor(v.toDouble())) throw IllegalArgumentException("$key must be an integer")
                val i = v.toInt()
                if (i !in range) throw IllegalArgumentException("$key must be in $range")
                return i
            }
            fun bool(key: String, def: Boolean) = if (o.has(key) && !o.isNull(key)) o.getBoolean(key) else def

            val hour = int("hour", existing?.hour, 0..23)
            val minute = int("minute", existing?.minute, 0..59)
            val days = if (o.has("days")) {
                val arr = o.getJSONArray("days")
                (0 until arr.length()).map {
                    val d = arr.getInt(it)
                    if (d !in 0..6) throw IllegalArgumentException("days must be 0..6")
                    d
                }.distinct().sorted()
            } else existing?.days ?: emptyList()
            val soundId = o.optString("soundId", existing?.soundId ?: SOUNDS[0])
            if (soundId !in SOUNDS) throw IllegalArgumentException("unknown soundId $soundId")
            val volume = if (o.has("volume")) o.getDouble("volume") else existing?.volume ?: 0.8
            if (volume.isNaN() || volume !in 0.0..1.0) throw IllegalArgumentException("volume must be 0..1")
            val snooze = o.optJSONObject("snooze")
            val snoozeLen = snooze?.optInt("lengthMin", existing?.snoozeLengthMin ?: 5) ?: existing?.snoozeLengthMin ?: 5
            val snoozeMax = snooze?.optInt("max", existing?.snoozeMax ?: 3) ?: existing?.snoozeMax ?: 3
            if (snoozeLen !in 1..60) throw IllegalArgumentException("snooze.lengthMin must be 1..60")
            if (snoozeMax !in 0..10) throw IllegalArgumentException("snooze.max must be 0..10")
            val oneShotAt = if (o.has("oneShotAt")) (if (o.isNull("oneShotAt")) null else o.getLong("oneShotAt")) else existing?.oneShotAt
            val label = o.optString("label", existing?.label ?: "").take(60)

            val extras = JSONObject(existing?.extras?.toString() ?: "{}")
            o.keys().forEach { k -> if (k !in CORE) extras.put(k, o.get(k)) }

            validateExtras(extras)

            return Alarm(
                id = existing?.id ?: o.optString("id").ifBlank { java.util.UUID.randomUUID().toString() },
                hour = hour, minute = minute, days = days, label = label,
                enabled = bool("enabled", existing?.enabled ?: true),
                soundId = soundId, vibrate = bool("vibrate", existing?.vibrate ?: true), volume = volume,
                rampSec = int("rampSec", existing?.rampSec ?: 30, 0..300),
                snoozeLengthMin = snoozeLen, snoozeMax = snoozeMax,
                deleteAfterUse = bool("deleteAfterUse", existing?.deleteAfterUse ?: false),
                skipNext = bool("skipNext", existing?.skipNext ?: false),
                oneShotAt = oneShotAt,
                nextTriggerAt = existing?.nextTriggerAt,
                createdAt = existing?.createdAt ?: now, updatedAt = now, extras = extras,
            )
        }

        private fun validateExtras(x: JSONObject) {
            if (x.has("sunriseMin") && (x.opt("sunriseMin") !is Number || x.optInt("sunriseMin", -1) !in 0..60)) {
                throw IllegalArgumentException("sunriseMin must be 0..60")
            }
            x.optJSONObject("snooze")?.let { s ->
                if (s.has("weeklyBudget") && !s.isNull("weeklyBudget") && s.optInt("weeklyBudget", -1) !in 0..50) {
                    throw IllegalArgumentException("snooze.weeklyBudget must be 0..50 or null")
                }
            }
            x.optJSONObject("challenge")?.let { c ->
                val chain = c.optJSONArray("chain") ?: throw IllegalArgumentException("challenge.chain is required")
                if (chain.length() !in 1..4) throw IllegalArgumentException("challenge.chain must have 1..4 items")
                for (i in 0 until chain.length()) {
                    if (chain.optString(i) !in CHALLENGES) throw IllegalArgumentException("unknown challenge ${chain.optString(i)}")
                }
                if (c.optInt("level", 1) !in 1..4) throw IllegalArgumentException("challenge.level must be 1..4")
                val qr = (0 until chain.length()).any { chain.optString(it) == "qr" }
                if (qr && c.optString("qrPayload").isBlank()) throw IllegalArgumentException("register a QR code first")
            }
            x.optJSONObject("wakeCheck")?.let { w ->
                if (w.optInt("delayMin", 4) !in 1..30) throw IllegalArgumentException("wakeCheck.delayMin must be 1..30")
                if (w.optInt("windowSec", 60) !in 30..300) throw IllegalArgumentException("wakeCheck.windowSec must be 30..300")
            }
        }

        /** Reads a stored alarm (already validated when written). */
        fun fromStored(o: JSONObject): Alarm {
            val a = fromJson(o, null, o.optLong("updatedAt", System.currentTimeMillis()))
            return a.copy(
                id = o.getString("id"),
                createdAt = o.optLong("createdAt", a.createdAt),
                nextTriggerAt = if (o.isNull("nextTriggerAt")) null else o.optLong("nextTriggerAt"),
            )
        }
    }
}
