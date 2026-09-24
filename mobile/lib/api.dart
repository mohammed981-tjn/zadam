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

/// Raised for anything the caller should show the user rather than swallow.
class ApiException implements Exception {
  ApiException(this.message);
  final String message;
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
      throw ApiException('التطبيق غير مضبوط للاتصال بالخادم.');
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
      throw ApiException('تعذّر الاتصال. تحقّق من الشبكة وأعد المحاولة.');
    }

    if (res.statusCode != 200) {
      throw ApiException('تعذّر تحميل البيانات (${res.statusCode}).');
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
      'crop': mining ? 'eq.تعدين' : 'neq.تعدين',
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
      throw ApiException('المساعد غير مضبوط في هذه النسخة من التطبيق.');
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
      throw ApiException('تعذّر الوصول للمساعد. تحقّق من الشبكة.');
    }

    final body = jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>;

    // The route answers 429 and 503 with a message written for the reader, so
    // showing its text beats replacing it with a status code.
    if (res.statusCode != 200) {
      throw ApiException(
        body['error'] as String? ?? 'تعذّر الحصول على إجابة (${res.statusCode}).',
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
      throw ApiException('خريطة الأمطار غير مضبوطة في هذه النسخة من التطبيق.');
    }

    late final http.Response res;
    try {
      res = await _client
          .get(Uri.parse('${ApiConfig.siteUrl}/api/rain'))
          .timeout(_timeout);
    } catch (_) {
      throw ApiException('تعذّر الاتصال. تحقّق من الشبكة وأعد المحاولة.');
    }

    // A proxy or an error page can answer with HTML; that is a failed load,
    // not a crash.
    try {
      final body =
          jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>;
      if (res.statusCode != 200) {
        throw ApiException(
          body['error'] as String? ?? 'تعذّر تحميل التوقّع (${res.statusCode}).',
        );
      }
      return RainGrid.fromJson(body);
    } on ApiException {
      rethrow;
    } catch (_) {
      throw ApiException('تعذّر تحميل التوقّع (${res.statusCode}).');
    }
  }

  /// Everything the النفير screen shows, in parallel reads. Every table here
  /// is world-readable by policy; nothing needs a session.
  Future<NafirBoard> nafirBoard() async {
    final results = await Future.wait([
      _get('nafir_calls', {
        'select': '*',
        'status': 'eq.open',
        'order': 'starts_on.asc',
        'limit': '30',
      }),
      _get('nafir_calls', {
        'select': '*',
        'status': 'eq.done',
        'order': 'closed_at.desc',
        'limit': '10',
      }),
      _get('faza_requests', {
        'select': '*',
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
