/// دليل المرحلة ومستند الأرض من التطبيق (البند ٢٠٣): the file's checks, the two ways it is sent (a photo to the
/// website's route, a PDF straight to the person's own folder and then its path), and «أضف دليلاً» / «ارفع المستند»
/// on screen.
library;

import 'dart:convert';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sudagri/account.dart';
import 'package:sudagri/api.dart';
import 'package:sudagri/evidence.dart';
import 'package:sudagri/lands.dart';
import 'package:sudagri/screens/evidence_sheet.dart';
import 'package:sudagri/screens/lands_screen.dart';
import 'package:sudagri/screens/season_screen.dart';
import 'package:sudagri/seasons.dart';
import 'package:sudagri/theme.dart';

const site = 'https://site.test';
const uid = '11111111-2222-4333-8444-555555555555';

String token(String sub) {
  String part(Object o) => base64Url.encode(utf8.encode(jsonEncode(o))).replaceAll('=', '');
  return '${part({'alg': 'HS256'})}.${part({'sub': sub, 'role': 'authenticated'})}.sig';
}

http.Response json(Object body, [int status = 200]) =>
    http.Response.bytes(utf8.encode(jsonEncode(body)), status, headers: {'content-type': 'application/json; charset=utf-8'});

final jpeg = [0xff, 0xd8, 0xff, 0xe0, 0, 16, 1, 2, 3, 4];
final pdf = utf8.encode('%PDF-1.7\n1 0 obj\n');

/// A signed-in phone whose every request — the website's and the bucket's — goes to [handler].
Future<(AccountController, MockClient)> signedIn(Future<http.Response> Function(http.Request) handler) async {
  final expires = DateTime.now().toUtc().add(const Duration(hours: 1)).millisecondsSinceEpoch ~/ 1000;
  SharedPreferences.setMockInitialValues({
    'sudagri.session': jsonEncode({'access_token': token(uid), 'refresh_token': 'r1', 'expires_at': expires}),
  });
  final client = MockClient(handler);
  final c = AccountController(siteUrl: site, supabaseUrl: 'https://db.test', anonKey: 'anon', client: client);
  await c.load();
  return (c, client);
}

EvidenceSender sender(AccountController c, http.Client client) =>
    EvidenceSender(account: c, client: client, supabaseUrl: 'https://db.test', anonKey: 'anon', random: Random(7));

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

Future<void> settle(WidgetTester tester) async {
  for (var i = 0; i < 6; i++) {
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
    await tester.pump(const Duration(milliseconds: 100));
  }
}

final seasonJson = <String, dynamic>{
  'season': {'id': 's1', 'name': 'قمح الجزيرة', 'crop': 'قمح', 'feddans': 10, 'status': 'active'},
  'is_owner': true,
  'can_write': true,
  'progress': {'done': 1, 'total': 2, 'pct': 50},
  'stages': [
    {
      'id': 'st1', 'name': 'تحضير الأرض', 'budget': 1000, 'completed': true, 'released': true,
      'evidence': [
        {'id': 'e1', 'kind': 'photo', 'caption': 'صورة الحرث'},
      ],
    },
    {'id': 'st2', 'name': 'الزراعة', 'budget': 2000, 'completed': false, 'released': false, 'evidence': []},
  ],
};

final landJson = <String, dynamic>{
  'land': {'id': 'l1', 'name': 'حواشة الشيخ', 'state': 'الجزيرة', 'feddans': 12, 'documents_on_file': 0, 'documents_required': 3},
  'documents': {
    'kinds': [
      {'key': 'tenure', 'label': 'إثبات حيازة أو عقد إيجار', 'have': false},
      {'key': 'photo', 'label': 'صورة للأرض', 'have': false},
    ],
    'files': [],
  },
};

void main() {
  test("the file is held to the website's upload: a photo or a PDF, up to ten megabytes", () {
    expect(evidenceFileProblem(const EvidenceFile(bytes: [], name: 'x', pdf: false)), 'اختر ملفاً أولاً — صورة أو مستند PDF.');
    expect(evidenceFileProblem(EvidenceFile(bytes: jpeg, name: 'a.jpg', pdf: false)), isNull);
    expect(evidenceFileProblem(EvidenceFile(bytes: pdf, name: 'a.pdf', pdf: true)), isNull);
    expect(evidenceFileProblem(EvidenceFile(bytes: pdf, name: 'a.jpg', pdf: false)), 'الصيغ المقبولة: JPG أو PNG أو PDF.');
    expect(evidenceFileProblem(EvidenceFile(bytes: jpeg, name: 'a.pdf', pdf: true)), 'الصيغ المقبولة: JPG أو PNG أو PDF.');
    final big = List<int>.filled(evidenceMaxBytes + 1, 0)..setAll(0, pdf);
    expect(evidenceFileProblem(EvidenceFile(bytes: big, name: 'big.pdf', pdf: true)), 'الملف 10.0 ميجابايت، والحد الأقصى 10.');
  });

  test('a PDF is named by a random id, as the website names its uploads; a caption left empty is the file name', () {
    expect(RegExp(r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$').hasMatch(newObjectId()), isTrue);
    expect(EvidenceFile(bytes: pdf, name: 'فاتورة.pdf', pdf: true).captionOr('  ', 'فاتورة'), 'فاتورة.pdf');
    expect(EvidenceFile(bytes: jpeg, name: 'image_123.jpg', pdf: false).captionOr('', 'صورة'), 'صورة');
    expect(EvidenceFile(bytes: jpeg, name: 'x.jpg', pdf: false).captionOr(' حرث ', 'صورة'), 'حرث');
  });

  test("a stage's photo goes to the website's route, which stores it; nothing goes to the bucket from the phone", () async {
    final seen = <String>[];
    Map<String, dynamic>? posted;
    final (c, client) = await signedIn((req) async {
      seen.add('${req.method} ${req.url.host}${req.url.path}');
      posted = jsonDecode(req.body) as Map<String, dynamic>;
      return json({'ok': true, 'message': 'رُفع الدليل. اعتمد المرحلة حين تتمّ.'});
    });
    final api = SeasonsApi(account: c, evidence: sender(c, client));
    final m = await api.addEvidence('s1', 'st2', kind: 'photo', file: EvidenceFile(bytes: jpeg, name: 'image.jpg', pdf: false));
    expect(m, 'رُفع الدليل. اعتمد المرحلة حين تتمّ.');
    expect(seen, ['POST site.test/api/app/seasons/s1/evidence']);
    expect(posted, {'stage_id': 'st2', 'kind': 'photo', 'caption': 'صورة', 'photo': base64Encode(jpeg)});
  });

  test("a stage's PDF goes to the person's own folder with their session, then its path to the route", () async {
    final seen = <String>[];
    http.Request? upload;
    Map<String, dynamic>? posted;
    final (c, client) = await signedIn((req) async {
      seen.add('${req.method} ${req.url.host}');
      if (req.url.host == 'db.test') {
        upload = req;
        return json({'Key': 'evidence/x'});
      }
      posted = jsonDecode(req.body) as Map<String, dynamic>;
      return json({'ok': true, 'message': 'رُفع الدليل.'});
    });
    final api = SeasonsApi(account: c, evidence: sender(c, client));
    await api.addEvidence('s1', 'st2', kind: 'invoice', caption: '', file: EvidenceFile(bytes: pdf, name: 'فاتورة البذور.pdf', pdf: true));

    expect(seen, ['POST db.test', 'POST site.test']);
    final path = RegExp('^/storage/v1/object/evidence/($uid/stages/[0-9a-f-]{36}\\.pdf)\$').firstMatch(upload!.url.path);
    expect(path, isNotNull, reason: upload!.url.path);
    expect(upload!.headers['authorization'], 'Bearer ${token(uid)}');
    expect(upload!.headers['apikey'], 'anon');
    expect(upload!.headers['content-type'], 'application/pdf');
    expect(upload!.headers['x-upsert'], 'false');
    expect(upload!.bodyBytes, pdf);
    expect(posted, {'stage_id': 'st2', 'kind': 'invoice', 'caption': 'فاتورة البذور.pdf', 'storage_path': path!.group(1)});
  });

  test("the website's refusal comes back in its words, and a refused upload never reaches the route", () async {
    var routeCalls = 0;
    final (c, client) = await signedIn((req) async {
      if (req.url.host == 'db.test') return json({'error': 'too big'}, 413);
      routeCalls++;
      return json({'error': 'لا يُضاف دليلٌ إلى موسمٍ لا تملكه.'}, 400);
    });
    final api = SeasonsApi(account: c, evidence: sender(c, client));
    await expectLater(
      api.addEvidence('s1', 'st2', kind: 'photo', file: EvidenceFile(bytes: jpeg, name: 'a.jpg', pdf: false)),
      throwsA(isA<ApiException>().having((e) => e.message, 'message', 'لا يُضاف دليلٌ إلى موسمٍ لا تملكه.')),
    );
    await expectLater(
      api.addEvidence('s1', 'st2', kind: 'invoice', file: EvidenceFile(bytes: pdf, name: 'a.pdf', pdf: true)),
      throwsA(isA<ApiException>().having((e) => e.message, 'message', 'تعذّر رفع الملف. أعد المحاولة.')),
    );
    expect(routeCalls, 1);
  });

  test("a land's document: a photo or a PDF in the lands folder, then the land's documents route", () async {
    final posted = <Map<String, dynamic>>[];
    String? uploadPath;
    final (c, client) = await signedIn((req) async {
      if (req.url.host == 'db.test') {
        uploadPath = req.url.path;
        return json({'Key': 'x'});
      }
      expect(req.url.path, '/api/app/lands/l1/documents');
      posted.add(jsonDecode(req.body) as Map<String, dynamic>);
      return json({'ok': true, 'message': 'رُفع المستند.'});
    });
    final api = LandsApi(c, sender(c, client));
    expect(await api.addDocument('l1', kind: 'photo', kindLabel: 'صورة للأرض', file: EvidenceFile(bytes: jpeg, name: 'a.jpg', pdf: false)),
        'رُفع المستند.');
    await api.addDocument('l1', kind: 'tenure', kindLabel: 'إثبات حيازة', caption: 'عقد ٢٠٢٦', file: EvidenceFile(bytes: pdf, name: 'c.pdf', pdf: true));
    expect(posted.first, {'kind': 'photo', 'caption': 'صورة للأرض', 'photo': base64Encode(jpeg)});
    expect(uploadPath, startsWith('/storage/v1/object/evidence/$uid/lands/'));
    expect(posted.last['storage_path'], uploadPath!.substring('/storage/v1/object/evidence/'.length));
    expect(posted.last['caption'], 'عقد ٢٠٢٦');
  });

  group('on screen', () {
    void tall(WidgetTester tester) {
      tester.view.physicalSize = const Size(390, 1600);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
    }

    testWidgets('«أضف دليلاً» on the open stage only; a photo sent, then «اعتمد المرحلة» passes', (tester) async {
      tall(tester);
      var evidence = <Map<String, dynamic>>[];
      Map<String, dynamic>? posted;
      String? signed;
      late SeasonsApi api;
      await tester.runAsync(() async {
        final (c, client) = await signedIn((req) async {
          if (req.url.path == '/api/app/seasons/s1/evidence') {
            posted = jsonDecode(req.body) as Map<String, dynamic>;
            evidence = [
              {'id': 'e2', 'kind': posted!['kind'], 'caption': posted!['caption']},
            ];
            return json({'ok': true, 'message': 'رُفع الدليل. اعتمد المرحلة حين تتمّ.'});
          }
          if (req.url.path == '/api/app/seasons/s1/stages') {
            signed = (jsonDecode(req.body) as Map)['stage_id'] as String;
            return evidence.isEmpty
                ? json({'error': 'لا تُعتمد مرحلةٌ بلا دليل.'}, 400)
                : json({'ok': true, 'message': 'اعتُمدت المرحلة.'});
          }
          final stages = [
            (seasonJson['stages'] as List)[0],
            {...((seasonJson['stages'] as List)[1] as Map), 'evidence': evidence},
          ];
          return json({...seasonJson, 'stages': stages});
        });
        api = SeasonsApi(account: c, evidence: sender(c, client));
      });
      final picked = <EvidenceSource>[];
      await tester.pumpWidget(app(SeasonScreen(
        id: 's1',
        name: 'قمح الجزيرة',
        api: api,
        pick: (s) async {
          picked.add(s);
          return EvidenceFile(bytes: jpeg, name: 'image.jpg', pdf: false);
        },
      )));
      await settle(tester);

      expect(find.text('أضف دليلاً'), findsOneWidget, reason: 'the signed-off stage offers none');
      expect(find.text('ارفع دليلاً (من الموقع)'), findsNothing);
      expect(find.text('لا تُعتمد مرحلةٌ بلا دليل: صورةٌ من الحقل أو فاتورةٌ أو تقرير معاينة.'), findsOneWidget);

      await tester.tap(find.text('أضف دليلاً'));
      await tester.pumpAndSettle();
      expect(find.text('الزراعة'), findsWidgets);
      for (final k in ['صورة', 'فاتورة', 'معاينة']) {
        expect(find.widgetWithText(ChoiceChip, k), findsOneWidget);
      }
      await tester.tap(find.widgetWithText(ChoiceChip, 'معاينة'));
      await tester.enterText(find.byType(TextField), 'البذر بالسطور');
      await tester.tap(find.text('من الصور'));
      await settle(tester);
      await tester.pumpAndSettle();

      expect(picked, [EvidenceSource.gallery]);
      expect(posted, {'stage_id': 'st2', 'kind': 'inspection', 'caption': 'البذر بالسطور', 'photo': base64Encode(jpeg)});
      expect(find.text('رُفع الدليل. اعتمد المرحلة حين تتمّ.'), findsOneWidget);
      expect(find.text('البذر بالسطور'), findsOneWidget, reason: 'the page is read again and shows the new evidence');

      await tester.tap(find.text('اعتمد المرحلة'));
      await settle(tester);
      await tester.pumpAndSettle();
      expect(signed, 'st2');
      expect(find.text('لم تُعتمد المرحلة'), findsNothing);
      // The first sentence's snack bar goes first; the sign-off's follows it.
      await tester.pump(const Duration(seconds: 5));
      await tester.pumpAndSettle();
      expect(find.text('اعتُمدت المرحلة.'), findsOneWidget);
    });

    testWidgets("a refusal stays on the sheet in the website's words, with what was typed", (tester) async {
      tall(tester);
      late SeasonsApi api;
      await tester.runAsync(() async {
        final (c, client) = await signedIn((req) async {
          if (req.url.path == '/api/app/seasons/s1/evidence') return json({'error': 'لم نجد الملف المرفوع. أعد رفعه ثم حاول مرة أخرى.'}, 400);
          return json(seasonJson);
        });
        api = SeasonsApi(account: c, evidence: sender(c, client));
      });
      await tester.pumpWidget(app(SeasonScreen(
        id: 's1',
        api: api,
        pick: (s) async => EvidenceFile(bytes: jpeg, name: 'a.jpg', pdf: false),
      )));
      await settle(tester);
      await tester.tap(find.text('أضف دليلاً'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), 'حقل القمح');
      await tester.tap(find.text('صوّر الآن'));
      await settle(tester);
      await tester.pumpAndSettle();
      expect(find.text('لم نجد الملف المرفوع. أعد رفعه ثم حاول مرة أخرى.'), findsOneWidget);
      expect(find.text('حقل القمح'), findsOneWidget);
      expect(find.text('صوّر الآن'), findsOneWidget, reason: 'the sheet is still open to try again');
    });

    testWidgets('«ارفع المستند» on the land card sends a PDF and reads the card again', (tester) async {
      tall(tester);
      var cardReads = 0;
      final posted = <Map<String, dynamic>>[];
      late LandsApi api;
      await tester.runAsync(() async {
        final (c, client) = await signedIn((req) async {
          if (req.url.host == 'db.test') return json({'Key': 'x'});
          if (req.url.path == '/api/app/lands/l1/documents') {
            posted.add(jsonDecode(req.body) as Map<String, dynamic>);
            return json({'ok': true, 'message': 'رُفع المستند.'});
          }
          if (req.url.path == '/api/app/lands/l1/water') return json({'located': false, 'rows': [], 'note': 'x'});
          cardReads++;
          return json(landJson);
        });
        api = LandsApi(c, sender(c, client));
      });
      await tester.pumpWidget(app(LandCardScreen(
        id: 'l1',
        name: 'حواشة الشيخ',
        api: api,
        pick: (s) async => s == EvidenceSource.pdf ? EvidenceFile(bytes: pdf, name: 'عقد الإيجار.pdf', pdf: true) : null,
      )));
      await settle(tester);
      expect(find.text('ارفع المستندات من الموقع'), findsNothing);
      await tester.scrollUntilVisible(find.text('ارفع المستند'), 200, scrollable: find.byType(Scrollable).first);
      await tester.tap(find.text('ارفع المستند'));
      await tester.pumpAndSettle();
      expect(find.widgetWithText(ChoiceChip, 'إثبات حيازة أو عقد إيجار'), findsOneWidget);
      await tester.tap(find.text('ملفّ PDF'));
      await settle(tester);
      await tester.pumpAndSettle();
      expect(posted.single['kind'], 'tenure');
      expect(posted.single['caption'], 'عقد الإيجار.pdf');
      expect(posted.single['storage_path'], matches(RegExp('^$uid/lands/[0-9a-f-]{36}\\.pdf\$')));
      expect(find.text('رُفع المستند.'), findsOneWidget);
      expect(cardReads, 2);
    });
  });
}
