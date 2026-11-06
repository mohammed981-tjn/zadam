/// «ينتظرك» في رئيسيّة التطبيق (البند ٢٠٦): ما يقرؤه التطبيق من /api/app/home بجلسة صاحبه، وأين تفتح كلّ بطاقة،
/// وترتيب المجموعات بحسب الجانب، والقائمة كما تُرسم.
library;

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sudagri/account.dart';
import 'package:sudagri/api.dart';
import 'package:sudagri/home.dart';
import 'package:sudagri/screens/home_screen.dart';
import 'package:sudagri/theme.dart';

/// What the route answers for a farmer who also invests, as src/lib/roleHome.ts arranges it.
final _sample = <String, dynamic>{
  'role': 'farmer',
  'name': 'آمنة عبد الله',
  'side': 'farmer',
  'waiting': 3,
  'full': [
    {
      'group': 'farmer',
      'title': 'أرضي ومواسمي',
      'items': [
        {
          'key': 'evidence',
          'kind': 'waiting',
          'count': 1,
          'title': 'مراحل تنتظر أدلّتها',
          'detail': '«الزراعة» في «ذرة الجزيرة»: ارفع صورةً أو فاتورة ثمّ اعتمدها',
          'href': '/seasons/s1',
        },
        {
          'key': 'season:s1',
          'kind': 'status',
          'count': null,
          'title': 'ذرة الجزيرة · ذرة رفيعة',
          'detail': 'المرحلة التالية: الزراعة — صُرف ٥٠٪ من ميزانيّتها',
          'href': '/seasons/s1',
        },
      ],
    },
  ],
  'compact': [
    {
      'group': 'investor',
      'title': 'استثماري',
      'items': [
        {'key': 'sign:investor', 'kind': 'waiting', 'count': 2, 'title': 'عقودٌ تنتظر توقيعك', 'detail': null, 'href': '/invest/agreements/a1'},
      ],
    },
  ],
};

void main() {
  Future<AccountController> controller(Future<http.Response> Function(http.Request) handler) async {
    final expires = DateTime.now().toUtc().add(const Duration(hours: 1)).millisecondsSinceEpoch ~/ 1000;
    SharedPreferences.setMockInitialValues({
      'sudagri.session': jsonEncode({'access_token': 'a1', 'refresh_token': 'r1', 'expires_at': expires}),
    });
    final c = AccountController(siteUrl: 'https://site.test', supabaseUrl: 'https://db.test', anonKey: 'anon',
        client: MockClient(handler));
    await c.load();
    return c;
  }

  group('what the route says', () {
    test('is read from /api/app/home with the person\'s token', () async {
      final c = await controller((req) async {
        expect(req.method, 'GET');
        expect(req.url.path, '/api/app/home');
        expect(req.headers['authorization'], 'Bearer a1');
        return http.Response.bytes(utf8.encode(jsonEncode(_sample)), 200);
      });
      final d = await HomeApi(account: c).load();
      expect(d.side, 'farmer');
      expect(d.waiting, 3);
      expect(d.full.single.items.map((i) => i.key), ['evidence', 'season:s1']);
      expect(d.full.single.items.first.waiting, isTrue);
      expect(d.full.single.items.last.count, isNull);
      expect(d.compact.single.items.single.count, 2);
    });

    test('a refusal comes back in the site\'s words', () async {
      final c = await controller((_) async =>
          http.Response.bytes(utf8.encode('{"error":"تعذّر تحميل ما ينتظرك. أعد المحاولة بعد قليل."}'), 500));
      expect(() => HomeApi(account: c).load(),
          throwsA(isA<ApiException>().having((e) => e.message, 'message', 'تعذّر تحميل ما ينتظرك. أعد المحاولة بعد قليل.')));
    });

    test('the headline counts what is kept on the phone, and the greeting uses the first name', () {
      final d = RoleHomeData.fromJson(_sample);
      expect(d.headline(0), 'ينتظرك 3');
      expect(d.headline(2), 'ينتظرك 5');
      expect(d.greeting, 'أهلاً آمنة');
      final none = RoleHomeData.fromJson({'side': 'nonsense', 'waiting': 0});
      expect(none.headline(0), 'لا شيء ينتظرك الآن');
      expect(none.greeting, 'أهلاً بك');
      expect(none.side, 'farmer', reason: 'an unknown side reads as the farmer\'s, as on the website');
      expect(none.full, isEmpty);
    });
  });

  group('order and destinations', () {
    test('an investor sees the market and investment first; everyone else the farm', () {
      expect(sectionOrder('investor'), [1, 0, 2]);
      expect(sectionOrder('farmer'), [0, 1, 2]);
      expect(sectionOrder(null), [0, 1, 2]);
    });

    test('each card opens its page\'s own screen', () {
      expect(destinationOf('/seasons/s1'), (screen: HomeScreenKey.season, id: 's1', tab: 0));
      expect(destinationOf('/seasons').screen, HomeScreenKey.seasons);
      expect(destinationOf('/seasons/offline').screen, HomeScreenKey.seasons);
      expect(destinationOf('/lands').screen, HomeScreenKey.lands);
      expect(destinationOf('/lands/l1').screen, HomeScreenKey.lands);
      expect(destinationOf('/herds/h1').screen, HomeScreenKey.herds);
      expect(destinationOf('/books?report=links').screen, HomeScreenKey.books);
      expect(destinationOf('/invest/agreements/a1'), (screen: HomeScreenKey.agreement, id: 'a1', tab: 0));
      expect(destinationOf('/invest/mine'), (screen: HomeScreenKey.invest, id: null, tab: 1));
      expect(destinationOf('/invest/inspections/i1').tab, 1);
      expect(destinationOf('/invest'), (screen: HomeScreenKey.invest, id: null, tab: 0));
      expect(destinationOf('/dashboard'), (screen: HomeScreenKey.invest, id: null, tab: 1));
      expect(destinationOf('/market/alerts'), (screen: HomeScreenKey.prices, id: null, tab: 3));
      expect(destinationOf('/suppliers/orders/o1'), (screen: HomeScreenKey.suppliers, id: null, tab: 1));
      expect(destinationOf('/suppliers/deliveries').tab, 2);
      expect(destinationOf('/suppliers/mine').tab, 3);
      expect(destinationOf('/agent'), (screen: HomeScreenKey.agent, id: null, tab: 0));
      expect(destinationOf('/partners/mine').screen, HomeScreenKey.agent);
      expect(destinationOf('/account/agents'), (screen: HomeScreenKey.agent, id: null, tab: 1));
      expect(destinationOf('/admin/inbox').screen, HomeScreenKey.account);
      expect(destinationOf('/notifications').screen, HomeScreenKey.account);
      expect(destinationOf('').screen, HomeScreenKey.account);
    });
  });

  testWidgets('the list shows the count, the cards and the other side, and a card opens', (tester) async {
    tester.view.physicalSize = const Size(390, 1600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    HomeCard? opened;
    await tester.pumpWidget(MaterialApp(
      theme: sudagriLight,
      locale: const Locale('ar'),
      supportedLocales: const [Locale('ar')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: Scaffold(
        body: SingleChildScrollView(
          child: WaitingBoard(data: RoleHomeData.fromJson(_sample), offline: 1, onOpen: (c) => opened = c),
        ),
      ),
    ));

    expect(find.text('ينتظرك 4'), findsOneWidget);
    expect(find.text('أهلاً آمنة'), findsOneWidget);
    expect(find.text('محفوظٌ على هاتفك لم يُرسل بعد'), findsOneWidget);
    expect(find.text('مراحل تنتظر أدلّتها'), findsOneWidget);
    expect(find.text('ذرة الجزيرة · ذرة رفيعة'), findsOneWidget);
    expect(find.text('وينتظرك في جوانبك الأخرى'), findsOneWidget);
    expect(find.text('استثماري: عقودٌ تنتظر توقيعك'), findsOneWidget);
    // One group of one's own: its title is not repeated over the cards.
    expect(find.text('أرضي ومواسمي'), findsNothing);

    await tester.tap(find.text('مراحل تنتظر أدلّتها'));
    expect(opened?.href, '/seasons/s1');
    await tester.tap(find.text('استثماري: عقودٌ تنتظر توقيعك'));
    expect(opened?.href, '/invest/agreements/a1');
    expect(tester.takeException(), isNull);
  });

  // Last in the file: it signs the app's own controller in.
  testWidgets('signed in, the home asks what waits, and an unreachable site is a retry under the hero', (tester) async {
    tester.view.physicalSize = const Size(390, 4200);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final payload = base64Url.encode(utf8.encode(jsonEncode({'sub': 'u1'}))).replaceAll('=', '');
    final expires = DateTime.now().toUtc().add(const Duration(hours: 1)).millisecondsSinceEpoch ~/ 1000;
    SharedPreferences.setMockInitialValues({
      'sudagri.session': jsonEncode({'access_token': 'h.$payload.s', 'refresh_token': 'r1', 'expires_at': expires}),
    });
    await tester.runAsync(accountController.load);

    await tester.pumpWidget(MaterialApp(
      theme: sudagriLight,
      locale: const Locale('ar'),
      supportedLocales: const [Locale('ar')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: const HomeScreen(),
    ));
    await tester.pump(const Duration(milliseconds: 600));

    // No site is configured in a test, so the read is refused at once: the board still builds, the groups in the
    // farm-first order, and the refusal offers a retry rather than a crash.
    expect(find.text('التطبيق غير مضبوط للاتصال بالموقع.'), findsOneWidget);
    expect(find.text('إعادة المحاولة'), findsWidgets);
    final farm = tester.getTopLeft(find.text('مزرعتي')).dy;
    final market = tester.getTopLeft(find.text('السوق والاستثمار')).dy;
    expect(farm < market, isTrue);
    expect(tester.takeException(), isNull);
  });
}
