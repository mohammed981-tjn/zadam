/// المواسم في التطبيق (البند ٢٠٣): what /api/app/seasons returns, the outbox's keep-and-send rules (the website's
/// src/lib/outbox.ts, held here against a stand-in server), and the screens built with no session and with one.
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
import 'package:sudagri/screens/season_screen.dart';
import 'package:sudagri/screens/seasons_screen.dart';
import 'package:sudagri/seasons.dart';
import 'package:sudagri/theme.dart';

const site = 'https://site.test';

String token(String sub) {
  String part(Object o) => base64Url.encode(utf8.encode(jsonEncode(o))).replaceAll('=', '');
  return '${part({'alg': 'HS256'})}.${part({'sub': sub, 'role': 'authenticated'})}.sig';
}

http.Response json(Object body, [int status = 200]) => http.Response.bytes(
    utf8.encode(jsonEncode(body)), status,
    headers: {'content-type': 'application/json; charset=utf-8'});

Map<String, Object> sessionPrefs(String sub) {
  final expires = DateTime.now().toUtc().add(const Duration(hours: 1)).millisecondsSinceEpoch ~/ 1000;
  return {
    'sudagri.session': jsonEncode({'access_token': token(sub), 'refresh_token': 'r1', 'expires_at': expires}),
  };
}

Future<AccountController> controller(Future<http.Response> Function(http.Request) handler) async {
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

final seasonJson = <String, dynamic>{
  'season': {
    'id': 's1',
    'name': 'قمح الجزيرة',
    'crop': 'قمح',
    'station': 'ود مدني',
    'irrigation': 'ري سطحي',
    'feddans': 10,
    'location': 'الحصاحيصا',
    'status': 'active',
    'partnership_id': null,
  },
  'is_owner': true,
  'can_write': true,
  'today': '2026-11-06',
  'progress': {'done': 1, 'total': 2, 'pct': 50},
  'totals': {
    'costs': 1250.5,
    'revenue': 0,
    'profit': -1250.5,
    'profit_per_feddan': -125.05,
    'cost_per_feddan': 125.05,
    'planned_per_feddan': 300,
    'revenue_per_feddan': 0,
    'margin_pct': null,
    'planned_budget': 3000,
    'released': 1000,
  },
  'by_category': [
    {'category': 'seeds', 'label': 'بذور', 'amount': 1250.5, 'share': 100},
  ],
  'variance': {'planned': 3000, 'spent': 1250.5, 'unassigned': 250.5},
  'stages': [
    {
      'id': 'st1',
      'name': 'تحضير الأرض',
      'planned_start': '2026-11-01',
      'planned_end': '2026-11-15',
      'water_m3': 0,
      'budget': 1000,
      'spent': 1000,
      'left': 0,
      'completed': true,
      'released': true,
      'reason': null,
      'activities': ['حرث'],
      'evidence': [
        {'id': 'e1', 'kind': 'photo', 'caption': 'صورة الحرث'},
      ],
    },
    {
      'id': 'st2',
      'name': 'الزراعة',
      'planned_start': '2026-11-16',
      'planned_end': '2026-11-30',
      'water_m3': 1200,
      'budget': 2000,
      'spent': 0,
      'left': 2000,
      'completed': false,
      'released': false,
      'reason': 'لا توجد أدلة مرفوعة لهذه المرحلة (صور أو فواتير أو تقرير معاينة).',
      'activities': [],
      'evidence': [],
    },
  ],
  'entries': [
    {
      'id': 'l1',
      'category': 'seeds',
      'label': 'بذور',
      'description': 'تقاوي',
      'entry_date': '2026-11-02',
      'currency': 'SDG',
      'amount_usd': 1250.5,
      'entered_amount': 3001200,
      'fx_rate': 2400,
      'paid_from': 'cash',
      'paid_from_label': 'نقداً',
    },
  ],
  'credit': [
    {
      'id': 'l2',
      'category': 'labour',
      'label': 'عمالة',
      'description': null,
      'entry_date': '2026-11-03',
      'currency': 'USD',
      'amount_usd': 40,
      'entered_amount': null,
      'fx_rate': null,
      'paid_from': 'credit',
      'paid_from_label': 'آجل',
      'settled_on': null,
    },
  ],
  'suggested_rate': {'rate': 2400, 'rate_date': '2026-11-06'},
  'revaluation': null,
  'crop_value': {'usd': 5400, 'pounds': 12960000, 'note': 'نحو 18,000 كجم.'},
  'band': {'p50': 120},
  'categories': [],
};

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('models', () {
    test('the list keeps my seasons apart from my partnership seasons', () {
      final l = SeasonsList.fromJson({
        'seasons': [
          {'id': 'a', 'name': 'ذرة', 'crop': 'ذرة رفيعة', 'feddans': 5, 'planting_date': '2026-07-01', 'status': 'active'},
          {'id': 'b', 'name': 'قطن', 'crop_key': 'cotton', 'feddans': '2.5', 'planting_date': '2025-07-01', 'status': 'completed'},
        ],
        'partner': [
          {'id': 'c', 'name': 'شراكة', 'crop': 'قمح', 'feddans': 8, 'planting_date': '2026-11-01', 'status': 'active'},
        ],
      });
      expect(l.mine.map((s) => s.id), ['a', 'b']);
      expect(l.mine[1].crop, 'cotton', reason: 'the key stands in when no name came');
      expect(l.mine[1].feddans, 2.5);
      expect(l.mine[1].active, isFalse);
      expect(seasonStatusLabel(l.mine[1].status), 'مكتمل');
      expect(l.partner.single.name, 'شراكة');
    });

    test('a season parses: figures, stages, entries in pounds, credit, crop value', () {
      final v = SeasonView.fromJson(seasonJson);
      expect(v.canWrite, isTrue);
      expect(v.pct, 50);
      expect(v.t('costs'), 1250.5);
      expect(v.totals['margin_pct'], isNull);
      expect(v.stages.last.reason, contains('أدلة'));
      expect(v.stages.first.evidence, ['صورة الحرث']);
      expect(v.entries.single.paid, '3,001,200 ج.س');
      expect(v.credit.single.settledOn, isNull);
      expect(v.cropValue!.headline, '\$5,400 · 12,960,000 جنيه');
      expect(v.rateHint, contains('2,400'));
      expect(v.byCategory.single.$1, 'بذور');
    });

    test('figures are written as the website writes them', () {
      expect(n0(1234567.6), '1,234,568');
      expect(n0(-1250.5), '-1,250', reason: 'as JavaScript\'s Math.round, not Dart\'s half away from zero');
      expect(n0(2.5), '3');
      expect(amount2(-0.5), '-0.5');
      expect(n0(999), '999');
      expect(amount2(1250.5), '1,250.5');
      expect(amount2(40), '40');
      expect(categoryLabel('irrigation'), 'ري ووقود');
    });

    test('the account is read from the token, and a broken token is no account', () {
      expect(userIdOf(token('abc-123')), 'abc-123');
      expect(userIdOf('not-a-token'), isNull);
      expect(userIdOf('a.%%%.c'), isNull);
    });

    test('an outage is told from a refusal', () {
      expect(isOutage(ApiException('تعذّر الاتصال. تحقّق من الشبكة وأعد المحاولة.')), isTrue);
      expect(isOutage(ApiException('انتهت جلستك. ادخل من جديد.')), isTrue);
      expect(isOutage(ApiException('تعذّر الطلب (502).')), isTrue);
      expect(isOutage(ApiException('اكتب مبلغاً صحيحاً بأقصى كسرين عشريين.')), isFalse);
      expect(isOutage(ApiException('الفترة مقفلة.')), isFalse);
    });
  });

  group('outbox: keeping', () {
    test('kept under the account and the season, stamped with the day it was written', () async {
      final box = LedgerOutbox(now: () => DateTime(2026, 11, 6, 23, 30));
      expect(await box.keep(key: 'ledger:s1', userId: 'u1', fields: {'category': 'seeds', 'amount': '10'}), KeepResult.kept);
      final items = await box.pending('u1', 'ledger:s1');
      expect(items.single.fields['entry_date'], '2026-11-06');
      expect(items.single.seasonId, 's1');
      expect(await box.pending('u2'), isEmpty, reason: 'another account on the same phone is never offered it');
      expect(await box.pending(null), isEmpty);
    });

    test('no account, no keeping; a secret field is never kept; a field too long is not a typed answer', () async {
      final box = LedgerOutbox();
      expect(await box.keep(key: 'ledger:s1', userId: null, fields: {'amount': '1'}), KeepResult.noOwner);
      await box.keep(key: 'ledger:s1', userId: 'u1', fields: {'amount': '1', 'password': 'x'});
      expect((await box.pending('u1')).single.fields.containsKey('password'), isFalse);
      expect(await box.keep(key: 'ledger:s1', userId: 'u1', fields: {'description': 'x' * 2001}), KeepResult.unfit);
    });

    test('the same form twice within a minute is one double tap; after it, a second entry', () async {
      var now = DateTime(2026, 11, 6, 10);
      final box = LedgerOutbox(now: () => now);
      final f = {'category': 'seeds', 'amount': '10'};
      expect(await box.keep(key: 'ledger:s1', userId: 'u1', fields: f), KeepResult.kept);
      expect(await box.keep(key: 'ledger:s1', userId: 'u1', fields: f), KeepResult.duplicate);
      now = now.add(const Duration(minutes: 2));
      expect(await box.keep(key: 'ledger:s1', userId: 'u1', fields: f), KeepResult.kept);
      expect((await box.pending('u1')).length, 2);
    });

    test('twenty at most, and seven days at most', () async {
      var now = DateTime(2026, 11, 1);
      final box = LedgerOutbox(now: () => now);
      for (var i = 0; i < 20; i++) {
        expect(await box.keep(key: 'ledger:s1', userId: 'u1', fields: {'amount': '$i'}), KeepResult.kept);
      }
      expect(await box.keep(key: 'ledger:s1', userId: 'u1', fields: {'amount': 'x'}), KeepResult.full);
      now = now.add(const Duration(days: 7, minutes: 1));
      expect(await box.load(), isEmpty, reason: 'a form older than a week no longer says what its writer meant');
    });

    test('a damaged box loses the damaged item, not the rest, and never throws', () async {
      SharedPreferences.setMockInitialValues({
        LedgerOutbox.storageKey: jsonEncode([
          {'id': 'x'},
          {
            'id': 'ok', 'key': 'ledger:s1', 'label': 'قيد', 'userId': 'u1',
            'createdAt': DateTime.now().millisecondsSinceEpoch, 'fields': {'amount': '5'},
          },
        ]),
      });
      expect((await LedgerOutbox().load()).single.id, 'ok');
      SharedPreferences.setMockInitialValues({LedgerOutbox.storageKey: '{not json'});
      expect(await LedgerOutbox().load(), isEmpty);
    });
  });

  group('outbox: sending', () {
    Future<LedgerOutbox> boxWith(int n, {String key = 'ledger:s1', String user = 'u1'}) async {
      var t = DateTime.now().subtract(const Duration(hours: 1));
      final box = LedgerOutbox(now: () => t);
      for (var i = 0; i < n; i++) {
        await box.keep(key: key, userId: user, fields: {'amount': '$i'});
        t = t.add(const Duration(minutes: 2));
      }
      return LedgerOutbox();
    }

    test('everything sent leaves the box', () async {
      final box = await boxWith(3);
      final sent = <String>[];
      final r = await box.send(userId: 'u1', key: 'ledger:s1', post: (s, f) async => sent.add('$s:${f['amount']}'));
      expect(sent, ['s1:0', 's1:1', 's1:2']);
      expect(r.sent, 3);
      expect(r.waiting, 0);
    });

    test('the network lost half-way: the rest go back and wait, in order', () async {
      final box = await boxWith(3);
      var n = 0;
      final r = await box.send(
        userId: 'u1',
        key: 'ledger:s1',
        post: (s, f) async {
          if (n++ == 1) throw ApiException('تعذّر الاتصال. تحقّق من الشبكة وأعد المحاولة.');
        },
      );
      expect(r.sent, 1);
      expect(r.refused, isEmpty);
      expect([for (final i in await box.pending('u1')) i.fields['amount']], ['1', '2']);
    });

    test('a refusal is not sent again, and its reason is reported', () async {
      final box = await boxWith(2);
      final r = await box.send(
        userId: 'u1',
        key: 'ledger:s1',
        post: (s, f) async {
          if (f['amount'] == '0') throw ApiException('الفترة مقفلة.');
        },
      );
      expect(r.sent, 1);
      expect(r.refused.single.$2, 'الفترة مقفلة.');
      expect(r.waiting, 0);
    });

    test('another account\'s items are never sent', () async {
      await boxWith(1, user: 'u2');
      final box = LedgerOutbox();
      var calls = 0;
      final r = await box.send(userId: 'u1', post: (s, f) async => calls++);
      expect(calls, 0);
      expect(r.sent, 0);
      expect((await box.pending('u2')).length, 1);
    });

    test('a blank-form item waits until its season is chosen', () async {
      await boxWith(1, key: LedgerOutbox.unassigned);
      final box = LedgerOutbox();
      final seen = <String>[];
      await box.send(userId: 'u1', post: (s, f) async => seen.add(s));
      expect(seen, isEmpty);
      expect((await box.pending('u1', LedgerOutbox.unassigned)).length, 1);
      await box.send(userId: 'u1', post: (s, f) async => seen.add(s), seasonFor: (_) => 's9');
      expect(seen, ['s9']);
      expect(await box.pending('u1'), isEmpty);
    });
  });

  group('the client', () {
    test('an entry with no network is kept; a refusal is thrown with the website\'s words', () async {
      SharedPreferences.setMockInitialValues(sessionPrefs('u1'));
      var offline = true;
      final c = await controller((req) async {
        if (offline) throw Exception('no route to host');
        expect(req.url.path, '/api/app/seasons/s1/entries');
        expect(req.headers['authorization'], startsWith('Bearer '));
        return json({'error': 'اكتب مبلغاً صحيحاً بأقصى كسرين عشريين.'}, 400);
      });
      final api = SeasonsApi(account: c);
      expect(api.userId, 'u1');
      expect(await api.addOrKeep('s1', {'category': 'seeds', 'amount': '10'}), KeepResult.kept);
      expect((await api.outbox.pending('u1', 'ledger:s1')).single.fields['amount'], '10');

      offline = false;
      await expectLater(
        api.addOrKeep('s1', {'category': 'seeds', 'amount': '1.234'}),
        throwsA(isA<ApiException>().having((e) => e.message, 'message', contains('كسرين'))),
      );
      expect((await api.outbox.pending('u1')).length, 1, reason: 'a refusal is not kept: the form still holds it');
    });

    test('kept entries go to the season\'s route once online', () async {
      SharedPreferences.setMockInitialValues(sessionPrefs('u1'));
      final bodies = <Map<String, dynamic>>[];
      final c = await controller((req) async {
        bodies.add(jsonDecode(req.body) as Map<String, dynamic>);
        return json({'ok': true});
      });
      final api = SeasonsApi(account: c);
      await api.outbox.keep(key: 'ledger:s1', userId: 'u1', fields: {'category': 'labour', 'amount': '7'});
      final r = await api.sendPending(seasonId: 's1');
      expect(r.sent, 1);
      expect(bodies.single['category'], 'labour');
      expect(bodies.single['entry_date'], isNotEmpty, reason: 'the day it was written travels with it');
    });
  });

  group('screens', () {
    testWidgets('signed out, «مواسمي» asks to sign in', (tester) async {
      SharedPreferences.setMockInitialValues({});
      await accountController.load();
      await tester.pumpWidget(app(const SeasonsScreen()));
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.text('ادخل إلى حسابك'), findsOneWidget);
      expect(find.text('ادخل أو أنشئ حساباً'), findsOneWidget);
    });

    testWidgets('a season page builds from the route\'s reply', (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      SharedPreferences.setMockInitialValues(sessionPrefs('u1'));
      late SeasonsApi api;
      await tester.runAsync(() async {
        final c = await controller((req) async => json(seasonJson));
        api = SeasonsApi(account: c);
      });
      await tester.pumpWidget(app(SeasonScreen(id: 's1', name: 'قمح الجزيرة', api: api)));
      for (var i = 0; i < 5; i++) {
        await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
        await tester.pump(const Duration(milliseconds: 100));
      }
      expect(find.text('أضف قيداً'), findsOneWidget);
      expect(find.text('قيمة محصولك القائم — تقدير'), findsOneWidget);
      await tester.scrollUntilVisible(find.text('اعتمد المرحلة'), 200, scrollable: find.byType(Scrollable).first);
      expect(find.text('اعتمد المرحلة'), findsOneWidget, reason: 'only the stage still open offers it');
    });
  });
}
