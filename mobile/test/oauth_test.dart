/// الدخول بحساب Google في التطبيق (البند ١٧٣): السرّ يبقى في الجوّال وتخرج بصمته، والرابط العائد يُفتح به وحده.
library;

import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sudagri/account.dart';

http.Response json(Object body, [int status = 200]) => http.Response.bytes(
    utf8.encode(jsonEncode(body)), status,
    headers: {'content-type': 'application/json; charset=utf-8'});

String challengeOf(String verifier) =>
    base64Url.encode(sha256.convert(utf8.encode(verifier)).bytes).replaceAll('=', '');

void main() {
  test('the fingerprint is PKCE\'s own (RFC 7636, appendix B), the same the site computes', () {
    expect(challengeOf('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  test('the browser gets the fingerprint; the secret stays on the phone', () async {
    SharedPreferences.setMockInitialValues({});
    final c = AccountController(siteUrl: 'https://site.test', supabaseUrl: 'https://db.test', anonKey: 'anon',
        client: MockClient((_) async => json({})));
    final url = await c.providerSignInUrl('google', side: 'investor');
    final verifier = (await SharedPreferences.getInstance()).getString('sudagri.oauth.verifier')!;
    expect(url.path, '/api/app/oauth');
    expect(url.queryParameters['provider'], 'google');
    expect(url.queryParameters['side'], 'investor');
    expect(verifier.length, 43);
    expect(url.queryParameters['challenge'], challengeOf(verifier));
    expect(url.toString().contains(verifier), isFalse);
    final again = await c.providerSignInUrl('google');
    expect(again.queryParameters['challenge'], isNot(url.queryParameters['challenge']), reason: 'a new secret each time');
  });

  test('the link back is opened with the secret, and the session is kept', () async {
    SharedPreferences.setMockInitialValues({'sudagri.oauth.verifier': 'v' * 43});
    Map<String, dynamic>? sent;
    final c = AccountController(
      siteUrl: 'https://site.test', supabaseUrl: 'https://db.test', anonKey: 'anon',
      client: MockClient((req) async {
        expect(req.url.path, '/api/app/oauth/finish');
        sent = jsonDecode(req.body) as Map<String, dynamic>;
        return json({'access_token': 'a2', 'refresh_token': 'r2', 'expires_at': 1900000000});
      }),
    );
    await c.load();
    await c.handleLink(Uri.parse('sudagri://auth?h=SEALED'));
    expect(sent, {'handoff': 'SEALED', 'verifier': 'v' * 43});
    expect(c.value?.accessToken, 'a2');
    expect((await SharedPreferences.getInstance()).getString('sudagri.oauth.verifier'), isNull,
        reason: 'used once');
    expect(c.providerError.value, isNull);
  });

  test('another link is not this one\'s; a refusal is said, and no session is kept', () async {
    SharedPreferences.setMockInitialValues({'sudagri.oauth.verifier': 'v' * 43});
    var calls = 0;
    final c = AccountController(
      siteUrl: 'https://site.test', supabaseUrl: 'https://db.test', anonKey: 'anon',
      client: MockClient((_) async {
        calls++;
        return json({'error': 'انتهت مهلة الدخول.'}, 401);
      }),
    );
    await c.load();
    await c.handleLink(Uri.parse('https://evil.test/auth?h=x'));
    await c.handleLink(Uri.parse('sudagri://other?h=x'));
    expect(calls, 0);
    await c.handleLink(Uri.parse('sudagri://auth?h=SEALED'));
    expect(c.value, isNull);
    expect(c.providerError.value, 'انتهت مهلة الدخول.');
  });

  test('a link back with no secret on the phone asks to start again', () async {
    SharedPreferences.setMockInitialValues({});
    final c = AccountController(siteUrl: 'https://site.test', supabaseUrl: 'https://db.test', anonKey: 'anon',
        client: MockClient((_) async => fail('nothing is sent without the secret')));
    await c.load();
    await c.handleLink(Uri.parse('sudagri://auth?h=SEALED'));
    expect(c.value, isNull);
    expect(c.providerError.value, contains('مرّةً أخرى'));
  });
}
