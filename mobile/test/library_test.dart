/// المكتبة والدراسات في التطبيق (البند ٢٠٣): the list and a work from the
/// public routes, «ما أرسلتُه» as the signed-in person, the studies and the
/// guide as the website's blocks, and a sending through the website's own two
/// steps with its limits.
library;

import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:sudagri/api.dart';
import 'package:sudagri/library.dart';
import 'package:sudagri/screens/library_screen.dart';
import 'package:sudagri/screens/page_reader_screen.dart';
import 'package:sudagri/theme.dart';

const site = 'https://site.test';
const db = 'https://db.test';

http.Response json(Object body, [int status = 200]) => http.Response.bytes(
    utf8.encode(jsonEncode(body)), status,
    headers: {'content-type': 'application/json; charset=utf-8'});

final work = {
  'id': '0d4f6c1e-2b7a-4c55-9f0e-1a2b3c4d5e6f',
  'kind': 'feasibility',
  'kindLabel': 'دراسة جدوى',
  'title': 'جدوى السمسم في القضارف',
  'authors': 'سلمى أحمد',
  'institution': 'جامعة القضارف',
  'year': 2024,
  'crop': 'السمسم',
  'state': null,
  'abstract': 'درسنا تكلفة الفدان وعائده في ثلاثة مواسم.',
  'hasFile': true,
  'link_url': null,
  'published_at': '2026-10-30T09:00:00Z',
};

ResearchDraft draft({Uint8List? pdf, String name = 'study.pdf', String link = ''}) => ResearchDraft(
      title: 'جدوى السمسم في القضارف',
      authors: 'سلمى أحمد',
      abstract: 'درسنا تكلفة الفدان وعائده في ثلاثة مواسم، ووجدنا أنّ الريّ التكميليّ يرفع الغلّة.',
      consent: true,
      linkUrl: link,
      fileName: pdf == null ? null : name,
      fileBytes: pdf,
    );

void main() {
  test('the list and a work parse from the public routes, with the filter in the query', () async {
    final seen = <Uri>[];
    final api = LibraryApi(
      siteUrl: site,
      client: MockClient((req) async {
        seen.add(req.url);
        expect(req.headers['authorization'], isNull, reason: 'a public read sends no session');
        if (req.url.path == '/api/app/library') {
          return json({
            'items': [work],
            'kinds': [
              {'key': 'feasibility', 'label': 'دراسة جدوى'},
            ],
            'states': ['القضارف'],
            'maxBytes': 20971520,
          });
        }
        return json({...work, 'citation': 'سلمى أحمد (2024). جدوى السمسم في القضارف.', 'pageUrl': '$site/library/x'});
      }),
    );
    final list = await api.list(kind: 'feasibility', q: ' سمسم ');
    expect(seen.single.queryParameters, {'kind': 'feasibility', 'q': 'سمسم'});
    expect(list.items.single.byline, 'سلمى أحمد · جامعة القضارف · 2024');
    expect(list.states, ['القضارف']);
    expect(list.maxBytes, researchMaxBytes);
    final one = await api.item('${work['id']}');
    expect(one.hasFile, isTrue);
    expect(one.pageUrl, '$site/library/x');
    expect(one.citation, startsWith('سلمى أحمد (2024)'));
  });

  test('«ما أرسلتُه» is asked as the signed-in person', () async {
    String? asked;
    final api = LibraryApi(
      siteUrl: site,
      client: MockClient((_) async => json({})),
      call: (method, path, {body}) async {
        asked = '$method $path';
        return {
          'items': [
            {'id': 'a', 'title': 'بحث', 'kindLabel': 'تقرير', 'status': 'rejected', 'statusLabel': 'رُدّ', 'review_note': 'ليس عن السودان'},
          ],
        };
      },
    );
    final mine = await api.mine();
    expect(asked, 'GET /api/app/library/mine');
    expect(mine.single.reviewNote, 'ليس عن السودان');
  });

  test('the website\'s checks before sending: a PDF up to 20 MB, or a link; the fields; the consent', () {
    expect(draft().problem(), 'أرفق ملفّ PDF أو ضع رابط العمل.');
    expect(draft(link: 'https://example.test/x').problem(), isNull);
    expect(draft(pdf: Uint8List(10), name: 'x.docx').problem(), 'الملفّ PDF حتى ٢٠ ميجابايت.');
    expect(draft(pdf: Uint8List(researchMaxBytes + 1)).problem(), 'الملفّ PDF حتى ٢٠ ميجابايت.');
    expect(draft(pdf: Uint8List(10)).problem(), isNull);
    expect((draft(link: 'https://x.test')..consent = false).problem(), contains('أكّد'));
    expect((draft(link: 'https://x.test')..abstract = 'قصير').problem(), contains('الملخّص'));
  });

  test('sending with a PDF: the upload slot, the file to the signed link, then the fields — with the session', () async {
    final steps = <String>[];
    final api = LibraryApi(
      siteUrl: site,
      supabaseUrl: db,
      anonKey: 'anon',
      token: () async => 'a1',
      client: MockClient((req) async {
        if (req.url.host == 'db.test') {
          steps.add('PUT ${req.url.path}?token=${req.url.queryParameters['token']}');
          expect(req.method, 'PUT');
          expect(req.headers['content-type'], 'application/pdf');
          expect(req.headers['authorization'], 'Bearer anon', reason: 'the upload link is the permission, not the session');
          expect(req.bodyBytes.length, 3);
          return json({'Key': 'research/incoming/u.pdf'});
        }
        expect(req.url.path, '/api/research');
        expect(req.headers['authorization'], 'Bearer a1', reason: 'the work is credited to the account');
        final body = jsonDecode(req.body) as Map<String, dynamic>;
        steps.add('POST ${body['step']}${body['file_path'] == null ? '' : ' ${body['file_path']}'}');
        if (body['step'] == 'upload') return json({'ok': true, 'path': 'incoming/u.pdf', 'token': 't9'});
        expect(body['consent'], isTrue);
        expect(body['title'], 'جدوى السمسم في القضارف');
        return json({'ok': true});
      }),
    );
    await api.submit(draft(pdf: Uint8List.fromList([1, 2, 3])));
    expect(steps, [
      'POST upload',
      'PUT /storage/v1/object/upload/sign/research/incoming/u.pdf?token=t9',
      'POST submit incoming/u.pdf',
    ]);
  });

  test('the route\'s refusal is shown in its words; a visitor sends without a session', () async {
    final api = LibraryApi(
      siteUrl: site,
      supabaseUrl: db,
      token: () async => null,
      client: MockClient((req) async {
        expect(req.headers['authorization'], isNull);
        return json({'ok': false, 'message': 'أرسلت كثيراً خلال دقيقة. انتظر قليلاً ثم أعد المحاولة.'}, 429);
      }),
    );
    expect(
      () => api.submit(draft(link: 'https://example.test/x')),
      throwsA(isA<ApiException>().having((e) => e.message, 'message', contains('أرسلت كثيراً'))),
    );
  });

  test('a page reads into blocks, its sections make the contents, and the canal brings its figures', () {
    final page = ReadPage.fromJson({
      'slug': 'arc-canal',
      'blocks': [
        {'kind': 'h1', 'text': 'القناة القوسية'},
        {'kind': 'section', 'text': 'الخلاصة'},
        {'kind': 'p', 'text': 'الموقع سليم.'},
        {'kind': 'table', 'rows': [['أ', 'ب'], ['1', '2']]},
        {'kind': 'section', 'text': 'الأرض'},
        {'kind': 'ul', 'items': ['واحد', 'اثنان']},
      ],
      'canal': {
        'lengthKm': 94,
        'peakM': 432,
        'liftM': 55,
        'terminusAboveSourceM': 30,
        'sourceElevationM': 377,
        'profile': [
          {'km': 0, 'elevation': 377},
          {'km': 2.3, 'elevation': 380},
        ],
      },
      'pageUrl': '$site/arc-canal',
    });
    expect(page.sections, [(1, 'الخلاصة'), (4, 'الأرض')]);
    expect(page.blocks[3].rows.last, ['1', '2']);
    expect(page.canal!.profile.last, (2.3, 380.0));
  });

  Widget app(Widget home) => MaterialApp(
        theme: sudagriLight,
        locale: const Locale('ar'),
        supportedLocales: const [Locale('ar')],
        localizationsDelegates: GlobalMaterialLocalizations.delegates,
        home: home,
      );

  testWidgets('the library screen lists the works and opens the share form', (tester) async {
    final api = LibraryApi(
      siteUrl: site,
      client: MockClient((req) async {
        if (req.url.path == '/api/app/library') {
          return json({'items': [work], 'kinds': [], 'states': ['القضارف'], 'maxBytes': researchMaxBytes});
        }
        if (req.url.path == '/api/app/library/studies') return json({'studies': []});
        return json({'slug': 'guide', 'blocks': []});
      }),
    );
    await tester.pumpWidget(app(LibraryScreen(api: api)));
    await tester.pumpAndSettle();
    expect(find.text('المكتبة والدراسات'), findsOneWidget);
    expect(find.text('جدوى السمسم في القضارف'), findsOneWidget);
    await tester.tap(find.text('شارك دراستك أو بحثك'));
    await tester.pumpAndSettle();
    expect(find.text('نوع العمل'), findsOneWidget);
    expect(find.textContaining('بلا حساب إن شئت'), findsOneWidget);
  });

  testWidgets('the reader draws the study\'s blocks with its title and caveat', (tester) async {
    final api = LibraryApi(
      siteUrl: site,
      client: MockClient((_) async => json({
            'slug': 'exchange-rate',
            'title': ['دراسة', 'أزمة سعر الصرف والتضخم'],
            'note': 'نُشرت كما كُتبت',
            'caveat': 'عن الأرقام في الدراسة: كلُّ رقمٍ منسوبٌ إلى مصدره.',
            'blocks': [
              {'kind': 'section', 'id': 's1', 'text': 'أولاً: التشخيص'},
              {'kind': 'p', 'text': 'ارتفع التضخم.'},
              {'kind': 'formula', 'text': 'E = M / Y'},
              {'kind': 'ol', 'items': ['خفض العجز']},
            ],
          })),
    );
    await tester.pumpWidget(app(PageReaderScreen(slug: 'exchange-rate', title: 'أزمة سعر الصرف', api: api)));
    await tester.pumpAndSettle();
    expect(find.text('أزمة سعر الصرف والتضخم'), findsOneWidget);
    expect(find.textContaining('كلُّ رقمٍ منسوبٌ'), findsOneWidget);
    expect(find.text('أولاً: التشخيص'), findsOneWidget);
    expect(find.text('E = M / Y'), findsOneWidget);
    expect(find.text('خفض العجز'), findsOneWidget);
  });
}
