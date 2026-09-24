/// النفير في التطبيق: ما يُدعى إليه، ومَن يطلب الفزعة، وما أُنجز، والمؤشّرات.
///
/// Read-only by design. Joining, pledging and signing are acts done under a
/// name and a session, and the app has no sign-in yet; it shows the calls and
/// sends the person to the website page where the act happens. The labels
/// mirror src/lib/nafir.ts — the database's closed lists — and the parity test
/// in test/nafir_test.dart pins them.
library;

const nafirKinds = <String, String>{
  'harvest': 'حصاد',
  'planting': 'زراعة',
  'canal': 'تطهير قناة أو ترعة',
  'building': 'بناء',
  'cleaning': 'نظافة وإصلاح',
  'other': 'عملٌ آخر',
};

const fazaCauses = <String, String>{
  'flood': 'سيلٌ أو فيضان',
  'pest': 'آفة',
  'fire': 'حريق',
  'drought': 'جفاف',
  'livestock': 'نفوق ماشية',
  'illness': 'مرضٌ أقعد صاحبه',
  'other': 'سببٌ آخر',
};

const fazaNeeds = <String, String>{
  'labor': 'أيدٍ عاملة',
  'tools': 'آلات وأدوات',
  'seeds': 'بذور وتقاوي',
  'transport': 'ترحيل',
  'advice': 'مشورة وخبرة',
  'other': 'غير ذلك',
};

class NafirCall {
  const NafirCall({
    required this.id,
    required this.displayName,
    required this.kind,
    required this.title,
    required this.description,
    required this.state,
    required this.locality,
    required this.startsOn,
    required this.needed,
    this.hosting,
    this.bringTools,
    this.outcome,
    this.attended,
  });

  final String id;
  final String displayName;
  final String kind;
  final String title;
  final String description;
  final String state;
  final String locality;
  final String startsOn;
  final int needed;
  final String? hosting;
  final String? bringTools;
  final String? outcome;
  final int? attended;

  String get kindLabel => nafirKinds[kind] ?? kind;

  factory NafirCall.fromJson(Map<String, dynamic> j) => NafirCall(
        id: j['id'] as String,
        displayName: j['display_name'] as String? ?? '',
        kind: j['kind'] as String? ?? 'other',
        title: j['title'] as String? ?? '',
        description: j['description'] as String? ?? '',
        state: j['state'] as String? ?? '',
        locality: j['locality'] as String? ?? '',
        startsOn: j['starts_on'] as String? ?? '',
        needed: (j['needed'] as num?)?.toInt() ?? 0,
        hosting: j['hosting'] as String?,
        bringTools: j['bring_tools'] as String?,
        outcome: j['outcome'] as String?,
        attended: (j['attended'] as num?)?.toInt(),
      );
}

class FazaRequest {
  const FazaRequest({
    required this.id,
    required this.displayName,
    required this.cause,
    required this.title,
    required this.description,
    required this.state,
    required this.locality,
    required this.needs,
  });

  final String id;
  final String displayName;
  final String cause;
  final String title;
  final String description;
  final String state;
  final String locality;
  final List<String> needs;

  String get causeLabel => fazaCauses[cause] ?? cause;

  factory FazaRequest.fromJson(Map<String, dynamic> j) => FazaRequest(
        id: j['id'] as String,
        displayName: j['display_name'] as String? ?? '',
        cause: j['cause'] as String? ?? 'other',
        title: j['title'] as String? ?? '',
        description: j['description'] as String? ?? '',
        state: j['state'] as String? ?? '',
        locality: j['locality'] as String? ?? '',
        needs: ((j['needs'] as List<dynamic>?) ?? const [])
            .map((e) => e as String)
            .toList(),
      );
}

class NafirIndicators {
  const NafirIndicators({
    required this.signers,
    required this.leaders,
    required this.nafirDone,
    required this.attended,
    required this.pledgesTotal,
    required this.pledgesKept,
    required this.shuraTotal,
    required this.shuraAnswered,
    required this.pulseCount,
    required this.pulseFloor,
    this.pulseTrustPeople,
  });

  final int signers;
  final int leaders;
  final int nafirDone;
  final int attended;
  final int pledgesTotal;
  final int pledgesKept;
  final int shuraTotal;
  final int shuraAnswered;
  final int pulseCount;
  final int pulseFloor;

  /// Null below the floor of respondents — the database withholds it.
  final double? pulseTrustPeople;

  factory NafirIndicators.fromJson(Map<String, dynamic> j) {
    int n(String k) => (j[k] as num?)?.toInt() ?? 0;
    return NafirIndicators(
      signers: n('signers_leaders') + n('signers_members'),
      leaders: n('signers_leaders'),
      nafirDone: n('nafir_done'),
      attended: n('nafir_attended'),
      pledgesTotal: n('pledges_total'),
      pledgesKept: n('pledges_kept'),
      shuraTotal: n('shura_total'),
      shuraAnswered: n('shura_answered'),
      pulseCount: n('pulse_count'),
      pulseFloor: n('pulse_floor'),
      pulseTrustPeople: (j['pulse_trust_people'] as num?)?.toDouble(),
    );
  }
}

class NafirBoard {
  const NafirBoard({
    required this.open,
    required this.done,
    required this.faza,
    required this.joined,
    this.indicators,
  });

  final List<NafirCall> open;
  final List<NafirCall> done;
  final List<FazaRequest> faza;

  /// Call id → how many have answered.
  final Map<String, int> joined;
  final NafirIndicators? indicators;
}
