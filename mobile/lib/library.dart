/// المكتبة والدراسات في التطبيق (البند ٢٠٣): /library و/library/[id]
/// و/library/mine و/library/new، و/studies (ومنها /studies/exchange-rate)،
/// و/arc-canal و/guide.
///
/// Reading: the published works and one work come from /api/app/library
/// (public, the website's own read with the public client); «ما أرسلتُه» from
/// /api/app/library/mine as the signed-in person; the studies and the guide from
/// /api/app/library/studies and `/api/app/library/read/<slug>`, which hand back
/// the website's own text as blocks (the exchange-rate study through the same
/// parser as its page, the canal study and the guide read off the rendered
/// pages), so nothing here is a hand copy that could drift.
///
/// Sending a work («شارك دراستك أو بحثك») takes the website form's own two steps
/// at /api/research: an upload slot for one path the server makes, the PDF put
/// straight into the private `research` bucket with that signed link (as the
/// browser's `uploadToSignedUrl` does), then the fields, checked on the server
/// by the same `checkResearch`. The limits are the website's: a PDF of up to
/// 20 MB, or a link. A signed-in phone sends its session, so the work is
/// credited to the account and followed in «ما أرسلتُه».
library;

import 'dart:convert';
import 'dart:typed_data';

import 'package:http/http.dart' as http;

import 'account.dart';
import 'api.dart';
import 'feasibility.dart' show AppCall;
import 'i18n.dart';

Map<String, dynamic> _map(Object? v) => (v as Map?)?.cast<String, dynamic>() ?? const {};
List<Map<String, dynamic>> _maps(Object? v) => [for (final x in (v as List? ?? const [])) _map(x)];
String? _str(Object? v) => v is String && v.isNotEmpty ? v : null;

/// The website's limit: twenty megabytes, PDF only (lib/research.ts, RESEARCH_MAX_BYTES).
const researchMaxBytes = 20 * 1024 * 1024;

Map<String, String> get researchKindLabels => {
  'feasibility': tr('دراسة جدوى', 'Feasibility study'),
  'research': tr('بحثٌ علميّ', 'Research paper'),
  'thesis': tr('رسالة جامعيّة', 'Thesis'),
  'report': tr('تقرير', 'Report'),
  'other': tr('غير ذلك', 'Other'),
};

class ResearchItem {
  const ResearchItem({
    required this.id,
    required this.kind,
    required this.kindLabel,
    required this.title,
    required this.authors,
    this.institution,
    this.year,
    this.crop,
    this.state,
    required this.abstract,
    required this.hasFile,
    this.linkUrl,
    this.publishedAt,
    this.citation,
    this.pageUrl,
  });

  final String id;
  final String kind;
  final String kindLabel;
  final String title;
  final String authors;
  final String? institution;
  final int? year;
  final String? crop;
  final String? state;
  final String abstract;
  final bool hasFile;
  final String? linkUrl;
  final DateTime? publishedAt;
  final String? citation;

  /// The work's page on the website, where the PDF opens (the bucket is
  /// private and its links are signed there).
  final String? pageUrl;

  /// «المؤلّف · الجهة · السنة».
  String get byline => [authors, ?institution, if (year != null) '$year'].join(' · ');

  factory ResearchItem.fromJson(Map<String, dynamic> j) => ResearchItem(
        id: '${j['id']}',
        kind: '${j['kind']}',
        kindLabel: _str(j['kindLabel']) ?? researchKindLabels[j['kind']] ?? '${j['kind']}',
        title: '${j['title'] ?? ''}',
        authors: '${j['authors'] ?? ''}',
        institution: _str(j['institution']),
        year: (j['year'] as num?)?.toInt(),
        crop: _str(j['crop']),
        state: _str(j['state']),
        abstract: '${j['abstract'] ?? ''}',
        hasFile: j['hasFile'] == true,
        linkUrl: _str(j['link_url']),
        publishedAt: DateTime.tryParse('${j['published_at'] ?? ''}'),
        citation: _str(j['citation']),
        pageUrl: _str(j['pageUrl']),
      );
}

class LibraryList {
  const LibraryList(this.items, this.kinds, this.states, this.maxBytes);
  final List<ResearchItem> items;

  /// (key, label), in the website's order.
  final List<(String, String)> kinds;
  final List<String> states;
  final int maxBytes;
}

class MineItem {
  const MineItem(this.id, this.title, this.kindLabel, this.status, this.statusLabel, this.reviewNote);
  final String id;
  final String title;
  final String kindLabel;
  final String status;
  final String statusLabel;
  final String? reviewNote;

  factory MineItem.fromJson(Map<String, dynamic> j) => MineItem(
        '${j['id']}',
        '${j['title'] ?? ''}',
        _str(j['kindLabel']) ?? '',
        '${j['status']}',
        _str(j['statusLabel']) ?? '${j['status']}',
        _str(j['review_note']),
      );
}

class StudyCard {
  const StudyCard({
    required this.title,
    required this.note,
    required this.kind,
    required this.url,
    this.read,
    this.library = false,
    this.photo,
    this.alt = '',
  });
  final String title;
  final String note;
  final String kind;
  final String url;

  /// The app's own reader (`/api/app/library/read/<read>`), or null.
  final String? read;

  /// The library itself.
  final bool library;
  final String? photo;
  final String alt;

  factory StudyCard.fromJson(Map<String, dynamic> j) => StudyCard(
        title: '${j['title'] ?? ''}',
        note: '${j['note'] ?? ''}',
        kind: '${j['kind'] ?? ''}',
        url: '${j['url'] ?? ''}',
        read: _str(j['read']),
        library: j['library'] == true,
        photo: _str(j['photo']),
        alt: '${j['alt'] ?? ''}',
      );
}

/// One block of a page, as the website's text gives it.
class PageBlock {
  const PageBlock(this.kind, {this.text = '', this.items = const [], this.rows = const []});

  /// h1, section, h3, h4, p, formula, ol, ul, table, hr.
  final String kind;
  final String text;
  final List<String> items;
  final List<List<String>> rows;

  factory PageBlock.fromJson(Map<String, dynamic> j) => PageBlock(
        '${j['kind']}',
        text: '${j['text'] ?? ''}',
        items: [for (final i in (j['items'] as List? ?? const [])) '$i'],
        rows: [
          for (final r in (j['rows'] as List? ?? const [])) [for (final c in (r as List)) '$c'],
        ],
      );
}

class CanalFigures {
  const CanalFigures(this.lengthKm, this.peakM, this.liftM, this.terminusAboveSourceM, this.sourceElevationM, this.profile);
  final num lengthKm;
  final num peakM;
  final num liftM;
  final num terminusAboveSourceM;
  final num sourceElevationM;

  /// (km along the route, ground elevation m).
  final List<(double, double)> profile;
}

class ReadPage {
  const ReadPage({
    required this.slug,
    required this.blocks,
    this.title = const [],
    this.note,
    this.caveat,
    this.canal,
    this.pageUrl,
  });
  final String slug;
  final List<PageBlock> blocks;
  final List<String> title;
  final String? note;
  final String? caveat;
  final CanalFigures? canal;
  final String? pageUrl;

  /// The numbered sections, for a table of contents: (block index, text).
  List<(int, String)> get sections => [
        for (var i = 0; i < blocks.length; i++)
          if (blocks[i].kind == 'section') (i, blocks[i].text),
      ];

  factory ReadPage.fromJson(Map<String, dynamic> j) {
    final c = j['canal'] == null ? null : _map(j['canal']);
    return ReadPage(
      slug: '${j['slug']}',
      blocks: [for (final b in _maps(j['blocks'])) PageBlock.fromJson(b)],
      title: [for (final t in (j['title'] as List? ?? const [])) '$t'],
      note: _str(j['note']),
      caveat: _str(j['caveat']),
      pageUrl: _str(j['pageUrl']),
      canal: c == null
          ? null
          : CanalFigures(
              (c['lengthKm'] as num?) ?? 0,
              (c['peakM'] as num?) ?? 0,
              (c['liftM'] as num?) ?? 0,
              (c['terminusAboveSourceM'] as num?) ?? 0,
              (c['sourceElevationM'] as num?) ?? 0,
              [
                for (final p in _maps(c['profile']))
                  (((p['km'] as num?) ?? 0).toDouble(), ((p['elevation'] as num?) ?? 0).toDouble()),
              ],
            ),
    );
  }
}

/// What the sender fills in, as the website's form.
class ResearchDraft {
  ResearchDraft({
    this.kind = 'feasibility',
    this.title = '',
    this.authors = '',
    this.institution = '',
    this.year = '',
    this.language = 'ar',
    this.crop = '',
    this.state = '',
    this.abstract = '',
    this.linkUrl = '',
    this.contact = '',
    this.consent = false,
    this.fileName,
    this.fileBytes,
  });

  String kind;
  String title;
  String authors;
  String institution;
  String year;
  String language;
  String crop;
  String state;
  String abstract;
  String linkUrl;
  String contact;
  bool consent;
  String? fileName;
  Uint8List? fileBytes;

  /// What the website's form refuses before sending (the server checks it all again with checkResearch).
  String? problem({int maxBytes = researchMaxBytes}) {
    final pdf = fileBytes;
    if (pdf != null && (pdf.length > maxBytes || !(fileName ?? '').toLowerCase().endsWith('.pdf'))) {
      return tr('الملفّ PDF حتى ٢٠ ميجابايت.', 'The file is a PDF of up to 20 MB.');
    }
    if (pdf == null && linkUrl.trim().isEmpty) return tr('أرفق ملفّ PDF أو ضع رابط العمل.', 'Attach a PDF or give a link to the work.');
    if (title.trim().length < 5) return tr('العنوان من ٥ أحرفٍ إلى ٢٠٠.', 'The title is from 5 to 200 characters.');
    if (authors.trim().length < 2) return tr('اكتب اسم المؤلّف أو المؤلّفين.', 'Write the name of the author or authors.');
    if (abstract.trim().length < 40) return tr('الملخّص من ٤٠ حرفاً إلى ٣٠٠٠: ما الذي درسته، وكيف، وماذا وجدت.', 'The abstract is from 40 to 3,000 characters: what you studied, how, and what you found.');
    if (!consent) return tr('أكّد أنّ لك حقّ مشاركة هذا العمل، أو أنّه منشورٌ للعموم.', 'Confirm that you have the right to share this work, or that it is published openly.');
    return null;
  }

  Map<String, dynamic> fields(String filePath) => {
        'step': 'submit',
        'lang': 'ar',
        'kind': kind,
        'title': title,
        'authors': authors,
        'institution': institution,
        'year': year,
        'language': language,
        'crop': crop,
        'state': state,
        'abstract': abstract,
        'link_url': linkUrl,
        'contact': contact,
        'file_path': filePath,
        'consent': consent,
      };
}

class LibraryApi {
  LibraryApi({
    http.Client? client,
    String? siteUrl,
    String? supabaseUrl,
    String? anonKey,
    AppCall? call,
    Future<String?> Function()? token,
  })  : _client = client ?? http.Client(),
        _site = siteUrl ?? ApiConfig.siteUrl,
        _supabase = supabaseUrl ?? ApiConfig.supabaseUrl,
        _anon = anonKey ?? ApiConfig.supabaseAnonKey,
        _call = call ?? accountController.call,
        _token = token ?? (() async => (await accountController.fresh())?.accessToken);

  final http.Client _client;
  final String _site;
  final String _supabase;
  final String _anon;
  final AppCall _call;
  final Future<String?> Function() _token;

  static const _timeout = Duration(seconds: 40);

  Future<Map<String, dynamic>> _get(String path, [Map<String, String>? query]) async {
    if (_site.isEmpty) throw ApiException(tr('التطبيق غير مضبوط للاتصال بالموقع.', 'The app is not set up to connect to the website.'));
    final uri = Uri.parse('$_site$path').replace(queryParameters: query == null || query.isEmpty ? null : query);
    late final http.Response res;
    try {
      res = await _client.get(uri, headers: langController.header).timeout(_timeout);
    } catch (_) {
      throw ApiException(tr('تعذّر الاتصال. تحقّق من الشبكة وأعد المحاولة.', 'Could not connect. Check the network and try again.'));
    }
    final j = _decode(res);
    if (res.statusCode != 200) {
      throw ApiException(_str(j['error']) ?? _str(j['message']) ?? tr('تعذّر التحميل (${res.statusCode}).', 'Could not load (${res.statusCode}).'));
    }
    return j;
  }

  static Map<String, dynamic> _decode(http.Response res) {
    try {
      return _map(jsonDecode(utf8.decode(res.bodyBytes)));
    } catch (_) {
      return const {};
    }
  }

  /// The published works, newest first, by kind and by words (as /library).
  Future<LibraryList> list({String? kind, String q = ''}) async {
    final j = await _get('/api/app/library', {
      if (kind != null && kind.isNotEmpty) 'kind': kind,
      if (q.trim().isNotEmpty) 'q': q.trim(),
    });
    return LibraryList(
      [for (final i in _maps(j['items'])) ResearchItem.fromJson(i)],
      [for (final k in _maps(j['kinds'])) ('${k['key']}', '${k['label']}')],
      [for (final s in (j['states'] as List? ?? const [])) '$s'],
      (j['maxBytes'] as num?)?.toInt() ?? researchMaxBytes,
    );
  }

  Future<ResearchItem> item(String id) async => ResearchItem.fromJson(await _get('/api/app/library/$id'));

  /// «ما أرسلتُه», as the signed-in person.
  Future<List<MineItem>> mine() async {
    final j = await _call('GET', '/api/app/library/mine');
    return [for (final m in _maps(j['items'])) MineItem.fromJson(m)];
  }

  Future<List<StudyCard>> studies() async {
    final j = await _get('/api/app/library/studies');
    return [for (final s in _maps(j['studies'])) StudyCard.fromJson(s)];
  }

  /// exchange-rate, arc-canal or guide.
  Future<ReadPage> read(String slug) async => ReadPage.fromJson(await _get('/api/app/library/read/$slug'));

  Future<Map<String, dynamic>> _research(Map<String, dynamic> body, String? token) async {
    late final http.Response res;
    try {
      res = await _client
          .post(
            Uri.parse('$_site/api/research'),
            headers: {
              'content-type': 'application/json',
              'authorization': ?(token == null ? null : 'Bearer $token'),
            },
            body: jsonEncode(body),
          )
          .timeout(_timeout);
    } catch (_) {
      throw ApiException(tr('تعذّر الاتصال. تحقّق من الشبكة وأعد المحاولة.', 'Could not connect. Check the network and try again.'));
    }
    final j = _decode(res);
    if (res.statusCode != 200 || j['ok'] != true) {
      throw ApiException(_str(j['message']) ?? tr('تعذّر الإرسال الآن، حاول بعد قليل.', 'Sending failed just now; try again shortly.'));
    }
    return j;
  }

  /// «شارك دراستك أو بحثك»: the website form's two steps. Nothing is published by being sent.
  Future<void> submit(ResearchDraft d, {int maxBytes = researchMaxBytes}) async {
    if (_site.isEmpty) throw ApiException(tr('التطبيق غير مضبوط للاتصال بالموقع.', 'The app is not set up to connect to the website.'));
    final problem = d.problem(maxBytes: maxBytes);
    if (problem != null) throw ApiException(problem);
    final token = await _token();

    var filePath = '';
    final pdf = d.fileBytes;
    if (pdf != null) {
      final slot = await _research({'step': 'upload', 'lang': 'ar'}, token);
      final path = _str(slot['path']);
      final uploadToken = _str(slot['token']);
      if (path == null || uploadToken == null || _supabase.isEmpty) {
        throw ApiException(tr('تعذّر تجهيز رفع الملفّ. حاول بعد قليل.', 'Could not prepare the upload. Try again shortly.'));
      }
      // As the browser's uploadToSignedUrl: the file itself, to the one path the server made, with its token.
      final uri = Uri.parse('$_supabase/storage/v1/object/upload/sign/research/$path')
          .replace(queryParameters: {'token': uploadToken});
      late final http.Response up;
      try {
        up = await _client
            .put(uri,
                headers: {
                  'apikey': _anon,
                  'authorization': 'Bearer $_anon',
                  'content-type': 'application/pdf',
                  'cache-control': 'max-age=3600',
                  'x-upsert': 'false',
                },
                body: pdf)
            .timeout(const Duration(minutes: 3));
      } catch (_) {
        throw ApiException(tr('تعذّر رفع الملفّ. تحقّق من الاتّصال وأعد المحاولة.', 'The upload failed. Check the connection and try again.'));
      }
      if (up.statusCode != 200) throw ApiException(tr('تعذّر رفع الملفّ. تحقّق من الاتّصال وأعد المحاولة.', 'The upload failed. Check the connection and try again.'));
      filePath = path;
    }
    await _research(d.fields(filePath), token);
  }
}
