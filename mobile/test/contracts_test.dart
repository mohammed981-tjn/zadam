/// «عقودي» (البند ٢٠٣): what /api/app/contracts returns, the website's rules for which step each reader is offered,
/// the finger signature in the website's shape, and the screens against a stand-in server.
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sudagri/contracts.dart';
import 'package:sudagri/screens/contract_detail_screen.dart';
import 'package:sudagri/screens/contracts_screen.dart';

const me = 'u-me';

Map<String, dynamic> overviewJson() => {
  'me': me,
  'is_admin': false,
  'service': [
    {
      'id': 's1',
      'title': 'حرث وريّ',
      'status': 'proposed',
      'currency': 'SDG',
      'total_amount': 1250000,
      'provider_name': 'مكتب النيل',
    },
  ],
  'forward': [
    {
      'id': 'f1',
      'ref': 'FC-1',
      'crop': 'سمسم',
      'quantity': 10,
      'unit': 'قنطار',
      'price': 85000,
      'currency': 'SDG',
      'delivery_from': '2026-12-01',
      'delivery_to': '2026-12-20',
      'delivery_place': 'القضارف',
      'status': 'proposed',
      'status_label': 'ينتظر توقيع الطرف الآخر',
      'buyer_id': 'u-buyer',
      'farmer_id': me,
      'proposed_by': 'u-buyer',
    },
    {
      'id': 'f2',
      'ref': 'FC-2',
      'crop': 'ذرة',
      'quantity': 5,
      'unit': 'جوال',
      'price': 30000,
      'currency': 'SDG',
      'delivery_from': '2026-11-01',
      'delivery_to': '2026-11-05',
      'delivery_place': 'سنار',
      'status': 'completed',
      'status_label': 'تمّ وأُقفل',
      'buyer_id': me,
      'farmer_id': 'u-f',
      'proposed_by': me,
    },
  ],
  'forward_disputes': [],
  'agreements': [
    {
      'id': 'a1',
      'ref': null,
      'title': 'عقد مزارعة (مشاركة بالمحصول)',
      'model': 'sharecrop',
      'status': 'draft',
      'version': 2,
      'me': 'investor',
      'signed_by_me': false,
      'waiting': ['owner', 'investor'],
    },
    {
      'id': 'a2',
      'ref': 'SP-7',
      'title': 'عقد إيجار أرضٍ زراعيّة',
      'model': 'lease',
      'status': 'signed',
      'version': 1,
      'me': 'owner',
      'signed_by_me': true,
      'waiting': [],
    },
  ],
};

Map<String, dynamic> agreementJson({
  List<Map<String, dynamic>> signatures = const [],
  String me = 'investor',
  String status = 'draft',
}) => {
  'id': 'a1',
  'ref': status == 'signed' ? 'SP-9' : null,
  'title': 'عقد مزارعة (مشاركة بالمحصول)',
  'model': 'sharecrop',
  'status': status,
  'version': 2,
  'terms_hash': 'abcdef0123456789abcdef0123456789',
  'signed_at': status == 'signed' ? '2026-11-01T10:00:00Z' : null,
  'me': me,
  'earlier_signatures': 0,
  'clauses': [
    {
      'title': 'الطرفان',
      'body': ['الطرف الأول، صاحب الأرض: أحمد', 'الطرف الثاني، المستثمر: سلمى'],
    },
    {
      'title': 'قسمة المحصول',
      'body': ['يُقسم المحصول بعد الحصاد: لصاحب الأرض ٦٠٪، وللمستثمر ٤٠٪.'],
    },
  ],
  'roles': [
    {'role': 'owner', 'label': 'صاحب الأرض'},
    {'role': 'investor', 'label': 'المستثمر'},
  ],
  'signatures': signatures,
  'shares': [
    {'label': 'صاحب الأرض', 'pct': 60},
    {'label': 'المستثمر', 'pct': 40},
  ],
  'seasons': [],
  'statement': null,
};

/// A stand-in for the signed-in request: answers from [answers] by path, and remembers what was sent.
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
  group('the list', () {
    test('parses the three kinds and counts what waits for the reader', () {
      final o = ContractsOverview.fromJson(overviewJson());
      expect(o.service.single.statusLabel, 'معروض');
      expect(o.forward.first.side(me), 'أنت المزارع');
      expect(o.forward.first.waitingFor(me), isTrue, reason: 'proposed by the other side');
      expect(o.forward.last.open, isFalse);
      expect(o.agreements.first.waitingForMe, isTrue);
      expect(o.agreements.last.waitingForMe, isFalse, reason: 'sealed');
      expect(o.waitingForMe, 2);
    });
  });

  group('service contracts: the website\'s contractMoves', () {
    List<String> moves(String s, {bool client = false, bool provider = false, bool admin = false}) => [
      for (final m in contractMoves(s, isClient: client, isProvider: provider, isAdmin: admin)) m.status,
    ];

    test('a draft is the client\'s to propose or cancel', () {
      expect(moves('draft', client: true), ['proposed', 'cancelled']);
      expect(moves('draft', provider: true), isEmpty);
    });
    test('a proposal is the provider\'s to accept — the client may only withdraw or cancel', () {
      expect(moves('proposed', provider: true), ['active', 'cancelled']);
      expect(moves('proposed', client: true), ['draft', 'cancelled']);
      expect(contractMoves('proposed', isClient: false, isProvider: true, isAdmin: false).first.label, 'أقبل العقد');
    });
    test('in force, the client closes it and either side may dispute', () {
      expect(moves('active', client: true), ['completed', 'disputed']);
      expect(moves('active', provider: true), ['disputed']);
      expect(moves('completed', client: true), ['disputed']);
    });
    test('an administrator acts only on a dispute, and is not offered the parties\' buttons', () {
      expect(moves('active', admin: true), isEmpty);
      expect(moves('disputed', admin: true), ['active', 'completed', 'cancelled']);
    });

    ServiceContract contract(String status, {bool client = false, bool provider = false, bool admin = false}) =>
        ServiceContract.fromJson({
          'id': 's1',
          'title': 'حرث',
          'status': status,
          'currency': 'SDG',
          'total_amount': 100,
          'paid': 0,
          'is_client': client,
          'is_provider': provider,
          'is_admin': admin,
          'milestones': [
            {
              'id': 'm1',
              'seq': 1,
              'title': 'الحرث',
              'status': 'pending',
              'quantity': 2,
              'unit': 'فدان',
              'unit_price': 50,
              'amount': 100,
              'requires_evidence': true,
              'evidence': [],
            },
            {
              'id': 'm2',
              'seq': 2,
              'title': 'الريّ',
              'status': 'submitted',
              'quantity': 1,
              'unit': 'م³',
              'unit_price': 0,
              'amount': 0,
              'requires_evidence': true,
              'evidence': [],
            },
          ],
        });

    test('phases: the provider starts and submits, the client approves — and nothing moves before agreement', () {
      final p = contract('active', provider: true);
      expect(p.isMine(p.milestones[0]), isTrue);
      expect(p.isMine(p.milestones[1]), isFalse, reason: 'approval is the client\'s (handoff of 20 August)');
      expect(p.waitingText(p.milestones[1]), 'بانتظار العميل: اعتمد المرحلة.');
      final c = contract('active', client: true);
      expect(c.isMine(c.milestones[1]), isTrue);
      expect(c.blocked(c.milestones[1]), isTrue, reason: 'no proof yet');
      final admin = contract('active', admin: true);
      expect(admin.isMine(admin.milestones[1]), isTrue, reason: 'the administration counts as the client');
      final draft = contract('draft', client: true);
      expect(draft.isMine(draft.milestones[1]), isFalse);
      expect(draft.waitingText(draft.milestones[0]), contains('لا عمل قبل الاتفاق'));
    });
  });

  group('forward contracts: what the page offers', () {
    ForwardContract fc(
      String status, {
      required String buyer,
      required String farmer,
      required String proposer,
      String? cancelBy,
      bool admin = false,
    }) => ForwardContract.fromJson({
      'id': 'f1',
      'ref': 'FC-1',
      'crop': 'سمسم',
      'quantity': 10,
      'unit_label': 'قنطار',
      'price': 85000,
      'currency': 'SDG',
      'delivery_from': '2026-12-01',
      'delivery_to': '2026-12-20',
      'delivery_place': 'القضارف',
      'status': status,
      'status_label': '',
      'buyer_id': buyer,
      'farmer_id': farmer,
      'proposed_by': proposer,
      'cancel_requested_by': cancelBy,
      'me': me,
      'is_admin': admin,
      'grade': 'أولى',
      'tolerance_percent': 5,
      'value': 850000,
      'payment_terms': 'نقداً',
      'late_penalty_pct_week': 1,
      'late_penalty_cap_pct': 10,
      'breach_penalty_pct': 20,
      'force_majeure': true,
      'farmer_name': 'أحمد',
      'buyer_name': 'سلمى',
      'proposed_at': '2026-11-01T10:00:00Z',
      'events': [],
    });
    List<String> steps(ForwardContract c) => [for (final a in c.actions) a.step];

    test('the other side signs or declines; the proposer may only withdraw', () {
      expect(steps(fc('proposed', buyer: 'u-b', farmer: me, proposer: 'u-b')), ['sign', 'decline']);
      expect(steps(fc('proposed', buyer: me, farmer: 'u-f', proposer: me)), ['withdraw']);
      expect(fc('proposed', buyer: 'u-b', farmer: me, proposer: 'u-b').actions.first.label, 'أوقّع العقد');
    });
    test('a stranger — an administrator reading — is offered nothing until a dispute', () {
      expect(steps(fc('proposed', buyer: 'u-b', farmer: 'u-f', proposer: 'u-b', admin: true)), isEmpty);
      expect(steps(fc('disputed', buyer: 'u-b', farmer: 'u-f', proposer: 'u-b', admin: true)), ['resolve']);
    });
    test('after signing: the buyer records the delivery on the website, the farmer confirms it here', () {
      final buyer = fc('signed', buyer: me, farmer: 'u-f', proposer: me);
      expect(steps(buyer), ['deliver', 'cancel', 'dispute']);
      expect(buyer.actions.first.onSite, isTrue);
      expect(steps(fc('delivered', buyer: 'u-b', farmer: me, proposer: 'u-b')), ['confirm', 'cancel', 'dispute']);
    });
    test('a cancellation is answered by the side that did not ask', () {
      expect(steps(fc('cancel_requested', buyer: 'u-b', farmer: me, proposer: 'u-b', cancelBy: 'u-b')), [
        'cancel_yes',
        'cancel_no',
        'dispute',
      ]);
      expect(steps(fc('cancel_requested', buyer: 'u-b', farmer: me, proposer: 'u-b', cancelBy: me)), ['dispute']);
      expect(fc('signed', buyer: me, farmer: 'u-f', proposer: me).actions[1].needsReason, isTrue);
    });
  });

  group('partnership agreements', () {
    test('the signing form shows to a party who has not signed this version, as on the website', () {
      expect(Agreement.fromJson(agreementJson()).canSign, isTrue);
      final signedByMe = Agreement.fromJson(
        agreementJson(
          signatures: [
            {
              'role': 'investor',
              'label': 'المستثمر',
              'full_name': 'سلمى أحمد',
              'signature': 'M 1 1 L 2 2',
              'signed_at': '2026-11-01T10:00:00Z',
            },
          ],
        ),
      );
      expect(signedByMe.canSign, isFalse);
      expect(signedByMe.waitingLabels, ['صاحب الأرض']);
      expect(Agreement.fromJson(agreementJson(status: 'signed')).canSign, isFalse);
      expect(Agreement.fromJson(agreementJson(me: 'admin')).canSign, isFalse);
      expect(Agreement.fromJson(agreementJson(me: 'manager')).canSign, isTrue);
      expect(Agreement.fromJson(agreementJson(me: 'manager')).canEditTerms, isFalse);
      expect(Agreement.fromJson(agreementJson()).shares.first, ('صاحب الأرض', 60));
    });

    test('the signature is the website\'s: an SVG path of whole numbers in 600×200, ready from eight lines', () {
      final d = SignatureDrawing();
      const box = Size(300, 100);
      d.start(const Offset(10, 10), box);
      for (var i = 1; i <= 7; i++) {
        d.extend(Offset(10.0 + i * 20, 10.0 + i * 5), box);
      }
      expect(d.ready, isFalse);
      d.extend(const Offset(400, -30), box); // off the pad: kept inside it
      expect(d.ready, isTrue);
      expect(d.path, startsWith('M 20 20 L 60 30'));
      expect(d.path, endsWith('L 600 0'));
      expect(RegExp(r'^[ML0-9 .-]{20,30000}$').hasMatch(d.path), isTrue, reason: 'the shape the table checks');
      final strokes = signatureStrokes(d.path, const Size(600, 200));
      expect(strokes.single.length, 9);
      expect(strokes.single.first, const Offset(20, 20));
      d.clear();
      expect(d.isEmpty, isTrue);
      expect(d.lines, 0);
    });

    test('signing sends the version and fingerprint shown, the name, the drawing and the confirmation', () async {
      final stub = StubCall({
        'POST /api/app/contracts/agreements/a1/sign': {'ok': true, 'ref': null, 'message': 'وُقِّع توقيعك.'},
      });
      final api = ContractsApi(call: stub.call);
      final said = await api.sign(
        Agreement.fromJson(agreementJson()),
        fullName: 'سلمى أحمد',
        signature: 'M 1 1 L 2 2',
        agree: true,
      );
      expect(said, 'وُقِّع توقيعك.');
      final (method, path, body) = stub.sent.single;
      expect('$method $path', 'POST /api/app/contracts/agreements/a1/sign');
      expect(body, {
        'version': 2,
        'hash': 'abcdef0123456789abcdef0123456789',
        'full_name': 'سلمى أحمد',
        'signature': 'M 1 1 L 2 2',
        'agree': 'yes',
      });
    });
  });

  group('screens', () {
    Widget app(Widget home) => MaterialApp(
      home: Directionality(textDirection: TextDirection.rtl, child: home),
    );

    testWidgets('the list shows the three kinds and what waits for the reader', (tester) async {
      final stub = StubCall({'GET /api/app/contracts': overviewJson()});
      await tester.pumpWidget(app(ContractsScreen(api: ContractsApi(call: stub.call))));
      await tester.pumpAndSettle();
      expect(find.text('عقود الشراكة'), findsOneWidget);
      expect(find.text('ينتظر توقيعك'), findsOneWidget);
      expect(find.text('العقود الآجلة'), findsOneWidget);
      expect(find.text('ينتظرك'), findsOneWidget);
      await tester.scrollUntilVisible(find.text('حرث وريّ'), 200);
      expect(find.text('حرث وريّ'), findsOneWidget);
    });

    testWidgets('the agreement signs only once the name, the drawing and the confirmation are there', (tester) async {
      await tester.binding.setSurfaceSize(const Size(420, 2600));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      final stub = StubCall({
        'GET /api/app/contracts/agreements/a1': agreementJson(),
        'POST /api/app/contracts/agreements/a1/sign': {'ok': true, 'ref': null, 'message': 'وُقِّع توقيعك.'},
      });
      await tester.pumpWidget(
        app(
          AgreementScreen(
            id: 'a1',
            api: ContractsApi(call: stub.call),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('1. الطرفان'), findsOneWidget);
      expect(find.text('لم يوقّع بعد'), findsNWidgets(2));

      FilledButton signButton() =>
          tester.widget<FilledButton>(find.ancestor(of: find.text('أوقّع'), matching: find.byType(FilledButton)));
      expect(signButton().onPressed, isNull);

      await tester.enterText(find.byKey(const Key('sign-name')), 'سلمى أحمد');
      final pad = find.byKey(const Key('signature-pad'));
      final gesture = await tester.startGesture(tester.getTopLeft(pad) + const Offset(20, 20));
      for (var i = 0; i < 12; i++) {
        await gesture.moveBy(const Offset(12, 3));
      }
      await gesture.up();
      await tester.pump();
      expect(find.text('✓ التوقيع جاهز'), findsOneWidget);
      expect(signButton().onPressed, isNull, reason: 'not confirmed yet');

      await tester.tap(find.byKey(const Key('sign-agree')));
      await tester.pump();
      expect(signButton().onPressed, isNotNull);
      await tester.tap(find.text('أوقّع'));
      await tester.pumpAndSettle();
      final signed = stub.sent.firstWhere((s) => s.$1 == 'POST');
      expect(signed.$3!['agree'], 'yes');
      expect(RegExp(r'^[ML0-9 .-]{20,30000}$').hasMatch(signed.$3!['signature'] as String), isTrue);
    });

    testWidgets('a provider sees «أقبل العقد» on a proposed contract, and asks before it binds', (tester) async {
      final stub = StubCall({
        'GET /api/app/contracts/service/s1': {
          'id': 's1',
          'title': 'حرث وريّ',
          'status': 'proposed',
          'currency': 'SDG',
          'total_amount': 100,
          'paid': 0,
          'is_client': false,
          'is_provider': true,
          'is_admin': false,
          'milestones': [],
        },
      });
      await tester.pumpWidget(
        app(
          ServiceContractScreen(
            id: 's1',
            api: ContractsApi(call: stub.call),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('أقبل العقد'), findsOneWidget);
      expect(find.text('اعرضه على مقدّم الخدمة'), findsNothing);
      await tester.tap(find.text('أقبل العقد'));
      await tester.pumpAndSettle();
      expect(find.textContaining('يسري العقد'), findsOneWidget);
      await tester.tap(find.widgetWithText(FilledButton, 'أقبل العقد').last);
      await tester.pumpAndSettle();
      expect(stub.sent.any((s) => s.$1 == 'POST' && s.$3!['status'] == 'active'), isTrue);
    });
  });
}
