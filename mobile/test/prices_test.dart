/// الأسعار والسوق في التطبيق (البند ٢٠٣): what /api/app/prices/** send is read
/// right, an old figure is said to be old in the website's words, the alert
/// form refuses what the website refuses, and the screen builds.
library;

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:sudagri/api.dart';
import 'package:sudagri/prices.dart';
import 'package:sudagri/screens/prices_screen.dart';
import 'package:sudagri/theme.dart';

Map<String, dynamic> marketJson({bool quiet = false, bool staleFeed = true}) => {
      'checked': '2026-11-04',
      'quiet': quiet,
      'last_bulletins': [
        {'market_name': 'الأبيض', 'date': '2026-10-20'},
      ],
      'usd': {'bank_name': 'بنك الخرطوم', 'sell': 4231.5, 'date': '2026-11-05'},
      'crops': [
        {
          'crop': 'sesame',
          'name': 'السمسم',
          'series': [
            {
              'market_name': 'الأبيض',
              'per_unit': 'للقنطار',
              'price': 650000,
              'usd': 153.6,
              'date': '2026-10-20',
              'age_days': 17,
              'stale': true,
              'source': 'https://suna-sd.net/x',
              'change': -5000,
              'change_pct': -0.76,
              'arrivals': 1200,
              'all_sorghum': false,
              'history': [
                {'date': '2026-10-18', 'price': 655000},
                {'date': '2026-10-20', 'price': 650000},
              ],
              'alert_subject': 'crop|obeid|sesame|qintar',
            },
          ],
        },
      ],
      'wfp_monthly': {
        'report': 'WFP Sudan Market Monitor',
        'source': 'https://wfp.org/r',
        'month': '2026-09',
        'gedarefAuction': {'arrivalsTonnes': 900, 'arrivalsVsLastMonthPct': 12, 'priceVsLastMonthPct': -3, 'priceVsLastYearPct': 40},
        'sorghumRetailPerKg': {
          'national': {'price': 2100, 'lastMonth': 2000},
          'northKordofan': {'price': 1900, 'lastMonth': 1850},
        },
      },
      'fews': [
        {'market': 'القضارف', 'product': 'ذرة', 'unit': '3.5 كجم', 'value': 7000, 'prev': 6800, 'month': '2026-09'},
      ],
      'fews_source': 'https://fews.net/east-africa/sudan',
      'wfp_towns': {
        'latest': '2026-09',
        'source': 'https://data.humdata.org/x',
        'towns': [
          {
            'name': 'الأبيض',
            'place': null,
            'latest': '2026-09',
            'items': [
              {'name': 'ذرة', 'unit': 'كجم', 'month': '2026-09', 'price': 1900, 'vs_month_pct': 3, 'vs_year_pct': -10, 'unusual': 'high', 'median': 1000},
            ],
          },
        ],
      },
      'feeds': [
        {'key': 'fx_bank', 'newest': '2026-11-05', 'age_days': 1, 'limit_days': 4, 'stale': false},
        {'key': 'crop_obeid', 'newest': '2026-10-20', 'age_days': 17, 'limit_days': 10, 'stale': staleFeed},
      ],
      'stale_lines': staleFeed ? ['قديم: نشرة سوق الأبيض — آخر رقمٍ 2026-10-20 (17 يوماً، والحدّ 10)'] : [],
      'units_note': 'القنطار ٤٥ كيلوغراماً (١٠٠ رطل).',
    };

const ratesJson = {
  'stale_days': 3,
  'bank': {'name': 'بنك الخرطوم', 'buy': 4200, 'sell': 4231.5, 'date': '2026-11-05', 'source': 'https://b.test', 'age_days': 1, 'stale': false},
  'parallel': {'buy': 8900, 'sell': 9004, 'date': '2026-10-30', 'source': 'https://p.test', 'age_days': 7, 'stale': true},
  'table': [
    {'code': 'USD', 'name': 'الدولار الأمريكي', 'bank': 4231.5, 'parallel': 9004},
    {'code': 'SAR', 'name': 'الريال السعودي', 'bank': 1128.4, 'parallel': 2401.07},
  ],
  'cbos': {'last_bulletin': '2022-03-07', 'liberalised': '2026-08-24', 'circular': '2026/16', 'source': 'https://st.test'},
  'cross_source': 'https://www.exchangerate-api.com',
};

const inputsJson = {
  'pending': false,
  'window_days': 14,
  'groups': [
    {
      'item': 'urea',
      'name': 'يوريا',
      'rows': [
        {'state': 'الجزيرة', 'kind': null, 'verdict': 'limited', 'verdict_label': 'قليل', 'median': 95000, 'low': 90000, 'high': 100000,
         'per_unit': 'للجوال (٥٠ كجم)', 'reports': 3, 'reporters': 1, 'unavailable': 1, 'latest_on': '2026-11-05', 'latest_days_ago': 1},
      ],
    },
  ],
  'reports': [
    {'id': 'r1', 'item': 'يوريا', 'state': 'الجزيرة', 'locality': 'ود مدني', 'kind': null, 'price': null, 'per_unit': 'للجوال (٥٠ كجم)',
     'availability': 'unavailable', 'availability_label': 'غير موجود', 'observed_on': '2026-11-05', 'note': null},
  ],
  'suppliers': [
    {'key': 'urea', 'name': 'يوريا', 'count': 2},
  ],
  'published': {
    'old_days': 60,
    'figures': [
      {'item': 'جازولين', 'place': 'الخرطوم', 'price': 3800, 'per_unit': 'للّتر', 'date': '2026-08-01', 'age_days': 97, 'old': true,
       'note': null, 'source': 'برنامج الأغذية العالمي', 'url': 'https://wfp.test'},
    ],
    'trends': [],
  },
};

const alertsJson = {
  'max_active': 10,
  'options': [
    {'value': 'crop|obeid|sesame|qintar', 'label': 'السمسم — الأبيض', 'unit': 'جنيه للقنطار', 'price': 650000, 'date': '2026-10-20'},
    {'value': 'fx_bank|||', 'label': 'الدولار — بنك الخرطوم', 'unit': 'جنيه', 'price': 4231.5, 'date': '2026-11-05'},
  ],
  'running': [
    {'id': 'a1', 'text': 'السمسم في الأبيض فوق 700,000 جنيه للقنطار', 'created_at': '2026-11-01T10:00:00Z'},
  ],
  'settled': [
    {'id': 'a2', 'text': 'الدولار في بنك الخرطوم فوق 4,000 جنيه', 'status': 'fired', 'fired_value': 4231.5, 'fired_market_date': '2026-11-05', 'settled_at': '2026-11-05T09:00:00Z'},
  ],
};

class FakePricesClient extends PricesClient {
  FakePricesClient({this.signedInAs = false});
  final bool signedInAs;
  final added = <Map<String, String>>[];

  @override
  Future<MarketBoard> market() async => MarketBoard.fromJson(marketJson());
  @override
  Future<RatesBoard> rates() async => RatesBoard.fromJson(ratesJson);
  @override
  Future<InputsBoard> inputs() async => InputsBoard.fromJson(inputsJson);
  @override
  Future<AlertsBoard> alerts() async => AlertsBoard.fromJson(alertsJson);
  @override
  Future<String> addAlert({required String subject, required String direction, required String threshold}) async {
    added.add({'subject': subject, 'direction': direction, 'threshold': threshold});
    return 'أضفنا التنبيه.';
  }
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

void main() {
  group('words and numbers', () {
    test('money groups as the website does, and drops trailing zeros', () {
      expect(money(1234567), '1,234,567');
      expect(money(4231.5, digits: 2), '4,231.5');
      expect(money(-5000), '-5,000');
      expect(money(0.756, digits: 1), '0.8');
    });

    test('a market day reads in Arabic', () {
      expect(arDay('2026-11-03'), '3 نوفمبر 2026');
      expect(arMonth('2026-09'), 'سبتمبر 2026');
      expect(arDay('not a date'), 'not a date');
    });

    test('the freshness label: the date alone when fresh, the age and the warning when old', () {
      expect(freshnessLabel(date: '2026-11-05', ageDays: 1, stale: false), 'بتاريخ 5 نوفمبر 2026');
      expect(
        freshnessLabel(date: '2026-10-20', ageDays: 17, stale: true),
        'بتاريخ 20 أكتوبر 2026 — مضى 17 يوماً، فتحقّق قبل أن تبيع أو تشتري عليه',
      );
      expect(
        freshnessLabel(date: '2026-10-30', ageDays: 7, stale: true, kind: FreshnessKind.rate),
        'بتاريخ 30 أكتوبر 2026 — مضى 7 أيام، فتحقّق قبل أن تعتمده',
      );
      expect(
        freshnessLabel(date: '2026-08-01', ageDays: 97, stale: true, kind: FreshnessKind.published),
        'نُشر في 1 أغسطس 2026 — قديم، فتحقّق قبل أن تشتري عليه',
      );
    });

    test('«stale» is the server\'s word, not a guess from the age', () {
      // The server's limit for crops is three days; four days with stale=false stays fresh here.
      expect(freshnessLabel(date: '2026-11-01', ageDays: 4, stale: false), 'بتاريخ 1 نوفمبر 2026');
    });
  });

  group('parsing', () {
    test('the crop market: cards, the old figure, the feeds and the monthly references', () {
      final b = MarketBoard.fromJson(marketJson());
      expect(b.crops.single.name, 'السمسم');
      final s = b.crops.single.series.single;
      expect(s.price, 650000);
      expect(s.stale, isTrue);
      expect(s.freshness, contains('مضى 17 يوماً'));
      expect(s.alertSubject, 'crop|obeid|sesame|qintar');
      expect(s.history.map((p) => p.price), [655000, 650000]);
      expect(b.staleFeeds.single.name, 'نشرة سوق الأبيض');
      expect(b.staleLines.single, startsWith('قديم: نشرة سوق الأبيض'));
      expect(b.wfpMonthly!.month, '2026-09');
      expect(b.wfpMonthly!.kordofanPrice, 1900);
      expect(b.fews!.single.market, 'القضارف');
      expect(b.wfpTowns.single.items.single.unusual, 'high');
    });

    test('FEWS NET unreachable is null, not an empty table', () {
      final j = marketJson()..['fews'] = null;
      expect(MarketBoard.fromJson(j).fews, isNull);
    });

    test('exchange rates and the converter', () {
      final r = RatesBoard.fromJson(ratesJson);
      expect(r.bank!.name, 'بنك الخرطوم');
      expect(r.parallel!.stale, isTrue);
      expect(r.parallel!.freshness, contains('فتحقّق قبل أن تعتمده'));
      final c = convert(10, r.table[1]);
      expect(c.bank, closeTo(11284, 0.01));
      expect(c.parallel, closeTo(24010.7, 0.01));
    });

    test('the inputs board: the count line, the reports and the old published figure', () {
      final b = InputsBoard.fromJson(inputsJson);
      final row = b.groups.single.rows.single;
      expect(row.verdictLabel, 'قليل');
      expect(row.countLine, '3 بلاغ من 1 شخص · 1 قال «غير موجود» · آخرها أمس · بلاغُ شخصٍ واحد: خذه بحذر');
      expect(b.reports.single.price, isNull);
      expect(b.figures!.single.old, isTrue);
      expect(b.figures!.single.freshness, contains('قديم'));
      expect(b.suppliers.single.count, 2);
    });

    test('alerts: running, finished, and what a finished one says', () {
      final a = AlertsBoard.fromJson(alertsJson);
      expect(a.full, isFalse);
      expect(a.running.single.status, 'active');
      expect(a.settled.single.outcome, 'أُطلق بسعر 4,232 بتاريخ 2026-11-05');
      expect(agoLabel(0), 'اليوم');
      expect(agoLabel(3), 'منذ 3 أيّام');
    });
  });

  group('the alert form refuses what the website refuses', () {
    final sesame = AlertOption.fromJson((alertsJson['options'] as List).first as Map<String, dynamic>);

    test('a limit written with Arabic digits and separators is read', () {
      expect(parseThreshold('٦٠٠٬٠٠٠'), 600000);
      expect(parseThreshold('600,000'), 600000);
      expect(parseThreshold(' 7 5 0 '), 750);
      expect(parseThreshold(''), isNull);
      expect(parseThreshold('0'), isNull);
      expect(parseThreshold('-5'), isNull);
      expect(parseThreshold('abc'), isNull);
      expect(parseThreshold('200000000000'), isNull);
    });

    test('each check, in order', () {
      expect(alertFormProblem(option: null, direction: 'above', threshold: '1'), 'اختر ما تريد متابعة سعره.');
      expect(alertFormProblem(option: sesame, direction: 'sideways', threshold: '1'), 'اختر: حين يصير السعر فوق الحدّ أو تحته.');
      expect(alertFormProblem(option: sesame, direction: 'above', threshold: 'كثير'), 'اكتب سعراً صحيحاً بالجنيه.');
      expect(
        alertFormProblem(option: sesame, direction: 'above', threshold: '600000'),
        'السعر الآن 650,000 وهو فوق 600,000 أصلاً. اختر حدّاً أعلى منه.',
      );
      expect(
        alertFormProblem(option: sesame, direction: 'below', threshold: '700000'),
        'السعر الآن 650,000 وهو تحت 700,000 أصلاً. اختر حدّاً أدنى منه.',
      );
      expect(alertFormProblem(option: sesame, direction: 'above', threshold: '700000'), isNull);
      // Equal to the price is not past it: the server fires only strictly beyond.
      expect(alertFormProblem(option: sesame, direction: 'above', threshold: '650000'), isNull);
    });
  });

  test('the boards are read from the website without a session', () async {
    final seen = <String>[];
    final client = MockClient((req) async {
      seen.add(req.url.path);
      expect(req.headers['authorization'], isNull);
      return http.Response.bytes(utf8.encode(jsonEncode(marketJson())), 200, headers: {'content-type': 'application/json'});
    });
    final b = await PricesClient(client: client, siteUrl: 'https://site.test').market();
    expect(seen, ['/api/app/prices']);
    expect(b.crops, hasLength(1));
  });

  test('a refusal carries the route\'s own sentence', () async {
    final client = MockClient((req) async =>
        http.Response.bytes(utf8.encode(jsonEncode({'error': 'تعذّرت قراءة الأسعار الآن.'})), 503));
    expect(
      () => PricesClient(client: client, siteUrl: 'https://site.test').rates(),
      throwsA(isA<ApiException>().having((e) => e.message, 'message', 'تعذّرت قراءة الأسعار الآن.')),
    );
  });

  group('the screen', () {
    testWidgets('the crop board builds with the old-feed warning, the card and its age', (tester) async {
      tester.view.physicalSize = const Size(390, 3000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);

      await tester.pumpWidget(app(PricesScreen(client: FakePricesClient())));
      await tester.pumpAndSettle();

      expect(find.text('سوق المحاصيل اليوم'), findsOneWidget);
      expect(find.byKey(const Key('stale-feeds')), findsOneWidget);
      expect(find.text('السمسم'), findsOneWidget);
      expect(find.textContaining('مضى 17 يوماً'), findsOneWidget);
      expect(find.text('650,000 جنيه'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('the rates and inputs tabs build', (tester) async {
      tester.view.physicalSize = const Size(390, 3000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);

      await tester.pumpWidget(app(PricesScreen(client: FakePricesClient(), initialTab: 1)));
      await tester.pumpAndSettle();
      expect(find.text('أسعار العملات مقابل الجنيه السوداني'), findsOneWidget);
      expect(find.textContaining('فتحقّق قبل أن تعتمده'), findsOneWidget);

      await tester.tap(find.text('المدخلات والوقود'));
      await tester.pumpAndSettle();
      expect(find.text('أين السماد والجازولين هذا الأسبوع وبكم'), findsOneWidget);
      expect(find.text('قليل'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('signed out, the alerts tab asks the reader to sign in', (tester) async {
      await tester.pumpWidget(app(PricesScreen(client: FakePricesClient(), initialTab: 3)));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('alerts-signed-out')), findsOneWidget);
    });

    testWidgets('the alert form says why it refuses, then sends a good one', (tester) async {
      tester.view.physicalSize = const Size(390, 1400);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final client = FakePricesClient();
      var saved = 0;
      final options = AlertsBoard.fromJson(alertsJson).options;

      await tester.pumpWidget(app(Scaffold(
        body: SingleChildScrollView(
          child: AlertForm(options: options, client: client, onSaved: () => saved++, preselect: 'crop|obeid|sesame|qintar'),
        ),
      )));
      expect(find.textContaining('آخر سعرٍ منشور: 650,000'), findsOneWidget);

      await tester.enterText(find.byKey(const Key('alert-threshold')), '600000');
      await tester.tap(find.byKey(const Key('alert-submit')));
      await tester.pump();
      expect(find.text('السعر الآن 650,000 وهو فوق 600,000 أصلاً. اختر حدّاً أعلى منه.'), findsOneWidget);
      expect(client.added, isEmpty);

      await tester.enterText(find.byKey(const Key('alert-threshold')), '٧٠٠٠٠٠');
      await tester.tap(find.byKey(const Key('alert-submit')));
      await tester.pumpAndSettle();
      expect(client.added.single, {'subject': 'crop|obeid|sesame|qintar', 'direction': 'above', 'threshold': '٧٠٠٠٠٠'});
      expect(find.text('أضفنا التنبيه.'), findsOneWidget);
      expect(saved, 1);
    });
  });
}
