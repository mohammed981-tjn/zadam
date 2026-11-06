/// «الاستثمار» (البند ٢٠٣): what /api/app/invest returns, the offer card's and the land card's rules as the website
/// draws them, browsing as a visitor without a session, and the screens against a stand-in server.
library;

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:sudagri/invest.dart';
import 'package:sudagri/screens/invest_detail_screen.dart';
import 'package:sudagri/screens/invest_screen.dart';

const site = 'https://site.test';

Map<String, dynamic> land({bool mine = false, String? interest, Map<String, dynamic>? inspection}) => {
  'land_id': 'l1',
  'place': 'الجزيرة · مدني',
  'feddans': null,
  'area': 'متوسّطة',
  'documents_on_file': 3,
  'models': [
    {'key': 'sharecrop', 'label': 'مشاركة بالمحصول'},
    {'key': 'lease', 'label': 'إيجار الأرض'},
  ],
  'water': 'قناة ري',
  'water_per_feddan': '4,000 م³',
  'soil_label': 'التربة (تقدير للمنطقة، لا للحقل)',
  'soil': 'فيرتيسول',
  'soil_confidence': null,
  'climate': 'ود مدني',
  'crops': ['القمح'],
  'note': 'أرضٌ على القناة',
  'mine': mine,
  'interest_status': interest,
  'interest_label': interest == null ? null : 'بانتظار صاحب الأرض',
  'inspection': inspection,
};

Map<String, dynamic> overview({bool signedIn = false, List<Map<String, dynamic>>? lands}) => {
  'signed_in': signedIn,
  'lands_failed': false,
  'lands': lands ?? [land()],
  'projects': [
    {
      'id': 'p1',
      'slug': 'trial-1',
      'name': 'قمح الجزيرة',
      'location': 'الجزيرة',
      'description': null,
      'status': 'open',
      'status_label': 'مفتوح للاستثمار',
      'risk_level': 'medium',
      'risk_label': 'خطر متوسط',
      'total_feddans': 20,
      'funded_pct': 0,
      'share_price': r'US$100.00',
      'expected_return': null,
      'trial': true,
      'trial_label': 'فرصة تجريبيّة: منفّذها من فريق المنصّة',
      'is_demo': false,
      'demo_label': null,
      'verified_land': 'على أرضٍ موثّقة · 3 من 4 مستندات في الملفّ',
    },
  ],
  'inspections_on': true,
  'fee_line': 'مجّانيّة أثناء موسم التجربة.',
  'reports': null,
  'companies': [
    {
      'name': 'شركة النيل للميكنة',
      'kinds': ['الميكنة'],
      'states': ['الجزيرة'],
      'phone': '+249900000000',
    },
  ],
  'risk_notice': 'الزراعة ربحٌ وخسارة: قد يضعف المحصول أو يهلك أو ينخفض سعره.',
  'models': [
    {'key': 'sharecrop', 'label': 'مشاركة بالمحصول', 'investor': 'يموّل', 'owner': 'يقدّم الأرض'},
    {'key': 'lease', 'label': 'إيجار الأرض', 'investor': 'يستأجر', 'owner': 'يأخذ أجرة'},
    {'key': 'finance', 'label': 'تمويل المدخلات مقابل حصّة', 'investor': 'يدفع', 'owner': 'يزرع'},
  ],
  'checks': [
    {'key': 'access', 'label': 'الطريق والوصول', 'detail': 'هل يصلها طريق'},
    {'key': 'water', 'label': 'الماء ومصدره', 'detail': 'يعمل الآن'},
  ],
};

Map<String, dynamic> mine() => {
  'interests': [
    {
      'interest_id': 'i1',
      'place': 'الجزيرة · مدني',
      'area': 'متوسّطة',
      'model_label': 'مشاركة بالمحصول',
      'message': 'أريد تمويل الموسم',
      'status': 'pending',
      'status_label': 'بانتظار صاحب الأرض',
    },
    {
      'interest_id': 'i2',
      'place': 'حقل النيل — نهر النيل',
      'area': '12 فدان',
      'model_label': 'إيجار الأرض',
      'message': 'إيجار لموسمين',
      'status': 'accepted',
      'status_label': 'قَبِل — تواصلا',
      'owner_name': 'أحمد',
      'owner_phone': '+249911111111',
      'map': 'https://www.google.com/maps?q=1,2',
    },
  ],
  'inspections': [
    {
      'id': 'n1',
      'role': 'investor',
      'place': 'الجزيرة',
      'area': 'متوسّطة',
      'status_label': 'كُتب التقرير',
      'verdict_label': 'سليمةٌ بشروط',
      'checks': ['الماء ومصدره'],
    },
  ],
  'investments': [],
  'plans': [
    {
      'title': 'مشروع الموسم',
      'crop': 'القمح',
      'feddans': 5,
      'status_label': 'مسوّدة — راجعها ثمّ وافق',
      'items': 4,
      'costUsd': 1200,
      'paidSdg': 0,
      'paidItems': 0,
      'delivered': 0,
      'remainingUsd': 1200,
      'unpriced': 1,
    },
  ],
  'lands': [
    {
      'id': 'L1',
      'name': 'حقل الجزيرة',
      'place': 'الجزيرة',
      'feddans': 20,
      'verified': true,
      'investors_on': true,
      'open_to_investors': false,
      'models': [],
      'model_labels': [],
      'note': null,
      'requests': [],
      'inspections': [],
    },
    {
      'id': 'L2',
      'name': 'حقل النيل',
      'place': 'نهر النيل',
      'feddans': 12,
      'verified': true,
      'investors_on': true,
      'open_to_investors': true,
      'models': ['lease'],
      'model_labels': ['إيجار الأرض'],
      'requests': [
        {
          'interest_id': 'r1',
          'model_label': 'إيجار الأرض',
          'message': 'أريدها لموسم',
          'status': 'pending',
          'investor_name': 'سلمى',
          'record': 'من السودان · عقود موقّعة: 0',
        },
      ],
      'inspections': [],
    },
    {
      'id': 'L3',
      'name': 'أرض جديدة',
      'place': 'سنار',
      'feddans': 3,
      'verified': false,
      'investors_on': true,
      'open_to_investors': false,
      'models': [],
      'model_labels': [],
      'requests': [],
      'inspections': [],
    },
  ],
};

class StubCall {
  StubCall(this.answers);
  final Map<String, Map<String, dynamic>> answers;
  final sent = <(String, String, Map<String, dynamic>?)>[];

  Future<Map<String, dynamic>> call(String method, String path, {Map<String, dynamic>? body}) async {
    sent.add((method, path, body));
    return answers['$method $path'] ?? const {'ok': true, 'message': 'تمّ'};
  }
}

void main() {
  group('the offer card, as LandOfferCard decides it', () {
    test('mine, already asked, a visitor, or «اطلب الشراكة»', () {
      expect(LandOffer.fromJson(land(mine: true)).action(signedIn: true), OfferAction.mine);
      expect(LandOffer.fromJson(land(interest: 'pending')).action(signedIn: true), OfferAction.asked);
      expect(LandOffer.fromJson(land()).action(signedIn: false), OfferAction.signIn);
      expect(LandOffer.fromJson(land()).action(signedIn: true), OfferAction.request);
    });
    test('the inspection report is asked by a member, on a land not theirs, with none of theirs open', () {
      final l = LandOffer.fromJson(land());
      expect(l.canAskInspection(signedIn: true, inspectionsOn: true), isTrue);
      expect(l.canAskInspection(signedIn: false, inspectionsOn: true), isFalse);
      expect(l.canAskInspection(signedIn: true, inspectionsOn: false), isFalse);
      expect(LandOffer.fromJson(land(mine: true)).canAskInspection(signedIn: true, inspectionsOn: true), isFalse);
      final open = LandOffer.fromJson(
        land(inspection: {'id': 'n1', 'status': 'requested', 'label': 'بانتظار موافقة صاحب الأرض'}),
      );
      expect(open.canAskInspection(signedIn: true, inspectionsOn: true), isFalse);
      expect(open.inspectionLabel, 'بانتظار موافقة صاحب الأرض');
    });
    test('the overview parses, with the trial label the site puts on a trial project', () {
      final o = InvestOverview.fromJson(overview());
      expect(o.lands.single.models.map((m) => m.key), ['sharecrop', 'lease']);
      expect(o.projects.single.trialLabel, 'فرصة تجريبيّة: منفّذها من فريق المنصّة');
      expect(o.glossary.riskNotice, startsWith('الزراعة ربحٌ وخسارة'));
      expect(o.companies.single.kinds, ['الميكنة']);
    });
  });

  group('my side of it', () {
    test('requests, lands and the one-tap offer', () {
      final m = MyInvest.fromJson(mine());
      expect(m.interests[0].canWithdraw, isTrue);
      expect(m.interests[0].canOpenAgreement, isFalse);
      expect(m.interests[1].canOpenAgreement, isTrue);
      expect(m.asked.single.verdictLabel, 'سليمةٌ بشروط');
      expect(m.lands[0].canOffer, isTrue);
      expect(m.lands[1].canClose, isTrue);
      expect(m.lands[1].requests.single.canDecide, isTrue);
      expect(m.lands[2].canOffer, isFalse, reason: 'not verified yet');
      expect(m.plans.single.unpriced, 1);
    });
    test('«اعرض أرضي على المستثمرين» ticks every model, or the ones chosen last time', () {
      final all = InvestOverview.fromJson(overview()).glossary.models;
      expect(consentDefaults(const [], all), {'sharecrop', 'lease', 'finance'});
      expect(consentDefaults(const ['lease'], all), {'lease'});
    });
  });

  group('the routes', () {
    test('a visitor browses without a session, as the website\'s public page', () async {
      final seen = <http.Request>[];
      final api = InvestApi(
        signedIn: () => false,
        siteUrl: site,
        call: (m, p, {body}) => throw StateError('no session call for a visitor'),
        client: MockClient((req) async {
          seen.add(req);
          return http.Response.bytes(
            utf8.encode(jsonEncode(overview())),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }),
      );
      final o = await api.overview();
      expect(o.lands, hasLength(1));
      expect(seen.single.url.toString(), '$site/api/app/invest');
      expect(seen.single.headers.containsKey('authorization'), isFalse);
    });

    test('signed in, the request carries the acknowledged risk notice to the shared step', () async {
      final stub = StubCall({});
      final api = InvestApi(call: stub.call, signedIn: () => true, siteUrl: site);
      await api.requestPartnership(landId: 'l1', model: 'lease', message: 'أريدها لموسمين', riskAcknowledged: true);
      await api.setConsent(landId: 'L1', open: true, models: ['lease']);
      expect(stub.sent[0].$2, '/api/app/invest/interest');
      expect(stub.sent[0].$3, {'land_id': 'l1', 'model': 'lease', 'message': 'أريدها لموسمين', 'risk_ack': 'yes'});
      expect(stub.sent[1].$3!['open'], isTrue);
    });
  });

  group('screens', () {
    Widget app(Widget home) => MaterialApp(
      home: Directionality(textDirection: TextDirection.rtl, child: home),
    );

    testWidgets('a visitor sees the lands, the risk notice and «سجّل كمستثمر», not the request', (tester) async {
      await tester.binding.setSurfaceSize(const Size(420, 3000));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      final stub = StubCall({'GET /api/app/invest': overview()});
      await tester.pumpWidget(
        app(
          InvestScreen(
            api: InvestApi(call: stub.call, signedIn: () => true, siteUrl: site),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.textContaining('الزراعة ربحٌ وخسارة'), findsOneWidget);
      expect(find.text('الجزيرة · مدني'), findsOneWidget);
      // The site read this as a visitor (signed_in: false): the card asks to sign up, and offers no inspection.
      expect(find.text('سجّل كمستثمر لتطلب الشراكة'), findsOneWidget);
      expect(find.text('اطلب الشراكة'), findsNothing);
      expect(find.text('اطلب تقرير معاينةٍ مستقلّ قبل أن تقرّر'), findsNothing);
      expect(find.text('فرصة تجريبيّة: منفّذها من فريق المنصّة'), findsOneWidget);
    });

    testWidgets('the request is sent only with a message and the risk notice acknowledged', (tester) async {
      await tester.binding.setSurfaceSize(const Size(420, 1600));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      final stub = StubCall({
        'POST /api/app/invest/interest': {'ok': true, 'message': 'أُرسل طلبك.'},
      });
      final api = InvestApi(call: stub.call, signedIn: () => true, siteUrl: site);
      final o = InvestOverview.fromJson(overview(signedIn: true));
      await tester.pumpWidget(
        app(
          Scaffold(
            body: ListView(
              children: [
                LandOfferTile(
                  land: o.lands.single,
                  signedIn: true,
                  inspectionsOn: true,
                  feeLine: o.feeLine,
                  glossary: o.glossary,
                  api: api,
                  onChanged: () {},
                ),
              ],
            ),
          ),
        ),
      );
      await tester.tap(find.text('اطلب الشراكة'));
      await tester.pumpAndSettle();
      FilledButton send() => tester.widget<FilledButton>(find.byKey(const Key('interest-send')));
      expect(send().onPressed, isNull);
      await tester.enterText(find.byKey(const Key('interest-message')), 'أنا سلمى، أريد تمويل الموسم الشتوي');
      await tester.pump();
      expect(send().onPressed, isNull, reason: 'the risk notice is not acknowledged yet');
      await tester.tap(find.byKey(const Key('risk-ack')));
      await tester.pump();
      await tester.tap(find.byKey(const Key('interest-send')));
      await tester.pumpAndSettle();
      expect(stub.sent.single.$3!['risk_ack'], 'yes');
      expect(stub.sent.single.$3!['model'], 'sharecrop');
    });

    testWidgets('the landowner\'s tab offers the one-tap offer and the requests to decide', (tester) async {
      await tester.binding.setSurfaceSize(const Size(420, 3200));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      final stub = StubCall({'GET /api/app/invest': overview(signedIn: true), 'GET /api/app/invest/mine': mine()});
      await tester.pumpWidget(
        app(
          InvestScreen(
            initialTab: 2,
            api: InvestApi(call: stub.call, signedIn: () => true, siteUrl: site),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('اعرض أرضي على المستثمرين'), findsOneWidget);
      expect(find.text('أقبل وأكشف بياناتي له'), findsOneWidget);
      expect(find.text('أوقف عرضها'), findsOneWidget);
      await tester.tap(find.byKey(const Key('offer-land')));
      await tester.pumpAndSettle();
      final offer = stub.sent.firstWhere((s) => s.$2 == '/api/app/invest/consent');
      expect(offer.$3!['models'], ['sharecrop', 'lease', 'finance'], reason: 'every model, as the website pre-ticks');
    });

    testWidgets('an opportunity\'s page shows its trial note, its study and the risk notice', (tester) async {
      final stub = StubCall({
        'GET /api/app/invest/projects/trial-1': {
          'signed_in': false,
          'project': overview()['projects'][0],
          'study': [
            {'label': 'درجة التقييم', 'value': '72/100'},
          ],
          'trial_note': 'منفّذها من فريق المنصّة نفسه.',
          'updates': [],
          'investment_open': false,
          'is_submitter': false,
          'offer': null,
          'own_land': null,
          ...{'risk_notice': overview()['risk_notice'], 'models': overview()['models'], 'checks': overview()['checks']},
        },
      });
      await tester.binding.setSurfaceSize(const Size(420, 3000));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      await tester.pumpWidget(
        app(
          ProjectScreen(
            slug: 'trial-1',
            api: InvestApi(call: stub.call, signedIn: () => true),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.textContaining('فرصة تجريبيّة'), findsOneWidget);
      expect(find.text('72/100'), findsOneWidget);
      expect(find.textContaining('الزراعة ربحٌ وخسارة'), findsOneWidget);
      expect(find.text('الدفع عبر المنصّة لم يُفتح بعد'), findsOneWidget);
    });
  });
}
