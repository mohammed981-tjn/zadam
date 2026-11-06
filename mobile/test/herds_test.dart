/// «القطعان» في التطبيق (البند ٢٠٣): what /api/app/herds/* returns, the client against a stand-in server, and the
/// list with the disease watch, the new-cycle form and a cycle's export readiness on screen.
library;

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sudagri/account.dart';
import 'package:sudagri/herds.dart';
import 'package:sudagri/screens/herds_screen.dart';
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

const herd = {
  'id': 'h1',
  'name': 'ضأن الصادر',
  'species': 'sheep',
  'species_label': 'ضأن',
  'purpose_label': 'تسمين',
  'breed': 'حمري',
  'head_count': 1200,
  'start_date': '2026-10-01',
  'status': 'active',
  'stages_done': 1,
  'stages_total': 5,
};

Map<String, dynamic> pageJson({bool fao = true}) => {
      'herds': [herd],
      'diseases': fao
          ? {
              'alerts': [
                {'land': 'حواشة الشيخ', 'state': 'الجزيرة', 'diseases': ['الحمّى القلاعيّة (3 أكتوبر 2026)']},
              ],
              'nearest': ['«حواشة الشيخ»: أقرب حدثٍ مُبلَّغ عنه الحمّى القلاعيّة على بعد 12 كم.'],
              'groups': [
                {'country': 'السودان', 'states': ['الجزيرة'], 'disease': 'الحمّى القلاعيّة', 'count': 4, 'latest': '3 أكتوبر 2026'},
              ],
              'sudan_events': true,
              'has_lands': true,
              'source': 'المصدر: الفاو، نظام EMPRES-i',
              'source_url': 'https://data.apps.fao.org/catalog/dataset/major-diseases-by-date-empres-i',
            }
          : null,
      'species': [
        {
          'key': 'sheep',
          'label': 'ضأن',
          'purposes': [
            {'key': 'meat', 'label': 'لحوم'},
            {'key': 'fattening', 'label': 'تسمين'},
          ],
        },
        {
          'key': 'poultry',
          'label': 'دواجن',
          'purposes': [
            {'key': 'eggs', 'label': 'بيض'},
          ],
        },
      ],
    };

Map<String, dynamic> detailJson(String destination) => {
      'herd': herd,
      'totals': {'done': 1, 'stages': 2, 'feed_kg': 130000, 'budget': 0, 'per_head': 0},
      'stages': [
        {'id': 's1', 'order': 1, 'name': 'الاقتناء', 'completed': true, 'planned_start': '2026-10-01', 'planned_end': '2026-10-07',
         'days': 7, 'feed_kg': 8820, 'budget': 0, 'feed_share': 7, 'can_complete': false},
        {'id': 's2', 'order': 2, 'name': 'الحجر الصحي', 'completed': false, 'planned_start': '2026-10-08', 'planned_end': '2026-10-28',
         'days': 21, 'feed_kg': 26460, 'budget': 0, 'feed_share': 20, 'can_complete': true},
      ],
      'readiness': {
        'destination': destination,
        'destinations': [
          {'key': 'sa', 'label': 'السعوديّة'},
          {'key': 'eg', 'label': 'مصر'},
        ],
        'verdict': 'ينقص سجلَّ القطيع 2 وفي 1 تنبيه — راجعها قبل البيع للمصدّر.',
        'met': false,
        'lines': [
          {'id': 'tags', 'status': 'missing', 'title': destination == 'eg' ? 'شرط مصر' : 'ترقيم كلّ رأس', 'detail': '0 من 1200 مرقّماً.',
           'source': 'جريدة أمّ القرى', 'source_url': 'https://www.uqn.gov.sa/x', 'source_meta': 'رسميّ · 2026-10-02'},
        ],
        'tags': {'present': 0, 'others': [], 'sample': []},
        'records': [
          {'id': 'x1', 'kind': 'تطعيم', 'item': 'طاعون المجترّات الصغيرة', 'done_on': '2026-10-05', 'heads': 1200, 'withdrawn': false},
        ],
        'items': [
          {'choice': 'vaccination:ppr', 'kind': 'vaccination', 'label': 'طاعون المجترّات الصغيرة'},
          {'choice': 'test:brucellosis', 'kind': 'test', 'label': 'البروسيلا (الحمّى المالطيّة)'},
        ],
        'note': 'هذه قائمة تحضير، لا شهادة.',
      },
    };

void main() {
  test('the page parses: the herds, the disease watch, and the species with their purposes', () {
    final p = HerdsPage.fromJson(pageJson());
    expect(p.herds.single.kindLine, 'ضأن — تسمين — حمري');
    expect(p.diseases!.alerts.single.state, 'الجزيرة');
    expect(p.diseases!.groups.single.count, 4);
    expect(p.species.first.purposes.map((x) => x.key), ['meat', 'fattening']);
    expect(HerdsPage.fromJson(pageJson(fao: false)).diseases, isNull,
        reason: 'FAO unreachable is said as such, not as «nothing reported»');
  });

  test('a cycle parses with its stages and its export readiness', () {
    final d = HerdDetail.fromJson(detailJson('sa'));
    expect(d.active, isTrue);
    expect(d.stages.where((s) => s.canComplete).single.id, 's2');
    expect(d.readiness!.met, isFalse);
    expect(d.readiness!.lines.single.status, 'missing');
    expect(d.readiness!.items.last.choice, 'test:brucellosis');
    final poultry = HerdDetail.fromJson({...detailJson('sa'), 'readiness': null});
    expect(poultry.readiness, isNull);
  });

  test('the client sends the website\'s fields to the routes, with the token', () async {
    final seen = <String>[];
    final bodies = <Map<String, dynamic>>[];
    final account = await signedIn((req) async {
      seen.add('${req.method} ${req.url.path}${req.url.query.isEmpty ? '' : '?${req.url.query}'}');
      expect(req.headers['authorization'], 'Bearer a1');
      if (req.method == 'POST') bodies.add(jsonDecode(req.body) as Map<String, dynamic>);
      if (req.url.path == '/api/app/herds' && req.method == 'POST') return json({'id': 'h9', 'message': 'أُنشئت الدورة.'});
      if (req.url.path == '/api/app/herds') return json(pageJson());
      if (req.method == 'POST') return json({'ok': true, 'message': 'تمّ'});
      return json(detailJson(req.url.queryParameters['to'] ?? 'sa'));
    });
    final api = HerdsApi(account);

    expect((await api.page()).herds.single.id, 'h1');
    expect(await api.create(name: 'ضأن', species: 'sheep', purpose: 'meat', headCount: 50, startDate: '2026-11-01'), 'h9');
    expect(bodies.last, {'name': 'ضأن', 'species': 'sheep', 'purpose': 'meat', 'head_count': 50, 'start_date': '2026-11-01', 'breed': ''},
        reason: 'a blank budget is left out, as the website reads a blank field');
    expect((await api.detail('h1', destination: 'eg')).readiness!.destination, 'eg');
    await api.completeStage('h1', 's2');
    expect(bodies.last, {'action': 'complete_stage', 'stage_id': 's2'});
    await api.addHealth('h1', choice: 'vaccination:ppr', doneOn: '2026-10-05', heads: 1200);
    expect(bodies.last['choice'], 'vaccination:ppr');
    await api.addTags('h1', prefix: 'SD-', from: 1);
    expect(bodies.last, {'action': 'tags', 'prefix': 'SD-', 'from': 1});
    expect(seen, containsAll(['GET /api/app/herds', 'POST /api/app/herds', 'GET /api/app/herds/h1?to=eg', 'POST /api/app/herds/h1']));
  });

  testWidgets('the list shows the disease alert for the person\'s state and the herd; the herd opens its readiness',
      (tester) async {
    tallPhone(tester);
    final account = await signedIn((req) async {
      if (req.url.path == '/api/app/herds') return json(pageJson());
      if (req.method == 'POST') return json({'ok': true, 'message': 'اعتُمدت المرحلة.'});
      return json(detailJson(req.url.queryParameters['to'] ?? 'sa'));
    });
    await tester.pumpWidget(app(HerdsScreen(api: HerdsApi(account))));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('disease-alert')), findsOneWidget);
    expect(find.textContaining('الحمّى القلاعيّة (3 أكتوبر 2026)'), findsOneWidget);
    await scrollTo(tester, find.text('ضأن الصادر'));
    expect(find.text('ضأن الصادر'), findsOneWidget);

    await tester.tap(find.text('ضأن الصادر'));
    await tester.pumpAndSettle();
    await scrollTo(tester, find.text('اعتمد المرحلة'));
    expect(find.text('اعتمد المرحلة'), findsOneWidget, reason: 'only the next open stage can be signed off');
    await scrollTo(tester, find.text('ترقيم كلّ رأس'));
    expect(find.text('ترقيم كلّ رأس'), findsOneWidget);
    await scrollTo(tester, find.text('مصر'));
    await tester.tap(find.text('مصر'));
    await tester.pumpAndSettle();
    expect(find.text('شرط مصر'), findsOneWidget);
  });

  testWidgets('FAO unreachable says so; a new cycle offers the purposes of the chosen species', (tester) async {
    tallPhone(tester);
    final account = await signedIn((req) async {
      if (req.url.path == '/api/app/herds' && req.method == 'GET') return json({...pageJson(fao: false), 'herds': []});
      return json({'error': 'تعذّر توليد خطة الدورة — راجع النوع والغرض والعدد وتاريخ البدء.'}, 400);
    });
    await tester.pumpWidget(app(HerdsScreen(api: HerdsApi(account))));
    await tester.pumpAndSettle();
    expect(find.text('تعذّر الوصول إلى بيانات الفاو عن أمراض الماشية الآن.'), findsOneWidget);
    expect(find.text('لا توجد دورات بعد'), findsOneWidget);

    await tester.tap(find.byKey(const Key('new-herd')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('herd-name')), 'دورة');
    await tester.enterText(find.byKey(const Key('herd-heads')), '20');
    await scrollTo(tester, find.byKey(const Key('herd-save')));
    await tester.tap(find.byKey(const Key('herd-save')));
    await tester.pumpAndSettle();
    await scrollTo(tester, find.textContaining('تعذّر توليد'));
    expect(find.text('تعذّر توليد خطة الدورة — راجع النوع والغرض والعدد وتاريخ البدء.'), findsOneWidget);
  });
}
