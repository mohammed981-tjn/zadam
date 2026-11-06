/// التصدير في التطبيق (البند ٢٠٣): what the website's export file offers —
/// the product, then the destination (backlog 118), what that pair asks for
/// with each requirement's mode and the day it took effect, when its rules
/// were last checked and against what, and the reader's own offers with the
/// readiness the website computes for each.
///
/// Nothing is judged here. The requirement list and its review come from the
/// corridor's own rows (public, as on the website); the readiness — ready or
/// not, the score, which document is missing — is the database's
/// (`export_offer_readiness`), read through /api/app/export/offers. An offer
/// is saved as a draft through the same checks as the website's form.
library;

import 'package:http/http.dart' as http;

import 'account.dart';
import 'prices.dart' show arDay, siteJson;

num? _num(Object? v) => v is num ? v : (v is String ? num.tryParse(v) : null);
String _str(Object? v) => v is String ? v : (v == null ? '' : '$v');
String? _strOrNull(Object? v) => v is String && v.isNotEmpty ? v : null;
List<Map<String, dynamic>> _list(Object? v) =>
    v is List ? v.whereType<Map>().map((e) => e.cast<String, dynamic>()).toList() : const [];

// ── Products and destinations ───────────────────────────────────────────────

class Commodity {
  const Commodity({required this.id, required this.code, required this.label, required this.defaultUom, this.hsCode});
  final String id;
  final String code;
  final String label;
  final String defaultUom;
  final String? hsCode;

  factory Commodity.fromJson(Map<String, dynamic> j) => Commodity(
        id: _str(j['id']),
        code: _str(j['code']),
        label: _str(j['label']),
        defaultUom: _str(j['defaultUom']),
        hsCode: _strOrNull(j['hsCode']),
      );
}

class Destination {
  const Destination({required this.id, required this.code, required this.label, required this.group});
  final String id;
  final String code;
  final String label;

  /// The region heading it sits under, in the website's order.
  final String group;

  factory Destination.fromJson(Map<String, dynamic> j) =>
      Destination(id: _str(j['id']), code: _str(j['code']), label: _str(j['label']), group: _str(j['group']));
}

class ExportChoices {
  const ExportChoices({required this.commodities, required this.destinations, required this.studied, required this.grades, required this.uoms});
  final List<Commodity> commodities;
  final List<Destination> destinations;

  /// Requirements on record per pair, keyed "commodityId|destinationId".
  final Map<String, int> studied;
  final List<({String id, String commodityId, String name})> grades;
  final List<({String code, String name})> uoms;

  int? studiedCount(String commodityId, String destinationId) => studied['$commodityId|$destinationId'];

  /// The destinations under their region headings, in the order the server sent them.
  List<({String group, List<Destination> items})> get grouped {
    final out = <({String group, List<Destination> items})>[];
    for (final d in destinations) {
      if (out.isEmpty || out.last.group != d.group) out.add((group: d.group, items: <Destination>[]));
      out.last.items.add(d);
    }
    return out;
  }

  /// What the website's form says under the two choices, before saving.
  String pairNote(String commodityId, String destinationId) {
    final n = studiedCount(commodityId, destinationId);
    return n != null
        ? 'شروطُ هذه الوجهة لهذا المنتج مدروسة: $n مستنداتٍ.'
        : 'لم تُدرس شروطُ هذه الوجهة لهذا المنتج في المنصّة بعد — اسأل المصدّرَ المرخَّص عن مستنداتها.';
  }

  factory ExportChoices.fromJson(Map<String, dynamic> j) => ExportChoices(
        commodities: _list(j['commodities']).map(Commodity.fromJson).toList(),
        destinations: _list(j['destinations']).map(Destination.fromJson).toList(),
        studied: {
          for (final e in ((j['studied'] as Map?) ?? const {}).entries) '${e.key}': _num(e.value)?.toInt() ?? 0,
        },
        grades: [
          for (final g in _list(j['grades'])) (id: _str(g['id']), commodityId: _str(g['commodityId']), name: _str(g['name'])),
        ],
        uoms: [for (final u in _list(j['uoms'])) (code: _str(u['code']), name: _str(u['name']))],
      );
}

// ── What one pair asks for ──────────────────────────────────────────────────

class Requirement {
  const Requirement({required this.name, required this.mode, required this.modeLabel, required this.effectiveFrom, required this.standing, this.note, this.effectiveTo});
  final String name;
  final String? note;

  /// required · conditional · recommended.
  final String mode;
  final String modeLabel;
  final String effectiveFrom;
  final String? effectiveTo;

  /// in_force · upcoming (from the server, by Khartoum's date).
  final String standing;

  bool get required => mode == 'required';

  String get dateLine {
    final from = standing == 'upcoming' ? 'يسري من ${arDay(effectiveFrom)}' : 'ساري منذ ${arDay(effectiveFrom)}';
    return effectiveTo == null ? from : '$from حتى ${arDay(effectiveTo!)}';
  }

  factory Requirement.fromJson(Map<String, dynamic> j) => Requirement(
        name: _str(j['name']),
        note: _strOrNull(j['note']),
        mode: _str(j['mode']),
        modeLabel: _str(j['mode_label']),
        effectiveFrom: _str(j['effective_from']),
        effectiveTo: _strOrNull(j['effective_to']),
        standing: _str(j['standing']),
      );
}

/// When a corridor's rules were last checked — the line the website shows
/// beside the readiness, in its words.
class RulesStatus {
  const RulesStatus({required this.reviewDays, required this.stale, this.lastReviewedAt, this.daysSince, this.reviewedCount = 0, this.sourceNote});
  final DateTime? lastReviewedAt;
  final int reviewedCount;
  final int? daysSince;
  final int reviewDays;
  final bool stale;

  /// What it was checked against, as the reviewer wrote it (sources and links).
  final String? sourceNote;

  String get line {
    if (lastReviewedAt == null) return '⚠ قواعدُ هذا الممرّ لم تُراجَع بعد — تحقّق منها قبل الشحن.';
    return stale
        ? '⚠ قواعدُ هذا الممرّ لم تُراجَع منذ $daysSince يوماً — والحدُّ $reviewDays. قد تكون تغيّرت.'
        : 'قواعدُ هذا الممرّ رُوجعت قبل $daysSince يوماً.';
  }

  static RulesStatus? tryParse(Object? raw) {
    if (raw is! Map) return null;
    final j = raw.cast<String, dynamic>();
    return RulesStatus(
      lastReviewedAt: DateTime.tryParse(_str(j['last_reviewed_at'])),
      reviewedCount: _num(j['reviewed_count'])?.toInt() ?? 0,
      daysSince: _num(j['days_since'])?.toInt(),
      reviewDays: _num(j['review_days'])?.toInt() ?? 0,
      stale: j['stale'] == true,
      sourceNote: _strOrNull(j['source_note']),
    );
  }
}

class CorridorRules {
  const CorridorRules({required this.studied, required this.requirements, this.corridorId, this.rules});
  final String? corridorId;
  final bool studied;
  final List<Requirement> requirements;
  final RulesStatus? rules;

  List<Requirement> get inForce => requirements.where((r) => r.standing == 'in_force').toList();
  List<Requirement> get upcoming => requirements.where((r) => r.standing == 'upcoming').toList();

  factory CorridorRules.fromJson(Map<String, dynamic> j) => CorridorRules(
        corridorId: _strOrNull(j['corridor_id']),
        studied: j['studied'] == true,
        requirements: _list(j['requirements']).map(Requirement.fromJson).toList(),
        rules: RulesStatus.tryParse(j['rules']),
      );
}

// ── The reader's offers and their readiness ─────────────────────────────────

class Readiness {
  const Readiness({required this.verdict, required this.source, this.ready = false, this.score = 0, this.requiredTotal = 0, this.requiredMet = 0, this.missing = const [], this.sourceNote});
  final bool ready;
  final int score;
  final int requiredTotal;
  final int requiredMet;
  final List<String> missing;

  /// live · frozen · none («لم تُدرس»).
  final String source;
  final String verdict;
  final String? sourceNote;

  bool get unstudied => source == 'none';

  factory Readiness.fromJson(Map<String, dynamic> j) => Readiness(
        ready: j['ready'] == true,
        score: _num(j['score'])?.toInt() ?? 0,
        requiredTotal: _num(j['required_total'])?.toInt() ?? 0,
        requiredMet: _num(j['required_met'])?.toInt() ?? 0,
        missing: [for (final m in (j['missing'] as List? ?? const [])) '$m'],
        source: _strOrNull(j['source']) ?? 'none',
        verdict: _str(j['verdict']),
        sourceNote: _strOrNull(j['source_note']),
      );
}

class ReadinessLine {
  const ReadinessLine({required this.name, required this.modeLabel, required this.satisfied, this.note});
  final String name;
  final String? note;
  final String modeLabel;
  final bool satisfied;

  factory ReadinessLine.fromJson(Map<String, dynamic> j) => ReadinessLine(
        name: _str(j['name']),
        note: _strOrNull(j['note']),
        modeLabel: _str(j['mode_label']),
        satisfied: j['satisfied'] == true,
      );
}

/// The moves the website's buttons offer for each status, in its words.
const offerMoves = <String, List<({String to, String label})>>{
  'draft': [(to: 'submitted', label: 'أرسل للمراجعة'), (to: 'withdrawn', label: 'اسحب')],
  'submitted': [(to: 'draft', label: 'أعده مسوّدة')],
  'rejected': [(to: 'draft', label: 'أصلحه وأعده مسوّدة')],
};

class MyOffer {
  const MyOffer({
    required this.id,
    required this.reference,
    required this.quantity,
    required this.uom,
    required this.value,
    required this.status,
    required this.statusLabel,
    required this.statusHelp,
    required this.readiness,
    required this.lines,
    this.commodity,
    this.destination,
    this.rejectionReason,
    this.rules,
  });

  final String id;
  final String reference;
  final String? commodity;
  final String? destination;
  final String quantity;
  final String uom;
  final String value;
  final String status;
  final String statusLabel;
  final String statusHelp;
  final String? rejectionReason;
  final Readiness readiness;
  final List<ReadinessLine> lines;
  final RulesStatus? rules;

  List<({String to, String label})> get moves => offerMoves[status] ?? const [];

  factory MyOffer.fromJson(Map<String, dynamic> j) => MyOffer(
        id: _str(j['id']),
        reference: _str(j['reference']),
        commodity: _strOrNull(j['commodity']),
        destination: _strOrNull(j['destination']),
        quantity: _str(j['quantity']),
        uom: _str(j['uom']),
        value: _str(j['value']),
        status: _str(j['status']),
        statusLabel: _str(j['status_label']),
        statusHelp: _str(j['status_help']),
        rejectionReason: _strOrNull(j['rejection_reason']),
        readiness: Readiness.fromJson(((j['readiness'] as Map?) ?? const {}).cast<String, dynamic>()),
        lines: _list(j['lines']).map(ReadinessLine.fromJson).toList(),
        rules: RulesStatus.tryParse(j['rules']),
      );
}

// ── Saving an offer ─────────────────────────────────────────────────────────

/// A decimal with at most [scale] places and greater than zero — the website's
/// `parseDecimal` shape (no exponent, no sign).
bool positiveDecimal(String s, int scale) {
  final m = RegExp(r'^(\d+)(?:\.(\d+))?$').firstMatch(s.trim());
  if (m == null) return false;
  if ((m[2]?.length ?? 0) > scale) return false;
  return double.parse(s.trim()) > 0;
}

bool _coordinate(String s) => RegExp(r'^-?\d+(?:\.\d{1,6})?$').hasMatch(s.trim());

class OfferDraft {
  OfferDraft({
    this.commodityId = '',
    this.destinationId = '',
    this.quantity = '',
    this.unitPrice = '',
    this.uom = '',
    this.gradeId = '',
    this.plotRef = '',
    this.areaHectares = '',
    this.latitude = '',
    this.longitude = '',
    this.boundary = '',
  });

  String commodityId;
  String destinationId;
  String quantity;
  String unitPrice;
  String uom;
  String gradeId;
  String plotRef;
  String areaHectares;
  String latitude;
  String longitude;
  String boundary;

  /// The website form's checks, in its order and words. The server makes them
  /// again, and the database holds the boundary.
  String? get problem {
    if (commodityId.isEmpty || destinationId.isEmpty) return 'اختر المنتج والوجهة.';
    if (!positiveDecimal(quantity, 4) || !positiveDecimal(unitPrice, 2)) {
      return 'الكمّية والسعر يجب أن يكونا رقمين أكبر من صفر — الكمّية بأربع خانات عشرية على الأكثر، والسعر بخانتين.';
    }
    if (plotRef.trim().isEmpty) return 'اسم القطعة أو رقمها مطلوب.';
    if (!_coordinate(latitude) || !_coordinate(longitude)) {
      return 'الإحداثيّة مطلوبة، رقماً عشرياً — مثال: 13.183333 و30.216667.';
    }
    final area = double.tryParse(areaHectares.trim());
    if (area != null && area >= 4 && boundary.trim().isEmpty) {
      return 'القطعة أكبر من أربعة هكتارات، واللائحة الأوروبية تطلب لها مضلَّع حدودٍ كاملاً لا نقطةً واحدة.';
    }
    return null;
  }

  Map<String, dynamic> toJson() => {
        'commodity_id': commodityId,
        'destination_id': destinationId,
        'quantity': quantity.trim(),
        'unit_price': unitPrice.trim(),
        if (uom.isNotEmpty) 'uom_code': uom,
        if (gradeId.isNotEmpty) 'grade_id': gradeId,
        'plot_ref': plotRef.trim(),
        'area_hectares': areaHectares.trim(),
        'latitude': latitude.trim(),
        'longitude': longitude.trim(),
        'boundary': boundary.trim(),
      };
}

// ── The study: «ممرّ الصادر السوداني», the website's /export ─────────────────

class StudySource {
  const StudySource(this.label, this.url);
  final String label;
  final String url;

  factory StudySource.fromJson(Object? raw) {
    final j = raw is Map ? raw.cast<String, dynamic>() : const <String, dynamic>{};
    return StudySource(_str(j['label']), _str(j['url']));
  }
}

class ExportStudy {
  const ExportStudy({
    required this.headline,
    required this.rejectionPoints,
    required this.rejectionSource,
    required this.commodities,
    required this.commoditiesSource,
    required this.beyond,
    required this.gates,
    required this.moneyKnot,
    required this.moneyKnotSource,
    required this.deadlines,
    required this.limits,
  });

  final List<({String value, String label, String? note, StudySource source})> headline;
  final List<String> rejectionPoints;
  final StudySource rejectionSource;
  final List<({String name, String? share, String markets, String gate})> commodities;
  final StudySource commoditiesSource;
  final List<String> beyond;
  final List<({String n, String title, List<String> body, String holder, StudySource source})> gates;
  final List<String> moneyKnot;
  final StudySource moneyKnotSource;

  /// The coming regulations, each with the day it takes effect and its source.
  final List<({String what, String when, String asks, String effect, StudySource source})> deadlines;
  final List<({String title, String body, StudySource source})> limits;

  static List<String> _strings(Object? v) => [for (final s in (v as List? ?? const [])) '$s'];

  factory ExportStudy.fromJson(Map<String, dynamic> j) {
    final rejection = ((j['rejection'] as Map?) ?? const {}).cast<String, dynamic>();
    final knot = ((j['money_knot'] as Map?) ?? const {}).cast<String, dynamic>();
    return ExportStudy(
      headline: [
        for (final f in _list(j['headline']))
          (value: _str(f['value']), label: _str(f['label']), note: _strOrNull(f['note']), source: StudySource.fromJson(f['source'])),
      ],
      rejectionPoints: _strings(rejection['points']),
      rejectionSource: StudySource.fromJson(rejection['source']),
      commodities: [
        for (final c in _list(j['commodities']))
          (name: _str(c['name']), share: _strOrNull(c['share']), markets: _str(c['markets']), gate: _str(c['gate'])),
      ],
      commoditiesSource: StudySource.fromJson(j['commodities_source']),
      beyond: _strings(j['beyond']),
      gates: [
        for (final g in _list(j['gates']))
          (n: _str(g['n']), title: _str(g['title']), body: _strings(g['body']), holder: _str(g['holder']), source: StudySource.fromJson(g['source'])),
      ],
      moneyKnot: _strings(knot['paragraphs']),
      moneyKnotSource: StudySource.fromJson(knot['source']),
      deadlines: [
        for (final d in _list(j['deadlines']))
          (what: _str(d['what']), when: _str(d['when']), asks: _str(d['asks']), effect: _str(d['effect']), source: StudySource.fromJson(d['source'])),
      ],
      limits: [
        for (final l in _list(j['limits'])) (title: _str(l['title']), body: _str(l['body']), source: StudySource.fromJson(l['source'])),
      ],
    );
  }
}

// ── The client ──────────────────────────────────────────────────────────────

class ExportClient {
  ExportClient({this.client, this.siteUrl});

  /// A stand-in transport and site for tests; the app's own otherwise.
  final http.Client? client;
  final String? siteUrl;

  Future<ExportChoices> choices() async =>
      ExportChoices.fromJson(await siteJson('/api/app/export', client: client, siteUrl: siteUrl));

  Future<CorridorRules> corridor(String commodityId, String destinationId) async => CorridorRules.fromJson(
        await siteJson(
          '/api/app/export?commodity=${Uri.encodeQueryComponent(commodityId)}&destination=${Uri.encodeQueryComponent(destinationId)}',
          client: client,
          siteUrl: siteUrl,
        ),
      );

  Future<ExportStudy> study() async =>
      ExportStudy.fromJson(await siteJson('/api/app/export/study', client: client, siteUrl: siteUrl));

  bool get signedIn => accountController.value != null;

  Future<List<MyOffer>> offers() async {
    final body = await accountController.call('GET', '/api/app/export/offers');
    return _list(body['offers']).map(MyOffer.fromJson).toList();
  }

  /// Saves the draft; returns the website's confirmation sentence.
  Future<String> saveOffer(OfferDraft draft) async {
    final body = await accountController.call('POST', '/api/app/export/offers', body: draft.toJson());
    return body['message'] as String? ?? 'حُفظ العرض مسوّدة.';
  }

  Future<String> move(String id, String to) async {
    final body = await accountController.call('POST', '/api/app/export/offers/move', body: {'id': id, 'to': to});
    return body['message'] as String? ?? 'تغيّرت حالة العرض.';
  }
}
