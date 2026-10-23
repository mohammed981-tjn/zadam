/// «حسابي» (backlog 138): the session, what /api/app/me returns, and the
/// controller's sign-in, refresh and sign-out against a stand-in server.
library;

import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sudagri/account.dart';
import 'package:sudagri/api.dart';

const site = 'https://site.test';
const supabase = 'https://db.test';

int inSeconds(Duration d) => DateTime.now().toUtc().add(d).millisecondsSinceEpoch ~/ 1000;

Map<String, dynamic> sessionJson({String access = 'a1', String refresh = 'r1', Duration ttl = const Duration(hours: 1)}) =>
    {'access_token': access, 'refresh_token': refresh, 'expires_at': inSeconds(ttl)};

http.Response json(Object body, [int status = 200]) => http.Response.bytes(
    utf8.encode(jsonEncode(body)), status,
    headers: {'content-type': 'application/json; charset=utf-8'});

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('a session reads either reply and knows when it is stale', () {
    final fromSite = Session.fromJson(sessionJson());
    expect(fromSite.isStale, isFalse);
    expect(Session.fromJson(fromSite.toJson()).refreshToken, 'r1');

    // The auth server may send expires_in without expires_at.
    final fromAuth = Session.fromJson({'access_token': 'a', 'refresh_token': 'r', 'expires_in': 30});
    expect(fromAuth.isStale, isTrue, reason: 'within the minute of margin');
  });

  test("/api/app/me parses, the administrator's review list included", () {
    final a = Account.fromJson({
      'name': 'محمد',
      'role': 'admin',
      'unread': 2,
      'notifications': [
        {'id': 'n1', 'title': 'أرضٌ تنتظر', 'body': '', 'link': '/admin/lands', 'read': false, 'at': '2026-10-22T10:00:00Z'},
      ],
      'lands': [
        {'id': 'l1', 'name': 'الجموعية', 'state': 'الخرطوم', 'feddans': 20, 'verification': 'verified', 'open_to_investors': false},
      ],
      'review': {
        'total': 3,
        'sections': [
          {'key': 'lands', 'title': 'أراضٍ تنتظر التوثيق', 'what': 'راجع', 'href': '/admin/lands', 'count': 3,
           'items': [{'title': 'أرض', 'meta': 'الجزيرة'}]},
        ],
      },
    });
    expect(a.isAdmin, isTrue);
    expect(roleLabel(a.role), 'مدير');
    expect(a.notifications.single.read, isFalse);
    expect(a.lands.single.statusLabel, 'محقّقة');
    expect(a.reviewTotal, 3);
    expect(a.review.single.items.single.meta, 'الجزيرة');

    final farmer = Account.fromJson({'name': 'أحمد', 'role': 'farmer', 'review': null});
    expect(farmer.isAdmin, isFalse);
    expect(farmer.reviewTotal, isNull);
    expect(roleLabel('farmer'), 'مزارع وصاحب أرض');
  });

  test("the website's country codes, Sudan first", () {
    expect(dialCodes.first.$1, '249');
    expect(dialCodes.map((c) => c.$1).toSet().length, dialCodes.length);
  });

  test('sign in keeps the session; a refusal shows the server\'s words', () async {
    final sent = <Map<String, dynamic>>[];
    final c = AccountController(
      siteUrl: site, supabaseUrl: supabase, anonKey: 'anon',
      client: MockClient((req) async {
        final body = jsonDecode(req.body) as Map<String, dynamic>;
        sent.add(body);
        return body['password'] == 'secret'
            ? json(sessionJson())
            : json({'error': 'رقم الجوال أو كلمة المرور غير صحيحة.'}, 401);
      }),
    );
    await c.load();
    expect(c.value, isNull);

    await expectLater(
      c.signIn(method: 'phone', dialCode: '249', phone: '0912345678', password: 'wrong'),
      throwsA(isA<ApiException>().having((e) => e.message, 'message', contains('غير صحيحة'))),
    );
    expect(c.value, isNull);

    await c.signIn(method: 'phone', dialCode: '249', phone: '0912345678', password: 'secret');
    expect(c.value?.accessToken, 'a1');
    expect(sent.last['dial_code'], '249');

    // Kept on the phone: a new controller finds it.
    final again = AccountController(siteUrl: site, supabaseUrl: supabase, anonKey: 'anon',
        client: MockClient((_) async => json({})));
    await again.load();
    expect(again.value?.refreshToken, 'r1');
  });

  test('a stale session is refreshed; a refused refresh signs the phone out', () async {
    var refreshOk = true;
    final c = AccountController(
      siteUrl: site, supabaseUrl: supabase, anonKey: 'anon',
      client: MockClient((req) async {
        if (req.url.path == '/api/app/signin') return json(sessionJson(ttl: const Duration(seconds: 10)));
        if (req.url.path == '/auth/v1/token') {
          expect(req.url.queryParameters['grant_type'], 'refresh_token');
          expect(req.headers['apikey'], 'anon');
          return refreshOk
              ? json(sessionJson(access: 'a2', refresh: 'r2'))
              : json({'error': 'invalid_grant'}, 400);
        }
        if (req.url.path == '/api/app/me') {
          expect(req.headers['authorization'], 'Bearer a2');
          return json({'name': 'محمد', 'role': 'farmer'});
        }
        return json({}, 404);
      }),
    );
    await c.load();
    await c.signIn(method: 'email', email: 'a@b.c', password: 'x');
    expect(c.value!.isStale, isTrue);

    final me = await c.me();
    expect(me.name, 'محمد');
    expect(c.value?.accessToken, 'a2');

    // Signed out elsewhere: the next refresh is refused.
    await c.signIn(method: 'email', email: 'a@b.c', password: 'x');
    refreshOk = false;
    await expectLater(c.me(), throwsA(isA<ApiException>()));
    expect(c.value, isNull);
  });

  test('sign out tells the server and forgets the session', () async {
    final paths = <String>[];
    final c = AccountController(
      siteUrl: site, supabaseUrl: supabase, anonKey: 'anon',
      client: MockClient((req) async {
        paths.add(req.url.path);
        return req.url.path == '/api/app/signin' ? json(sessionJson()) : json({});
      }),
    );
    await c.load();
    await c.signIn(method: 'phone', phone: '0912345678', password: 'secret');
    await c.signOut();
    expect(paths, contains('/auth/v1/logout'));
    expect(c.value, isNull);
    expect((await SharedPreferences.getInstance()).getString('sudagri.session'), isNull);
  });
}
