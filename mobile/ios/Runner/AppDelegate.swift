import Flutter
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)

    // The films are watched in the app, not captured from it. iOS lets no app
    // block screenshots, but it does say when the screen is being recorded or
    // mirrored; the film screen asks, and hides the film while it is.
    // "on"/"off" are Android's FLAG_SECURE switch and do nothing here.
    guard let registrar = engineBridge.pluginRegistry.registrar(forPlugin: "SudagriSecure") else { return }
    let channel = FlutterMethodChannel(name: "sudagri/secure", binaryMessenger: registrar.messenger())
    channel.setMethodCallHandler { call, result in
      switch call.method {
      case "isCaptured":
        result(UIScreen.main.isCaptured)
      case "on", "off":
        result(nil)
      default:
        result(FlutterMethodNotImplemented)
      }
    }
  }
}
