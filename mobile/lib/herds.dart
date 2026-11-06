/// «القطعان» في التطبيق (البند ٢٠٣): دورات الإنتاج الحيوانيّ، وأمراض الماشية في ولايتك، والجاهزيّة للتصدير.
///
/// The website's /herds and /herds/[id] shown natively. The routes under /api/app/herds read as the signed-in
/// person, through row-level security, and serve only the caller's own herds. A new cycle, a stage signed off, the
/// budget, a health record and ear tags all go through the website's own steps (src/lib/herdSteps.ts). The disease
/// alerts are what FAO's EMPRES-i holds for Sudan and its neighbours, the farmer's own states first, as the website
/// shows them; and the export checklist is the website's, line by line, each with its source.
library;

import 'account.dart';

num _num(Object? v) => v is num ? v : num.tryParse('$v') ?? 0;
num? _numOrNull(Object? v) => v == null ? null : (v is num ? v : num.tryParse('$v'));
String? _str(Object? v) => v is String && v.isNotEmpty ? v : null;
List<Map<String, dynamic>> _maps(Object? v) =>
    [for (final e in (v as List? ?? const [])) if (e is Map) Map<String, dynamic>.from(e)];
List<String> _strings(Object? v) => [for (final e in (v as List? ?? const [])) '$e'];

class HerdSummary {
  const HerdSummary({
    required this.id,
    required this.name,
    required this.speciesLabel,
    required this.purposeLabel,
    required this.headCount,
    required this.status,
    this.breed,
    this.startDate,
    this.stagesDone = 0,
    this.stagesTotal = 0,
  });

  final String id;
  final String name;
  final String speciesLabel;
  final String purposeLabel;
  final String? breed;
  final int headCount;
  final String status;
  final String? startDate;
  final int stagesDone;
  final int stagesTotal;

  /// «أبقار — تسمين — كنانة», as the website's list line.
  String get kindLine => [speciesLabel, purposeLabel, ?breed].join(' — ');

  factory HerdSummary.fromJson(Map<String, dynamic> j) => HerdSummary(
        id: j['id'] as String,
        name: j['name'] as String? ?? '',
        speciesLabel: j['species_label'] as String? ?? '',
        purposeLabel: j['purpose_label'] as String? ?? '',
        breed: _str(j['breed']),
        headCount: _num(j['head_count']).toInt(),
        status: j['status'] as String? ?? 'active',
        startDate: _str(j['start_date']),
        stagesDone: _num(j['stages_done']).toInt(),
        stagesTotal: _num(j['stages_total']).toInt(),
      );
}

class DiseaseAlert {
  const DiseaseAlert(this.land, this.state, this.diseases);
  final String land;
  final String state;
  final List<String> diseases;
}

class DiseaseGroup {
  const DiseaseGroup({required this.country, required this.disease, required this.count, required this.latest, this.states = const []});
  final String country;
  final List<String> states;
  final String disease;
  final int count;
  final String latest;
}

/// «أمراض الماشية في السودان وجيرانه»: null from the server when FAO could not be reached.
class DiseaseWatch {
  const DiseaseWatch({
    required this.alerts,
    required this.nearest,
    required this.groups,
    required this.sudanEvents,
    required this.hasLands,
    required this.source,
    this.sourceUrl,
  });

  final List<DiseaseAlert> alerts;
  final List<String> nearest;
  final List<DiseaseGroup> groups;
  final bool sudanEvents;
  final bool hasLands;
  final String source;
  final String? sourceUrl;

  factory DiseaseWatch.fromJson(Map<String, dynamic> j) => DiseaseWatch(
        alerts: [
          for (final a in _maps(j['alerts']))
            DiseaseAlert(a['land'] as String? ?? '', a['state'] as String? ?? '', _strings(a['diseases'])),
        ],
        nearest: _strings(j['nearest']),
        groups: [
          for (final g in _maps(j['groups']))
            DiseaseGroup(
              country: g['country'] as String? ?? '',
              states: _strings(g['states']),
              disease: g['disease'] as String? ?? '',
              count: _num(g['count']).toInt(),
              latest: g['latest'] as String? ?? '',
            ),
        ],
        sudanEvents: j['sudan_events'] as bool? ?? false,
        hasLands: j['has_lands'] as bool? ?? false,
        source: j['source'] as String? ?? '',
        sourceUrl: _str(j['source_url']),
      );
}

class Choice {
  const Choice(this.key, this.label);
  final String key;
  final String label;
}

/// A species for the new-cycle form, with the purposes it is kept for on the platform.
class SpeciesChoice {
  const SpeciesChoice(this.key, this.label, this.purposes);
  final String key;
  final String label;
  final List<Choice> purposes;
}

class HerdsPage {
  const HerdsPage({required this.herds, required this.species, this.diseases});
  final List<HerdSummary> herds;
  final DiseaseWatch? diseases;
  final List<SpeciesChoice> species;

  factory HerdsPage.fromJson(Map<String, dynamic> j) => HerdsPage(
        herds: [for (final h in _maps(j['herds'])) HerdSummary.fromJson(h)],
        diseases: j['diseases'] is Map ? DiseaseWatch.fromJson(Map<String, dynamic>.from(j['diseases'] as Map)) : null,
        species: [
          for (final s in _maps(j['species']))
            SpeciesChoice(s['key'] as String? ?? '', s['label'] as String? ?? '', [
              for (final p in _maps(s['purposes'])) Choice(p['key'] as String? ?? '', p['label'] as String? ?? ''),
            ]),
        ],
      );
}

class HerdStageRow {
  const HerdStageRow({
    required this.id,
    required this.order,
    required this.name,
    required this.completed,
    required this.budget,
    this.plannedStart,
    this.plannedEnd,
    this.days,
    this.feedKg,
    this.feedShare,
    this.canComplete = false,
  });

  final String id;
  final int order;
  final String name;
  final bool completed;
  final String? plannedStart;
  final String? plannedEnd;
  final int? days;
  final num? feedKg;
  final num budget;
  final int? feedShare;
  final bool canComplete;
}

class CheckLine {
  const CheckLine({
    required this.id,
    required this.status,
    required this.title,
    required this.detail,
    required this.source,
    this.sourceUrl,
    this.sourceMeta = '',
  });

  final String id;

  /// ok · missing · warn · info
  final String status;
  final String title;
  final String detail;
  final String source;
  final String? sourceUrl;
  final String sourceMeta;
}

class HealthRow {
  const HealthRow({
    required this.id,
    required this.kind,
    required this.item,
    required this.doneOn,
    required this.heads,
    this.result,
    this.vet,
    this.withdrawn = false,
  });
  final String id;
  final String kind;
  final String item;
  final String doneOn;
  final int heads;
  final String? result;
  final String? vet;
  final bool withdrawn;
}

class HealthItem {
  const HealthItem(this.choice, this.kind, this.label);

  /// "kind:key", as the website's form sends it.
  final String choice;
  final String kind;
  final String label;
}

/// «الجاهزيّة للتصدير» (backlog 117): the health record, the ear tags, and the preparation checklist.
class Readiness {
  const Readiness({
    required this.destination,
    required this.destinations,
    required this.verdict,
    required this.met,
    required this.lines,
    required this.tagsPresent,
    required this.tagsOther,
    required this.tagSample,
    required this.records,
    required this.items,
    required this.note,
  });

  final String destination;
  final List<Choice> destinations;
  final String verdict;
  final bool met;
  final List<CheckLine> lines;
  final int tagsPresent;
  final List<String> tagsOther;
  final List<String> tagSample;
  final List<HealthRow> records;
  final List<HealthItem> items;
  final String note;

  factory Readiness.fromJson(Map<String, dynamic> j) {
    final tags = Map<String, dynamic>.from(j['tags'] as Map? ?? const {});
    return Readiness(
      destination: j['destination'] as String? ?? 'sa',
      destinations: [for (final d in _maps(j['destinations'])) Choice(d['key'] as String? ?? '', d['label'] as String? ?? '')],
      verdict: j['verdict'] as String? ?? '',
      met: j['met'] as bool? ?? false,
      lines: [
        for (final l in _maps(j['lines']))
          CheckLine(
            id: l['id'] as String? ?? '',
            status: l['status'] as String? ?? 'info',
            title: l['title'] as String? ?? '',
            detail: l['detail'] as String? ?? '',
            source: l['source'] as String? ?? '',
            sourceUrl: _str(l['source_url']),
            sourceMeta: l['source_meta'] as String? ?? '',
          ),
      ],
      tagsPresent: _num(tags['present']).toInt(),
      tagsOther: _strings(tags['others']),
      tagSample: _strings(tags['sample']),
      records: [
        for (final r in _maps(j['records']))
          HealthRow(
            id: r['id'] as String? ?? '',
            kind: r['kind'] as String? ?? '',
            item: r['item'] as String? ?? '',
            doneOn: r['done_on'] as String? ?? '',
            heads: _num(r['heads']).toInt(),
            result: _str(r['result']),
            vet: _str(r['vet']),
            withdrawn: r['withdrawn'] as bool? ?? false,
          ),
      ],
      items: [
        for (final i in _maps(j['items']))
          HealthItem(i['choice'] as String? ?? '', i['kind'] as String? ?? '', i['label'] as String? ?? ''),
      ],
      note: j['note'] as String? ?? '',
    );
  }
}

class HerdDetail {
  const HerdDetail({
    required this.herd,
    required this.done,
    required this.stageCount,
    required this.feedKg,
    required this.budget,
    required this.perHead,
    required this.stages,
    this.readiness,
  });

  final HerdSummary herd;
  final int done;
  final int stageCount;
  final num feedKg;
  final num budget;
  final num perHead;
  final List<HerdStageRow> stages;

  /// Null for poultry and fish: they are not exported live from here.
  final Readiness? readiness;

  bool get active => herd.status == 'active';

  factory HerdDetail.fromJson(Map<String, dynamic> j) {
    final t = Map<String, dynamic>.from(j['totals'] as Map? ?? const {});
    return HerdDetail(
      herd: HerdSummary.fromJson(Map<String, dynamic>.from(j['herd'] as Map)),
      done: _num(t['done']).toInt(),
      stageCount: _num(t['stages']).toInt(),
      feedKg: _num(t['feed_kg']),
      budget: _num(t['budget']),
      perHead: _num(t['per_head']),
      stages: [
        for (final s in _maps(j['stages']))
          HerdStageRow(
            id: s['id'] as String? ?? '',
            order: _num(s['order']).toInt(),
            name: s['name'] as String? ?? '',
            completed: s['completed'] as bool? ?? false,
            plannedStart: _str(s['planned_start']),
            plannedEnd: _str(s['planned_end']),
            days: _numOrNull(s['days'])?.toInt(),
            feedKg: _numOrNull(s['feed_kg']),
            budget: _num(s['budget']),
            feedShare: _numOrNull(s['feed_share'])?.toInt(),
            canComplete: s['can_complete'] as bool? ?? false,
          ),
      ],
      readiness: j['readiness'] is Map ? Readiness.fromJson(Map<String, dynamic>.from(j['readiness'] as Map)) : null,
    );
  }
}

/// The app's talk with /api/app/herds, as the signed-in person.
class HerdsApi {
  HerdsApi([AccountController? account]) : _account = account ?? accountController;

  final AccountController _account;

  Future<HerdsPage> page() async => HerdsPage.fromJson(await _account.call('GET', '/api/app/herds'));

  /// Creates the cycle and its stages; the new herd's id.
  Future<String> create({
    required String name,
    required String species,
    required String purpose,
    required int headCount,
    required String startDate,
    num? budgetPerHead,
    String breed = '',
  }) async {
    final j = await _account.call('POST', '/api/app/herds', body: {
      'name': name,
      'species': species,
      'purpose': purpose,
      'head_count': headCount,
      'start_date': startDate,
      'budget_per_head': ?budgetPerHead,
      'breed': breed,
    });
    return j['id'] as String;
  }

  Future<HerdDetail> detail(String id, {String destination = 'sa'}) async =>
      HerdDetail.fromJson(await _account.call('GET', '/api/app/herds/$id?to=$destination'));

  Future<String> _step(String id, Map<String, dynamic> body) async {
    final j = await _account.call('POST', '/api/app/herds/$id', body: body);
    return j['message'] as String? ?? 'تمّ.';
  }

  Future<String> completeStage(String id, String stageId) => _step(id, {'action': 'complete_stage', 'stage_id': stageId});

  Future<String> setBudget(String id, num perHead) => _step(id, {'action': 'budget', 'budget_per_head': perHead});

  Future<String> addHealth(
    String id, {
    required String choice,
    required String doneOn,
    required int heads,
    String result = '',
    String product = '',
    String batch = '',
    String vet = '',
    String note = '',
  }) =>
      _step(id, {
        'action': 'health',
        'choice': choice,
        'done_on': doneOn,
        'heads': heads,
        'result': result,
        'product': product,
        'batch': batch,
        'vet_name': vet,
        'note': note,
      });

  Future<String> addTags(String id, {String prefix = '', required int from, int? to}) =>
      _step(id, {'action': 'tags', 'prefix': prefix, 'from': from, 'to': ?to});
}
