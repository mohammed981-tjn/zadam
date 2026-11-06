/// دراسة الجدوى والخطّة في التطبيق (البند ٢٠٣): the app sends the inputs and
/// draws what /api/app/feasibility computed — it does none of the arithmetic —
/// and makes the project and the plan as the signed-in person.
library;

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:sudagri/api.dart';
import 'package:sudagri/feasibility.dart';
import 'package:sudagri/screens/feasibility_screen.dart';
import 'package:sudagri/theme.dart';

const site = 'https://site.test';

http.Response json(Object body, [int status = 200]) => http.Response.bytes(
    utf8.encode(jsonEncode(body)), status,
    headers: {'content-type': 'application/json; charset=utf-8'});

final options = {
  'defaults': {
    'crop': 'sorghum',
    'station': 'gezira',
    'plantingMonth': 5,
    'method': 'flood',
    'feddans': 50,
    'costPerFeddan': 120,
    'waterTariff': 0,
  },
  'crops': [
    {'key': 'sorghum', 'name': 'الذرة الرفيعة', 'group': 'sudan', 'hasInputs': true},
    {'key': 'faba_bean', 'name': 'الفول المصري', 'group': 'new', 'hasInputs': false},
  ],
  'stations': [
    {'key': 'gezira', 'name': 'الجزيرة (ود مدني)'},
  ],
  'months': ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
  'methods': [
    {'key': 'flood', 'label': 'ري بالغمر'},
    {'key': 'drip', 'label': 'ري بالتنقيط'},
  ],
  'risks': [
    {
      'key': 'locust',
      'name': 'الجراد الصحراوي',
      'reserve': false,
      'basis': 'غزوان في 1988 و1998.',
      'treatment': 'جاهزيّةٌ لا رشٌّ مجدول.',
      'services': ['الاستجابة للجراد'],
      'sources': [
        {'label': 'FAO', 'url': 'https://example.test/fao'},
      ],
    },
  ],
  'riskDefaults': [
    {'key': 'locust', 'applies': true, 'everyYears': 10, 'lossPct': 30, 'reserveUsd': null},
  ],
  'newCrops': [
    {'key': 'faba_bean', 'name': 'الفول المصري', 'inStudy': true, 'evidence': 'يُزرع في الشمال.', 'sources': []},
  ],
};

Map<String, dynamic> study({required String crop, required bool newCrop}) => {
      'input': {'crop': crop, 'cropName': newCrop ? 'الفول المصري' : 'الذرة الرفيعة', 'feddans': 50, 'stationName': 'الجزيرة'},
      'referenceUnavailable': false,
      'fx': {'sdgPerUsd': 2500, 'sdgPerUsdParallel': 3600},
      'advice': {
        'chosen': 'flood',
        'recommended': 'flood',
        'savingM3PerFeddan': 0,
        'savingShare': 0,
        'pivotMinFeddans': 100,
        'methods': [
          {'method': 'flood', 'label': 'ري بالغمر', 'suitability': 'suited', 'tooSmall': false, 'm3PerFeddan': 3400},
        ],
      },
      'needs': newCrop
          ? null
          : {
              'system': 'مرويّ',
              'seedKg': [3, 4],
              'ureaKg': [40, 40],
              'phosphate': null,
              'timing': null,
              'sprays': null,
              'operations': 'حراثة',
              'sources': [],
              'estimate': {'lines': [], 'totalUsd': 30.5, 'missing': ['ثمن البذور']},
              'localReferences': [],
              'fertiliserSource': 'https://example.test/wb',
              'canMakeProject': true,
            },
      'published': newCrop
          ? [
              {
                'figure': '1,408 SDG/feddan',
                'basis': 'التكلفة الكلّيّة',
                'season': '2013–14',
                'place': 'ولاية نهر النيل، ريّ صغير',
                'source': 'FAO & Mamoun Beheiry Center (2017)',
                'url': 'https://example.test/rn',
              },
            ]
          : [],
      'reference': {
        'sudanKgPerHa': 700,
        'nearestPeerKgPerHa': 5500,
        'peerMedianKgPerHa': 1500,
        'usdPerTonne': 300,
        'year': 2023,
        'priceBasis': 'sudan_export',
        'priceBasisLabel': 'قيمة الوحدة التصديرية للسودان',
        'priceBasisNote': 'قيمة الصادر مقسومة على كميته.',
        'stationSource': 'NASA POWER',
      },
      'phases': [
        {
          'stage': 'land_prep',
          'name': 'تحضير الأرض',
          'cost': 900,
          'cumulativeCost': 900,
          'cumulativeShare': 0.15,
          'breakEvenKgPerHa': 238.0,
          'verdict': 'within_national',
          'verdictLabel': 'يُسترد بالمتوسط الوطني',
          'lastSafeExit': true,
        },
        {
          'stage': 'planting',
          'name': 'الزراعة',
          'cost': 1200,
          'cumulativeCost': 2100,
          'cumulativeShare': 0.35,
          'breakEvenKgPerHa': 1111.0,
          'verdict': 'needs_peer',
          'verdictLabel': 'يحتاج أعلى من المتوسط الوطني',
          'lastSafeExit': false,
        },
      ],
      'lastSafeExit': 'land_prep',
      'verdict': 'needs_peer',
      'verdictLabel': 'يحتاج أعلى من المتوسط الوطني',
      'breakEvenKgPerHa': 3175.0,
      'totals': {
        'fieldCost': 6000,
        'waterM3Total': 170000,
        'waterCost': 0,
        'totalCost': 6000,
        'costPerFeddan': 120,
        'revenueAtNational': 2206,
        'marginAtNational': -3794,
        'revenueAtPeer': 17336,
        'marginAtPeer': 11336,
      },
      'risks': {
        'settings': [],
        'protectionUsd': 0,
        'sprayNote': null,
        'rows': [
          {'key': 'locust', 'expectedUsd': 66.2},
        ],
        'expectedTotalUsd': 66.2,
        'reserveTotalUsd': 0,
        'uncounted': [],
        'marginAfterUsd': -3860,
        'badYear': {'key': 'locust', 'marginUsd': -4456},
      },
      'locust': null,
    };

void main() {
  test('n0 writes whole numbers as the website does', () {
    expect(n0(1234567.4), '1,234,567');
    expect(n0(-3794), '−3,794');
    expect(n0(null), '—');
    expect(usd(950), '950 \$');
  });

  test('the inputs open on the website\'s defaults and carry the risks as set', () {
    final o = StudyOptions.fromJson(options);
    final i = StudyInputs.fromOptions(o);
    expect(i.crop, 'sorghum');
    expect(i.feddans, 50);
    expect(i.costPerFeddan, 120);
    expect(i.plantingMonth, 5);
    i.risks.first.lossPct = 20;
    final j = i.toJson();
    expect(j['manualPrice'], '');
    expect((j['risks'] as List).first, {'key': 'locust', 'applies': true, 'everyYears': 10.0, 'lossPct': 20.0, 'reserveUsd': null});
    expect(StudyInputs.fromOptions(o, crop: 'faba_bean').crop, 'faba_bean');
    expect(StudyInputs.fromOptions(o, crop: 'made_up').crop, 'sorghum');
    expect(o.riskDefaults.first.lossPct, 30, reason: 'the defaults are copied, not shared');
  });

  test('signed out, the study is the public route; signed in, the session one; a refused session falls back', () async {
    final seen = <String>[];
    final client = MockClient((req) async {
      seen.add('public ${req.method} ${req.url.path}');
      final body = jsonDecode(req.body) as Map<String, dynamic>;
      expect(body['crop'], 'sorghum');
      expect(body['feddans'], 50);
      return json(study(crop: 'sorghum', newCrop: false));
    });
    var signedIn = false;
    var refuse = false;
    final api = FeasibilityApi(
      client: client,
      siteUrl: site,
      signedIn: () => signedIn,
      call: (method, path, {body}) async {
        seen.add('session $method $path');
        if (refuse) throw ApiException('انتهت جلستك. ادخل من جديد.');
        return study(crop: 'sorghum', newCrop: false);
      },
    );
    final inputs = StudyInputs.fromOptions(StudyOptions.fromJson(options));
    final s = await api.study(inputs);
    expect(s.phases.length, 2);
    expect(s.lastSafeExit, 'land_prep');
    expect(s.total('marginAtNational'), -3794);
    expect(s.expectedUsd('locust'), 66.2);
    signedIn = true;
    await api.study(inputs);
    refuse = true;
    await api.study(inputs);
    expect(seen, [
      'public POST /api/app/feasibility',
      'session POST /api/app/feasibility',
      'session POST /api/app/feasibility',
      'public POST /api/app/feasibility',
    ]);
  });

  test('«حوّلها إلى مشروع» and the plan go to their routes as the signed-in person', () async {
    final calls = <String, Map<String, dynamic>?>{};
    final api = FeasibilityApi(
      client: MockClient((_) async => json({})),
      siteUrl: site,
      call: (method, path, {body}) async {
        calls[path] = body;
        if (path == '/api/app/plan') {
          return {
            'riskProfileLabel': 'متوسط',
            'requestedAmount': 500,
            'allocatedAmount': 480,
            'allocations': [
              {'name': 'مشروع السمسم', 'slug': 'sesame', 'riskLabel': 'منخفض', 'shares': 4, 'amount': 480},
            ],
          };
        }
        return {'ok': true, 'message': 'أُنشئت القائمة من دراسة الجدوى.'};
      },
    );
    expect(await api.makeProject(crop: 'sorghum', feddans: 12.5), 'أُنشئت القائمة من دراسة الجدوى.');
    expect(calls['/api/app/feasibility/project'], {'crop': 'sorghum', 'feddans': 12.5});
    final plan = await api.plan(amount: 500, q1: 1, q2: 2, q3: 3);
    expect(calls['/api/app/plan'], {'amount': 500.0, 'q1': 1, 'q2': 2, 'q3': 3});
    expect(plan.allocations.single.shares, 4);
    expect(plan.allocated, 480);
  });

  test('a route\'s refusal reaches the reader in its own words', () async {
    final api = FeasibilityApi(
      client: MockClient((_) async => json({'error': 'تعذّر حساب الدراسة بهذه المدخلات.'}, 400)),
      siteUrl: site,
      signedIn: () => false,
    );
    expect(
      () => api.study(StudyInputs.fromOptions(StudyOptions.fromJson(options))),
      throwsA(isA<ApiException>().having((e) => e.message, 'message', 'تعذّر حساب الدراسة بهذه المدخلات.')),
    );
  });

  testWidgets('the screen draws the ladder, the last safe exit and, for a new crop, the published costs as written',
      (tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 2.5;
    addTearDown(tester.view.reset);

    final api = FeasibilityApi(
      siteUrl: site,
      signedIn: () => false,
      client: MockClient((req) async {
        if (req.method == 'GET') return json(options);
        final body = jsonDecode(req.body) as Map<String, dynamic>;
        return json(study(crop: '${body['crop']}', newCrop: body['crop'] == 'faba_bean'));
      }),
    );
    await tester.pumpWidget(MaterialApp(
      theme: sudagriLight,
      locale: const Locale('ar'),
      supportedLocales: const [Locale('ar')],
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
      home: FeasibilityScreen(api: api, initialCrop: 'faba_bean'),
    ));
    await tester.pumpAndSettle();

    expect(find.text('دراسة الجدوى والخطّة'), findsOneWidget);
    final down = find.byWidgetPredicate((w) => w is Scrollable && w.axisDirection == AxisDirection.down).first;
    await tester.scrollUntilVisible(find.textContaining('آخر مخرج آمن'), 300, scrollable: down);
    expect(find.textContaining('آخر مخرج آمن: «تحضير الأرض»'), findsOneWidget);

    await tester.scrollUntilVisible(find.text('1,408 SDG/feddan'), 300, scrollable: down);
    expect(find.text('1,408 SDG/feddan'), findsOneWidget);
    expect(find.textContaining('2013–14'), findsOneWidget);
    expect(find.text('FAO & Mamoun Beheiry Center (2017)'), findsOneWidget);

    await tester.scrollUntilVisible(find.text('السلّم المرحلي'), 300, scrollable: down);
    expect(find.text('1. تحضير الأرض'), findsOneWidget);
    expect(find.text('2. الزراعة'), findsOneWidget);
  });
}
