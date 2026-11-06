/// «أراضيّ» في التطبيق (البند ٢٠٣): what /api/app/lands/* returns, the client's routes and bodies against a stand-in
/// server, and the list and the card on screen.
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
import 'package:sudagri/lands.dart';
import 'package:sudagri/screens/lands_screen.dart';
import 'package:sudagri/theme.dart';

const site = 'https://site.test';

http.Response json(Object body, [int status = 200]) => http.Response.bytes(
    utf8.encode(jsonEncode(body)), status,
    headers: {'content-type': 'application/json; charset=utf-8'});

Future<AccountController> signedIn(Future<http.Response> Function(http.Request) handler) async {
  final expires = DateTime.now().toUtc().add(const Duration(hours: 1)).millisecondsSinceEpoch ~/ 1000;
  SharedPreferences.setMockInitialValues({
    'sudagri.session': jsonEncode({'access_token': 'a1', 'refresh_token': 'r1', 'expires_at': expires}),
  });
  final c = AccountController(siteUrl: site, supabaseUrl: 'https://db.test', anonKey: 'anon', client: MockClient(handler));
  await c.load();
  return c;
}

Widget app(Widget home) => MaterialApp(
      theme: sudagriLight,
      locale: const Locale('ar'),
      supportedLocales: const [Locale('ar')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: home,
    );

/// A phone tall enough that the whole page is built, so a finder sees every section without dragging the map.
void tallPhone(WidgetTester tester) {
  tester.view.physicalSize = const Size(1080, 14000);
  tester.view.devicePixelRatio = 2.5;
  addTearDown(tester.view.reset);
}

/// Brings [target] onto the screen.
Future<void> scrollTo(WidgetTester tester, Finder target) async {
  await tester.ensureVisible(target);
  await tester.pumpAndSettle();
}

const summary = {
  'id': 'l1',
  'name': 'حواشة الشيخ',
  'state': 'الجزيرة',
  'locality': 'الحصاحيصا',
  'feddans': 4.5,
  'station': 'ود مدني',
  'water_source': 'قناة من خزان أو نهر',
  'soil': 'تربة طينيّة متشقّقة',
  'verification': 'verified',
  'verification_label': 'محقّقة',
  'verification_note': null,
  'documents_on_file': 3,
  'documents_required': 3,
  'listed': true,
  'open_to_investors': false,
  'open_to_partners': true,
  'has_location': true,
  'drawn': true,
};

Map<String, dynamic> cardJson({bool openToInvestors = false}) => {
      'land': {
        'id': 'l1',
        'name': 'حواشة الشيخ',
        'state': 'الجزيرة',
        'locality': 'الحصاحيصا',
        'village': null,
        'feddans': 4.5,
        'station_key': 'wad_medani',
        'station': 'ود مدني',
        'water_source': 'canal',
        'water_source_label': 'قناة من خزان أو نهر',
        'water_per_feddan': 3000,
        'soil_note': null,
        'previous_crops': 'قطن',
        'tenure': 'ملك',
        'latitude': 14.4,
        'longitude': 33.5,
        'boundary': [
          [14.40, 33.50],
          [14.40, 33.502],
          [14.402, 33.502],
        ],
        'drawn_feddans': 4.48,
        'soil': {'name': 'تربة طينيّة متشقّقة', 'probability': 62, 'from_satellite': true},
        'verification': 'verified',
        'verification_label': 'محقّقة',
        'verification_note': 'صورة الحيازة واضحة.',
        'documents_on_file': 2,
        'documents_required': 3,
        'listed': true,
        'open_to_investors': openToInvestors,
        'investor_models': openToInvestors ? ['lease'] : [],
        'investor_note': null,
        'open_to_partners': null,
        'crop_keys': [],
        'partner_group': 'تربة طينيّة · صغيرة',
      },
      'documents': {
        'kinds': [
          {'key': 'tenure', 'label': 'إثبات حيازة أو عقد إيجار', 'have': true},
          {'key': 'photo', 'label': 'صورة للأرض', 'have': true},
          {'key': 'permit', 'label': 'تصريح أو موافقة', 'have': false},
        ],
        'files': [
          {'id': 'd1', 'kind': 'tenure', 'label': 'إثبات حيازة أو عقد إيجار', 'caption': 'شهادة البحث'},
        ],
      },
      'investors': {
        'models': [
          {'key': 'sharecrop', 'label': 'مشاركة بالمحصول', 'detail': 'يقدّم الأرض والماء والعمل.'},
          {'key': 'lease', 'label': 'إيجار الأرض', 'detail': 'يأخذ أجرةً متّفقاً عليها.'},
        ],
        'requests': [
          {'id': 'r1', 'status': 'pending', 'name': 'سلمى', 'model': 'إيجار الأرض', 'message': 'أريد استئجارها للموسم', 'phone': null, 'record': 'من السعودية'},
          {'id': 'r2', 'status': 'accepted', 'name': 'أحمد', 'model': 'مشاركة بالمحصول', 'message': 'نبدأ في نوفمبر', 'phone': '+966500000000'},
        ],
        'inspections': [],
      },
      'partners': {'crops': [], 'interests': []},
      'tests': [
        {'id': 't1', 'kind': 'water', 'tested_on': '2026-10-01', 'lab': 'مختبر ود مدني', 'values': 'EC 0.5 dS/m · pH 7.6',
         'reading': 'ملوحة الماء: بلا قيدٍ على الريّ (أقلّ من ٠٫٧).', 'note': null, 'deletable': true},
      ],
      'soil_crops': null,
      'seasons': [
        {'id': 's1', 'name': 'شتوي ٢٠٢٦', 'status': 'جارٍ', 'line': 'قمح · غمر · 4.5 فدان · 2026-11-15'},
      ],
    };

void main() {
  test('the list line parses, and the documents counter says «مكتملة» once enough are on file', () {
    final l = LandSummary.fromJson(summary);
    expect(l.verified, isTrue);
    expect(l.documentsLine, 'المستندات مكتملة ✓');
    expect(l.openToPartners, isTrue);
    expect(LandSummary.fromJson({...summary, 'documents_on_file': 1}).documentsLine, 'المستندات: 1 من 3');
    expect(LandSummary.fromJson({...summary, 'open_to_investors': null}).openToInvestors, isNull,
        reason: 'a database before the investor migration offers nothing rather than a button that fails');
  });

  test('the card parses: the drawn boundary, the soil, the documents, the requests and the tests', () {
    final c = LandCard.fromJson(cardJson());
    expect(c.boundary, hasLength(3));
    expect(c.boundary.first, (14.40, 33.50));
    expect(c.drawnFeddans, 4.48);
    expect(c.soil!.fromSatellite, isTrue);
    expect(c.documentKinds.where((k) => k.have), hasLength(2));
    expect(c.documents.single.caption, 'شهادة البحث');
    expect(c.investorRequests.first.pending, isTrue);
    expect(c.investorRequests.first.phone, isNull);
    expect(c.investorRequests.last.phone, '+966500000000');
    expect(c.openToPartners, isNull);
    expect(c.tests.single.deletable, isTrue);
    expect(c.tests.single.kindLabel, 'ماء');
    expect(c.seasons.single.status, 'جارٍ');
  });

  test('the water rows parse, and a land without a place says so', () {
    final w = LandWater.fromJson({
      'located': true,
      'feddans': 4.5,
      'rows': [
        {'period': 'العشرة الأولى من أكتوبر', 'mm_per_day': 3.2, 'm3_per_feddan': 134.4, 'm3_land': 605},
      ],
      'note': 'الحساب…',
      'source': 'https://data.apps.fao.org/x',
    });
    expect(w.rows.single.m3Land, 605);
    expect(LandWater.fromJson({'located': false, 'rows': [], 'note': 'أضف موقع هذه الأرض'}).located, isFalse);
    expect(fmt0(12600), '12,600');
    expect(fmt0(605.4), '605');
  });

  test('the client reads the routes with the token and sends the owner\'s steps as the website\'s forms', () async {
    final seen = <String>[];
    Map<String, dynamic>? posted;
    final account = await signedIn((req) async {
      seen.add('${req.method} ${req.url.path}');
      expect(req.headers['authorization'], 'Bearer a1');
      if (req.url.path == '/api/app/lands/mine') return json({'lands': [summary]});
      if (req.url.path == '/api/app/lands/l1' && req.method == 'GET') return json(cardJson());
      if (req.url.path == '/api/app/lands/l1/water') return json({'located': false, 'rows': [], 'note': 'x'});
      if (req.url.path == '/api/app/lands/l1' && req.method == 'POST') {
        posted = jsonDecode(req.body) as Map<String, dynamic>;
        if (posted!['action'] == 'partners') return json({'error': 'ليست لك هذه الأرض.'}, 400);
        return json({'ok': true, 'message': 'عُرضت أرضك في صفحة فرص الاستثمار.'});
      }
      return json({'error': 'غير موجود'}, 404);
    });
    final api = LandsApi(account);

    expect((await api.mine()).single.name, 'حواشة الشيخ');
    expect((await api.card('l1')).name, 'حواشة الشيخ');
    expect((await api.water('l1')).located, isFalse);

    final message = await api.setInvestors('l1', open: true, models: ['lease'], note: 'أرضٌ على القناة');
    expect(message, 'عُرضت أرضك في صفحة فرص الاستثمار.');
    expect(posted, {'action': 'investors', 'open': true, 'models': ['lease'], 'note': 'أرضٌ على القناة'});

    await api.decideInvestor('l1', 'r1', accept: false);
    expect(posted, {'action': 'investor_decide', 'interest_id': 'r1', 'accept': false});

    await api.addTest('l1', kind: 'soil', testedOn: '2026-10-01', ec: 4.2, organic: 1.1);
    expect(posted!['action'], 'test');
    expect(posted!['ec_dsm'], 4.2);
    expect(posted!['organic_matter_pct'], 1.1);

    await expectLater(
      api.setPartners('l1', open: true, crops: ['wheat']),
      throwsA(isA<ApiException>().having((e) => e.message, 'message', 'ليست لك هذه الأرض.')),
    );
    expect(seen, containsAll(['GET /api/app/lands/mine', 'GET /api/app/lands/l1', 'GET /api/app/lands/l1/water']));
  });

  testWidgets('the list shows each land, and a land opens its card with the boundary and the review note', (tester) async {
    tallPhone(tester);
    Map<String, dynamic>? posted;
    final account = await signedIn((req) async {
      if (req.url.path == '/api/app/lands/mine') return json({'lands': [summary]});
      if (req.url.path == '/api/app/lands/l1/water') return json({'located': false, 'rows': [], 'note': 'أضف موقع هذه الأرض'});
      if (req.url.path == '/api/app/lands/l1' && req.method == 'GET') return json(cardJson(openToInvestors: posted != null));
      if (req.method == 'POST') {
        posted = jsonDecode(req.body) as Map<String, dynamic>;
        return json({'ok': true, 'message': 'عُرضت أرضك.'});
      }
      return json({'error': 'غير موجود'}, 404);
    });
    final api = LandsApi(account);

    await tester.pumpWidget(app(LandsScreen(api: api)));
    await tester.pumpAndSettle();
    expect(find.text('حواشة الشيخ'), findsOneWidget);
    expect(find.text('محقّقة'), findsOneWidget);
    expect(find.text('مفتوحة للشركات'), findsOneWidget);
    expect(find.byKey(const Key('add-land')), findsOneWidget);

    await tester.tap(find.text('حواشة الشيخ'));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('verification-note')), findsOneWidget);
    expect(find.textContaining('صورة الحيازة واضحة'), findsOneWidget);
    await scrollTo(tester, find.text('الحدود على الخريطة'));
    expect(find.text('الحدود على الخريطة'), findsOneWidget);

    // «اعرضها» opens the models, all ticked when none were chosen before, and sends them.
    await scrollTo(tester, find.byKey(const Key('investors-offer')));
    await tester.tap(find.byKey(const Key('investors-offer')));
    await tester.pumpAndSettle();
    await scrollTo(tester, find.byKey(const Key('investors-submit')));
    await tester.tap(find.byKey(const Key('investors-submit')));
    await tester.pumpAndSettle();
    expect(posted!['action'], 'investors');
    expect(posted!['open'], isTrue);
    expect((posted!['models'] as List).toSet(), {'sharecrop', 'lease'});
    expect(find.text('عُرضت أرضك.'), findsOneWidget);
    // The card again, now open to investors.
    await scrollTo(tester, find.byKey(const Key('investors-close')));
    expect(find.byKey(const Key('investors-close')), findsOneWidget);
  });

  testWidgets('no land yet says how to start, and a refusal shows the server\'s words with a retry', (tester) async {
    tallPhone(tester);
    var fail = true;
    final account = await signedIn((req) async {
      if (fail) return json({'error': 'انتهت جلستك. ادخل من جديد.'}, 500);
      return json({'lands': []});
    });
    await tester.pumpWidget(app(LandsScreen(api: LandsApi(account))));
    await tester.pumpAndSettle();
    expect(find.text('انتهت جلستك. ادخل من جديد.'), findsOneWidget);
    fail = false;
    await tester.tap(find.text('إعادة المحاولة'));
    await tester.pumpAndSettle();
    expect(find.text('لم تسجّل أرضاً بعد'), findsOneWidget);
  });
}
