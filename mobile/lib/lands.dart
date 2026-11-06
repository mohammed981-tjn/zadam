/// «أراضيّ» في التطبيق (البند ٢٠٣): القائمة وبطاقة الأرض كما يعرضهما الموقع.
///
/// The website's /lands and its field card (/lands/[id]) shown natively: the routes under /api/app/lands read as the
/// signed-in person, through row-level security, and serve only the caller's own lands — a land's exact place is
/// its owner's and the administrator's. The owner's steps on the card (offering the land to investors, opening it
/// to partner companies, answering their requests, adding a water or soil test) go through the website's own
/// functions (src/lib/landOwnerSteps.ts), so the app and the website check and say the same thing.
///
/// Parsing lives here, apart from the screen, so the shape of the JSON is tested without a widget tree.
library;

import 'account.dart';

num _num(Object? v) => v is num ? v : num.tryParse('$v') ?? 0;
num? _numOrNull(Object? v) => v == null ? null : (v is num ? v : num.tryParse('$v'));
String? _str(Object? v) => v is String && v.isNotEmpty ? v : null;
List<Map<String, dynamic>> _maps(Object? v) =>
    [for (final e in (v as List? ?? const [])) if (e is Map) Map<String, dynamic>.from(e)];
List<String> _strings(Object? v) => [for (final e in (v as List? ?? const [])) '$e'];

/// A whole number with thousands separated, as the website writes it ("en-US"): 12,600.
String fmt0(num v) {
  final s = v.round().abs().toString();
  final b = StringBuffer(v < 0 ? '-' : '');
  for (var i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 == 0) b.write(',');
    b.write(s[i]);
  }
  return b.toString();
}

/// One line of «أراضيّ».
class LandSummary {
  const LandSummary({
    required this.id,
    required this.name,
    required this.state,
    required this.feddans,
    required this.verification,
    required this.verificationLabel,
    required this.documentsOnFile,
    required this.documentsRequired,
    this.locality,
    this.station,
    this.waterSource,
    this.soil,
    this.verificationNote,
    this.listed = false,
    this.openToInvestors,
    this.openToPartners,
    this.hasLocation = false,
    this.drawn = false,
  });

  final String id;
  final String name;
  final String state;
  final String? locality;
  final num feddans;
  final String? station;
  final String? waterSource;
  final String? soil;
  final String verification;
  final String verificationLabel;
  final String? verificationNote;
  final int documentsOnFile;
  final int documentsRequired;
  final bool listed;

  /// Null where the database has not reached the investor or partner migration: the card then offers nothing.
  final bool? openToInvestors;
  final bool? openToPartners;
  final bool hasLocation;
  final bool drawn;

  bool get verified => verification == 'verified';

  /// The website's counter: kinds on file against kinds required, «مكتملة» once enough (backlog 123).
  String get documentsLine => documentsOnFile >= documentsRequired
      ? 'المستندات مكتملة ✓'
      : 'المستندات: $documentsOnFile من $documentsRequired';

  factory LandSummary.fromJson(Map<String, dynamic> j) => LandSummary(
        id: j['id'] as String,
        name: j['name'] as String? ?? '',
        state: j['state'] as String? ?? '',
        locality: _str(j['locality']),
        feddans: _num(j['feddans']),
        station: _str(j['station']),
        waterSource: _str(j['water_source']),
        soil: _str(j['soil']),
        verification: j['verification'] as String? ?? 'unverified',
        verificationLabel: j['verification_label'] as String? ?? '',
        verificationNote: _str(j['verification_note']),
        documentsOnFile: _num(j['documents_on_file']).toInt(),
        documentsRequired: _num(j['documents_required']).toInt(),
        listed: j['listed'] as bool? ?? false,
        openToInvestors: j['open_to_investors'] as bool?,
        openToPartners: j['open_to_partners'] as bool?,
        hasLocation: j['has_location'] as bool? ?? false,
        drawn: j['drawn'] as bool? ?? false,
      );
}

class LandSoil {
  const LandSoil({required this.name, this.probability, this.fromSatellite = false});
  final String name;
  final num? probability;
  final bool fromSatellite;
}

class DocumentKind {
  const DocumentKind(this.key, this.label, this.have);
  final String key;
  final String label;
  final bool have;
}

class DocumentFile {
  const DocumentFile(this.id, this.label, this.caption);
  final String id;
  final String label;
  final String? caption;
}

/// A partnership model the owner may accept, with what it means for the owner.
class InvestorModel {
  const InvestorModel(this.key, this.label, this.detail);
  final String key;
  final String label;
  final String detail;
}

class InvestorRequest {
  const InvestorRequest({
    required this.id,
    required this.status,
    required this.model,
    required this.message,
    this.name,
    this.phone,
    this.record,
  });

  final String id;
  final String status;
  final String? name;
  final String model;
  final String message;

  /// Only once the owner has accepted.
  final String? phone;

  /// Where the number is from, since when, what they did (backlog 136).
  final String? record;

  bool get accepted => status == 'accepted';
  bool get pending => status == 'pending';
}

class InspectionRequest {
  const InspectionRequest({required this.id, required this.status, required this.state, required this.checks, this.name});
  final String id;
  final String status;
  final String? name;
  final String state;
  final List<String> checks;
}

class PartnerCrop {
  const PartnerCrop(this.key, this.label);
  final String key;
  final String label;
}

class PartnerRequest {
  const PartnerRequest({required this.id, required this.message, this.company, this.kinds = const [], this.phone});
  final String id;
  final String? company;
  final List<String> kinds;
  final String? phone;
  final String message;
}

class LandTestRow {
  const LandTestRow({
    required this.id,
    required this.kind,
    required this.testedOn,
    required this.values,
    this.lab,
    this.reading,
    this.note,
    this.deletable = false,
  });

  final String id;
  final String kind;
  final String testedOn;
  final String? lab;
  final String values;
  final String? reading;
  final String? note;
  final bool deletable;

  String get kindLabel => kind == 'water' ? 'ماء' : 'تربة';
}

class SeasonRow {
  const SeasonRow(this.id, this.name, this.status, this.line);
  final String id;
  final String name;
  final String status;
  final String line;
}

/// The latest soil test's salinity, and the crops that still give their full yield at it (FAO-29).
class SoilCrops {
  const SoilCrops({required this.ec, required this.testedOn, required this.full, required this.classOnly});
  final num ec;
  final String testedOn;
  final List<String> full;
  final int classOnly;
}

/// A land's card: what the website shows its owner on «أراضيّ» and on the field card together.
class LandCard {
  const LandCard({
    required this.id,
    required this.name,
    required this.state,
    required this.feddans,
    required this.verification,
    required this.verificationLabel,
    required this.documentsOnFile,
    required this.documentsRequired,
    this.locality,
    this.village,
    this.station,
    this.stationKey,
    this.waterSource,
    this.waterSourceLabel,
    this.waterPerFeddan,
    this.soilNote,
    this.previousCrops,
    this.tenure,
    this.latitude,
    this.longitude,
    this.boundary = const [],
    this.drawnFeddans,
    this.soil,
    this.verificationNote,
    this.listed = false,
    this.openToInvestors,
    this.investorModelsChosen = const [],
    this.investorNote,
    this.openToPartners,
    this.cropKeys = const [],
    this.partnerGroup = '',
    this.documentKinds = const [],
    this.documents = const [],
    this.investorModels = const [],
    this.investorRequests = const [],
    this.inspections = const [],
    this.partnerCrops = const [],
    this.partnerRequests = const [],
    this.tests = const [],
    this.soilCrops,
    this.seasons = const [],
  });

  final String id;
  final String name;
  final String state;
  final String? locality;
  final String? village;
  final num feddans;
  final String? station;
  final String? stationKey;
  final String? waterSource;
  final String? waterSourceLabel;
  final num? waterPerFeddan;
  final String? soilNote;
  final String? previousCrops;
  final String? tenure;
  final num? latitude;
  final num? longitude;

  /// The corners as drawn in the app, (lat, lng) in order round the field.
  final List<(double, double)> boundary;
  final num? drawnFeddans;
  final LandSoil? soil;
  final String verification;
  final String verificationLabel;
  final String? verificationNote;
  final int documentsOnFile;
  final int documentsRequired;
  final bool listed;
  final bool? openToInvestors;
  final List<String> investorModelsChosen;
  final String? investorNote;
  final bool? openToPartners;
  final List<String> cropKeys;
  final String partnerGroup;
  final List<DocumentKind> documentKinds;
  final List<DocumentFile> documents;
  final List<InvestorModel> investorModels;
  final List<InvestorRequest> investorRequests;
  final List<InspectionRequest> inspections;
  final List<PartnerCrop> partnerCrops;
  final List<PartnerRequest> partnerRequests;
  final List<LandTestRow> tests;
  final SoilCrops? soilCrops;
  final List<SeasonRow> seasons;

  bool get verified => verification == 'verified';
  bool get hasLocation => latitude != null && longitude != null;

  String get documentsLine => documentsOnFile >= documentsRequired
      ? 'المستندات مكتملة ✓'
      : 'المستندات: $documentsOnFile من $documentsRequired';

  factory LandCard.fromJson(Map<String, dynamic> j) {
    final l = Map<String, dynamic>.from(j['land'] as Map? ?? const {});
    final docs = Map<String, dynamic>.from(j['documents'] as Map? ?? const {});
    final inv = Map<String, dynamic>.from(j['investors'] as Map? ?? const {});
    final par = Map<String, dynamic>.from(j['partners'] as Map? ?? const {});
    final soil = l['soil'] as Map?;
    final sc = j['soil_crops'] as Map?;
    return LandCard(
      id: l['id'] as String? ?? '',
      name: l['name'] as String? ?? '',
      state: l['state'] as String? ?? '',
      locality: _str(l['locality']),
      village: _str(l['village']),
      feddans: _num(l['feddans']),
      station: _str(l['station']),
      stationKey: _str(l['station_key']),
      waterSource: _str(l['water_source']),
      waterSourceLabel: _str(l['water_source_label']),
      waterPerFeddan: _numOrNull(l['water_per_feddan']),
      soilNote: _str(l['soil_note']),
      previousCrops: _str(l['previous_crops']),
      tenure: _str(l['tenure']),
      latitude: _numOrNull(l['latitude']),
      longitude: _numOrNull(l['longitude']),
      boundary: [
        for (final c in (l['boundary'] as List? ?? const []))
          if (c is List && c.length >= 2) (_num(c[0]).toDouble(), _num(c[1]).toDouble()),
      ],
      drawnFeddans: _numOrNull(l['drawn_feddans']),
      soil: soil == null
          ? null
          : LandSoil(
              name: soil['name'] as String? ?? '',
              probability: _numOrNull(soil['probability']),
              fromSatellite: soil['from_satellite'] as bool? ?? false,
            ),
      verification: l['verification'] as String? ?? 'unverified',
      verificationLabel: l['verification_label'] as String? ?? '',
      verificationNote: _str(l['verification_note']),
      documentsOnFile: _num(l['documents_on_file']).toInt(),
      documentsRequired: _num(l['documents_required']).toInt(),
      listed: l['listed'] as bool? ?? false,
      openToInvestors: l['open_to_investors'] as bool?,
      investorModelsChosen: _strings(l['investor_models']),
      investorNote: _str(l['investor_note']),
      openToPartners: l['open_to_partners'] as bool?,
      cropKeys: _strings(l['crop_keys']),
      partnerGroup: l['partner_group'] as String? ?? '',
      documentKinds: [
        for (final k in _maps(docs['kinds']))
          DocumentKind(k['key'] as String? ?? '', k['label'] as String? ?? '', k['have'] as bool? ?? false),
      ],
      documents: [
        for (final d in _maps(docs['files']))
          DocumentFile(d['id'] as String? ?? '', d['label'] as String? ?? '', _str(d['caption'])),
      ],
      investorModels: [
        for (final m in _maps(inv['models']))
          InvestorModel(m['key'] as String? ?? '', m['label'] as String? ?? '', m['detail'] as String? ?? ''),
      ],
      investorRequests: [
        for (final r in _maps(inv['requests']))
          InvestorRequest(
            id: r['id'] as String? ?? '',
            status: r['status'] as String? ?? 'pending',
            name: _str(r['name']),
            model: r['model'] as String? ?? '',
            message: r['message'] as String? ?? '',
            phone: _str(r['phone']),
            record: _str(r['record']),
          ),
      ],
      inspections: [
        for (final i in _maps(inv['inspections']))
          InspectionRequest(
            id: i['id'] as String? ?? '',
            status: i['status'] as String? ?? '',
            name: _str(i['name']),
            state: i['state'] as String? ?? '',
            checks: _strings(i['checks']),
          ),
      ],
      partnerCrops: [
        for (final c in _maps(par['crops'])) PartnerCrop(c['key'] as String? ?? '', c['label'] as String? ?? ''),
      ],
      partnerRequests: [
        for (final p in _maps(par['interests']))
          PartnerRequest(
            id: p['id'] as String? ?? '',
            company: _str(p['company']),
            kinds: _strings(p['kinds']),
            phone: _str(p['phone']),
            message: p['message'] as String? ?? '',
          ),
      ],
      tests: [
        for (final t in _maps(j['tests']))
          LandTestRow(
            id: t['id'] as String? ?? '',
            kind: t['kind'] as String? ?? 'soil',
            testedOn: t['tested_on'] as String? ?? '',
            lab: _str(t['lab']),
            values: t['values'] as String? ?? '',
            reading: _str(t['reading']),
            note: _str(t['note']),
            deletable: t['deletable'] as bool? ?? false,
          ),
      ],
      soilCrops: sc == null
          ? null
          : SoilCrops(
              ec: _num(sc['ec']),
              testedOn: sc['tested_on'] as String? ?? '',
              full: _strings(sc['full']),
              classOnly: _num(sc['class_only']).toInt(),
            ),
      seasons: [
        for (final s in _maps(j['seasons']))
          SeasonRow(s['id'] as String? ?? '', s['name'] as String? ?? '', s['status'] as String? ?? '',
              s['line'] as String? ?? ''),
      ],
    );
  }
}

class WaterRow {
  const WaterRow(this.period, this.mmPerDay, this.m3PerFeddan, this.m3Land);
  final String period;
  final num mmPerDay;
  final num m3PerFeddan;
  final num m3Land;
}

/// «ماء أرضك من الأقمار الصناعيّة — الفاو»: what WaPOR measured leaving the land every ten days.
class LandWater {
  const LandWater({required this.located, required this.rows, required this.note, this.feddans, this.source});
  final bool located;
  final num? feddans;
  final List<WaterRow> rows;
  final String note;
  final String? source;

  factory LandWater.fromJson(Map<String, dynamic> j) => LandWater(
        located: j['located'] as bool? ?? false,
        feddans: _numOrNull(j['feddans']),
        rows: [
          for (final r in _maps(j['rows']))
            WaterRow(r['period'] as String? ?? '', _num(r['mm_per_day']), _num(r['m3_per_feddan']), _num(r['m3_land'])),
        ],
        note: j['note'] as String? ?? '',
        source: _str(j['source']),
      );
}

/// The app's talk with /api/app/lands, as the signed-in person.
class LandsApi {
  LandsApi([AccountController? account]) : _account = account ?? accountController;

  final AccountController _account;

  Future<List<LandSummary>> mine() async {
    final j = await _account.call('GET', '/api/app/lands/mine');
    return [for (final l in _maps(j['lands'])) LandSummary.fromJson(l)];
  }

  Future<LandCard> card(String id) async => LandCard.fromJson(await _account.call('GET', '/api/app/lands/$id'));

  Future<LandWater> water(String id) async => LandWater.fromJson(await _account.call('GET', '/api/app/lands/$id/water'));

  /// One of the owner's steps on the card; the website's sentence for what happened.
  Future<String> _step(String id, Map<String, dynamic> body) async {
    final j = await _account.call('POST', '/api/app/lands/$id', body: body);
    return j['message'] as String? ?? 'تمّ.';
  }

  Future<String> setInvestors(String id, {required bool open, List<String> models = const [], String note = ''}) =>
      _step(id, {'action': 'investors', 'open': open, 'models': models, 'note': note});

  Future<String> decideInvestor(String id, String interestId, {required bool accept}) =>
      _step(id, {'action': 'investor_decide', 'interest_id': interestId, 'accept': accept});

  Future<String> setPartners(String id, {required bool open, List<String> crops = const []}) =>
      _step(id, {'action': 'partners', 'open': open, 'crop_keys': crops});

  Future<String> decidePartner(String id, String interestId, {required bool accept}) =>
      _step(id, {'action': 'partner_decide', 'interest_id': interestId, 'accept': accept});

  Future<String> addTest(
    String id, {
    required String kind,
    required String testedOn,
    num? ec,
    num? ph,
    num? sar,
    num? organic,
    String lab = '',
    String note = '',
  }) =>
      _step(id, {
        'action': 'test',
        'kind': kind,
        'tested_on': testedOn,
        'ec_dsm': ec,
        'ph': ph,
        'sar': sar,
        'organic_matter_pct': organic,
        'lab': lab,
        'note': note,
      });

  Future<String> deleteTest(String id, String testId) => _step(id, {'action': 'delete_test', 'test_id': testId});
}
