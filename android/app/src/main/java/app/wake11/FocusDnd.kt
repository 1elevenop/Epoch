package app.wake11

import android.app.NotificationManager
import android.content.Context

/**
 * Do Not Disturb during focus sessions (BLUEPRINT §6.5). Uses "Priority only", so the owner's own
 * DND exceptions and all alarms (including WAKE11's phase-end ring) still get through.
 * WAKE11 only turns DND off again if it turned it on itself and the owner has not changed it since;
 * that ownership is stored, so it survives the app being killed mid-session.
 */
object FocusDnd {
    private const val PREFS = "wake11_dnd"
    private const val KEY_OWNED = "owned"
    private const val KEY_PREV = "prev"
    private const val OURS = NotificationManager.INTERRUPTION_FILTER_PRIORITY

    private fun nm(ctx: Context) = ctx.getSystemService(NotificationManager::class.java)
    private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun hasAccess(ctx: Context) = nm(ctx).isNotificationPolicyAccessGranted
    fun isOwned(ctx: Context) = prefs(ctx).getBoolean(KEY_OWNED, false)

    /** Returns "on" (WAKE11 turned it on), "already" (owner had DND on — left alone) or "denied". */
    fun turnOn(ctx: Context): String {
        if (!hasAccess(ctx)) return "denied"
        if (isOwned(ctx)) return "on"
        val current = nm(ctx).currentInterruptionFilter
        if (current != NotificationManager.INTERRUPTION_FILTER_ALL) return "already"
        // Store ownership first (rule 4), then change the system setting.
        prefs(ctx).edit().putBoolean(KEY_OWNED, true).putInt(KEY_PREV, current).commit()
        nm(ctx).setInterruptionFilter(OURS)
        return "on"
    }

    /** Restores the previous mode if WAKE11 set DND and nobody changed it since. Returns true if restored. */
    fun turnOff(ctx: Context): Boolean {
        if (!isOwned(ctx)) return false
        val prev = prefs(ctx).getInt(KEY_PREV, NotificationManager.INTERRUPTION_FILTER_ALL)
        prefs(ctx).edit().remove(KEY_OWNED).remove(KEY_PREV).commit()
        if (!hasAccess(ctx) || nm(ctx).currentInterruptionFilter != OURS) return false
        nm(ctx).setInterruptionFilter(prev)
        return true
    }
}
