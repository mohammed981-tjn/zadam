package sd.sudagri.sudagri

import android.view.WindowManager
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

/**
 * The films are watched in the app, not captured from it (the owner, 3
 * October). While a film screen is open, Dart calls "on" and the window is
 * marked FLAG_SECURE: Android then refuses screenshots and shows black in
 * screen recordings and the recent-apps preview. "off" lifts it when the film
 * screen closes, so the rest of the app can still be shared.
 */
class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "sudagri/secure")
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "on" -> {
                        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
                        result.success(null)
                    }
                    "off" -> {
                        window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
                        result.success(null)
                    }
                    "isCaptured" -> result.success(false)
                    else -> result.notImplemented()
                }
            }
    }
}
