/// القوائم الماليّة في التطبيق (البند ٢٠٥): ما يرسله /api/app/books/statements (الملفّ test/fixtures/statements_route.json
/// هو ردّ المسار نفسه، تكتبه وتفحصه scripts/verify-ledger-bundle.ts)، والعنوان الذي يرسله التطبيق، وكتابة الأرقام كما
/// يكتبها الموقع، وتنزيل الحزمة PDF بجلسة التطبيق، والشاشة بلا جلسةٍ وبها، وألوانها من theme.dart وحده.
library;

import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sudagri/account.dart';
import 'package:sudagri/api.dart';
import 'package:sudagri/screens/statements_screen.dart';
import 'package:sudagri/statements.dart';
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

final fixture = jsonDecode(File('test/fixtures/statements_route.json').readAsStringSync()) as Map<String, dynamic>;
final pdfBytes = [...utf8.encode('%PDF-1.7\n'), ...List<int>.filled(64, 32)];

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('figures as the website writes them', () {
    test('cents to dollars, grouped, two decimals', () {
      expect(usd(123450), '1,234.50');
      expect(usd(-500), '-5.00');
      expect(usd(7), '0.07');
      expect(usd(100000000), '1,000,000.00');
    });
    test('a change is signed, a missing one is a dash', () {
      expect(signed(7000), '+70.00');
      expect(signed(-5000), '-50.00');
      expect(signed(0), '0.00');
      expect(signed(null), '—');
    });
    test('a percentage to one decimal', () {
      expect(percent(17.5), '+17.5%');
      expect(percent(-150), '-150.0%');
      expect(percent(null), '—');
      expect(percent(58, sign: false), '58.0%');
    });
  });

  group('the query the app sends is the page\'s own', () {
    test('defaults send nothing', () => expect(const StatementsQuery().query, ''));
    test('a year, a month, a season, no comparison', () {
      expect(const StatementsQuery(year: 2025).query, '?y=2025');
      expect(const StatementsQuery(basis: 'month', month: '2026-10').query, '?basis=month&m=2026-10');
      expect(
        const StatementsQuery(basis: 'season', season: '5b000000-0000-0000-0000-00000000005b', compare: false, book: 'farm').query,
        '?book=farm&basis=season&s=5b000000-0000-0000-0000-00000000005b&compare=0',
        reason: 'the same string statementsQuery writes on the website (verify-ledger-bundle.ts)',
      );
      expect(const StatementsQuery(basis: 'month', month: '2026-10').path, '/api/app/books/statements?basis=month&m=2026-10');
    });
    test('changing the basis keeps the book', () {
      const q = StatementsQuery(book: 'investor');
      expect(q.copyWith(basis: 'month', month: '2026-09').query, '?book=investor&basis=month&m=2026-09');
    });
  });

  group('what the route sends', () {
    final v = StatementsView.fromJson(fixture);
    test('the period and the one compared with', () {
      expect(v.basis, 'year');
      expect(v.period, contains('2026-01-01'));
      expect(v.previousPeriod, contains('2025-01-01'));
      expect(v.hasPrevious, isTrue);
      expect(v.ownerName, 'المزارع');
      expect(v.seasons.single.name, 'ذرة ٢٠٢٦');
    });
    test('the income statement in two columns', () {
      expect(v.netIncome.current, 47000);
      expect(v.netIncome.previous, 40000);
      expect(v.netIncome.change, 7000);
      expect(v.netIncome.pct, 17.5);
      expect(v.revenue.single.code, '4110');
    });
    test('the balance sheet balances, and its computed lines are marked', () {
      expect(v.balanced, isTrue);
      expect(v.totalAssets.current, v.totalLiabilities.current + v.totalEquity.current);
      expect(v.equity.where((l) => l.computed).map((l) => l.code), containsAll(['3990', '3991']));
    });
    test('cash ties and equity closes to the balance sheet', () {
      expect(v.cashTies, isTrue);
      expect(v.cashOpening.current + v.cashSections.fold<int>(0, (n, s) => n + s.$3.current), v.cashClosing.current);
      expect(v.equityCloses, isTrue);
      expect(v.equityRows.last.$3, v.totalEquity.current);
    });
    test('ageing by bucket, the advance shown only where there is one', () {
      expect(v.receivable.total, 44000);
      expect(v.receivable.buckets['90_plus'], 32000);
      expect(v.receivable.keys, ['0_30', '31_60', '61_90', '90_plus']);
      expect(v.payable.keys, contains('advance'));
      expect(v.payable.total, 5500);
    });
    test('budget against actual, with the stage names', () {
      final s = v.budget.single;
      expect(s.stages.map((x) => x.name), ['تحضير الأرض', 'الزراعة', 'بلا مرحلة']);
      expect(s.variance, 21000);
      expect(s.usedPct, 58);
    });
    test('notes, the fingerprint, and where the PDF is', () {
      expect(v.notes, hasLength(5));
      expect(v.notes.first.$1, 'أساس الإعداد');
      expect(v.fingerprint, matches(RegExp(r'^[0-9a-f]{64}$')));
      expect(v.fingerprintGroups.split(' '), hasLength(8));
      expect(v.pdfPath, '/api/app/books/statements/pdf');
    });
  });

  group('the PDF with the app\'s session', () {
    test('fetched with the bearer token, named and fingerprinted', () async {
      SharedPreferences.setMockInitialValues(sessionPrefs());
      late http.Request seen;
      final c = await controller((req) async {
        seen = req;
        return http.Response.bytes(pdfBytes, 200, headers: {
          'content-type': 'application/pdf',
          'content-disposition': 'attachment; filename="sudagri-statements-2026-01-01-2026-10-31.pdf"',
          'x-statements-fingerprint': 'ab' * 32,
        });
      });
      final pdf = await StatementsApi(account: c).pdf('/api/app/books/statements/pdf?y=2026');
      expect(seen.url.toString(), '$site/api/app/books/statements/pdf?y=2026');
      expect(seen.headers['authorization'], 'Bearer a.b.c');
      expect(pdf.fileName, 'sudagri-statements-2026-01-01-2026-10-31.pdf');
      expect(pdf.fingerprint, 'ab' * 32);
      expect(pdf.looksLikePdf, isTrue);
    });
    test('something that is not a PDF is refused, and the route\'s own refusal is shown', () async {
      SharedPreferences.setMockInitialValues(sessionPrefs());
      final html = await controller((req) async => http.Response('<html></html>', 200));
      await expectLater(StatementsApi(account: html).pdf('/x'), throwsA(isA<ApiException>()));
      final refused = await controller((req) async => json({'error': 'لا دفتر مفتوحاً لك هنا.'}, 404));
      await expectLater(
        StatementsApi(account: refused).pdf('/x'),
        throwsA(isA<ApiException>().having((e) => e.message, 'message', 'لا دفتر مفتوحاً لك هنا.')),
      );
    });
  });

  group('the screen', () {
    testWidgets('signed out, the statements ask to sign in', (tester) async {
      SharedPreferences.setMockInitialValues({});
      await accountController.load();
      await tester.pumpWidget(app(const StatementsScreen()));
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.text('ادخل إلى حسابك'), findsOneWidget);
    });

    testWidgets('signed in: the statements show, and «حمّل PDF» saves the bundle', (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      SharedPreferences.setMockInitialValues(sessionPrefs());
      final asked = <String>[];
      late StatementsApi api;
      await tester.runAsync(() async {
        await accountController.load();
        final c = await controller((req) async {
          asked.add(req.url.toString());
          if (req.url.path.endsWith('/pdf')) {
            return http.Response.bytes(pdfBytes, 200, headers: {
              'content-type': 'application/pdf',
              'content-disposition': 'attachment; filename="sudagri-statements.pdf"',
            });
          }
          return json(fixture);
        });
        api = StatementsApi(account: c);
      });
      StatementsPdf? saved;
      Future<void> settle() async {
        for (var i = 0; i < 5; i++) {
          await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
          await tester.pump(const Duration(milliseconds: 100));
        }
      }

      await tester.pumpWidget(app(StatementsScreen(
        api: api,
        save: (pdf) async {
          saved = pdf;
          return Uri.parse('content://saved/sudagri-statements.pdf');
        },
      )));
      await settle();
      expect(find.text('دفتر مزرعتك'), findsOneWidget);
      expect(find.text('قائمة الدخل'), findsOneWidget);
      expect(find.textContaining('صافي الدخل'), findsWidgets);
      expect(find.text('470.00'), findsWidgets, reason: 'the net income, this period');
      expect(find.text('400.00'), findsWidgets, reason: 'and the previous');

      await tester.tap(find.text('حمّل PDF'));
      await settle();
      expect(asked.last, '$site/api/app/books/statements/pdf');
      expect(saved?.looksLikePdf, isTrue);
      expect(find.textContaining('حُفظت الحزمة'), findsOneWidget);

      final list = find.byType(Scrollable).first;
      await tester.scrollUntilVisible(find.text('متوازنة: الأصول = الالتزامات + الملكيّة'), 300, scrollable: list);
      await tester.scrollUntilVisible(find.text('لك على غيرك: 440.00'), 300, scrollable: list);
      await tester.scrollUntilVisible(find.textContaining('الميزانيّة مقابل الفعليّ'), 300, scrollable: list);
      await tester.scrollUntilVisible(find.text('بصمة الأرقام'), 300, scrollable: list);
      expect(find.textContaining('SHA-256'), findsOneWidget);
    });
  });

  test('the screen takes its colours from theme.dart only: no red, no orange', () {
    final src = File('lib/screens/statements_screen.dart').readAsStringSync();
    expect(RegExp(r'Colors\.(red|orange|deepOrange|redAccent|orangeAccent)').hasMatch(src), isFalse);
    expect(RegExp(r'Color\(0x').hasMatch(src), isFalse, reason: 'no colour written by hand: theme.dart has them');
  });
}
