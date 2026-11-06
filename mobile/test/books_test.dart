/// الدفتر المحاسبيّ في التطبيق (البند ٢٠٣): what /api/app/books and /api/app/books/assets return, the query the app
/// sends (the page's own address), the answers to a partner's entry, and the screens with no session and with one.
library;

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sudagri/account.dart';
import 'package:sudagri/books.dart';
import 'package:sudagri/screens/books_screen.dart';
import 'package:sudagri/theme.dart';

const site = 'https://site.test';

http.Response json(Object body, [int status = 200]) => http.Response.bytes(
    utf8.encode(jsonEncode(body)), status,
    headers: {'content-type': 'application/json; charset=utf-8'});

Map<String, Object> sessionPrefs() {
  final expires = DateTime.now().toUtc().add(const Duration(hours: 1)).millisecondsSinceEpoch ~/ 1000;
  return {'sudagri.session': jsonEncode({'access_token': 'a.b.c', 'refresh_token': 'r1', 'expires_at': expires})};
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

Map<String, dynamic> page(Map<String, dynamic> report, {String r = 'trial'}) => {
      'today': '2026-11-06',
      'params': {'report': r, 'book': null, 'from': '2026-01-01', 'to': '2026-11-06', 'as_of': '2026-11-06', 'page': 1},
      'kinds': ['farm', 'investor'],
      'waiting_for_me': 1,
      'fees_waiting': 0,
      'book': {'id': 'b1', 'kind': 'farm', 'heading': 'دفتر مزرعتك', 'closed_through': null, 'owned': true},
      'report': report,
    };

final trial = <String, dynamic>{
  'kind': 'trial',
  'balanced': true,
  'rows': [
    {'code': '1110', 'name': 'النقد', 'debit': '1,250.50', 'credit': ''},
    {'code': '3100', 'name': 'رأس المال', 'debit': '', 'credit': '1,250.50'},
  ],
  'memo': [],
  'total_debit': '1,250.50',
  'total_credit': '1,250.50',
};

final link = <String, dynamic>{
  'id': 'k1',
  'kind': 'payout',
  'kind_label': 'تسليم نصيب',
  'status': 'pending',
  'mine': false,
  'amount': '500.00 دولار',
  'settles': null,
  'other_name': 'أحمد',
  'entry_date': '2026-11-01',
  'agreement_ref': 'SA-12',
  'memo': '',
  'status_label': 'ينتظر الردّ',
  'live': false,
  'reject_reason': null,
  'needs_account': true,
  'reversal': null,
  'action': 'none',
};

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('models', () {
    test('the query is the page\'s own address, with only what was set', () {
      expect(const BooksQuery().path, '/api/app/books?r=trial');
      final q = const BooksQuery(report: 'account', book: 'investor', from: '2026-02-01', account: 'acc-1', page: 2).path;
      expect(Uri.parse(q).queryParameters, {'r': 'account', 'book': 'investor', 'from': '2026-02-01', 'a': 'acc-1', 'p': '2'});
      expect(datesOf('journal'), ReportDates.period);
      expect(datesOf('balance'), ReportDates.asOf);
      expect(datesOf('links'), ReportDates.none);
    });

    test('the page parses: the book, the kinds, the waiting counts, the trial balance', () {
      final v = BooksView.fromJson(page(trial));
      expect(v.book!.heading, 'دفتر مزرعتك');
      expect(v.kinds, ['farm', 'investor']);
      expect(v.waitingForMe, 1);
      final r = v.data as TrialReport;
      expect(r.balanced, isTrue);
      expect(r.rows.first.debit, '1,250.50', reason: 'the figure is the page\'s, written by the server');
    });

    test('every report kind parses', () {
      expect(BookReport.fromJson({
        'kind': 'income',
        'revenue': [{'code': '4100', 'name': 'مبيعات', 'amount': '10.00'}],
        'expense': [],
        'total_revenue': '10.00',
        'total_expense': '0.00',
        'net_income': '10.00',
      }), isA<IncomeReport>().having((r) => r.revenue.single.name, 'name', 'مبيعات'));
      expect(BookReport.fromJson({
        'kind': 'balance', 'balanced': false, 'assets': [], 'liabilities': [], 'equity': [],
        'retained_income': null, 'current_income_label': 'ربح هذه السنة حتى اليوم', 'current_income': '0.00',
        'total_assets': '0.00', 'total_liabilities': '0.00', 'total_equity': '0.00', 'total_liabilities_equity': '0.00',
      }), isA<BalanceReport>().having((r) => r.balanced, 'balanced', isFalse));
      expect(BookReport.fromJson({
        'kind': 'cash', 'ties': true, 'opening': '0.00', 'net': '5.00', 'closing': '5.00',
        'sections': [{'key': 'operating', 'title': 'أنشطة التشغيل', 'rows': [], 'total': '5.00'}],
      }), isA<CashReport>().having((r) => r.sections.single.$1, 'title', 'أنشطة التشغيل'));
      expect(BookReport.fromJson({
        'kind': 'seasons',
        'rows': [{'season_id': 's1', 'name': 'قمح', 'revenue': '1.00', 'expense': '0.00', 'profit': '1.00'}],
      }), isA<SeasonsProfitReport>().having((r) => r.rows.single.seasonId, 'id', 's1'));
      final j = BookReport.fromJson({
        'kind': 'journal', 'has_more': true,
        'entries': [{
          'id': 'e', 'entry_no': 7, 'entry_date': '2026-11-01', 'memo': 'بذور', 'reversal': true,
          'lines': [{'code': '5100', 'account': 'بذور', 'debit': '10.00', 'credit': '', 'foreign': '24,000.00 SDG'}],
        }],
      }) as JournalReport;
      expect(j.hasMore, isTrue);
      expect(j.entries.single.lines.single.account, '5100 · بذور');
      expect(BookReport.fromJson({
        'kind': 'chart',
        'accounts': [{'id': 'a', 'code': '11', 'name': 'النقد', 'type': 'أصل', 'postable': false, 'active': true, 'depth': 1}],
      }), isA<ChartReport>().having((r) => r.accounts.single.depth, 'depth', 1));
      expect(BookReport.fromJson({
        'kind': 'account', 'account': {'id': 'a', 'code': '1110', 'name': 'النقد'},
        'rows': [{'date': '2026-01-01', 'entry_no': null, 'memo': 'رصيد أوّل الفترة', 'movement': '', 'balance': '0.00'}],
      }), isA<AccountReport>().having((r) => r.rows.single.entryNo, 'no', isNull));
      expect(BookReport.fromJson({'kind': 'something-new'}), isNull);
      expect(BookReport.fromJson(null), isNull);
    });

    test('the partner proposals keep their groups and what may be done', () {
      final r = BookReport.fromJson({
        'kind': 'links',
        'waiting_for_me': [link],
        'reversals_for_me': [],
        'waiting_for_them': [],
        'decided': [
          {
            ...link,
            'id': 'k2',
            'status': 'confirmed',
            'live': true,
            'action': 'withdraw',
            'reversal': {'id': 'v1', 'status': 'pending', 'label': 'طلب إلغاءٍ ينتظر الردّ', 'reason': 'خطأ', 'reject_reason': null},
          },
        ],
      }) as LinksReport;
      expect(r.waitingForMe.single.needsAccount, isTrue);
      expect(r.waitingForMe.single.facts, 'أحمد · 2026-11-01 · SA-12');
      expect(r.decided.single.action, 'withdraw');
      expect(r.decided.single.reversalId, 'v1');
    });

    test('fixed assets parse with the website\'s line under the name', () {
      final v = AssetsView.fromJson({
        'today': '2026-11-06',
        'assets': [
          {
            'id': 'x', 'name': 'جرّار', 'kind': 'آلات ومعدّات', 'acquired_on': '2026-01-10', 'life_months': 96,
            'months_posted': 9, 'cost': '20,000.00 دولار', 'salvage': '2,000.00 دولار', 'accumulated': '1,687.50 دولار',
            'book_value': '18,312.50 دولار', 'disposed_on': null, 'proceeds': null,
          },
          {
            'id': 'y', 'name': 'مضخّة', 'kind': 'آلات ومعدّات', 'acquired_on': '2025-01-10', 'life_months': 60,
            'months_posted': 12, 'cost': '1.00 دولار', 'salvage': null, 'accumulated': '0.20 دولار',
            'book_value': '0.80 دولار', 'disposed_on': '2026-02-01', 'proceeds': null,
          },
        ],
        'totals': {'cost': '20,001.00 دولار', 'accumulated': '1,687.70 دولار', 'book_value': '18,313.30 دولار'},
      });
      expect(v.assets.first.facts, 'آلات ومعدّات · 2026-01-10 · 9 من 96 شهراً · خردة 2,000.00 دولار');
      expect(v.assets.first.disposal, isNull);
      expect(v.assets.last.disposal, 'استُبعد في 2026-02-01');
      expect(v.totals.bookValue, '18,313.30 دولار');
    });
  });

  group('the client', () {
    test('an answer goes to the links route with the website\'s step, and its sentence comes back', () async {
      SharedPreferences.setMockInitialValues(sessionPrefs());
      late Map<String, dynamic> sent;
      final c = await controller((req) async {
        expect(req.url.path, '/api/app/books/links');
        sent = jsonDecode(req.body) as Map<String, dynamic>;
        return json({'ok': true, 'message': 'أُكِّد القيد وسُجِّل في دفترك ودفتر شريكك.'});
      });
      final m = await BooksApi(account: c).answer('confirm', linkId: 'k1', account: 'bank');
      expect(sent, {'action': 'confirm', 'link_id': 'k1', 'account': 'bank'});
      expect(m, contains('أُكِّد'));
    });

    test('a refusal arrives in the route\'s words', () async {
      SharedPreferences.setMockInitialValues(sessionPrefs());
      final c = await controller((req) async => json({'error': 'اكتب سبب الرفض (٣ أحرفٍ فأكثر): يراه صاحب الطلب.'}, 400));
      await expectLater(
        BooksApi(account: c).answer('reject_reversal', reversalId: 'v1', reason: 'لا'),
        throwsA(isA<Object>().having((e) => '$e', 'message', contains('٣ أحرف'))),
      );
    });
  });

  group('screens', () {
    testWidgets('signed out, the books ask to sign in', (tester) async {
      SharedPreferences.setMockInitialValues({});
      await accountController.load();
      await tester.pumpWidget(app(const BooksScreen()));
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.text('ادخل إلى حسابك'), findsOneWidget);
    });

    testWidgets('signed in, the trial balance and the partner proposals show', (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      SharedPreferences.setMockInitialValues(sessionPrefs());
      late BooksApi api;
      await tester.runAsync(() async {
        await accountController.load();
        final c = await controller((req) async {
          final r = req.url.queryParameters['r'] ?? 'trial';
          if (r == 'links') {
            return json(page({'kind': 'links', 'waiting_for_me': [link], 'reversals_for_me': [], 'waiting_for_them': [], 'decided': []}, r: 'links'));
          }
          return json(page(trial));
        });
        api = BooksApi(account: c);
      });
      Future<void> settle() async {
        for (var i = 0; i < 5; i++) {
          await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
          await tester.pump(const Duration(milliseconds: 100));
        }
      }

      await tester.pumpWidget(app(BooksScreen(api: api)));
      await settle();
      expect(find.text('دفتر مزرعتك'), findsOneWidget);
      expect(find.text('الميزان متوازن: المدين = الدائن'), findsOneWidget);
      expect(find.text('دفتر المستثمر'), findsOneWidget, reason: 'both books are offered when the reader has both');

      final tabs = find.descendant(
        of: find.byWidgetPredicate((w) => w is ListView && w.scrollDirection == Axis.horizontal),
        matching: find.byType(Scrollable),
      );
      await tester.scrollUntilVisible(find.text('اقتراحات الشريك (1)'), 200, scrollable: tabs.first);
      await tester.tap(find.text('اقتراحات الشريك (1)'));
      await settle();
      expect(find.text('أؤكّد أنّ هذا حدث'), findsOneWidget);
      expect(find.text('أعترض'), findsOneWidget);
    });
  });
}
