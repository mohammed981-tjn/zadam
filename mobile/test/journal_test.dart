/// القيد اليدويّ والمراجعة في التطبيق (البند ٢٠٥): the form's own reading of what was typed (as the website's), what the
/// routes return, what is sent, and the entry and review screens.
library;

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sudagri/account.dart';
import 'package:sudagri/journal.dart';
import 'package:sudagri/screens/books_review_screen.dart';
import 'package:sudagri/screens/journal_entry_screen.dart';
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

const accounts = [
  AccountOption(code: '1110', name: 'نقد في اليد', type: 'asset', systemKey: 'cash_on_hand', provider: 'cash'),
  AccountOption(code: '1120', name: 'حساب مصرفيّ', type: 'asset', systemKey: 'bank', provider: 'bank'),
  AccountOption(code: '1310', name: 'مدخلات', type: 'asset', systemKey: 'inventory_inputs'),
  AccountOption(code: '2110', name: 'موردون', type: 'liability', systemKey: 'payables_suppliers'),
  AccountOption(code: '4110', name: 'مبيعات محاصيل', type: 'revenue', systemKey: 'sales_crops'),
  AccountOption(code: '5110', name: 'بذور', type: 'expense', systemKey: 'cost_seeds'),
];

final context = <String, dynamic>{
  'today': '2026-11-06',
  'books': [
    {'id': 'b1', 'kind': 'farm', 'role': 'owner', 'label': 'دفتر المزرعة', 'closed_through': '2026-10-31', 'always_review': false},
    {'id': 'b2', 'kind': 'farm', 'role': 'preparer', 'label': 'دفتر المزرعة — أحمد', 'closed_through': null, 'always_review': true},
  ],
  'book_id': 'b1',
  'accounts': [
    for (final a in accounts)
      {'code': a.code, 'name': a.name, 'type': a.type, 'system_key': a.systemKey, 'currency': null, 'provider': a.provider},
  ],
  'templates': [
    {
      'key': 'pay_supplier',
      'group': 'daily',
      'name': 'سداد مورّد',
      'hint': 'دفعت لمورّدٍ ما كان عليك له.',
      'lines': [
        {'side': 'D', 'key': 'payables_suppliers'},
        {'side': 'C', 'key': 'cash_on_hand', 'choose': 'money'},
      ],
    },
    {
      'key': 'accrued_wages',
      'group': 'adjusting',
      'name': 'أجورٌ مستحقّة',
      'hint': 'عملٌ تمّ وأجره لم يُدفع.',
      'lines': [
        {'side': 'D', 'key': 'cost_labour', 'choose': 'expense'},
        {'side': 'C', 'key': 'accrued_wages'},
      ],
    },
  ],
};

final review = <String, dynamic>{
  'books': [
    {
      'id': 'b1',
      'label': 'دفتر المزرعة',
      'kind': 'farm',
      'always_review': false,
      'pending': [
        {
          'id': 'd1',
          'date': '2026-11-05',
          'memo': 'مبيدات أعدّها المحاسب',
          'status': 'pending',
          'status_label': 'ينتظر الاعتماد',
          'by': 'المحاسب',
          'has_document': true,
          'note': null,
          'lines': [
            {'account': '5130 — مبيدات', 'side': 'D', 'amount': '30.00 دولار'},
            {'account': '1110 — نقد في اليد', 'side': 'C', 'amount': '30.00 دولار'},
          ],
        },
      ],
      'preparers': [
        {'id': 'p1', 'name': 'المحاسب', 'role': 'accountant', 'status': 'active', 'status_label': 'يُعِدّ', 'open': true, 'standing': true},
      ],
    },
  ],
  'invitations': [
    {'id': 'i1', 'owner_name': 'سعاد', 'book_kind': 'farm'},
  ],
  'agents': [],
  'preparing': [],
  'prepared': [],
};

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('amounts as typed', () {
    test('plain, grouped and Arabic-Indic figures are read to cents', () {
      expect(parseMinor('250'), 25000);
      expect(parseMinor('1,234.5'), 123450);
      expect(parseMinor('١٬٢٣٤٫٥٠'), 123450);
      expect(parseMinor(' 7.05 '), 705);
    });
    test('what is not money is not guessed', () {
      expect(parseMinor('1.234'), isNull, reason: 'finer than a cent');
      expect(parseMinor('12,5'), isNull, reason: 'a comma is only a thousands separator');
      expect(parseMinor('-5'), isNull);
      expect(parseMinor('abc'), isNull);
      expect(parseMinor(''), isNull);
    });
    test('cents are written back grouped', () {
      expect(formatMinor(123450), '1,234.50');
      expect(formatMinor(5), '0.05');
      expect(formatMinor(-2500), '-25.00');
    });
  });

  group('the entry', () {
    test('a balanced entry passes; the website\'s refusals are refused here first', () {
      final ok = [JournalLine(account: '5110', side: 'D', amount: '25'), JournalLine(account: '1110', side: 'C', amount: '25.00')];
      expect(entryProblem(date: '2026-11-06', memo: 'بذور', lines: ok, accounts: accounts), isNull);
      expect(totalsOf(ok), (debit: 2500, credit: 2500));

      final unbalanced = [JournalLine(account: '5110', side: 'D', amount: '25'), JournalLine(account: '1110', side: 'C', amount: '24.99')];
      expect(entryProblem(date: '2026-11-06', memo: 'بذور', lines: unbalanced, accounts: accounts),
          'القيد غير متوازن: المدين 25.00 والدائن 24.99.');
      expect(entryProblem(date: '2026-11-06', memo: 'بذور', lines: [ok.first], accounts: accounts), 'القيد من سطرين إلى مئتي سطر.');
      expect(entryProblem(date: '2026-11-06', memo: ' ', lines: ok, accounts: accounts), 'اكتب بيان القيد (حتى ٥٠٠ حرف).');
      expect(entryProblem(date: '6/11', memo: 'بذور', lines: ok, accounts: accounts), 'اكتب تاريخ القيد.');
      expect(
          entryProblem(
              date: '2026-11-06',
              memo: 'بذور',
              lines: [JournalLine(account: '9999', side: 'D', amount: '1'), JournalLine(account: '1110', side: 'C', amount: '1')],
              accounts: accounts),
          'اختر حساباً يُقيَّد عليه في السطر 1.');
      expect(
          entryProblem(
              date: '2026-11-06',
              memo: 'بذور',
              lines: [JournalLine(account: '5110', side: 'D', amount: '0'), JournalLine(account: '1110', side: 'C', amount: '0')],
              accounts: accounts),
          'اكتب مبلغاً صحيحاً في السطر 1.');
    });

    test('a ready entry fills the lines from the book\'s own accounts, or not at all', () {
      final ctx = JournalContext.fromJson(context);
      final pay = ctx.templates.first;
      final filled = fillTemplate(pay, ctx.accounts, amount: '40')!;
      expect([for (final l in filled) '${l.side}${l.account}:${l.amount}'], ['D2110:40', 'C1110:40']);
      expect(fillTemplate(ctx.templates[1], ctx.accounts), isNull, reason: 'this book has no accrued-wages account');
      expect([for (final a in choicesFor(ctx.accounts, 'money')) a.code], ['1110', '1120']);
      expect([for (final a in choicesFor(ctx.accounts, 'expense_or_inventory')) a.code], ['1310', '5110']);
    });

    test('the route\'s answers are read', () {
      final ctx = JournalContext.fromJson(context);
      expect(ctx.book!.label, 'دفتر المزرعة');
      expect(ctx.book!.closedThrough, '2026-10-31');
      expect(ctx.books[1].preparer, isTrue);
      final r = ReviewView.fromJson(review);
      expect(r.waiting, 2, reason: 'one draft waiting and one invitation');
      expect(r.books.single.pending.single.lines.length, 2);
      expect(dayBefore('2026-11-01'), '2026-10-31');
      expect(newEntryKey().length, greaterThanOrEqualTo(8));
      expect(newEntryKey() == newEntryKey(), isFalse);
    });
  });

  group('the client', () {
    test('an entry goes to the website\'s route with its lines and its photo', () async {
      SharedPreferences.setMockInitialValues(sessionPrefs());
      late Map<String, dynamic> sent;
      final c = await controller((req) async {
        expect(req.url.path, '/api/app/books/journal');
        expect(req.headers['authorization'], 'Bearer a.b.c');
        sent = jsonDecode(req.body) as Map<String, dynamic>;
        return json({'ok': true, 'status': 'pending', 'message': 'حُفظ القيد وينتظر اعتماد صاحب الدفتر'});
      });
      final (status, message) = await JournalApi(account: c).submit({
        'book': 'b2',
        'key': 'app-123456789',
        'lines': [JournalLine(account: '5110', side: 'D', amount: '5').toJson()],
      }, attachment: {'photo': 'AAAA'});
      expect(status, 'pending');
      expect(message, contains('ينتظر'));
      expect(sent['photo'], 'AAAA');
      expect((sent['lines'] as List).first, {'account': '5110', 'side': 'D', 'amount': '5'});
    });

    test('an answer to a draft is the website\'s step', () async {
      SharedPreferences.setMockInitialValues(sessionPrefs());
      late Map<String, dynamic> sent;
      final c = await controller((req) async {
        expect(req.url.path, '/api/app/books/review');
        sent = jsonDecode(req.body) as Map<String, dynamic>;
        return json({'ok': true, 'message': 'رُدّ القيد إلى مُعِدّه بسببه.'});
      });
      final m = await JournalApi(account: c).reviewAction('reject', {'id': 'd1', 'note': 'لا يطابق الإيصال'});
      expect(m, 'رُدّ القيد إلى مُعِدّه بسببه.');
      expect(sent, {'action': 'reject', 'id': 'd1', 'note': 'لا يطابق الإيصال'});
    });

    test('a refusal arrives in the website\'s words', () async {
      SharedPreferences.setMockInitialValues(sessionPrefs());
      final c = await controller((req) async => json({'error': 'الفترة حتى 2026-10-31 مقفلة؛ لا قيد بتاريخٍ فيها'}, 400));
      expect(
        () => JournalApi(account: c).closeAction('lock', {'book': 'b1', 'through': '2026-10-01'}),
        throwsA(isA<Exception>().having((e) => '$e', 'message', contains('مقفلة'))),
      );
    });
  });

  group('screens', () {
    Future<void> settle(WidgetTester tester) async {
      for (var i = 0; i < 5; i++) {
        await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
        await tester.pump(const Duration(milliseconds: 100));
      }
    }

    testWidgets('signed out, the entry form asks to sign in', (tester) async {
      SharedPreferences.setMockInitialValues({});
      await accountController.load();
      await tester.pumpWidget(app(const JournalEntryScreen()));
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.text('ادخل إلى حسابك'), findsOneWidget);
    });

    testWidgets('an empty entry is held back, a ready entry fills the lines, and a balanced one is sent', (tester) async {
      tester.view.physicalSize = const Size(390, 1400);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      SharedPreferences.setMockInitialValues(sessionPrefs());
      final posts = <Map<String, dynamic>>[];
      late JournalApi api;
      await tester.runAsync(() async {
        await accountController.load();
        final c = await controller((req) async {
          if (req.method == 'POST') {
            posts.add(jsonDecode(req.body) as Map<String, dynamic>);
            return json({'ok': true, 'status': 'posted', 'message': 'رُحِّل القيد في دفترك.'});
          }
          return json(context);
        });
        api = JournalApi(account: c);
      });

      await tester.pumpWidget(app(JournalEntryScreen(api: api)));
      await settle(tester);
      expect(find.textContaining('مقفل حتى 2026-10-31'), findsOneWidget);
      expect(find.text('سداد مورّد'), findsOneWidget);
      final list = find.byType(Scrollable).first;

      // An empty hand entry is held back on the phone: nothing goes to the website.
      await tester.scrollUntilVisible(find.text('رحِّل القيد'), 200, scrollable: list);
      await tester.tap(find.text('رحِّل القيد'));
      await settle(tester);
      expect(find.text('اكتب بيان القيد (حتى ٥٠٠ حرف).'), findsOneWidget);
      expect(posts, isEmpty);
      await tester.scrollUntilVisible(find.text('سداد مورّد'), -200, scrollable: list);

      await tester.tap(find.text('سداد مورّد'));
      await settle(tester);
      expect(find.text('دفعت لمورّدٍ ما كان عليك له.'), findsOneWidget);
      expect(find.text('2110 — موردون'), findsOneWidget);
      await tester.enterText(find.widgetWithText(TextField, 'المبلغ'), '40');
      await settle(tester);
      expect(find.textContaining('متوازن'), findsOneWidget);
      await tester.scrollUntilVisible(find.text('رحِّل القيد'), 200, scrollable: list);
      await tester.tap(find.text('رحِّل القيد'));
      await settle(tester);
      expect(posts, hasLength(1));
      expect(posts.single['template'], 'pay_supplier');
      expect(posts.single['lines'], [
        {'account': '2110', 'side': 'D', 'amount': '40'},
        {'account': '1110', 'side': 'C', 'amount': '40'},
      ]);
      expect(find.text('رُحِّل القيد في دفترك.'), findsOneWidget);
    });

    testWidgets('the review shows what waits, and approving it is the website\'s step', (tester) async {
      tester.view.physicalSize = const Size(390, 1400);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      SharedPreferences.setMockInitialValues(sessionPrefs());
      final posts = <Map<String, dynamic>>[];
      late JournalApi api;
      await tester.runAsync(() async {
        await accountController.load();
        final c = await controller((req) async {
          if (req.method == 'POST') {
            posts.add(jsonDecode(req.body) as Map<String, dynamic>);
            return json({'ok': true, 'message': 'اعتُمد القيد ورُحِّل في دفترك.'});
          }
          return json(review);
        });
        api = JournalApi(account: c);
      });

      await tester.pumpWidget(app(BooksReviewScreen(api: api)));
      await settle(tester);
      expect(find.text('سعاد يدعوك لتُعِدّ قيود دفتره.'), findsOneWidget);
      expect(find.text('مبيدات أعدّها المحاسب'), findsOneWidget);
      expect(find.text('ينتظر اعتمادك (1)'), findsOneWidget);
      await tester.tap(find.text('أعتمده فيُرحَّل'));
      await settle(tester);
      expect(posts.single, {'action': 'approve', 'id': 'd1'});
      expect(find.text('اعتُمد القيد ورُحِّل في دفترك.'), findsOneWidget);
    });

    testWidgets('the hub leads to the five steps', (tester) async {
      await tester.pumpWidget(app(const JournalHubScreen()));
      await tester.pump();
      for (final t in ['قيدٌ جديد', 'المراجعة', 'الاستثناءات', 'سجلّ التدقيق', 'إقفال الفترة']) {
        expect(find.text(t), findsOneWidget);
      }
    });
  });
}
