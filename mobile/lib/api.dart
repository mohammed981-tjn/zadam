/// Talking to the same backend the website talks to.
///
/// Two different endpoints for two different reasons. Knowledge entries come
/// straight from Supabase over PostgREST, because they are world-readable by
/// policy and going through the web app would only add a hop. The assistant
/// goes through the Next.js route instead of calling any model directly,
/// because that route is where the retrieval, the rate limit, the answer cache
/// and the local resolvers live — duplicating that here would mean maintaining
/// the assistant twice and getting a worse one.
///
/// Configuration comes from --dart-define at build time. Nothing here is a
/// secret: the anon key is publishable by design and every table it can reach
/// is protected by row-level security on the server, which is the only place
/// protection means anything.
library;

import 'dart:convert';
import 'package:http/http.dart' as http;

import 'i18n.dart';
import 'nafir.dart';
import 'rain_map.dart';

class ApiConfig {
  static const supabaseUrl = String.fromEnvironment('SUPABASE_URL');
  static const supabaseAnonKey = String.fromEnvironment('SUPABASE_ANON_KEY');

  /// Where the deployed Next.js app lives, for the assistant route.
  static const siteUrl = String.fromEnvironment('SITE_URL');

  static bool get isConfigured =>
      supabaseUrl.isNotEmpty && supabaseAnonKey.isNotEmpty;

  static bool get hasAssistant => siteUrl.isNotEmpty;
}

class KnowledgeEntry {
  const KnowledgeEntry({
    required this.crop,
    required this.topic,
    required this.title,
    required this.content,
    this.sourceCountry,
    this.sourceNote,
  });

  final String crop;
  final String topic;
  final String title;
  final String content;
  final String? sourceCountry;
  final String? sourceNote;

  factory KnowledgeEntry.fromJson(Map<String, dynamic> json) => KnowledgeEntry(
        crop: json['crop'] as String? ?? '',
        topic: json['topic'] as String? ?? '',
        title: json['title'] as String? ?? '',
        content: json['content'] as String? ?? '',
        sourceCountry: json['source_country'] as String?,
        sourceNote: json['source_note'] as String?,
      );
}

/// An investment opportunity as the landing page shows it.
class Project {
  const Project({
    required this.name,
    required this.location,
    required this.description,
    this.totalFeddans,
    this.pricePerShare,
    this.expectedAnnualReturn,
    this.riskLevel,
  });

  final String name;
  final String location;
  final String description;
  final num? totalFeddans;
  final num? pricePerShare;
  final num? expectedAnnualReturn;
  final String? riskLevel;

  factory Project.fromJson(Map<String, dynamic> json) => Project(
        name: json['name'] as String? ?? '',
        location: json['location'] as String? ?? '',
        description: json['description'] as String? ?? '',
        totalFeddans: json['total_feddans'] as num?,
        pricePerShare: json['price_per_share'] as num?,
        expectedAnnualReturn: json['expected_annual_return'] as num?,
        riskLevel: json['risk_level'] as String?,
      );
}

/// One item of «جديد سوداقري», as the website's /news page shows it.
class NewsItem {
  const NewsItem({
    required this.title,
    required this.body,
    required this.publishedAt,
    this.summary,
    this.linkPath,
    this.linkLabel,
  });

  final String title;
  final String body;
  final DateTime publishedAt;
  final String? summary;

  /// A page on the website the item points to, e.g. /arc-canal.
  final String? linkPath;
  final String? linkLabel;

  factory NewsItem.fromJson(Map<String, dynamic> json) => NewsItem(
        title: json['title'] as String? ?? '',
        body: json['body'] as String? ?? '',
        publishedAt:
            DateTime.tryParse(json['published_at'] as String? ?? '') ??
                DateTime.now(),
        summary: json['summary'] as String?,
        linkPath: json['link_path'] as String?,
        linkLabel: json['link_label'] as String?,
      );
}

/// Raised for anything the caller should show the user rather than swallow.
class ApiException implements Exception {
  ApiException(this.message, {this.status});
  final String message;

  /// The HTTP status of the route's answer, when there was one: a 5xx with the route's own words (a 503 that says the
  /// book could not be reached) is still an outage, not a refusal of the form (backlog 209).
  final int? status;
  @override
  String toString() => message;
}

class SudagriApi {
  SudagriApi({http.Client? client}) : _client = client ?? http.Client();

  final http.Client _client;

  static const _timeout = Duration(seconds: 30);

  /// One PostgREST read, with the two failures a caller actually needs to tell
  /// apart: the network never answered, and the server refused.
  Future<List<Map<String, dynamic>>> _get(
    String table,
    Map<String, String> params,
  ) async {
    if (!ApiConfig.isConfigured) {
      throw ApiException(tr('التطبيق غير مضبوط للاتصال بالخادم.', 'The app is not set up to connect to the server.'));
    }

    final uri = Uri.parse('${ApiConfig.supabaseUrl}/rest/v1/$table')
        .replace(queryParameters: params);

    late final http.Response res;
    try {
      res = await _client.get(uri, headers: {
        'apikey': ApiConfig.supabaseAnonKey,
        'authorization': 'Bearer ${ApiConfig.supabaseAnonKey}',
      }).timeout(_timeout);
    } catch (_) {
      throw ApiException(tr('تعذّر الاتصال. تحقّق من الشبكة وأعد المحاولة.', 'Could not connect. Check the network and try again.'));
    }

    if (res.statusCode != 200) {
      throw ApiException(tr('تعذّر تحميل البيانات (${res.statusCode}).', 'Could not load the data (${res.statusCode}).'));
    }

    return (jsonDecode(utf8.decode(res.bodyBytes)) as List<dynamic>)
        .cast<Map<String, dynamic>>();
  }

  /// The projects the landing page lists.
  ///
  /// Mirrors the website's filter exactly: drafts are excluded, because a draft
  /// is a project whose documentation is not finished, and the platform's whole
  /// claim is that nothing is shown before it is verified.
  Future<List<Project>> projects() async {
    final rows = await _get('projects', {
      'select':
          'name,location,description,total_feddans,price_per_share,expected_annual_return,risk_level',
      'status': 'neq.draft',
      'order': 'created_at.desc',
    });
    return rows.map((e) => Project.fromJson(e)).toList();
  }

  /// The news, newest first. Row-level security returns only what is
  /// published and whose moment has come — the same rows the website's /news
  /// page reads, so a scheduled item appears in both at once.
  Future<List<NewsItem>> news() async {
    final rows = await _get('announcements', {
      'select': 'title,summary,body,link_path,link_label,published_at',
      'published_at': 'not.is.null',
      'order': 'published_at.desc',
      'limit': '50',
    });
    return rows.map((e) => NewsItem.fromJson(e)).toList();
  }

  /// The published knowledge entries.
  ///
  /// Deliberately mirrors the website's filter: assistant_only entries are
  /// regional reference material for the assistant to read, not a reading list
  /// to put in front of a farmer, and showing them here would bury the
  /// Sudan-specific ones under thirty foreign entries.
  Future<List<KnowledgeEntry>> knowledge({
    String? search,
    int limit = 200,
    /// Mining lives in its own section on the website — mixing it into the
    /// agricultural feed is what confuses a visitor who came for one of the two.
    bool mining = false,
  }) async {
    final params = <String, String>{
      'select': 'crop,topic,title,content,source_country,source_note',
      'assistant_only': 'eq.false',
      'crop': mining ? 'eq.تعدين' : 'neq.تعدين', // ar-only
      'order': 'created_at.desc',
      'limit': '$limit',
    };

    if (search != null && search.trim().isNotEmpty) {
      // PostgREST treats a comma as the or() separator, so a comma inside the
      // pattern would be read as another condition and silently change the
      // query. Stripping it is enough here because the rest of the pattern is
      // percent-encoded by Uri.
      // Parentheses are stripped for the same reason: they open and close the
      // or() group, so a stray one ends the filter early and the query fails.
      final safe = search.trim().replaceAll(RegExp(r'[,()]'), ' ');
      params['or'] = '(title.ilike.*$safe*,content.ilike.*$safe*,crop.ilike.*$safe*)';
    }

    final rows = await _get('knowledge_entries', params);
    return rows.map((e) => KnowledgeEntry.fromJson(e)).toList();
  }

  /// Asks the assistant, returning its answer and which engine produced it.
  Future<({String answer, String source})> ask(String question) async {
    if (!ApiConfig.hasAssistant) {
      throw ApiException(tr('المساعد غير مضبوط في هذه النسخة من التطبيق.', 'The assistant is not set up in this version of the app.'));
    }

    late final http.Response res;
    try {
      res = await _client
          .post(
            Uri.parse('${ApiConfig.siteUrl}/api/assistant'),
            headers: {'content-type': 'application/json'},
            body: jsonEncode({'question': question}),
          )
          .timeout(_timeout);
    } catch (_) {
      throw ApiException(tr('تعذّر الوصول للمساعد. تحقّق من الشبكة.', 'Could not reach the assistant. Check the network.'));
    }

    final body = jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>;

    // The route answers 429 and 503 with a message written for the reader, so
    // showing its text beats replacing it with a status code.
    if (res.statusCode != 200) {
      throw ApiException(
        body['error'] as String? ?? tr('تعذّر الحصول على إجابة (${res.statusCode}).', 'Could not get an answer (${res.statusCode}).'),
      );
    }

    return (
      answer: body['answer'] as String? ?? '',
      source: body['source'] as String? ?? 'model',
    );
  }

  /// The week's rain map, from the website so both draw the same grid.
  Future<RainGrid> rain() async {
    if (ApiConfig.siteUrl.isEmpty) {
      throw ApiException(tr('خريطة الأمطار غير مضبوطة في هذه النسخة من التطبيق.', 'The rain map is not set up in this version of the app.'));
    }

    late final http.Response res;
    try {
      res = await _client
          .get(Uri.parse('${ApiConfig.siteUrl}/api/rain'))
          .timeout(_timeout);
    } catch (_) {
      throw ApiException(tr('تعذّر الاتصال. تحقّق من الشبكة وأعد المحاولة.', 'Could not connect. Check the network and try again.'));
    }

    // A proxy or an error page can answer with HTML; that is a failed load,
    // not a crash.
    try {
      final body =
          jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>;
      if (res.statusCode != 200) {
        throw ApiException(
          body['error'] as String? ?? tr('تعذّر تحميل التوقّع (${res.statusCode}).', 'Could not load the forecast (${res.statusCode}).'),
        );
      }
      return RainGrid.fromJson(body);
    } on ApiException {
      rethrow;
    } catch (_) {
      throw ApiException(tr('تعذّر تحميل التوقّع (${res.statusCode}).', 'Could not load the forecast (${res.statusCode}).'));
    }
  }

  /// The columns NafirCall and FazaRequest read, by name.
  ///
  /// A visitor holds SELECT on named columns of these tables, not on the
  /// tables (backlog 132, supabase/migrations/20261022050000_visitor_columns.sql):
  /// the organiser's account id is withheld. So `select=*` is refused outright
  /// for every reader of this screen — the app has no sign-in — and it was,
  /// from the day that migration was applied until these lists replaced it.
  /// scripts/verify-visitor-columns.ts holds every select in this file to the
  /// grant.
  static const _nafirCallColumns =
      'id,display_name,kind,title,description,state,locality,starts_on,needed,'
      'hosting,bring_tools,outcome,attended';
  static const _fazaColumns =
      'id,display_name,cause,title,description,state,locality,needs';

  /// Everything the النفير screen shows, in parallel reads. Every table here
  /// is world-readable by policy; nothing needs a session.
  Future<NafirBoard> nafirBoard() async {
    final results = await Future.wait([
      _get('nafir_calls', {
        'select': _nafirCallColumns,
        'status': 'eq.open',
        'order': 'starts_on.asc',
        'limit': '30',
      }),
      _get('nafir_calls', {
        'select': _nafirCallColumns,
        'status': 'eq.done',
        'order': 'closed_at.desc',
        'limit': '10',
      }),
      _get('faza_requests', {
        'select': _fazaColumns,
        'status': 'eq.open',
        'order': 'created_at.desc',
        'limit': '20',
      }),
      _get('nafir_joins', {'select': 'call_id'}),
    ]);

    final joined = <String, int>{};
    for (final j in results[3]) {
      final id = j['call_id'] as String;
      joined[id] = (joined[id] ?? 0) + 1;
    }

    NafirIndicators? indicators;
    try {
      final res = await _client
          .post(
            Uri.parse('${ApiConfig.supabaseUrl}/rest/v1/rpc/nafir_indicators'),
            headers: {
              'apikey': ApiConfig.supabaseAnonKey,
              'authorization': 'Bearer ${ApiConfig.supabaseAnonKey}',
              'content-type': 'application/json',
            },
            body: '{}',
          )
          .timeout(_timeout);
      if (res.statusCode == 200) {
        final rows = jsonDecode(utf8.decode(res.bodyBytes)) as List<dynamic>;
        if (rows.isNotEmpty) {
          indicators =
              NafirIndicators.fromJson(rows.first as Map<String, dynamic>);
        }
      }
    } catch (_) {
      // The board is useful without the numbers; a failed count is not a
      // failed screen.
    }

    return NafirBoard(
      open: results[0].map(NafirCall.fromJson).toList(),
      done: results[1].map(NafirCall.fromJson).toList(),
      faza: results[2].map(FazaRequest.fromJson).toList(),
      joined: joined,
      indicators: indicators,
    );
  }

  void dispose() => _client.close();
}
