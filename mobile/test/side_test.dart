/// «أرضي · استثماري» في التطبيق (البند ١٧٣): الجانب يُرسل إلى /api/app/side بجلسة صاحبه.
library;

import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sudagri/account.dart';
import 'package:sudagri/api.dart';

void main() {
  Future<AccountController> controller(Future<http.Response> Function(http.Request) handler) async {
    final expires = DateTime.now().toUtc().add(const Duration(hours: 1)).millisecondsSinceEpoch ~/ 1000;
    SharedPreferences.setMockInitialValues({
      'sudagri.session': jsonEncode({'access_token': 'a1', 'refresh_token': 'r1', 'expires_at': expires}),
    });
    final c = AccountController(siteUrl: 'https://site.test', supabaseUrl: 'https://db.test', anonKey: 'anon',
        client: MockClient(handler));
    await c.load();
    return c;
  }

  test('the side goes to the site with the token', () async {
    Map<String, dynamic>? sent;
    final c = await controller((req) async {
      expect(req.url.path, '/api/app/side');
      expect(req.headers['authorization'], 'Bearer a1');
      sent = jsonDecode(req.body) as Map<String, dynamic>;
      return http.Response('{"role":"investor"}', 200);
    });
    await c.switchSide('investor');
    expect(sent, {'side': 'investor'});
  });

  test('a refusal comes back in the site\'s words', () async {
    final c = await controller((_) async =>
        http.Response.bytes(utf8.encode('{"error":"تعذّر تغيير الجانب الآن."}'), 500));
    expect(() => c.switchSide('farmer'),
        throwsA(isA<ApiException>().having((e) => e.message, 'message', 'تعذّر تغيير الجانب الآن.')));
  });
}
