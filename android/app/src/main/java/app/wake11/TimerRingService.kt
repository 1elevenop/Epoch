package app.wake11

import android.app.Activity
import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.media.MediaPlayer
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.view.Gravity
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONObject

/**
 * Rings for finished timers / focus phases: alarm stream, simple dismiss (no challenge, §6.3).
 * Several timers can be done at once; the sound stops when all are stopped. Auto-stop after 10 min.
 */
class TimerRingService : Service() {
    private val handler = Handler(Looper.getMainLooper())
    private var player: MediaPlayer? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP_ALL) {
            stopAll()
            if (ringing.isEmpty()) shutdown()
            return START_NOT_STICKY
        }
        if (ringing.isEmpty()) {
            // Started with nothing to ring (e.g. process restarted): satisfy the FGS contract, then stop.
            startForeground(NOTIF_ID, buildNotification())
            shutdown()
            return START_NOT_STICKY
        }
        running = this
        val n = buildNotification()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
        } else {
            startForeground(NOTIF_ID, n)
        }
        if (player == null) {
            try {
                player = RingService.createPlayer(this, TimerAlarms.sound(this)).apply { isLooping = true; start() }
            } catch (e: Exception) {
                android.util.Log.w("WAKE11", "timer sound failed: ${e.message}")
            }
        }
        handler.removeCallbacksAndMessages(null)
        handler.postDelayed({ ringing.keys.toList().forEach { stop(it) } }, AUTO_STOP_MS)
        try {
            startActivity(Intent(this, TimerDoneActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (_: Exception) { /* full-screen notification still applies */ }
        return START_NOT_STICKY
    }

    private fun buildNotification(): Notification {
        RingService.ensureChannel(this)
        val open = PendingIntent.getActivity(
            this, 5, Intent(this, TimerDoneActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val stopAll = PendingIntent.getService(
            this, 6, Intent(this, TimerRingService::class.java).setAction(ACTION_STOP_ALL),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        return Notification.Builder(this, RingService.CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_wake11)
            .setContentTitle("Time's up")
            .setContentText(ringing.values.joinToString(", ").ifBlank { "Timer" })
            .setCategory(Notification.CATEGORY_ALARM)
            .setOngoing(true)
            .setContentIntent(open)
            .setFullScreenIntent(open, true)
            .addAction(Notification.Action.Builder(null, "Stop", stopAll).build())
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .build()
    }

    private fun shutdown() {
        handler.removeCallbacksAndMessages(null)
        player?.let { try { it.stop() } catch (_: Exception) { }; it.release() }
        player = null
        running = null
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        player?.release()
        player = null
        if (running === this) running = null
        super.onDestroy()
    }

    companion object {
        const val ACTION_STOP_ALL = "app.wake11.TIMER_STOP_ALL"
        private const val NOTIF_ID = 4721
        private const val AUTO_STOP_MS = 10 * 60_000L

        @Volatile var running: TimerRingService? = null

        /** Timers currently ringing: id → label. */
        val ringing = linkedMapOf<String, String>()

        fun start(ctx: Context, id: String, label: String) {
            ringing[id] = label.ifBlank { "Timer" }
            ctx.startForegroundService(Intent(ctx, TimerRingService::class.java))
        }

        fun stop(id: String) {
            if (ringing.remove(id) == null) return
            AlarmPlugin.emit("timerStopped", JSONObject().put("id", id))
            TimerDoneActivity.current?.refresh()
            if (ringing.isEmpty()) running?.shutdown()
            else running?.let { s -> s.getSystemService(NotificationManager::class.java).notify(NOTIF_ID, s.buildNotification()) }
        }

        fun stopAll() = ringing.keys.toList().forEach { stop(it) }
    }
}

/** Simple native "Time's up" screen over the lock screen with a Stop button. */
class TimerDoneActivity : Activity() {
    private lateinit var list: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        }
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(Color.parseColor("#1A0606"))
            setPadding(48, 48, 48, 48)
        }
        root.addView(TextView(this).apply {
            text = "Time's up"
            textSize = 40f
            setTextColor(Color.parseColor("#FF5A5F"))
            gravity = Gravity.CENTER
        })
        list = TextView(this).apply { textSize = 22f; setTextColor(Color.WHITE); gravity = Gravity.CENTER; setPadding(0, 24, 0, 48) }
        root.addView(list)
        root.addView(Button(this).apply {
            text = "Stop"
            textSize = 26f
            contentDescription = "Stop all finished timers"
            setOnClickListener { TimerRingService.stopAll(); finish() }
        })
        setContentView(root)
    }

    override fun onResume() {
        super.onResume()
        current = this
        refresh()
    }

    override fun onPause() {
        super.onPause()
        if (current === this) current = null
    }

    fun refresh() = runOnUiThread {
        if (TimerRingService.ringing.isEmpty()) finish()
        else list.text = TimerRingService.ringing.values.joinToString("\n")
    }

    companion object {
        @Volatile var current: TimerDoneActivity? = null
    }
}
