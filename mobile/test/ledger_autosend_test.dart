/// القيد بلا شبكة لا يتكرّر، ويُرسَل وحده حين تعود الشبكة (البند ٢٠٣، متابعة): the idempotency key an entry is given
/// when it is typed and carries on every attempt (20261106060000_ledger_client_key.sql), the one-send-at-a-time lock,
/// and the automatic sender — on resume and on a light retry with backoff, never twice at once, stopping on a refusal.
library;

import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sudagri/account.dart';
import 'package:sudagri/ledger_autosend.dart';
import 'package:sudagri/seasons.dart';

const site = 'https://site.test';
const offlineMessage = 'تعذّر الاتصال. تحقّق من الشبكة وأعد المحاولة.';
final uuid4 = RegExp(r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$');

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

/// Lets the microtasks and the stand-in server's futures run.
Future<void> settle() => Future<void>.delayed(const Duration(milliseconds: 30));

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('the key', () {
    test('a version-4 UUID, different each time, from the given source in tests', () {
      expect(newClientKey(), matches(uuid4));
      expect(newClientKey() == newClientKey(), isFalse);
      expect(newClientKey(Random(7)), newClientKey(Random(7)));
      expect(newClientKey(Random(7)), matches(uuid4));
    });

    test('a form without one is given one; a form with one keeps it', () {
      final keyed = withClientKey({'amount': '5'}, Random(1));
      expect(keyed[clientKeyField], matches(uuid4));
      expect(withClientKey(keyed, Random(2)), same(keyed));
      expect(withClientKey({clientKeyField: ''}, Random(3))[clientKeyField], matches(uuid4), reason: 'an empty key is no key');
    });

    test('kept with a key; a form that already went keeps the key it went with', () async {
      final box = LedgerOutbox();
      await box.keep(key: 'ledger:s1', userId: 'u1', fields: {'amount': '1'});
      expect((await box.pending('u1')).single.fields[clientKeyField], matches(uuid4));
      SharedPreferences.setMockInitialValues({});
      await box.keep(key: 'ledger:s1', userId: 'u1', fields: {'amount': '1', clientKeyField: 'c1000000-0000-4000-8000-0000000000c1'});
      expect((await box.pending('u1')).single.fields[clientKeyField], 'c1000000-0000-4000-8000-0000000000c1');
    });

    test('two taps on «send» get two keys and are still one double tap', () async {
      final box = LedgerOutbox();
      expect(await box.keep(key: 'ledger:s1', userId: 'u1', fields: {'amount': '1', clientKeyField: 'k-a'}), KeepResult.kept);
      expect(await box.keep(key: 'ledger:s1', userId: 'u1', fields: {'amount': '1', clientKeyField: 'k-b'}), KeepResult.duplicate);
      expect(await box.keep(key: 'ledger:s1', userId: 'u1', fields: {'amount': '1'}), KeepResult.duplicate);
    });

    test('the answer lost on the way back: every attempt carries the key the first one carried', () async {
      SharedPreferences.setMockInitialValues(sessionPrefs('u1'));
      final keys = <String?>[];
      var answer = false;
      final c = await controller((req) async {
        keys.add((jsonDecode(req.body) as Map<String, dynamic>)[clientKeyField] as String?);
        // The server saved it, but the answer never reaches the phone.
        if (!answer) throw Exception('connection reset');
        return json({'ok': true, 'already': true, 'message': 'سُجّل القيد في دفتر الموسم.'});
      });
      final api = SeasonsApi(account: c);
      expect(await api.addOrKeep('s1', {'category': 'seeds', 'amount': '10'}), KeepResult.kept);
      expect(keys.single, matches(uuid4), reason: 'the first attempt already has its key');
      expect((await api.outbox.pending('u1')).single.fields[clientKeyField], keys.single, reason: 'kept with that key');

      expect((await api.sendPending()).sent, 0, reason: 'still no answer: it goes back to wait');
      answer = true;
      final r = await api.sendPending();
      expect(r.sent, 1);
      expect(r.waiting, 0);
      expect(keys.toSet().length, 1, reason: 'three attempts, one key: the server saves it once');
    });

    test('an entry kept before keys existed still goes, as before, without one', () async {
      SharedPreferences.setMockInitialValues({
        ...sessionPrefs('u1'),
        LedgerOutbox.storageKey: jsonEncode([
          {
            'id': 'old', 'key': 'ledger:s1', 'label': 'قيد', 'userId': 'u1',
            'createdAt': DateTime.now().millisecondsSinceEpoch, 'fields': {'category': 'seeds', 'amount': '5'},
          },
        ]),
      });
      final bodies = <Map<String, dynamic>>[];
      final c = await controller((req) async {
        bodies.add(jsonDecode(req.body) as Map<String, dynamic>);
        return json({'ok': true});
      });
      final r = await SeasonsApi(account: c).sendPending();
      expect(r.sent, 1);
      expect(bodies.single.containsKey(clientKeyField), isFalse);
    });
  });

  group('one send at a time', () {
    Future<LedgerOutbox> boxWith(int n) async {
      var t = DateTime.now().subtract(const Duration(hours: 1));
      final box = LedgerOutbox(now: () => t);
      for (var i = 0; i < n; i++) {
        await box.keep(key: 'ledger:s1', userId: 'u1', fields: {'amount': '$i'});
        t = t.add(const Duration(minutes: 2));
      }
      return LedgerOutbox();
    }

    test('a second send waits for the first, then finds nothing left: no entry goes out twice', () async {
      final box = await boxWith(2);
      final gate = Completer<void>();
      addTearDown(() => gate.isCompleted ? null : gate.complete());
      final posted = <String>[];
      var inFlight = 0, most = 0;
      Future<void> post(String s, Map<String, String> f) async {
        inFlight++;
        most = max(most, inFlight);
        await gate.future;
        posted.add(f['amount']!);
        inFlight--;
      }

      final a = box.send(userId: 'u1', post: post);
      final b = box.send(userId: 'u1', key: 'ledger:s1', post: post);
      await settle();
      expect(LedgerOutbox.busy, isTrue);
      expect(posted, isEmpty);
      gate.complete();
      final ra = await a, rb = await b;
      expect(posted, ['0', '1'], reason: 'each entry once');
      expect(most, 1, reason: 'never two at once');
      expect(ra.sent + rb.sent, 2);
      expect(LedgerOutbox.busy, isFalse);
    });

    test('an error that is not the server\'s answer puts the entry back instead of losing it', () async {
      final box = await boxWith(2);
      final r = await box.send(userId: 'u1', post: (s, f) async => throw StateError('boom'));
      expect(r.sent, 0);
      expect((await box.pending('u1')).length, 2);
      expect(LedgerOutbox.busy, isFalse, reason: 'the lock is let go after an error');
    });
  });

  group('the automatic sender', () {
    test('waits 30 seconds, then twice as long each time, ten minutes at most', () {
      final s = LedgerAutoSender(api: () => throw UnimplementedError());
      expect(s.delayFor(0), const Duration(seconds: 30));
      expect(s.delayFor(1), const Duration(minutes: 1));
      expect(s.delayFor(3), const Duration(minutes: 4));
      expect(s.delayFor(5), const Duration(minutes: 10));
      expect(s.delayFor(500), const Duration(minutes: 10));
    });

    Future<(LedgerAutoSender, SeasonsApi)> sender(Future<http.Response> Function(http.Request) handler,
        {List<Map<String, String>> kept = const []}) async {
      SharedPreferences.setMockInitialValues(sessionPrefs('u1'));
      final c = await controller(handler);
      final api = SeasonsApi(account: c);
      var t = DateTime.now().subtract(const Duration(hours: 1));
      final box = LedgerOutbox(now: () => t);
      for (final f in kept) {
        await box.keep(key: 'ledger:s1', userId: 'u1', fields: f);
        t = t.add(const Duration(minutes: 2));
      }
      final s = LedgerAutoSender(api: () => api, account: c);
      addTearDown(s.stop);
      return (s, api);
    }

    test('nothing waiting, nothing sent and nothing scheduled', () async {
      var calls = 0;
      final (s, _) = await sender((req) async {
        calls++;
        return json({'ok': true});
      });
      expect(await s.attempt(), isNull);
      expect(calls, 0);
      expect(s.scheduled, isNull);
    });

    test('two attempts at the same moment make one send (the lock)', () async {
      final gate = Completer<void>();
      addTearDown(() => gate.isCompleted ? null : gate.complete());
      var calls = 0;
      final (s, api) = await sender((req) async {
        calls++;
        await gate.future;
        return json({'ok': true});
      }, kept: [
        {'category': 'seeds', 'amount': '1'},
        {'category': 'seeds', 'amount': '2'},
      ]);
      final first = s.attempt();
      await settle();
      expect(await s.attempt(), isNull, reason: 'one is under way');
      gate.complete();
      final r = await first;
      expect(r!.sent, 2);
      expect(calls, 2, reason: 'each entry once');
      expect(s.reports.value, same(r), reason: 'an open screen hears of it');
      expect(await api.outbox.pending('u1'), isEmpty);
      expect(s.scheduled, isNull, reason: 'an empty box stops the retry');
    });

    test('it does not start behind a screen\'s send, but comes back for what is left', () async {
      final gate = Completer<void>();
      addTearDown(() => gate.isCompleted ? null : gate.complete());
      final (s, api) = await sender((req) async {
        await gate.future;
        return json({'ok': true});
      }, kept: [
        {'category': 'seeds', 'amount': '1'},
      ]);
      final screen = api.sendPending();
      await settle();
      expect(await s.attempt(), isNull);
      expect(s.scheduled, const Duration(seconds: 30));
      gate.complete();
      expect((await screen).sent, 1);
    });

    test('no network: the entry waits, and the next try is later each time', () async {
      final (s, api) = await sender((req) async => throw Exception('no route to host'), kept: [
        {'category': 'seeds', 'amount': '1'},
      ]);
      final r = await s.attempt();
      expect(r!.sent, 0);
      expect((await api.outbox.pending('u1')).length, 1);
      expect(s.scheduled, const Duration(minutes: 1));
      await s.attempt();
      expect(s.scheduled, const Duration(minutes: 2));
      expect(s.reports.value, isNull, reason: 'nothing to tell a screen');
    });

    test('a refusal is not sent again, its reason is reported, and the retry stops', () async {
      var calls = 0;
      final (s, api) = await sender((req) async {
        calls++;
        return json({'error': 'الفترة مقفلة.'}, 400);
      }, kept: [
        {'category': 'seeds', 'amount': '1'},
      ]);
      final r = await s.attempt();
      expect(r!.refused.single.$2, 'الفترة مقفلة.');
      expect(s.reports.value, same(r));
      expect(await api.outbox.pending('u1'), isEmpty);
      expect(s.scheduled, isNull);
      expect(await s.attempt(), isNull);
      expect(calls, 1);
    });

    test('a blank-form entry waits for its season: it is not sent by itself', () async {
      var calls = 0;
      final (s, api) = await sender((req) async {
        calls++;
        return json({'ok': true});
      });
      await api.keepUnassigned({'category': 'seeds', 'amount': '1'});
      expect(await s.attempt(), isNull);
      expect(calls, 0);
      expect((await api.outbox.pending('u1')).length, 1);
    });

    test('the app coming back to the front sends what waits; in the background it does not retry', () async {
      var online = false;
      var calls = 0;
      final (s, api) = await sender((req) async {
        calls++;
        if (!online) throw Exception('no route to host');
        return json({'ok': true});
      }, kept: [
        {'category': 'seeds', 'amount': '1'},
      ]);
      s.start();
      await settle();
      expect(calls, 1, reason: 'it tries once as it starts');
      expect(s.scheduled, isNotNull);

      s.didChangeAppLifecycleState(AppLifecycleState.paused);
      expect(s.scheduled, isNull, reason: 'no retry while the app is in the background');

      online = true;
      s.didChangeAppLifecycleState(AppLifecycleState.resumed);
      await settle();
      expect(calls, 2);
      expect(await api.outbox.pending('u1'), isEmpty);
      expect(s.reports.value?.sent, 1);
    });

    test('an entry kept with no network schedules the first retry', () async {
      final (s, api) = await sender((req) async => throw Exception('no route to host'));
      s.start();
      await settle();
      expect(s.scheduled, isNull);
      expect(await api.addOrKeep('s1', {'category': 'seeds', 'amount': '3'}), KeepResult.kept);
      expect(s.scheduled, const Duration(seconds: 30));
    });
  });
}
