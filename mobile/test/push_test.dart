/// إشعارات الجوّال (البند ٢٠٧): التطبيق يعمل بلا Firebase، ويسجّل رمز الجوّال بجلسة صاحبه بعد الدخول وينساه عند
/// الخروج، ويفتح الشاشة الصحيحة حين يُضغط الإشعار، ومفتاح «إشعارات الجوّال» في «حسابي».
library;

import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sudagri/account.dart';
import 'package:sudagri/push.dart';
import 'package:sudagri/push_route.dart';
import 'package:sudagri/screens/account_screen.dart';
import 'package:sudagri/theme.dart';

class FakePush implements PushPlatform {
  FakePush({this.configured = true, this.granted = true, this.launchedBy});

  final bool configured;
  final bool granted;
  final String? launchedBy;
  int tokenCalls = 0;
  int deleted = 0;
  String current = 'fcm-token-0000000000000000001';
  final refresh = StreamController<String>.broadcast();
  final taps = StreamController<String>.broadcast();
  final shown = StreamController<PushNotice>.broadcast();

  @override
  Future<bool> init() async {
    if (!configured) throw StateError('No Firebase App has been created');
    return true;
  }

  @override
  Future<bool> requestPermission() async => granted;

  @override
  Future<String?> token() async {
    tokenCalls++;
    return current;
  }

  @override
  Stream<String> get tokenRefresh => refresh.stream;

  @override
  Future<void> deleteToken() async => deleted++;

  @override
  Stream<String> get opened => taps.stream;

  @override
  Future<String?> initialLink() async => launchedBy;

  @override
  Stream<PushNotice> get foreground => shown.stream;

  @override
  String get platform => 'android';
}

void main() {
  late List<http.Request> calls;

  Future<AccountController> controller({bool signedIn = true, int status = 200}) async {
    calls = [];
    final expires = DateTime.now().toUtc().add(const Duration(hours: 1)).millisecondsSinceEpoch ~/ 1000;
    SharedPreferences.setMockInitialValues({
      if (signedIn) 'sudagri.session': jsonEncode({'access_token': 'a1', 'refresh_token': 'r1', 'expires_at': expires}),
    });
    final c = AccountController(
      siteUrl: 'https://site.test',
      supabaseUrl: 'https://db.test',
      anonKey: 'anon',
      client: MockClient((req) async {
        calls.add(req);
        if (req.url.host == 'db.test' && req.url.path.endsWith('/token')) {
          return http.Response(jsonEncode({'access_token': 'a2', 'refresh_token': 'r2', 'expires_in': 3600}), 200);
        }
        if (req.url.host == 'db.test') return http.Response('{}', 204);
        if (req.url.path == '/api/app/push' && req.method == 'GET') {
          return http.Response(jsonEncode({'enabled': true, 'devices': 1}), 200);
        }
        if (req.url.path == '/api/app/push/settings') {
          final on = (jsonDecode(req.body) as Map)['enabled'] as bool;
          return http.Response(jsonEncode({'ok': true, 'enabled': on}), 200);
        }
        return http.Response.bytes(utf8.encode(jsonEncode(status == 200 ? {'ok': true} : {'error': 'رمز الجهاز غير صالح'})), status);
      }),
    );
    await c.load();
    return c;
  }

  Iterable<http.Request> to(String path) => calls.where((r) => r.url.path == path);

  group('without Firebase', () {
    test('a build with no google-services.json starts, with notifications off, and asks nothing', () async {
      final c = await controller();
      final p = PushController(account: c, platform: FakePush(configured: false), enabledHere: true);
      await p.start();
      expect(p.available, isFalse);
      expect(p.registered, isNull);
      expect(calls, isEmpty);
      expect(c.beforeSignOut, isNull);
      await c.signOut();
      expect(c.value, isNull, reason: 'signing out works as before');
    });

    test('the web build does not even try', () async {
      final c = await controller();
      final fake = FakePush();
      final p = PushController(account: c, platform: fake, enabledHere: false);
      await p.start();
      expect(p.available, isFalse);
      expect(fake.tokenCalls, 0);
    });
  });

  group('the phone\'s token', () {
    test('is registered after sign-in with the person\'s own session', () async {
      final c = await controller();
      final fake = FakePush();
      final p = PushController(account: c, platform: fake, enabledHere: true);
      await p.start();
      await pumpEventQueue();
      final reg = to('/api/app/push').single;
      expect(reg.method, 'POST');
      expect(reg.headers['authorization'], 'Bearer a1');
      expect(jsonDecode(reg.body), {'token': fake.current, 'platform': 'android', 'locale': 'ar'});
      expect(p.registered, fake.current);
    });

    test('is not registered while signed out, then is at sign-in', () async {
      final c = await controller(signedIn: false);
      final fake = FakePush();
      final p = PushController(account: c, platform: fake, enabledHere: true);
      await p.start();
      await pumpEventQueue();
      expect(to('/api/app/push'), isEmpty);
      c.value = Session(accessToken: 'a9', refreshToken: 'r9', expiresAt: DateTime.now().toUtc().add(const Duration(hours: 1)));
      await pumpEventQueue();
      expect(to('/api/app/push').single.headers['authorization'], 'Bearer a9');
    });

    test('is not sent when the person refuses notifications', () async {
      final c = await controller();
      final p = PushController(account: c, platform: FakePush(granted: false), enabledHere: true);
      await p.start();
      await pumpEventQueue();
      expect(to('/api/app/push'), isEmpty);
      expect(p.registered, isNull);
    });

    test('a new token from FCM is registered again', () async {
      final c = await controller();
      final fake = FakePush();
      final p = PushController(account: c, platform: fake, enabledHere: true);
      await p.start();
      await pumpEventQueue();
      fake.refresh.add('fcm-token-0000000000000000002');
      await pumpEventQueue();
      expect(to('/api/app/push').map((r) => (jsonDecode(r.body) as Map)['token']),
          [fake.current, 'fcm-token-0000000000000000002']);
      expect(p.registered, 'fcm-token-0000000000000000002');
    });

    test('a refusal leaves the app as it was', () async {
      final c = await controller(status: 400);
      final p = PushController(account: c, platform: FakePush(), enabledHere: true);
      await p.start();
      await pumpEventQueue();
      expect(p.registered, isNull);
      expect(c.value, isNotNull);
    });

    test('«خروج» forgets it on the server while the session still works, then on the phone', () async {
      final c = await controller();
      final fake = FakePush();
      final p = PushController(account: c, platform: fake, enabledHere: true);
      await p.start();
      await pumpEventQueue();
      await c.signOut();
      final forget = to('/api/app/push/forget').single;
      expect(forget.headers['authorization'], 'Bearer a1');
      expect(jsonDecode(forget.body), {'token': fake.current});
      final iForget = calls.indexOf(forget);
      final iLogout = calls.indexWhere((r) => r.url.path == '/auth/v1/logout');
      expect(iForget, lessThan(iLogout), reason: 'forgotten before the session ends');
      expect(fake.deleted, 1);
      expect(p.registered, isNull);
      expect(c.value, isNull);
    });

    test('a session that ran out deletes the token on the phone', () async {
      final c = await controller();
      final fake = FakePush();
      final p = PushController(account: c, platform: fake, enabledHere: true);
      await p.start();
      await pumpEventQueue();
      c.value = null;
      await pumpEventQueue();
      expect(fake.deleted, 1);
      expect(to('/api/app/push/forget'), isEmpty);
    });
  });

  group('a tapped notification', () {
    test('opens the screen of its page', () {
      expect(pushTarget('/messages/c1'), (tab: null, screen: PushScreen.thread, id: 'c1', screenTab: 0, site: null));
      expect(pushTarget('/messages').screen, PushScreen.messages);
      expect(pushTarget('/books/review').screen, PushScreen.booksReview);
      expect(pushTarget('/books/review?book=investor').screen, PushScreen.booksReview);
      expect(pushTarget('/books').screen, PushScreen.books);
      expect(pushTarget('/invest/agreements/a1'), (tab: null, screen: PushScreen.agreement, id: 'a1', screenTab: 0, site: null));
      expect(pushTarget('/market/forward/f1').id, 'f1');
      expect(pushTarget('/market/forward/f1').screen, PushScreen.forward);
      expect(pushTarget('/contracts/k1').screen, PushScreen.serviceContract);
      expect(pushTarget('/contracts').screen, PushScreen.contracts);
      expect(pushTarget('/market#khartoum:sorghum').screen, PushScreen.prices);
      expect(pushTarget('/rates').screen, PushScreen.prices);
      expect(pushTarget('/seasons/s1').id, 's1');
      expect(pushTarget('/lands').screen, PushScreen.lands);
      expect(pushTarget('/invest/mine').screenTab, 1);
    });

    test('the inbox and anything odd open «حسابي»; pages the app has no screen for open on the website', () {
      expect(pushTarget('/notifications').tab, accountTab);
      expect(pushTarget(null).tab, accountTab);
      expect(pushTarget('https://evil.example/x').tab, accountTab);
      expect(pushTarget('//evil.example/x').tab, accountTab);
      expect(pushTarget('/messages/../../x').screen, PushScreen.messages, reason: 'an id that is not one is not opened');
      expect(pushTarget('/admin/inbox').site, '/admin/inbox');
      expect(pushTarget('/nafir/judiyya/j1').site, '/nafir/judiyya/j1');
    });

    test('while running, and the one that started the app, reach the shell', () async {
      final c = await controller();
      final fake = FakePush(launchedBy: '/messages/c1');
      final p = PushController(account: c, platform: fake, enabledHere: true);
      await p.start();
      expect(p.tapped.value, '/messages/c1');
      p.tapped.value = null;
      fake.taps.add('/books/review');
      await pumpEventQueue();
      expect(p.tapped.value, '/books/review');
      fake.shown.add(const PushNotice(title: 'رسالة جديدة', body: 'في محادثة الشراكة', link: '/messages/c2'));
      await pumpEventQueue();
      expect(p.notice.value?.link, '/messages/c2');
    });
  });

  testWidgets('«إشعارات الجوّال» in «حسابي» reads the switch and turns it off', (tester) async {
    final c = await tester.runAsync(() => controller());
    final p = PushController(account: c!, platform: FakePush(configured: false), enabledHere: true);
    await tester.pumpWidget(MaterialApp(
      theme: sudagriLight,
      locale: const Locale('ar'),
      supportedLocales: const [Locale('ar')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: Scaffold(body: ListView(children: [PhonePushCard(push: p)])),
    ));
    await tester.runAsync(() => pumpEventQueue());
    await tester.pump();
    expect(find.text('إشعارات الجوّال'), findsOneWidget);
    expect(find.text('مفعَّلة'), findsOneWidget);
    expect(find.text('مسجَّلة على 1 جوّال.'), findsOneWidget);
    expect(find.byKey(const Key('phone-push-unavailable')), findsOneWidget,
        reason: 'this build has no Firebase configuration, and the card says so');
    await tester.tap(find.byKey(const Key('phone-push-switch')));
    await tester.runAsync(() => pumpEventQueue());
    await tester.pump();
    expect(find.text('مطفأة'), findsOneWidget);
    expect(jsonDecode(to('/api/app/push/settings').single.body), {'enabled': false});
  });
}
