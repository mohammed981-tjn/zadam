/// The films are watched in the app, not captured from it (the owner, 3
/// October).
///
/// On Android, `on` marks the window FLAG_SECURE: screenshots are refused and
/// recordings show black, until `off`. iOS lets no app block screenshots, but
/// it reports when the screen is being recorded or mirrored, which
/// [isCaptured] reads so the film can be hidden while it is.
///
/// Every call swallows a missing platform side (tests, other platforms): a film
/// that plays unprotected is better than a film screen that crashes.
library;

import 'package:flutter/services.dart';

class SecureScreen {
  const SecureScreen._();

  static const _channel = MethodChannel('sudagri/secure');

  static Future<void> on() => _call('on');

  static Future<void> off() => _call('off');

  static Future<bool> isCaptured() async {
    try {
      return await _channel.invokeMethod<bool>('isCaptured') ?? false;
    } on MissingPluginException {
      return false;
    } on PlatformException {
      return false;
    }
  }

  static Future<void> _call(String method) async {
    try {
      await _channel.invokeMethod<void>(method);
    } on MissingPluginException {
      // No platform side: nothing to protect with.
    } on PlatformException {
      // The platform refused; the film still plays.
    }
  }
}
