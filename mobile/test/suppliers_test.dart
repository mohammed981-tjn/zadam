/// الموردون في التطبيق (البند ٢٠٣): the directory filtered as the website filters it, an order's sums, the steps sent
/// to the right routes as the signed-in person, a refusal in the database's words, and the screen itself.
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
import 'package:sudagri/screens/suppliers_deliveries_screen.dart';
import 'package:sudagri/screens/suppliers_mine_screen.dart';
import 'package:sudagri/screens/suppliers_orders_screen.dart';
import 'package:sudagri/screens/suppliers_screen.dart';
import 'package:sudagri/suppliers.dart';
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

Map<String, dynamic> supplier(String id, String name, String state, {List<String> delivers = const []}) => {
      'id': id, 'name': name, 'state': state, 'locality': 'السوق', 'phone': '0912345678',
      'delivery_states': delivers, 'categories': ['fertilizer'], 'verified_at': '2026-10-01T00:00:00Z', 'active': true,
    };

Map<String, dynamic> product(String id, String supplierId, String category, {String? key, String until = '2099-01-01'}) => {
      'id': id, 'supplier_id': supplierId, 'category': category, 'input_key': key, 'name': 'منتج $id',
      'pack_size': 50, 'pack_unit': 'kg', 'price_usd': 32.5, 'valid_until': until, 'active': true,
    };

final directoryJson = {
  'suppliers': [
    supplier('s1', 'متجر النيل', 'الجزيرة', delivers: ['سنار']),
    supplier('s2', 'مخازن القضارف', 'القضارف'),
  ],
  'products': [
    product('p1', 's1', 'fertilizer', key: 'urea'),
    product('p2', 's2', 'seed'),
  ],
  'rate': 600,
  'rate_note': 'الجنيه بسعر بيع بنك الخرطوم للدولار: 600 جنيه، في 6 نوفمبر 2026.',
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
  test('the directory filters by need and by state as the website does', () {
    final d = SupplierDirectory.fromJson(directoryJson);
    expect(d.shown().length, 2);
    expect(d.shown(item: 'urea').single.$1.name, 'متجر النيل');
    expect(d.shown(item: 'seed').single.$1.name, 'مخازن القضارف', reason: 'seed matches the seed category too');
    expect(d.shown(item: 'pesticide'), isEmpty);
    expect(d.shown(state: 'سنار').single.$1.id, 's1', reason: 'a supplier who delivers to the state is shown there');
    expect(d.shown(state: 'كسلا'), isEmpty);
    expect(d.rate, 600);
  });

  test("a product's pack, its load in kilos, and an offer past its date", () {
    final p = Product.fromJson(product('p1', 's1', 'fertilizer', until: '2020-01-01'));
    expect(p.packLabel, '50 كجم');
    expect(p.unitKg, 50);
    expect(p.expired, isTrue);
    expect(Product.fromJson({...product('p', 's', 'other'), 'pack_unit': 'ml', 'pack_size': 500}).unitKg, 0.5);
    expect(Product.fromJson({...product('p', 's', 'other'), 'pack_unit': 'unit'}).unitKg, isNull);
  });

  test("an order: the reader's pledges, their deposit, and whether joining is open", () {
    final v = OrderView.fromJson({
      'order': {
        'id': 'o1', 'title': 'يوريا القسم', 'status': 'open', 'deadline': '2099-01-01', 'drop_day': '2099-01-10',
        'target_tonnes': 30, 'pledged_tonnes': 12, 'members': 4, 'deposit_pct': 10, 'my_role': 'organiser',
      },
      'lines': [
        {'id': 'l1', 'name': 'يوريا', 'unit_label': 'جوال ٥٠ كجم', 'unit_price_usd': 30},
        {'id': 'l2', 'name': 'داب', 'unit_label': 'جوال', 'unit_price_usd': 40},
      ],
      'totals': {'l1': 20},
      'pledges': [
        {'id': 'x1', 'line_id': 'l1', 'user_id': 'me', 'display_name': 'أحمد', 'quantity': 10, 'status': 'pledged'},
        {'id': 'x2', 'line_id': 'l2', 'user_id': 'me', 'display_name': 'أحمد', 'quantity': 5, 'status': 'withdrawn'},
        {'id': 'x3', 'line_id': 'l2', 'user_id': 'other', 'display_name': 'علي', 'quantity': 3, 'status': 'pledged'},
      ],
      'me': 'me',
      'deliveries': [
        {'id': 'd1', 'order_id': 'o1', 'pledge_id': 'x3', 'kind': 'to_farm', 'destination': 'الحواشة', 'status': 'cancelled'},
        {'id': 'd2', 'order_id': 'o1', 'pledge_id': 'x3', 'kind': 'to_farm', 'destination': 'الحواشة', 'status': 'assigned'},
      ],
    });
    expect(v.mine.length, 2);
    expect(v.myValue, 300, reason: 'a withdrawn pledge is out of the load');
    expect(v.myDeposit, 30);
    expect(v.open, isTrue);
    expect(v.isOrganiser, isTrue);
    expect(v.deliveryFor('x3')?.id, 'd2', reason: 'a cancelled delivery is not the pledge’s delivery');
    expect(v.order.fill, closeTo(0.4, 1e-9));
    expect(v.totals['l1'], 20);
  });

  test('the directory is read without a session, as a visitor reads the page', () async {
    final api = SuppliersApi(
      client: MockClient((req) async {
        expect(req.url.path, '/api/app/suppliers');
        expect(req.headers['authorization'], isNull);
        return json(directoryJson);
      }),
      siteUrl: site,
    );
    final d = await api.directory();
    expect(d.suppliers.first.verified, isTrue);
  });

  test('each step goes to its route, as the signed-in person, with its action', () async {
    final seen = <String>[];
    final c = await signedIn((req) async {
      expect(req.headers['authorization'], 'Bearer a1');
      final body = req.body.isEmpty ? <String, dynamic>{} : jsonDecode(req.body) as Map<String, dynamic>;
      seen.add('${req.method} ${req.url.path} ${body['action'] ?? ''}'.trim());
      if (req.url.path == '/api/app/suppliers/orders' && req.method == 'POST') {
        expect(body['line_name'], ['يوريا']);
        return json({'ok': true, 'message': 'فُتح الطلب.', 'id': 'o9'});
      }
      if (req.url.path == '/api/app/suppliers/deliveries' && body['action'] == 'issue_code') {
        return json({'ok': true, 'message': '', 'code': '123456'});
      }
      if (req.url.path == '/api/app/suppliers/deliveries' && body['action'] == 'confirm') {
        expect(body['photo'], base64Encode([1, 2, 3]));
        expect(body['code'], '654321');
        return json({'ok': true, 'message': 'تأكّد التسليم بالرمز.'});
      }
      return json({'ok': true, 'message': 'تمّ.'});
    });
    final api = SuppliersApi(account: c, siteUrl: site);

    final opened = await api.createOrder({'supplier_id': 's1', 'line_name': ['يوريا']});
    expect(opened.id, 'o9');
    await api.orderStep('o9', 'pledge', {'line_id': 'l1', 'quantity': '10'});
    expect((await api.deliveryStep('issue_code', {'delivery_id': 'd1'})).code, '123456');
    await api.deliveryStep('confirm', {'delivery_id': 'd1', 'code': '654321', 'lat': 14.4, 'lng': 33.5, 'photo': base64Encode([1, 2, 3])});
    await api.deliveryStep('cancel', {'delivery_id': 'd2'});
    await api.mineStep('product', {'name': 'يوريا'});
    expect(seen, [
      'POST /api/app/suppliers/orders',
      'POST /api/app/suppliers/orders/o9 pledge',
      'POST /api/app/suppliers/deliveries issue_code',
      'POST /api/app/suppliers/deliveries confirm',
      'POST /api/app/suppliers/deliveries cancel',
      'POST /api/app/suppliers/mine product',
    ]);
  });

  test("the database's refusal reaches the person in its own words", () async {
    final c = await signedIn((_) async => json({'error': 'الرمز غير مطابق. اطلبه من المستلم مرّةً أخرى.'}, 400));
    final api = SuppliersApi(account: c, siteUrl: site);
    expect(
      () => api.deliveryStep('confirm', {'delivery_id': 'd1'}),
      throwsA(isA<ApiException>().having((e) => e.message, 'message', contains('غير مطابق'))),
    );
  });

  testWidgets('the screen lists the verified suppliers, and the signed-in tabs ask a visitor to sign in', (tester) async {
    tester.view.physicalSize = const Size(390, 1400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    SharedPreferences.setMockInitialValues({});
    await accountController.load();

    final api = SuppliersApi(client: MockClient((_) async => json(directoryJson)), siteUrl: site);
    await tester.pumpWidget(app(SuppliersScreen(api: api)));
    await tester.pumpAndSettle();

    expect(find.text('متجر النيل'), findsOneWidget);
    expect(find.text('موثّق'), findsWidgets);
    expect(find.text('\$32.5'), findsWidgets);
    expect(find.textContaining('600 جنيه'), findsWidgets);

    await tester.tap(find.widgetWithText(Tab, 'الطلبات الجماعية'));
    await tester.pumpAndSettle();
    expect(find.text('ادخل إلى حسابك'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('deliveries: each party sees its own step — the code, the handover, the payment and the cancellation', (tester) async {
    tester.view.physicalSize = const Size(390, 2600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    Map<String, dynamic> d(String id, String status, String kind) =>
        {'id': id, 'order_id': 'o1', 'kind': kind, 'destination': 'الحواشة ١٢', 'status': status};
    final c = await signedIn((req) async => json({
          'carrier': {'id': 'k1', 'name': 'ترحيلات النور', 'phone': '0912', 'vehicle': 'دفّار', 'capacity_tonnes': 7, 'states': ['الجزيرة'], 'verified_at': '2026-10-01'},
          'to_me': [d('d1', 'assigned', 'to_farm')],
          'to_carry': [d('d2', 'assigned', 'to_farm')],
          'assigned': [d('d3', 'assigned', 'to_pickup'), d('d4', 'confirmed', 'to_farm')],
        }));
    await accountController.load();

    await tester.pumpWidget(app(Scaffold(body: DeliveriesTab(api: SuppliersApi(account: c, siteUrl: site)))));
    await tester.pumpAndSettle();

    expect(find.text('أصدر رمز الاستلام'), findsOneWidget);
    expect(find.text('أكّد التسليم'), findsOneWidget);
    expect(find.text('ألغِ هذا التوصيل'), findsOneWidget);
    expect(find.text('دفعتُ للناقل'), findsOneWidget);
    expect(find.textContaining('موثّق منذ'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets("an order's page: pledging, the deposit to pay, and the organiser's panel", (tester) async {
    tester.view.physicalSize = const Size(360, 3200);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final c = await signedIn((req) async => json({
          'order': {
            'id': 'o1', 'title': 'يوريا قسم الحصاحيصا — موسم الشتاء', 'supplier_name': 'متجر النيل', 'status': 'open',
            'deadline': '2099-01-01', 'drop_day': '2099-01-10', 'target_tonnes': 30, 'pledged_tonnes': 12, 'members': 4,
            'deposit_pct': 10, 'my_role': 'organiser', 'pickup_name': 'مكتب القسم', 'pickup_locality': 'الحصاحيصا',
            'pickup_state': 'الجزيرة', 'payee': 'cooperative', 'payee_account': 'بنكك 123456 — الجمعية', 'organiser_phone': '0912345678',
          },
          'lines': [{'id': 'l1', 'name': 'يوريا', 'unit_label': 'جوال ٥٠ كجم', 'unit_price_usd': 30}],
          'totals': {'l1': 10},
          'pledges': [
            {'id': 'x1', 'line_id': 'l1', 'user_id': 'me', 'display_name': 'أحمد', 'quantity': 10, 'status': 'pledged', 'phone': '0911111111'},
            {'id': 'x2', 'line_id': 'l1', 'user_id': 'u2', 'display_name': 'علي عبد الرحمن', 'quantity': 4, 'status': 'defaulted'},
          ],
          'me': 'me',
          'carriers': [{'id': 'k1', 'name': 'ترحيلات النور', 'vehicle': 'دفّار', 'capacity_tonnes': 7}],
          'deliveries': [],
          'rate': 600,
        }));
    await accountController.load();

    await tester.pumpWidget(app(OrderScreen(id: 'o1', api: SuppliersApi(account: c, siteUrl: site))));
    await tester.pumpAndSettle();

    expect(find.text('عدّل'), findsOneWidget, reason: 'the reader already pledged on this line');
    expect(find.text('مقدّمك وكيف تدفعه'), findsOneWidget);
    expect(find.textContaining('10٪ = \$30'), findsOneWidget);
    expect(find.text('لوحة المنظّم'), findsOneWidget);
    expect(find.text('استُلم المقدّم'), findsOneWidget);
    expect(find.text('أعده متعهّداً'), findsOneWidget);
    expect(find.text('أغلق الانضمام'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets("«صفحتي كمورد»: the status, the document, the products and the pause", (tester) async {
    tester.view.physicalSize = const Size(360, 2600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final c = await signedIn((req) async => json({
          'supplier': {...supplier('s1', 'متجر النيل للأسمدة والمبيدات', 'الجزيرة'), 'verified_at': null, 'has_document': true, 'review_note': 'الصورة غير واضحة'},
          'products': [product('p1', 's1', 'pesticide', until: '2020-01-01'), product('p2', 's1', 'fertilizer')],
          'rate': 600,
        }));
    await accountController.load();

    await tester.pumpWidget(app(Scaffold(body: MineTab(api: SuppliersApi(account: c, siteUrl: site)))));
    await tester.pumpAndSettle();

    expect(find.text('بانتظار التوثيق'), findsOneWidget);
    expect(find.text('وصلت مستنداتك، ويراجعها المشرف.'), findsOneWidget);
    expect(find.textContaining('الصورة غير واضحة'), findsOneWidget);
    expect(find.textContaining('انتهى العرض'), findsOneWidget);
    expect(find.text('أوقف عرضه'), findsNWidgets(2));
    expect(find.text('أوقف ظهوري مؤقّتاً'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
