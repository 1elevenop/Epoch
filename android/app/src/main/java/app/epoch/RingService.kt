package app.epoch

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.VibrationAttributes
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import org.json.JSONObject

/**
 * Foreground service that makes the noise (decision D3: sound first, UI second).
 * Plays on the alarm stream (rings in silent/DND), vibrates, ramps volume, auto-silences after 15 min.
 */
class RingService : Service() {
    private val handler = Handler(Looper.getMainLooper())
    private var player: MediaPlayer? = null
    private var vibrator: Vibrator? = null
    private var originalVolume = -1
    private var alarmId: String? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            shutdown()
            return START_NOT_STICKY
        }
        val store = AlarmStore(this)
        val rs = store.ringState()
        val alarm = rs?.let { store.get(it.alarmId) }
        startForegroundCompat(alarm?.label ?: "", rs?.escalated == true)
        if (rs == null || alarm == null || rs.phase != RingState.RINGING) {
            shutdown()
            return START_NOT_STICKY
        }
        running = this
        if (alarmId != alarm.id) {
            stopSound()
            alarmId = alarm.id
            startSound(alarm, rs)
            if (alarm.vibrate) startVibration()
            handler.postDelayed({ autoSilence() }, AUTO_SILENCE_MS)
        }
        AlarmPlugin.emit("ringStarted", rs.toJson())
        return START_STICKY
    }

    private fun startForegroundCompat(label: String, escalated: Boolean) {
        ensureChannel(this)
        val full = PendingIntent.getActivity(
            this, 1, Intent(this, RingActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_USER_ACTION),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val n = Notification.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_epoch)
            .setContentTitle(getString(R.string.app_name))
            .setContentText(if (escalated) "You missed the wake-up check — snooze locked" else label.ifBlank { "Alarm" } + " — tap to dismiss")
            .setCategory(Notification.CATEGORY_ALARM)
            .setOngoing(true)
            .setContentIntent(full)
            .setFullScreenIntent(full, true)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .build()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
        } else {
            startForeground(NOTIF_ID, n)
        }
    }

    private fun startSound(alarm: Alarm, rs: RingState) {
        val am = getSystemService(AudioManager::class.java)
        val max = am.getStreamMaxVolume(AudioManager.STREAM_ALARM)
        val profile = Escalation.ringProfile(rs.snoozeCount, alarm.rampSec, alarm.volume, rs.escalated)
        val target = maxOf(1, Math.round(profile.volume * max).toInt())
        if (originalVolume < 0) originalVolume = am.getStreamVolume(AudioManager.STREAM_ALARM)
        try {
            player = createPlayer(this, alarm.soundId).apply { isLooping = true; start() }
        } catch (e: Exception) {
            // Sound file failed: fall back to the system alarm tone so the alarm still makes noise.
            player = MediaPlayer().apply {
                setAudioAttributes(ALARM_ATTRS)
                setDataSource(this@RingService, android.provider.Settings.System.DEFAULT_ALARM_ALERT_URI)
                isLooping = true
                prepare()
                start()
            }
        }
        val rampMs = profile.rampSec * 1000.0
        val start = System.currentTimeMillis()
        // Volume ramp, then volume lock: re-apply the target every 2 s (BLUEPRINT §5.2).
        val tick = object : Runnable {
            override fun run() {
                val f = if (rampMs <= 0) 1.0 else ((System.currentTimeMillis() - start) / rampMs).coerceAtMost(1.0)
                val want = maxOf(1, Math.round(target * f).toInt())
                if (am.getStreamVolume(AudioManager.STREAM_ALARM) != want) {
                    am.setStreamVolume(AudioManager.STREAM_ALARM, want, 0)
                }
                handler.postDelayed(this, if (f < 1.0) 1000 else 2000)
            }
        }
        tick.run()
    }

    private fun startVibration() {
        val v = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            getSystemService(VibratorManager::class.java).defaultVibrator
        } else {
            @Suppress("DEPRECATION") getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        }
        val effect = VibrationEffect.createWaveform(longArrayOf(0, 800, 600), 0)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            v.vibrate(effect, VibrationAttributes.createForUsage(VibrationAttributes.USAGE_ALARM))
        } else {
            @Suppress("DEPRECATION") v.vibrate(effect, ALARM_ATTRS)
        }
        vibrator = v
    }

    private fun autoSilence() {
        val id = alarmId ?: return
        RingController.dismiss(this, id, outcome = "auto_silenced")
    }

    private fun stopSound() {
        handler.removeCallbacksAndMessages(null)
        player?.let { try { it.stop() } catch (_: Exception) { }; it.release() }
        player = null
        vibrator?.cancel()
        vibrator = null
        if (originalVolume >= 0) {
            getSystemService(AudioManager::class.java).setStreamVolume(AudioManager.STREAM_ALARM, originalVolume, 0)
            originalVolume = -1
        }
    }

    fun shutdown() {
        stopSound()
        alarmId = null
        running = null
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        stopSound()
        if (running === this) running = null
        super.onDestroy()
    }

    companion object {
        const val ACTION_START = "app.epoch.RING_START"
        const val ACTION_STOP = "app.epoch.RING_STOP"
        /** Notifications on and the ring channel not blocked: needed for the full-screen ring screen. */
        fun notificationsAllowed(ctx: Context) =
            androidx.core.app.NotificationManagerCompat.from(ctx).areNotificationsEnabled() && channelEnabled(ctx)

        const val CHANNEL = "alarm_ring"
        private const val NOTIF_ID = 4711
        private const val AUTO_SILENCE_MS = 15 * 60_000L

        @Volatile var running: RingService? = null

        val ALARM_ATTRS: AudioAttributes = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()

        fun soundUri(ctx: Context, soundId: String): Uri {
            val res = ctx.resources.getIdentifier(soundId, "raw", ctx.packageName)
            return Uri.parse("android.resource://${ctx.packageName}/$res")
        }

        fun createPlayer(ctx: Context, soundId: String): MediaPlayer = MediaPlayer().apply {
            setAudioAttributes(ALARM_ATTRS)
            setDataSource(ctx, soundUri(ctx, soundId))
            prepare()
        }

        /** False if the user switched off the "Ringing alarms" channel itself. */
        fun channelEnabled(ctx: Context): Boolean {
            ensureChannel(ctx)
            val ch = ctx.getSystemService(NotificationManager::class.java).getNotificationChannel(CHANNEL)
            return ch == null || ch.importance != NotificationManager.IMPORTANCE_NONE
        }

        fun ensureChannel(ctx: Context) {
            val nm = ctx.getSystemService(NotificationManager::class.java)
            if (nm.getNotificationChannel(CHANNEL) != null) return
            val ch = NotificationChannel(CHANNEL, "Ringing alarms", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Shows the alarm screen when an alarm rings"
                setSound(null, null) // the service plays the sound itself
                enableVibration(false)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                setBypassDnd(true)
            }
            nm.createNotificationChannel(ch)
        }

        @Suppress("unused")
        fun stateJson(ctx: Context): JSONObject? = AlarmStore(ctx).ringState()?.toJson()
    }
}
