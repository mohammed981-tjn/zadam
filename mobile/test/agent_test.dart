/// وضع الوكيل في التطبيق (البند ٢٠٣): the organisation's farmers and a farmer's stages, the mark on what an agent
/// wrote («سجّلها الوكيل «…»» / «سجّلها وكيلك»), the steps sent to their routes, and «وكلائي» on screen.
library;

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sudagri/account.dart';
import 'package:sudagri/agent.dart';
import 'package:sudagri/api.dart';
import 'package:sudagri/screens/agent_farmer_screen.dart';
import 'package:sudagri/screens/agent_screen.dart';
import 'package:sudagri/theme.dart';

const site = 'https://site.test';

http.Response json(Object body, [int status = 200]) => http.Response.bytes(utf8.encode(jsonEncode(body)), status,
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

final myAgentsJson = {
  'agents': [
    {
      'id': 'm1', 'company_name': 'جمعيّة الحصاحيصا', 'company_phone': '0911111111', 'status': 'pending',
      'status_label': 'ينتظر جواب المزارع', 'note': 'نسجّل أرضك كما اتّفقنا', 'scopes': ['lands', 'seasons'],
      'scopes_label': 'الأراضي والمواسم', 'scopes_long': ['الأراضي: يراها ويسجّل أرضاً'], 'requested_at': '2026-11-01T10:00:00Z',
    },
    {
      'id': 'm2', 'company_name': 'شركة الزراعة', 'company_phone': '0922222222', 'status': 'active', 'status_label': 'قائم',
      'note': 'متابعة الموسم', 'scopes': ['seasons'], 'scopes_label': 'المواسم', 'requested_at': '2026-10-01T10:00:00Z',
      'answered_at': '2026-10-02T10:00:00Z',
    },
  ],
  'actions': [
    {
      'id': 41, 'at': '2026-11-05T09:00:00Z', 'subject': 'season_stage', 'company': 'شركة الزراعة',
      'label': 'اعتمد مرحلةً من موسم', 'season_id': 'se1', 'objection': null, 'can_object': true,
    },
    {
      'id': 40, 'at': '2026-11-04T09:00:00Z', 'subject': 'stage_evidence', 'company': null,
      'label': 'رفع دليلاً على مرحلة', 'season_id': 'se1', 'objection': {'reason': 'ليست أرضي', 'reopened': false}, 'can_object': false,
    },
  ],
};

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
  test('the mark says who wrote it, as on the website', () {
    expect(agentMark(company: 'شركة الزراعة', stage: true), 'سجّلها الوكيل «شركة الزراعة»: اعتمد هذه المرحلة باسمك.');
    expect(agentMark(stage: true), 'سجّلها وكيلك: اعتمد هذه المرحلة باسمك.');
    expect(agentMark(company: 'X', stage: false, caption: 'صورة الحقل'), 'سجّله الوكيل «X»: رفع الدليل «صورة الحقل» باسمك.');
  });

  test("the organisation's farmers: standing, waiting, ended", () {
    final b = AgentBoard.fromJson({
      'company': {'id': 'c1', 'name': 'جمعيّة', 'verified_at': '2026-10-01', 'active': true},
      'ready': true,
      'farmers': [
        {'id': 'a', 'farmer_id': 'f1', 'full_name': 'أحمد', 'phone': '0912', 'phone_tail': '1234', 'scopes': ['lands'], 'status': 'active'},
        {'id': 'b', 'farmer_id': null, 'phone_tail': '0000', 'scopes': ['lands'], 'status': 'pending', 'managed': true},
        {'id': 'c', 'farmer_id': null, 'phone_tail': '5678', 'scopes': ['herds'], 'status': 'revoked'},
      ],
    });
    expect(b.ready, isTrue);
    expect(b.active.single.fullName, 'أحمد');
    expect(b.pending.single.managed, isTrue);
    expect(b.past.single.phoneTail, '5678');
  });

  test('a stage is signed off only next in order, with evidence, and not after an objection', () {
    FarmerStage g(Map<String, dynamic> j) => FarmerStage({'id': 'g', 'name': 'الزراعة', ...j});
    expect(g({'next': true, 'evidence_count': 1}).canComplete, isTrue);
    expect(g({'next': true, 'evidence_count': 0}).canComplete, isFalse, reason: 'no evidence yet');
    expect(g({'next': false, 'evidence_count': 2}).canComplete, isFalse, reason: 'an earlier stage is open');
    expect(g({'next': true, 'evidence_count': 2, 'objected': true}).canComplete, isFalse, reason: 'the farmer signs it off now');
    expect(g({'completed': true, 'next': false}).canAddEvidence, isFalse);
  });

  test("«وكلائي»: what an agent wrote is marked, and only the season's lines not yet objected to can be", () {
    final v = MyAgentsView.fromJson(myAgentsJson);
    expect(v.pending.single.companyName, 'جمعيّة الحصاحيصا');
    expect(v.active.single.id, 'm2');
    expect(v.writes.first.mark, 'سجّلها الوكيل «شركة الزراعة»: اعتمد هذه المرحلة باسمك.');
    expect(v.writes.first.canObject, isTrue);
    expect(v.writes.last.mark, 'سجّله وكيلك: رفع الدليل باسمك.');
    expect(v.writes.last.objectionReason, 'ليست أرضي');
    expect(v.writes.last.canObject, isFalse);
  });

  test("the agent's writes go to the farmer's route, the farmer's answers to «وكلائي»", () async {
    final seen = <String>[];
    final c = await signedIn((req) async {
      expect(req.headers['authorization'], 'Bearer a1');
      final body = jsonDecode(req.body) as Map<String, dynamic>;
      seen.add('${req.url.path} ${body['action']}');
      if (body['action'] == 'evidence') {
        expect(body['photo'], base64Encode([9, 8, 7]));
        expect(body['kind'], 'invoice');
        expect(body['stage_id'], 'g1');
      }
      if (body['action'] == 'object') expect(body, {'action': 'object', 'action_id': 41, 'reason': 'لم يحدث هذا'});
      if (body['action'] == 'answer') expect(body['decision'], 'decline');
      return json({'ok': true, 'message': 'تمّ.'});
    });
    final api = AgentApi(account: c);
    await api.request(phone: '0912345678', scopes: ['lands'], note: 'نحن جمعيّة القرية');
    await api.completeStage('f1', 'g1');
    await api.addEvidence('f1', 'g1', kind: 'invoice', photo: [9, 8, 7], caption: 'فاتورة السماد');
    await api.answer('m1', accept: false);
    await api.object(41, 'لم يحدث هذا');
    await api.endMine('m2');
    expect(seen, [
      '/api/app/agent request',
      '/api/app/agent/f1 complete',
      '/api/app/agent/f1 evidence',
      '/api/app/agent/mine answer',
      '/api/app/agent/mine object',
      '/api/app/agent/mine end',
    ]);
  });

  test("a refusal from the database comes back in its words", () async {
    final c = await signedIn((_) async => json({'error': 'اعترض المزارع على اعتماد هذه المرحلة: يعتمدها هو بنفسه.'}, 400));
    expect(
      () => AgentApi(account: c).completeStage('f1', 'g1'),
      throwsA(isA<ApiException>().having((e) => e.message, 'message', contains('يعتمدها هو بنفسه'))),
    );
  });

  testWidgets('«وكلائي» shows the request to answer, the marks, and the objection where it is allowed', (tester) async {
    tester.view.physicalSize = const Size(390, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final c = await signedIn((req) async => json(myAgentsJson));
    // The gate reads the app's own session; the calls go through the stand-in.
    await accountController.load();

    await tester.pumpWidget(app(AgentScreen(api: AgentApi(account: c), initialTab: 1)));
    await tester.pumpAndSettle();

    expect(find.text('جمعيّة الحصاحيصا'), findsOneWidget);
    expect(find.text('أقبل'), findsOneWidget);
    expect(find.text('سجّلها الوكيل «شركة الزراعة»: اعتمد هذه المرحلة باسمك.'), findsOneWidget);
    expect(find.text('سجّله وكيلك: رفع الدليل باسمك.'), findsOneWidget);
    expect(find.text('اعتراض'), findsOneWidget, reason: 'only the line not yet objected to');
    expect(find.textContaining('اعترضت: ليست أرضي'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets("a farmer's page: the sign-off only where the website offers it, and the agent's own mark", (tester) async {
    tester.view.physicalSize = const Size(390, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final c = await signedIn((req) async => json({
          'farmer': {'id': 'f1', 'full_name': 'أحمد علي', 'phone': '0912', 'scopes': ['seasons'], 'scopes_label': 'المواسم'},
          'seasons': [
            {
              'id': 'se1', 'name': 'ذرة الخريف', 'crop_name': 'ذرة', 'feddans': 5, 'planting_date': '2026-07-01',
              'status': 'active', 'stages_done': 1, 'stages_total': 3,
              'stages': [
                {'id': 'g1', 'name': 'التحضير', 'completed': true, 'by_agent': true, 'evidence_count': 2, 'next': false},
                {'id': 'g2', 'name': 'الزراعة', 'completed': false, 'evidence_count': 1, 'next': true},
                {'id': 'g3', 'name': 'الحصاد', 'completed': false, 'evidence_count': 1, 'next': false},
              ],
            },
          ],
          'actions': [
            {'id': 1, 'at': '2026-11-01T00:00:00Z', 'label': 'اعتمدت مرحلةً من موسم'},
          ],
        }));
    await accountController.load();

    await tester.pumpWidget(app(AgentFarmerScreen(farmerId: 'f1', api: AgentApi(account: c))));
    await tester.pumpAndSettle();

    expect(find.text('أحمد علي'), findsOneWidget);
    expect(find.textContaining('اعتمدتها أنت'), findsOneWidget);
    expect(find.text('اعتمد المرحلة باسمه'), findsOneWidget, reason: 'only the next open stage with evidence');
    expect(find.text('ارفع دليلاً باسمه'), findsNWidgets(2), reason: 'on each stage not yet signed off');
    expect(find.text('أراضيه'), findsNothing, reason: 'not authorised for land');
    expect(tester.takeException(), isNull);
  });
}
