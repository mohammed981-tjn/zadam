/// التصدير في التطبيق (البند ٢٠٣): the products and destinations, a pair's
/// dated requirements and their review, an offer's readiness, the offer form's
/// checks, and the screen.
library;

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:sudagri/export.dart';
import 'package:sudagri/screens/export_screen.dart';
import 'package:sudagri/theme.dart';

const sesame = '11111111-1111-1111-1111-111111111111';
const gum = '22222222-2222-2222-2222-222222222222';
const egypt = '33333333-3333-3333-3333-333333333333';
const india = '44444444-4444-4444-4444-444444444444';

const choicesJson = {
  'commodities': [
    {'id': sesame, 'code': 'sesame', 'label': 'السمسم', 'defaultUom': 'ton', 'hsCode': '120740'},
    {'id': gum, 'code': 'gum_arabic', 'label': 'الصمغ العربي', 'defaultUom': 'ton', 'hsCode': null},
  ],
  'destinations': [
    {'id': egypt, 'code': 'EG', 'label': 'مصر', 'group': 'الخليج والدول العربيّة'},
    {'id': india, 'code': 'IN', 'label': 'الهند', 'group': 'آسيا'},
  ],
  'studied': {'$sesame|$egypt': 4},
  'grades': [
    {'id': 'g1', 'commodityId': sesame, 'name': 'أبيض نظيف'},
  ],
  'uoms': [
    {'code': 'ton', 'name': 'طن'},
  ],
};

const corridorJson = {
  'today': '2026-11-06',
  'corridor_id': 'c1',
  'studied': true,
  'requirements': [
    {'name': 'شهادة صحّة نباتيّة', 'note': 'للحبوب والبذور', 'mode': 'required', 'mode_label': 'إلزامي',
     'effective_from': '2019-05-11', 'effective_to': null, 'standing': 'in_force'},
    {'name': 'تقرير مختبر', 'note': null, 'mode': 'recommended', 'mode_label': 'مُستحسَن',
     'effective_from': '2019-05-11', 'effective_to': null, 'standing': 'in_force'},
    {'name': 'بيان العناية الواجبة', 'note': null, 'mode': 'required', 'mode_label': 'إلزامي',
     'effective_from': '2027-06-30', 'effective_to': null, 'standing': 'upcoming'},
  ],
  'rules': {
    'last_reviewed_at': '2026-11-05T08:00:00Z',
    'reviewed_count': 1,
    'days_since': 1,
    'review_days': 180,
    'stale': false,
    'source_note': 'قرار وزير الزراعة المصري 562 لسنة 2019 — https://example.gov.eg',
  },
};

const offersJson = {
  'offers': [
    {
      'id': '55555555-5555-5555-5555-555555555555',
      'reference': 'EXP-20261106-AB12',
      'commodity': 'السمسم',
      'destination': 'مصر',
      'quantity': '20.0000',
      'uom': 'ton',
      'value': '30,000.00',
      'status': 'draft',
      'status_label': 'مسوّدة',
      'status_help': 'لا يراه أحد حتى ترسله.',
      'rejection_reason': null,
      'readiness': {
        'ready': false, 'score': 60, 'required_total': 4, 'required_met': 3, 'missing': ['فاتورة تجاريّة'],
        'source': 'live', 'verdict': 'غيرُ جاهز — ينقصه 1 من 4 مستنداً إلزاميّاً.',
        'source_note': 'محسوبةٌ على قواعد الممرّ اليوم — وقد تتغيّر قبل أن تُرسل. وبالإرسال تُجمَّد.',
      },
      'lines': [
        {'name': 'شهادة صحّة نباتيّة', 'note': null, 'mode': 'required', 'mode_label': 'إلزامي', 'satisfied': true},
        {'name': 'فاتورة تجاريّة', 'note': null, 'mode': 'required', 'mode_label': 'إلزامي', 'satisfied': false},
      ],
      'rules': {'last_reviewed_at': null, 'days_since': null, 'review_days': 180, 'stale': true},
    },
  ],
};

const studyJson = {
  'headline': [
    {'value': '0٪', 'label': 'رسوم الدخول إلى الاتحاد الأوروبي', 'note': null, 'source': {'label': 'المفوضية الأوروبية', 'url': 'https://ec.test'}},
  ],
  'rejection': {'points': ['٦٥ حالةً سببها غيابُ المستندات'], 'source': {'label': 'دراسة الرفض', 'url': 'https://doi.test'}},
  'commodities': [
    {'name': 'الصمغ العربي', 'share': '٧٠٪', 'markets': 'أوروبا وأمريكا', 'gate': 'المطابقة'},
  ],
  'commodities_source': {'label': 'Volza', 'url': 'https://volza.test'},
  'beyond': ['الكركديه'],
  'gates': [
    {'n': '١', 'title': 'المنشأ', 'body': ['إثبات المنشأ'], 'holder': 'المصدِّر', 'source': {'label': 'الاتحاد الأوروبي', 'url': 'https://eu.test'}},
  ],
  'money_knot': {'paragraphs': ['النظام يوجب اعتماداً مستندياً'], 'source': {'label': 'Trade Finance Africa', 'url': 'https://tfa.test'}},
  'deadlines': [
    {'what': 'لائحة منع إزالة الغابات', 'when': '30 ديسمبر 2026', 'asks': 'بيان العناية الواجبة', 'effect': 'يُردّ ما لا بيان له',
     'source': {'label': 'الاتحاد الأوروبي', 'url': 'https://eudr.test'}},
  ],
  'limits': [
    {'title': 'ليست استشارةً قانونية', 'body': 'تحقّق قبل الالتزام.', 'source': {'label': 'بنك السودان', 'url': 'https://cbos.test'}},
  ],
};

class FakeExportClient extends ExportClient {
  final corridorCalls = <String>[];
  @override
  Future<ExportStudy> study() async => ExportStudy.fromJson(studyJson);
  @override
  Future<ExportChoices> choices() async => ExportChoices.fromJson(choicesJson);
  @override
  Future<CorridorRules> corridor(String commodityId, String destinationId) async {
    corridorCalls.add('$commodityId|$destinationId');
    if (destinationId == india) {
      return CorridorRules.fromJson({'corridor_id': null, 'studied': false, 'requirements': [], 'rules': null});
    }
    return CorridorRules.fromJson(corridorJson);
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
  group('parsing', () {
    test('products, destinations under their regions, and which pairs are studied', () {
      final c = ExportChoices.fromJson(choicesJson);
      expect(c.commodities.first.hsCode, '120740');
      expect(c.grouped.map((g) => g.group), ['الخليج والدول العربيّة', 'آسيا']);
      expect(c.studiedCount(sesame, egypt), 4);
      expect(c.studiedCount(gum, india), isNull);
      expect(c.pairNote(sesame, egypt), 'شروطُ هذه الوجهة لهذا المنتج مدروسة: 4 مستنداتٍ.');
      expect(c.pairNote(gum, india), startsWith('لم تُدرس شروطُ هذه الوجهة لهذا المنتج'));
    });

    test('a pair: in force and upcoming apart, each with its date, and the review line', () {
      final r = CorridorRules.fromJson(corridorJson);
      expect(r.inForce.map((x) => x.name), ['شهادة صحّة نباتيّة', 'تقرير مختبر']);
      expect(r.upcoming.single.dateLine, 'يسري من 30 يونيو 2027');
      expect(r.inForce.first.dateLine, 'ساري منذ 11 مايو 2019');
      expect(r.inForce.first.required, isTrue);
      expect(r.inForce.last.modeLabel, 'مُستحسَن');
      expect(r.rules!.line, 'قواعدُ هذا الممرّ رُوجعت قبل 1 يوماً.');
      expect(r.rules!.sourceNote, contains('562 لسنة 2019'));
    });

    test('the review line says «not reviewed» and «overdue» as the website does', () {
      expect(RulesStatus.tryParse({'review_days': 180, 'stale': true})!.line, '⚠ قواعدُ هذا الممرّ لم تُراجَع بعد — تحقّق منها قبل الشحن.');
      expect(
        RulesStatus.tryParse({'last_reviewed_at': '2026-01-01T00:00:00Z', 'days_since': 309, 'review_days': 180, 'stale': true})!.line,
        '⚠ قواعدُ هذا الممرّ لم تُراجَع منذ 309 يوماً — والحدُّ 180. قد تكون تغيّرت.',
      );
    });

    test('an offer: the readiness verdict, the missing line, and the moves its status allows', () {
      final o = MyOffer.fromJson((offersJson['offers'] as List).first as Map<String, dynamic>);
      expect(o.readiness.ready, isFalse);
      expect(o.readiness.unstudied, isFalse);
      expect(o.readiness.missing, ['فاتورة تجاريّة']);
      expect(o.lines.where((l) => !l.satisfied).single.name, 'فاتورة تجاريّة');
      expect(o.moves.map((m) => m.to), ['submitted', 'withdrawn']);
      expect(o.rules!.stale, isTrue);
    });

    test('the study: every figure, gate and deadline with its source', () {
      final s = ExportStudy.fromJson(studyJson);
      expect(s.headline.single.source.url, 'https://ec.test');
      expect(s.gates.single.body, ['إثبات المنشأ']);
      expect(s.deadlines.single.when, '30 ديسمبر 2026');
      expect(s.deadlines.single.source.label, 'الاتحاد الأوروبي');
      expect(s.limits.single.title, 'ليست استشارةً قانونية');
      expect(s.moneyKnot, hasLength(1));
    });

    test('an unstudied pair is «none», never ready', () {
      final r = Readiness.fromJson({'source': 'none', 'verdict': 'لم تُدرس شروطُ هذه الوجهة لهذا المنتج في المنصّة بعد'});
      expect(r.unstudied, isTrue);
      expect(r.ready, isFalse);
    });
  });

  group('the offer form refuses what the website refuses', () {
    OfferDraft good() => OfferDraft(
          commodityId: sesame,
          destinationId: egypt,
          quantity: '20',
          unitPrice: '1500.50',
          plotRef: 'القطعة ٧',
          latitude: '13.183333',
          longitude: '30.216667',
        );

    test('a complete draft passes', () => expect(good().problem, isNull));

    test('each check, in the website\'s words', () {
      expect((good()..destinationId = '').problem, 'اختر المنتج والوجهة.');
      expect((good()..quantity = '0').problem, startsWith('الكمّية والسعر يجب أن يكونا رقمين أكبر من صفر'));
      expect((good()..quantity = '1.23456').problem, startsWith('الكمّية والسعر'));
      expect((good()..unitPrice = '10.555').problem, startsWith('الكمّية والسعر'));
      expect((good()..unitPrice = '1,500').problem, startsWith('الكمّية والسعر'));
      expect((good()..plotRef = ' ').problem, 'اسم القطعة أو رقمها مطلوب.');
      expect((good()..latitude = 'شمال').problem, startsWith('الإحداثيّة مطلوبة'));
      expect((good()..areaHectares = '5').problem, startsWith('القطعة أكبر من أربعة هكتارات'));
      expect((good()..areaHectares = '5'..boundary = '{"type":"Polygon"}').problem, isNull);
    });

    test('what is sent: trimmed, and the optional fields left out when empty', () {
      final j = (good()..quantity = ' 20 ').toJson();
      expect(j['quantity'], '20');
      expect(j.containsKey('uom_code'), isFalse);
      expect(j.containsKey('grade_id'), isFalse);
      expect(j['commodity_id'], sesame);
    });

    test('decimals as the database reads them', () {
      expect(positiveDecimal('0.0001', 4), isTrue);
      expect(positiveDecimal('0', 4), isFalse);
      expect(positiveDecimal('1e3', 4), isFalse);
      expect(positiveDecimal('-1', 4), isFalse);
    });
  });

  test('the choices and a pair are read from the website without a session', () async {
    final seen = <String>[];
    final client = MockClient((req) async {
      seen.add(req.url.toString());
      expect(req.headers['authorization'], isNull);
      final body = req.url.queryParameters.isEmpty ? choicesJson : corridorJson;
      return http.Response.bytes(utf8.encode(jsonEncode(body)), 200, headers: {'content-type': 'application/json'});
    });
    final c = ExportClient(client: client, siteUrl: 'https://site.test');
    expect((await c.choices()).commodities, hasLength(2));
    expect((await c.corridor(sesame, egypt)).inForce, hasLength(2));
    expect(seen.last, 'https://site.test/api/app/export?commodity=$sesame&destination=$egypt');
  });

  group('the screen', () {
    testWidgets('choose a product and a destination, and see what it asks for', (tester) async {
      tester.view.physicalSize = const Size(390, 2600);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final client = FakeExportClient();

      await tester.pumpWidget(app(ExportScreen(client: client)));
      await tester.pumpAndSettle();
      expect(find.text('ممرّ الصادر السوداني'), findsOneWidget);

      await tester.tap(find.byKey(const Key('export-commodity')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('السمسم').last);
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('export-destination')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('مصر').last);
      await tester.pumpAndSettle();

      expect(client.corridorCalls, ['$sesame|$egypt']);
      expect(find.text('المستندات المطلوبة اليوم'), findsOneWidget);
      expect(find.text('شهادة صحّة نباتيّة'), findsOneWidget);
      expect(find.text('ساري منذ 11 مايو 2019'), findsNWidgets(2));
      expect(find.text('يسري من 30 يونيو 2027'), findsOneWidget);
      expect(find.byKey(const Key('corridor-review')), findsOneWidget);
      expect(find.textContaining('562 لسنة 2019'), findsOneWidget);
      expect(find.text('البند الجمركي: 120740'), findsOneWidget);

      await tester.tap(find.byKey(const Key('export-destination')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('الهند').last);
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('corridor-unstudied')), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('the study tab builds, the coming regulation with its date and source', (tester) async {
      tester.view.physicalSize = const Size(390, 3600);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(app(ExportScreen(client: FakeExportClient())));
      await tester.pumpAndSettle();
      await tester.tap(find.text('الدراسة'));
      await tester.pumpAndSettle();
      expect(find.text('البوّابات الأربع'), findsOneWidget);
      expect(find.text('30 ديسمبر 2026'), findsOneWidget);
      expect(find.text('المصدر: الاتحاد الأوروبي'), findsNWidgets(2));
      expect(tester.takeException(), isNull);
    });

    testWidgets('signed out, «عروضي» asks the reader to sign in', (tester) async {
      await tester.pumpWidget(app(ExportScreen(client: FakeExportClient())));
      await tester.pumpAndSettle();
      await tester.tap(find.text('عروضي'));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('offers-signed-out')), findsOneWidget);
    });

    testWidgets('the readiness panel: the verdict, the bar, the missing document named', (tester) async {
      final o = MyOffer.fromJson((offersJson['offers'] as List).first as Map<String, dynamic>);
      await tester.pumpWidget(app(Scaffold(body: SingleChildScrollView(child: ReadinessPanel(readiness: o.readiness, lines: o.lines, rules: o.rules)))));
      expect(find.text('غيرُ جاهز — ينقصه 1 من 4 مستنداً إلزاميّاً.'), findsOneWidget);
      expect(find.text('60٪'), findsOneWidget);
      expect(find.byType(LinearProgressIndicator), findsOneWidget);
      expect(find.text('⚠ قواعدُ هذا الممرّ لم تُراجَع بعد — تحقّق منها قبل الشحن.'), findsOneWidget);
      expect(find.bySemanticsLabel('ناقص'), findsOneWidget);
    });

    testWidgets('the offer form says why it refuses before anything is sent', (tester) async {
      tester.view.physicalSize = const Size(390, 2400);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(app(Scaffold(
        body: SingleChildScrollView(
          child: OfferForm(
            client: FakeExportClient(),
            choices: ExportChoices.fromJson(choicesJson),
            commodity: sesame,
            destination: egypt,
            open: true,
            onSaved: () {},
          ),
        ),
      )));
      await tester.pumpAndSettle();
      expect(find.text('شروطُ هذه الوجهة لهذا المنتج مدروسة: 4 مستنداتٍ.'), findsOneWidget);
      await tester.tap(find.byKey(const Key('offer-submit')));
      await tester.pump();
      expect(find.byKey(const Key('offer-message')), findsOneWidget);
      expect(find.textContaining('الكمّية والسعر يجب أن يكونا'), findsOneWidget);
    });
  });
}
