/// دراسة الجدوى المرحلية والخطّة في التطبيق (البند ٢٠٣).
///
/// The website's /tools/feasibility computes the study in the browser with
/// `phasedFeasibility`, `irrigationAdvice`, `estimateCostPerFeddan` and
/// `summariseRisks` from src/lib. None of those is mirrored in Dart (only the
/// FAO-56 water engine is, in agronomy.dart, for use with no signal), so this
/// file does no arithmetic of the study at all: it sends the inputs to
/// /api/app/feasibility, which answers with those same functions, and keeps the
/// answer as it came. The phone and the page cannot disagree about a number.
///
/// The other two steps are the website's too: «حوّلها إلى مشروع» (the input list
/// in «مشروعي», /api/app/feasibility/project) and «تخطيط الاستثمار» (/plan, the
/// suggested split across open projects, /api/app/plan) — both as the signed-in
/// person, through the account's one request helper.
library;

import 'dart:convert';

import 'package:http/http.dart' as http;

import 'account.dart';
import 'api.dart';
import 'i18n.dart';

/// A signed-in request: `accountController.call`, or a stand-in in tests.
typedef AppCall = Future<Map<String, dynamic>> Function(
  String method,
  String path, {
  Map<String, dynamic>? body,
});

Map<String, dynamic> _map(Object? v) => (v as Map?)?.cast<String, dynamic>() ?? const {};
List<Map<String, dynamic>> _maps(Object? v) => [for (final x in (v as List? ?? const [])) _map(x)];
double? _num(Object? v) => v is num ? v.toDouble() : null;
String? _str(Object? v) => v is String ? v : null;

/// A whole number with thousands separators, as the website writes it.
String n0(num? v) {
  if (v == null || !v.isFinite) return '—';
  final r = v.round();
  final s = r.abs().toString();
  final b = StringBuffer();
  for (var i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 == 0) b.write(',');
    b.write(s[i]);
  }
  return r < 0 ? '−$b' : b.toString();
}

/// Dollars as the page shows them: «1,234 $».
String usd(num? v) => v == null ? '—' : '${n0(v)} \$';

// ── What may be chosen ────────────────────────────────────────────────────────

class Choice {
  const Choice(this.key, this.label, {this.group = '', this.hasInputs = false});
  final String key;
  final String label;
  final String group;
  final bool hasInputs;
}

class Source {
  const Source(this.label, this.url);
  final String label;
  final String url;
  static Source fromJson(Map<String, dynamic> j) => Source(_str(j['label']) ?? '', _str(j['url']) ?? '');
}

class RiskInfo {
  const RiskInfo({
    required this.key,
    required this.name,
    required this.reserve,
    required this.basis,
    required this.treatment,
    required this.services,
    required this.sources,
  });
  final String key;
  final String name;

  /// A sum held back (the borehole), not a share of the harvest.
  final bool reserve;
  final String? basis;
  final String treatment;
  final List<String> services;
  final List<Source> sources;
}

/// What the farmer has set for one risk; sent back with every study.
class RiskSetting {
  RiskSetting({required this.key, required this.applies, this.everyYears, this.lossPct, this.reserveUsd});
  final String key;
  bool applies;
  double? everyYears;
  double? lossPct;
  double? reserveUsd;

  factory RiskSetting.fromJson(Map<String, dynamic> j) => RiskSetting(
        key: _str(j['key']) ?? '',
        applies: j['applies'] == true,
        everyYears: _num(j['everyYears']),
        lossPct: _num(j['lossPct']),
        reserveUsd: _num(j['reserveUsd']),
      );

  RiskSetting copy() =>
      RiskSetting(key: key, applies: applies, everyYears: everyYears, lossPct: lossPct, reserveUsd: reserveUsd);

  Map<String, dynamic> toJson() =>
      {'key': key, 'applies': applies, 'everyYears': everyYears, 'lossPct': lossPct, 'reserveUsd': reserveUsd};
}

class NewCropInfo {
  const NewCropInfo({
    required this.key,
    required this.name,
    required this.inStudy,
    required this.evidence,
    this.caution,
    required this.sources,
  });
  final String key;
  final String name;
  final bool inStudy;
  final String evidence;
  final String? caution;
  final List<Source> sources;
}

class StudyOptions {
  StudyOptions({
    required this.crops,
    required this.stations,
    required this.months,
    required this.methods,
    required this.defaults,
    required this.risks,
    required this.riskDefaults,
    required this.newCrops,
  });

  final List<Choice> crops;
  final List<Choice> stations;
  final List<String> months;
  final List<Choice> methods;
  final Map<String, dynamic> defaults;
  final List<RiskInfo> risks;
  final List<RiskSetting> riskDefaults;
  final List<NewCropInfo> newCrops;

  factory StudyOptions.fromJson(Map<String, dynamic> j) => StudyOptions(
        crops: [
          for (final c in _maps(j['crops']))
            Choice(_str(c['key']) ?? '', _str(c['name']) ?? '',
                group: _str(c['group']) ?? 'sudan', hasInputs: c['hasInputs'] == true),
        ],
        stations: [for (final s in _maps(j['stations'])) Choice(_str(s['key']) ?? '', _str(s['name']) ?? '')],
        months: [for (final m in (j['months'] as List? ?? const [])) '$m'],
        methods: [for (final m in _maps(j['methods'])) Choice(_str(m['key']) ?? '', _str(m['label']) ?? '')],
        defaults: _map(j['defaults']),
        risks: [
          for (final r in _maps(j['risks']))
            RiskInfo(
              key: _str(r['key']) ?? '',
              name: _str(r['name']) ?? '',
              reserve: r['reserve'] == true,
              basis: _str(r['basis']),
              treatment: _str(r['treatment']) ?? '',
              services: [for (final s in (r['services'] as List? ?? const [])) '$s'],
              sources: [for (final s in _maps(r['sources'])) Source.fromJson(s)],
            ),
        ],
        riskDefaults: [for (final r in _maps(j['riskDefaults'])) RiskSetting.fromJson(r)],
        newCrops: [
          for (final c in _maps(j['newCrops']))
            NewCropInfo(
              key: _str(c['key']) ?? '',
              name: _str(c['name']) ?? '',
              inStudy: c['inStudy'] == true,
              evidence: _str(c['evidence']) ?? '',
              caution: _str(c['caution']),
              sources: [for (final s in _maps(c['sources'])) Source.fromJson(s)],
            ),
        ],
      );
}

/// The inputs as the farmer sets them, opening on the website's defaults.
class StudyInputs {
  StudyInputs({
    required this.crop,
    required this.station,
    required this.plantingMonth,
    required this.method,
    required this.feddans,
    required this.costPerFeddan,
    required this.waterTariff,
    this.manualPrice = '',
    this.sprays = 0,
    this.sprayUsd = 0,
    required this.risks,
  });

  String crop;
  String station;
  int plantingMonth;
  String method;
  double feddans;
  double costPerFeddan;
  double waterTariff;

  /// As typed; empty means «use the reference price».
  String manualPrice;
  double sprays;
  double sprayUsd;
  List<RiskSetting> risks;

  factory StudyInputs.fromOptions(StudyOptions o, {String? crop}) {
    final d = o.defaults;
    final wanted = crop != null && o.crops.any((c) => c.key == crop) ? crop : _str(d['crop']) ?? 'sorghum';
    return StudyInputs(
      crop: wanted,
      station: _str(d['station']) ?? 'gezira',
      plantingMonth: (_num(d['plantingMonth']) ?? 5).toInt(),
      method: _str(d['method']) ?? 'flood',
      feddans: _num(d['feddans']) ?? 50,
      costPerFeddan: _num(d['costPerFeddan']) ?? 120,
      waterTariff: _num(d['waterTariff']) ?? 0,
      risks: [for (final r in o.riskDefaults) r.copy()],
    );
  }

  Map<String, dynamic> toJson() => {
        'crop': crop,
        'station': station,
        'plantingMonth': plantingMonth,
        'method': method,
        'feddans': feddans,
        'costPerFeddan': costPerFeddan,
        'waterTariff': waterTariff,
        'manualPrice': manualPrice,
        'sprays': sprays,
        'sprayUsd': sprayUsd,
        'risks': [for (final r in risks) r.toJson()],
      };
}

// ── The study, as the server computed it ─────────────────────────────────────

class Phase {
  const Phase({
    required this.stage,
    required this.name,
    required this.cost,
    required this.cumulativeCost,
    required this.cumulativeShare,
    required this.breakEvenKgPerHa,
    required this.verdict,
    required this.verdictLabel,
    required this.lastSafeExit,
  });
  final String stage;
  final String name;
  final double cost;
  final double cumulativeCost;
  final double cumulativeShare;
  final double? breakEvenKgPerHa;
  final String verdict;
  final String verdictLabel;
  final bool lastSafeExit;
}

class MethodRow {
  const MethodRow(this.method, this.label, this.suitability, this.tooSmall, this.m3PerFeddan);
  final String method;
  final String label;
  final String suitability;
  final bool tooSmall;
  final double m3PerFeddan;
}

class PublishedCost {
  const PublishedCost({
    required this.figure,
    required this.basis,
    required this.season,
    required this.place,
    required this.source,
    required this.url,
  });
  final String figure;
  final String basis;
  final String season;
  final String place;
  final String source;
  final String url;
}

/// The answer of /api/app/feasibility. The typed fields are what the screen
/// draws; [raw] keeps the rest as it came.
class FeasibilityStudy {
  FeasibilityStudy(this.raw);
  final Map<String, dynamic> raw;

  Map<String, dynamic> get input => _map(raw['input']);
  Map<String, dynamic> get totals => _map(raw['totals']);
  Map<String, dynamic> get reference => _map(raw['reference']);
  Map<String, dynamic> get advice => _map(raw['advice']);
  Map<String, dynamic> get fx => _map(raw['fx']);
  Map<String, dynamic>? get needs => raw['needs'] == null ? null : _map(raw['needs']);
  Map<String, dynamic> get risks => _map(raw['risks']);
  Map<String, dynamic>? get locust => raw['locust'] == null ? null : _map(raw['locust']);

  bool get referenceUnavailable => raw['referenceUnavailable'] == true;
  String? get lastSafeExit => _str(raw['lastSafeExit']);
  String get verdict => _str(raw['verdict']) ?? 'unknown';
  String get verdictLabel => _str(raw['verdictLabel']) ?? '';
  double? get breakEvenKgPerHa => _num(raw['breakEvenKgPerHa']);
  double get feddans => _num(input['feddans']) ?? 1;
  String get crop => _str(input['crop']) ?? '';
  String get cropName => _str(input['cropName']) ?? '';
  double? get sdgPerUsd => _num(fx['sdgPerUsd']);
  double? get sdgPerUsdParallel => _num(fx['sdgPerUsdParallel']);

  double? total(String key) => _num(totals[key]);

  List<Phase> get phases => [
        for (final p in _maps(raw['phases']))
          Phase(
            stage: _str(p['stage']) ?? '',
            name: _str(p['name']) ?? '',
            cost: _num(p['cost']) ?? 0,
            cumulativeCost: _num(p['cumulativeCost']) ?? 0,
            cumulativeShare: _num(p['cumulativeShare']) ?? 0,
            breakEvenKgPerHa: _num(p['breakEvenKgPerHa']),
            verdict: _str(p['verdict']) ?? 'unknown',
            verdictLabel: _str(p['verdictLabel']) ?? '',
            lastSafeExit: p['lastSafeExit'] == true,
          ),
      ];

  List<MethodRow> get methods => [
        for (final m in _maps(advice['methods']))
          MethodRow(_str(m['method']) ?? '', _str(m['label']) ?? '', _str(m['suitability']) ?? '',
              m['tooSmall'] == true, _num(m['m3PerFeddan']) ?? 0),
      ];

  List<PublishedCost> get published => [
        for (final c in _maps(raw['published']))
          PublishedCost(
            figure: _str(c['figure']) ?? '',
            basis: _str(c['basis']) ?? '',
            season: _str(c['season']) ?? '',
            place: _str(c['place']) ?? '',
            source: _str(c['source']) ?? '',
            url: _str(c['url']) ?? '',
          ),
      ];

  /// Expected loss of one risk in dollars, as summariseRisks counted it (null: a figure is missing).
  double? expectedUsd(String key) {
    for (final r in _maps(risks['rows'])) {
      if (r['key'] == key) return _num(r['expectedUsd']);
    }
    return null;
  }

  List<String> get uncounted => [for (final k in (risks['uncounted'] as List? ?? const [])) '$k'];
  Map<String, dynamic>? get badYear => risks['badYear'] == null ? null : _map(risks['badYear']);
}

/// «تخطيط الاستثمار»: the suggested split.
class PlanAllocation {
  const PlanAllocation(this.name, this.slug, this.riskLabel, this.shares, this.amount);
  final String name;
  final String slug;
  final String riskLabel;
  final int shares;
  final double amount;
}

class PlanSuggestion {
  const PlanSuggestion(this.riskProfileLabel, this.requested, this.allocated, this.allocations);
  final String riskProfileLabel;
  final double requested;
  final double allocated;
  final List<PlanAllocation> allocations;

  factory PlanSuggestion.fromJson(Map<String, dynamic> j) => PlanSuggestion(
        _str(j['riskProfileLabel']) ?? '',
        _num(j['requestedAmount']) ?? 0,
        _num(j['allocatedAmount']) ?? 0,
        [
          for (final a in _maps(j['allocations']))
            PlanAllocation(_str(a['name']) ?? '', _str(a['slug']) ?? '', _str(a['riskLabel']) ?? '',
                (_num(a['shares']) ?? 0).toInt(), _num(a['amount']) ?? 0),
        ],
      );
}

// ── Talking to the site ──────────────────────────────────────────────────────

class FeasibilityApi {
  FeasibilityApi({http.Client? client, String? siteUrl, AppCall? call, bool Function()? signedIn})
      : _client = client ?? http.Client(),
        _site = siteUrl ?? ApiConfig.siteUrl,
        _call = call ?? accountController.call,
        _signedIn = signedIn ?? (() => accountController.value != null);

  final http.Client _client;
  final String _site;
  final AppCall _call;
  final bool Function() _signedIn;

  static const _timeout = Duration(seconds: 40);

  Future<Map<String, dynamic>> _public(String method, String path, [Map<String, dynamic>? body]) async {
    if (_site.isEmpty) throw ApiException(tr('التطبيق غير مضبوط للاتصال بالموقع.', 'The app is not set up to connect to the website.'));
    final uri = Uri.parse('$_site$path');
    late final http.Response res;
    try {
      res = await (method == 'POST'
              ? _client.post(uri, headers: {'content-type': 'application/json', ...langController.header}, body: jsonEncode(body ?? const {}))
              : _client.get(uri, headers: langController.header))
          .timeout(_timeout);
    } catch (_) {
      throw ApiException(tr('تعذّر الاتصال. تحقّق من الشبكة وأعد المحاولة.', 'Could not connect. Check the network and try again.'));
    }
    Map<String, dynamic> j;
    try {
      j = _map(jsonDecode(utf8.decode(res.bodyBytes)));
    } catch (_) {
      j = const {};
    }
    if (res.statusCode != 200) throw ApiException(_str(j['error']) ?? tr('تعذّر الطلب (${res.statusCode}).', 'The request failed (${res.statusCode}).'));
    return j;
  }

  /// The choices and the website's defaults. Public, as the page is.
  Future<StudyOptions> options() async => StudyOptions.fromJson(await _public('GET', '/api/app/feasibility'));

  /// The whole study for these inputs. With a session the locust watch also
  /// measures from the farmer's own lands, as the page does when signed in.
  Future<FeasibilityStudy> study(StudyInputs inputs) async {
    final body = inputs.toJson();
    if (_signedIn()) {
      try {
        return FeasibilityStudy(await _call('POST', '/api/app/feasibility', body: body));
      } on ApiException {
        // A session the server no longer takes is a signed-out study, not a failed one.
      }
    }
    return FeasibilityStudy(await _public('POST', '/api/app/feasibility', body));
  }

  /// «حوّلها إلى مشروع»: the input list in «مشروعي», as the website's button makes it.
  Future<String> makeProject({required String crop, required double feddans, String? title}) async {
    final j = await _call('POST', '/api/app/feasibility/project', body: {
      'crop': crop,
      'feddans': feddans,
      if (title != null && title.trim().isNotEmpty) 'title': title.trim(),
    });
    return _str(j['message']) ?? tr('أُنشئت القائمة.', 'The list was created.');
  }

  /// «تخطيط الاستثمار» (/plan): the answers (1–3 each) and the amount, to a suggested split.
  Future<PlanSuggestion> plan({required double amount, required int q1, required int q2, required int q3}) async =>
      PlanSuggestion.fromJson(
          await _call('POST', '/api/app/plan', body: {'amount': amount, 'q1': q1, 'q2': q2, 'q3': q3}));
}
