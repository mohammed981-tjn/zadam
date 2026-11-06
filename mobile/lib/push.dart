/// إشعارات الجوّال والتطبيق مغلق (البند ٢٠٧).
///
/// Everything the platform already writes to a person's notifications — a price alert, locusts near the land, an
/// entry waiting for approval, an agreement waiting for a signature, a new message — reaches the phone through
/// Firebase Cloud Messaging, with the app closed. The server sends it (src/lib/fcm.ts); this file only gives the
/// server this phone's address, takes it back on «خروج», and opens the right screen when a notification is tapped.
///
/// WITHOUT FIREBASE NOTHING BREAKS
///
/// The Firebase project is the owner's to create (docs/push-setup-ar.md). Until its `google-services.json` is in the
/// Android build, Firebase finds no configuration when the app starts; [PushController.start] catches that and the
/// app runs exactly as before, with phone notifications off. On the web build (the preview) it is not even tried.
///
/// THE ADDRESS, AND WHOSE IT IS
///
/// The FCM registration token is sent after sign-in to `POST /api/app/push`, with the session's own token: the
/// database files it under whoever the session belongs to. «خروج» asks the server to forget it first
/// (`/api/app/push/forget`) and then deletes it on the phone, so the next account on this phone gets a new one. A
/// session that simply ran out cannot ask the server anything; the token is deleted on the phone, and the server
/// drops it the first time FCM calls it unregistered.
library;

import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import 'account.dart';
import 'i18n.dart';

/// A notification that arrived while the app was open: Android does not show those itself, so the app says so.
class PushNotice {
  const PushNotice({required this.title, required this.body, required this.link});
  final String title;
  final String body;
  final String link;
}

/// What the app needs from the phone's push service. Firebase in the app; a fake in the tests.
abstract class PushPlatform {
  /// Starts the push service. False — or a throw — when this build has no Firebase configuration.
  Future<bool> init();

  /// Asks the person (Android 13+, iOS) whether notifications may be shown. True when they may.
  Future<bool> requestPermission();

  Future<String?> token();
  Stream<String> get tokenRefresh;
  Future<void> deleteToken();

  /// The in-app path of a notification tapped while the app was in the background.
  Stream<String> get opened;

  /// The in-app path of the notification whose tap started the app, if one did.
  Future<String?> initialLink();

  /// Notifications that arrive while the app is open.
  Stream<PushNotice> get foreground;

  /// 'android' or 'ios', as the server records it.
  String get platform;
}

String _linkOf(RemoteMessage m) => (m.data['link'] as String?) ?? '/notifications';

class FirebasePushPlatform implements PushPlatform {
  FirebaseMessaging get _m => FirebaseMessaging.instance;

  @override
  Future<bool> init() async {
    // No options here: on Android they come from google-services.json through the Google services Gradle plugin,
    // which is applied only when the file is there (android/app/build.gradle.kts). Without it this throws.
    await Firebase.initializeApp();
    return true;
  }

  @override
  Future<bool> requestPermission() async {
    final s = await _m.requestPermission();
    return s.authorizationStatus == AuthorizationStatus.authorized ||
        s.authorizationStatus == AuthorizationStatus.provisional;
  }

  // The registration token is what FCM HTTP v1 sends to (`message.token`, src/lib/fcm.ts). firebase_messaging 17 also
  // offers Firebase Installation IDs for a newer direct-send API; the server does not use that yet.
  @override
  // ignore: deprecated_member_use
  Future<String?> token() => _m.getToken();

  @override
  // ignore: deprecated_member_use
  Stream<String> get tokenRefresh => _m.onTokenRefresh;

  @override
  // ignore: deprecated_member_use
  Future<void> deleteToken() => _m.deleteToken();

  @override
  Stream<String> get opened => FirebaseMessaging.onMessageOpenedApp.map(_linkOf);

  @override
  Future<String?> initialLink() async {
    final m = await _m.getInitialMessage();
    return m == null ? null : _linkOf(m);
  }

  @override
  Stream<PushNotice> get foreground => FirebaseMessaging.onMessage.where((m) => m.notification != null).map(
        (m) => PushNotice(title: m.notification?.title ?? tr('سوداقري', 'Sudagri'), body: m.notification?.body ?? '', link: _linkOf(m)),
      );

  @override
  String get platform => defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android';
}

class PushController {
  PushController({required this._account, PushPlatform? platform, bool? enabledHere})
      : _platform = platform ?? FirebasePushPlatform(),
        _enabledHere = enabledHere ?? !kIsWeb;

  final AccountController _account;
  final PushPlatform _platform;
  final bool _enabledHere;

  /// True once the push service started: this build has a Firebase configuration.
  bool available = false;

  /// The path of a tapped notification, for the shell to open. Set back to null once opened.
  final tapped = ValueNotifier<String?>(null);

  /// A notification that arrived while the app was open.
  final notice = ValueNotifier<PushNotice?>(null);

  /// The token the server has for this phone and this account, once registered.
  String? registered;

  bool _started = false;
  Future<void>? _registering;
  final _subs = <StreamSubscription<Object?>>[];

  Future<void> start() async {
    if (_started || !_enabledHere) return;
    _started = true;
    try {
      available = await _platform.init();
    } catch (_) {
      // No google-services.json in this build (or no Play services on the phone): phone notifications are off.
      available = false;
    }
    if (!available) return;
    _account.beforeSignOut = forget;
    _account.addListener(_sessionChanged);
    _subs.add(_platform.tokenRefresh.listen((t) {
      if (_account.value != null) _register(t);
    }, onError: (_) {}));
    _subs.add(_platform.opened.listen((l) => tapped.value = l, onError: (_) {}));
    _subs.add(_platform.foreground.listen((n) => notice.value = n, onError: (_) {}));
    try {
      final first = await _platform.initialLink();
      if (first != null) tapped.value = first;
    } catch (_) {}
    _sessionChanged();
  }

  void _sessionChanged() {
    if (_account.value != null) {
      if (registered == null) _registering ??= _registerNow().whenComplete(() => _registering = null);
    } else if (registered != null) {
      // The session ended without «خروج» (it expired, or was revoked): the server cannot be asked, so the token goes
      // here, and FCM reports it unregistered to the server the next time it is used.
      registered = null;
      _platform.deleteToken().catchError((_) {});
    }
  }

  Future<void> _registerNow() async {
    try {
      if (!await _platform.requestPermission()) return;
      final t = await _platform.token();
      if (t != null && t.isNotEmpty) await _register(t);
    } catch (_) {
      // Offline, or the service is not ready: the next sign-in or start tries again.
    }
  }

  Future<void> _register(String token) async {
    try {
      await _account.call('POST', '/api/app/push', body: {'token': token, 'platform': _platform.platform, 'locale': langController.value.name});
      registered = token;
    } on Exception catch (_) {
      // Not registered: nothing reaches this phone yet, and nothing else changes.
    }
  }

  /// «خروج»: the server forgets this phone's token while the session still works, then the phone deletes it.
  Future<void> forget() async {
    final t = registered;
    if (t == null) return;
    registered = null;
    try {
      await _account.call('POST', '/api/app/push/forget', body: {'token': t});
    } on Exception catch (_) {}
    try {
      await _platform.deleteToken();
    } catch (_) {}
  }

  /// «إشعارات الجوّال» in «حسابي»: on or off for the account, and how many phones have it.
  Future<({bool enabled, int devices})> status() async {
    final j = await _account.call('GET', '/api/app/push');
    return (enabled: j['enabled'] != false, devices: (j['devices'] as num?)?.toInt() ?? 0);
  }

  Future<bool> setEnabled(bool on) async {
    final j = await _account.call('POST', '/api/app/push/settings', body: {'enabled': on});
    return j['enabled'] != false;
  }

  void dispose() {
    for (final s in _subs) {
      s.cancel();
    }
    _account.removeListener(_sessionChanged);
    if (_account.beforeSignOut == forget) _account.beforeSignOut = null;
  }
}

/// The app's one push controller.
final pushController = PushController(account: accountController);
