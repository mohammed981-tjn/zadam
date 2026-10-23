/// صندوق الرسائل في التطبيق (البند ١٤٤): what /api/app/messages returns, and
/// the controller's list, thread and send against a stand-in server.
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

http.Response json(Object body, [int status = 200]) => http.Response.bytes(
    utf8.encode(jsonEncode(body)), status,
    headers: {'content-type': 'application/json; charset=utf-8'});

Future<AccountController> signedInController(Future<http.Response> Function(http.Request) handler) async {
  final expires = DateTime.now().toUtc().add(const Duration(hours: 1)).millisecondsSinceEpoch ~/ 1000;
  SharedPreferences.setMockInitialValues({
    'sudagri.session': jsonEncode({'access_token': 'a1', 'refresh_token': 'r1', 'expires_at': expires}),
  });
  final c = AccountController(siteUrl: site, supabaseUrl: supabase, anonKey: 'anon', client: MockClient(handler));
  await c.load();
  return c;
}

void main() {
  test('a thread parses: the request, the messages by part, the file link and «قُرئت»', () {
    final v = ConversationView.fromJson({
      'id': 'c1',
      'kind': 'partnership',
      'me': 'investor',
      'title': 'طلب شراكة على أرضٍ في الخرطوم',
      'status': 'pending',
      'open': true,
      'request': {'message': 'أريد تمويل الموسم', 'model': 'sharecrop', 'created_at': '2026-10-23T10:00:00Z'},
      'others_read_at': '2026-10-23T12:00:00Z',
      'messages': [
        {'id': 'm1', 'role': 'investor', 'mine': true, 'body': 'كم فداناً؟', 'created_at': '2026-10-23T11:00:00Z'},
        {'id': 'm2', 'role': 'owner', 'mine': false, 'body': '', 'attachment_path': 'u/messages/p.jpg',
         'attachment_kind': 'photo', 'created_at': '2026-10-23T11:30:00Z'},
      ],
      'files': {'u/messages/p.jpg': 'https://signed.test/p.jpg'},
    });
    expect(v.pending, isTrue);
    expect(v.request, 'أريد تمويل الموسم');
    expect(v.messages.last.fileUrl, 'https://signed.test/p.jpg');
    expect(senderLabels[v.messages.last.role], 'صاحب الأرض');
    expect(v.seenMessageId, 'm1', reason: 'the other side opened the thread after the last message the reader sent');
  });

  test('«قُرئت» waits until the other side has opened the thread since', () {
    final v = ConversationView.fromJson({
      'id': 'c1', 'kind': 'support', 'me': 'member', 'title': 'إدارة سوداقري', 'open': true,
      'others_read_at': '2026-10-23T10:00:00Z',
      'messages': [
        {'id': 'm1', 'role': 'member', 'mine': true, 'body': 'سؤال', 'created_at': '2026-10-23T11:00:00Z'},
      ],
    });
    expect(v.seenMessageId, isNull);
  });

  test('the list, «راسل سوداقري» and a message go to the right routes with the token', () async {
    final seen = <String>[];
    final c = await signedInController((req) async {
      seen.add('${req.method} ${req.url.path}');
      expect(req.headers['authorization'], 'Bearer a1');
      if (req.url.path == '/api/app/messages' && req.method == 'GET') {
        return json({
          'conversations': [
            {'id': 'c1', 'kind': 'support', 'my_role': 'admin', 'title': 'رسالة من سلمى', 'last_body': 'سؤال',
             'unread': 2, 'open': true, 'reported': false, 'needs_reply': true, 'last_message_at': '2026-10-23T11:00:00Z'},
          ],
        });
      }
      if (req.url.path == '/api/app/messages' && req.method == 'POST') return json({'id': 'c9'});
      if (req.url.path == '/api/app/messages/c9' && req.method == 'POST') {
        expect(jsonDecode(req.body), {'body': 'مرحباً'});
        return json({'ok': true});
      }
      return json({'error': 'غير متوقَّع'}, 500);
    });

    final rows = await c.conversations();
    expect(rows.single.isAdmin && rows.single.needsReply, isTrue);
    expect(rows.single.unread, 2);
    expect(await c.openSupport(), 'c9');
    await c.sendMessage('c9', 'مرحباً');
    expect(seen, ['GET /api/app/messages', 'POST /api/app/messages', 'POST /api/app/messages/c9']);
  });

  test("the server's refusal reaches the person in its own words", () async {
    final c = await signedInController((_) async =>
        json({'error': 'لا يُكتب رقم هاتفٍ قبل أن يقبل صاحب الأرض الطلب.'}, 400));
    expect(
      () => c.sendMessage('c1', '0912345678'),
      throwsA(isA<ApiException>().having((e) => e.message, 'message', contains('قبل أن يقبل'))),
    );
  });
}
