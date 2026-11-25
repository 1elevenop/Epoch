package app.epoch

import android.Manifest
import android.app.KeyguardManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import org.json.JSONObject

/** Device helpers used by challenges and focus mode: step sensor, unlock for QR scan, immersive mode. */
@CapacitorPlugin(
    name = "DevicePlugin",
    permissions = [Permission(alias = "activity", strings = [Manifest.permission.ACTIVITY_RECOGNITION])],
)
class DevicePlugin : Plugin() {
    private var stepListener: SensorEventListener? = null

    private fun send(event: String, data: JSONObject) = notifyListeners(event, JSObject.fromJSONObject(data))

    /**
     * The camera scanner cannot show over the lock screen, so the QR challenge first asks the
     * user to unlock (fingerprint / PIN). Resolves {unlocked}.
     */
    @PluginMethod
    fun requestUnlock(call: PluginCall) {
        val act = activity ?: return call.reject("No activity", "ERROR")
        val km = context.getSystemService(KeyguardManager::class.java)
        if (!km.isKeyguardLocked) return call.resolve(JSObject().put("unlocked", true))
        act.runOnUiThread {
            km.requestDismissKeyguard(act, object : KeyguardManager.KeyguardDismissCallback() {
                override fun onDismissSucceeded() = call.resolve(JSObject().put("unlocked", true))
                override fun onDismissCancelled() = call.resolve(JSObject().put("unlocked", false))
                override fun onDismissError() = call.resolve(JSObject().put("unlocked", false))
            })
        }
    }

    // ---------- step detector (steps challenge) ----------

    @PluginMethod
    fun startSteps(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= 29 && getPermissionState("activity") != PermissionState.GRANTED) {
            requestPermissionForAlias("activity", call, "stepsPermissionCallback")
            return
        }
        beginSteps(call)
    }

    @PermissionCallback
    private fun stepsPermissionCallback(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= 29 && getPermissionState("activity") != PermissionState.GRANTED) {
            call.reject("Physical activity permission denied", "PERMISSION_DENIED")
        } else {
            beginSteps(call)
        }
    }

    private fun beginSteps(call: PluginCall) {
        val sm = context.getSystemService(SensorManager::class.java)
        val sensor = sm.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR)
            ?: return call.reject("This phone has no step sensor", "NO_SENSOR")
        stopStepsInternal()
        val l = object : SensorEventListener {
            override fun onSensorChanged(e: SensorEvent) = send("step", JSONObject().put("at", System.currentTimeMillis()))
            override fun onAccuracyChanged(s: Sensor?, a: Int) {}
        }
        sm.registerListener(l, sensor, SensorManager.SENSOR_DELAY_FASTEST)
        stepListener = l
        call.resolve()
    }

    @PluginMethod
    fun stopSteps(call: PluginCall) {
        stopStepsInternal()
        call.resolve()
    }

    private fun stopStepsInternal() {
        stepListener?.let { context.getSystemService(SensorManager::class.java).unregisterListener(it) }
        stepListener = null
    }

    /** Focus mode: hide status + navigation bars (swipe to show briefly). */
    @PluginMethod
    fun setImmersive(call: PluginCall) {
        val on = call.getBoolean("on") ?: false
        val act = activity ?: return call.reject("No activity", "ERROR")
        act.runOnUiThread {
            val c = androidx.core.view.WindowCompat.getInsetsController(act.window, act.window.decorView)
            val bars = androidx.core.view.WindowInsetsCompat.Type.systemBars()
            if (on) {
                c.systemBarsBehavior = androidx.core.view.WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                c.hide(bars)
            } else {
                c.show(bars)
            }
            call.resolve()
        }
    }

    /** {access, owned} for the focus setup screen. */
    @PluginMethod
    fun dndStatus(call: PluginCall) {
        call.resolve(JSObject().put("access", FocusDnd.hasAccess(context)).put("owned", FocusDnd.isOwned(context)))
    }

    /** Opens Android's "Do Not Disturb access" list so the owner can allow Epoch once. */
    @PluginMethod
    fun openDndAccess(call: PluginCall) {
        val i = android.content.Intent(android.provider.Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS)
            .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            context.startActivity(i)
            call.resolve()
        } catch (e: Exception) {
            call.reject("Could not open Do Not Disturb settings", "UNAVAILABLE")
        }
    }

    /** {on: true} → result "on" | "already"; rejects DND_ACCESS_DENIED. {on: false} → {restored}. */
    @PluginMethod
    fun setFocusDnd(call: PluginCall) {
        if (call.getBoolean("on") == true) {
            when (val r = FocusDnd.turnOn(context)) {
                "denied" -> call.reject("Epoch is not allowed to change Do Not Disturb", "DND_ACCESS_DENIED")
                else -> call.resolve(JSObject().put("result", r))
            }
        } else {
            call.resolve(JSObject().put("restored", FocusDnd.turnOff(context)))
        }
    }

    override fun handleOnDestroy() {
        stopStepsInternal()
        super.handleOnDestroy()
    }
}
