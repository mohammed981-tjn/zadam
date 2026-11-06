/// وضع الوكيل في التطبيق (البند ٢٠٣): the website's /agent and /agent/[farmer] for a verified organisation acting for
/// farmers who authorised it, and «وكلائي» (/account/agents) for the farmer — through /api/app/agent/**.
///
/// Nothing starts before the farmer accepts from their own account; the database checks every step (the asker is a
/// verified company, the one answering is the farmer, a writer on a season holds a standing permission in seasons and
/// the season is active, the objector owns the line). What an agent writes on a season is marked as theirs — «سجّلها
/// الوكيل «…»» — and the farmer may object, which reopens the stage when that breaks no order.
library;

import 'dart:convert';

import 'account.dart';

const agentScopes = <String, String>{'lands': 'الأراضي', 'seasons': 'المواسم', 'herds': 'القطيع'};

/// What each permission covers, as the website's request form says it.
const agentScopeLong = <String, String>{
  'lands': 'الأراضي: يراها ويسجّل أرضاً ويعدّلها ويرفع مستنداتها',
  'seasons': 'المواسم: يراها ويعتمد مراحلها ويرفع أدلّتها، معلَّمةً باسمه، وتعترض على ما كتبه',
  'herds': 'القطيع: يراه ويتابع مراحله',
};

/// The kinds of evidence an agent may record on a stage.
const evidenceKinds = <String, String>{'photo': 'صورة', 'invoice': 'فاتورة', 'inspection': 'معاينة'};

/// The mark on a stage or a piece of evidence an agent wrote, as src/components/AgentWriteMark.tsx says it to the farmer.
String agentMark({String? company, required bool stage, String? caption}) {
  final who = company != null && company.isNotEmpty ? 'الوكيل «$company»' : 'وكيلك';
  return stage
      ? 'سجّلها $who: اعتمد هذه المرحلة باسمك.'
      : 'سجّله $who: رفع الدليل${caption != null && caption.isNotEmpty ? ' «$caption»' : ''} باسمك.';
}

/// What reopening means, under the objection form (AgentWriteMark).
String objectionNote({required bool stage}) => stage
    ? 'تُفتح المرحلة من جديد إن لم تُعتمد بعدها مرحلة، فتعتمدها أنت حين تتمّ. ودليلها يبقى.'
    : 'يبقى الدليل، معلَّماً أنّك اعترضت عليه.';

String _day(String? iso) {
  const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  final d = iso == null ? null : DateTime.tryParse(iso);
  return d == null ? '' : '${d.day} ${months[d.month - 1]} ${d.year}';
}

int _int(Object? v) => v is num ? v.round() : int.tryParse('$v') ?? 0;
List<String> _strings(Object? v) => [for (final x in (v as List? ?? const [])) '$x'];

// ── The agent's side ───────────────────────────────────────────────────────

class AgentCompany {
  AgentCompany({required this.id, required this.name, this.verifiedAt, this.active = true});
  final String id;
  final String name;
  final String? verifiedAt;
  final bool active;
}

/// A row of agent_my_farmers(): the name and phone only while the permission stands.
class AgentFarmer {
  AgentFarmer(this.j);
  final Map<String, dynamic> j;
  String get id => j['id'] as String;
  String? get farmerId => j['farmer_id'] as String?;
  String get fullName => (j['full_name'] as String?)?.trim().isNotEmpty == true ? j['full_name'] as String : 'مزارع';
  String? get phone => j['phone'] as String?;
  String get phoneTail => j['phone_tail'] as String? ?? '';
  List<String> get scopes => _strings(j['scopes']);
  String get scopesLabel => j['scopes_label'] as String? ?? scopes.map((s) => agentScopes[s] ?? s).join(' و');
  String get status => j['status'] as String? ?? 'pending';
  String get statusLabel => j['status_label'] as String? ?? status;
  bool get managed => j['managed'] == true;
  String get since => _day(j['answered_at'] as String?);
  String get requested => _day(j['requested_at'] as String?);
  String get endedOn => _day((j['ended_at'] ?? j['answered_at'] ?? j['requested_at']) as String?);
}

class AgentBoard {
  AgentBoard({this.company, this.ready = false, this.farmers = const []});
  final AgentCompany? company;
  final bool ready;
  final List<AgentFarmer> farmers;

  List<AgentFarmer> get active => [for (final m in farmers) if (m.status == 'active') m];
  List<AgentFarmer> get pending => [for (final m in farmers) if (m.status == 'pending') m];
  List<AgentFarmer> get past => [for (final m in farmers) if (m.status != 'active' && m.status != 'pending') m];

  factory AgentBoard.fromJson(Map<String, dynamic> j) {
    final c = j['company'] as Map<String, dynamic>?;
    return AgentBoard(
      company: c == null
          ? null
          : AgentCompany(
              id: c['id'] as String,
              name: c['name'] as String? ?? '',
              verifiedAt: c['verified_at'] as String?,
              active: c['active'] as bool? ?? true,
            ),
      ready: j['ready'] == true,
      farmers: [for (final m in (j['farmers'] as List? ?? const [])) AgentFarmer(m as Map<String, dynamic>)],
    );
  }
}

class FarmerStage {
  FarmerStage(this.j);
  final Map<String, dynamic> j;
  String get id => j['id'] as String;
  String get name => j['name'] as String? ?? j['stage_key'] as String? ?? '';
  String get plannedStart => j['planned_start'] as String? ?? '';
  String get plannedEnd => j['planned_end'] as String? ?? '';
  bool get completed => j['completed'] == true;
  bool get byAgent => j['by_agent'] == true;
  int get evidenceCount => _int(j['evidence_count']);

  /// The farmer objected to an agent's sign-off: only the farmer signs it off now.
  bool get objected => j['objected'] == true;

  /// Every stage before it is signed off, as the database requires.
  bool get next => j['next'] == true;

  /// The website shows «اعتمد المرحلة باسمه» for the next open stage that has evidence and no objection.
  bool get canComplete => !completed && next && !objected && evidenceCount > 0;
  bool get canAddEvidence => !completed;
}

class FarmerSeason {
  FarmerSeason(this.j);
  final Map<String, dynamic> j;
  String get id => j['id'] as String;
  String get name => j['name'] as String? ?? '';
  String get cropName => j['crop_name'] as String? ?? j['crop_key'] as String? ?? '';
  num get feddans => (j['feddans'] as num?) ?? 0;
  String get planted => _day(j['planting_date'] as String?);
  String get status => j['status'] as String? ?? '';
  int get stagesDone => _int(j['stages_done']);
  int get stagesTotal => _int(j['stages_total']);
  List<FarmerStage> get stages => [for (final g in (j['stages'] as List? ?? const [])) FarmerStage(g as Map<String, dynamic>)];
}

/// A farmer the agent acts for, as /agent/[farmer] shows them.
class FarmerView {
  FarmerView(this.j);
  final Map<String, dynamic> j;
  Map<String, dynamic> get _f => j['farmer'] as Map<String, dynamic>? ?? const {};
  String get id => _f['id'] as String? ?? '';
  String get fullName => (_f['full_name'] as String?)?.trim().isNotEmpty == true ? _f['full_name'] as String : 'مزارع';
  String? get phone => _f['phone'] as String?;
  List<String> get scopes => _strings(_f['scopes']);
  String get scopesLabel => _f['scopes_label'] as String? ?? '';
  bool can(String scope) => scopes.contains(scope);

  List<Map<String, dynamic>> get lands => [for (final l in (j['lands'] as List? ?? const [])) l as Map<String, dynamic>];
  List<FarmerSeason> get seasons => [for (final s in (j['seasons'] as List? ?? const [])) FarmerSeason(s as Map<String, dynamic>)];
  List<Map<String, dynamic>> get herds => [for (final h in (j['herds'] as List? ?? const [])) h as Map<String, dynamic>];
  List<({String at, String label})> get actions => [
        for (final a in (j['actions'] as List? ?? const []))
          (at: _day((a as Map)['at'] as String?), label: a['label'] as String? ?? ''),
      ];
}

// ── The farmer's side: «وكلائي» ────────────────────────────────────────────

class MyAgent {
  MyAgent(this.j);
  final Map<String, dynamic> j;
  String get id => j['id'] as String;
  String get companyName => j['company_name'] as String? ?? '';
  String get companyPhone => j['company_phone'] as String? ?? '';
  String get status => j['status'] as String? ?? 'pending';
  String get statusLabel => j['status_label'] as String? ?? status;
  String get note => j['note'] as String? ?? '';
  String get scopesLabel => j['scopes_label'] as String? ?? '';
  List<String> get scopesLong => _strings(j['scopes_long']);
  String get requested => _day(j['requested_at'] as String?);
  String get since => _day(j['answered_at'] as String?);
  String get endedOn => _day((j['ended_at'] ?? j['answered_at'] ?? j['requested_at']) as String?);
}

/// A line an agent wrote in the farmer's name.
class AgentWrite {
  AgentWrite(this.j);
  final Map<String, dynamic> j;
  int get id => _int(j['id']);
  String get at => _day(j['at'] as String?);
  String get subject => j['subject'] as String? ?? '';
  String? get company => j['company'] as String?;
  String get label => j['label'] as String? ?? '';
  String? get seasonId => j['season_id'] as String?;
  bool get onSeason => subject == 'season_stage' || subject == 'stage_evidence';
  bool get isStage => subject == 'season_stage';
  String? get objectionReason => (j['objection'] as Map?)?['reason'] as String?;
  bool get reopened => (j['objection'] as Map?)?['reopened'] == true;
  bool get canObject => j['can_object'] == true;

  /// «سجّلها الوكيل «…»» for a season's stage or evidence; the plain line for the rest.
  String get mark => onSeason ? agentMark(company: company, stage: isStage) : '${company ?? 'وكيل'} · $label';
}

class MyAgentsView {
  MyAgentsView({this.agents = const [], this.writes = const []});
  final List<MyAgent> agents;
  final List<AgentWrite> writes;

  List<MyAgent> get pending => [for (final m in agents) if (m.status == 'pending') m];
  List<MyAgent> get active => [for (final m in agents) if (m.status == 'active') m];
  List<MyAgent> get past => [for (final m in agents) if (m.status != 'active' && m.status != 'pending') m];

  factory MyAgentsView.fromJson(Map<String, dynamic> j) => MyAgentsView(
        agents: [for (final m in (j['agents'] as List? ?? const [])) MyAgent(m as Map<String, dynamic>)],
        writes: [for (final a in (j['actions'] as List? ?? const [])) AgentWrite(a as Map<String, dynamic>)],
      );
}

// ── The calls ──────────────────────────────────────────────────────────────

class AgentApi {
  AgentApi({AccountController? account}) : _account = account ?? accountController;
  final AccountController _account;

  static String _msg(Map<String, dynamic> j) => j['message'] as String? ?? '';

  Future<AgentBoard> board() async => AgentBoard.fromJson(await _account.call('GET', '/api/app/agent'));

  /// Asks a farmer, by their phone number, to authorise the organisation in [scopes], saying why.
  Future<String> request({required String phone, required List<String> scopes, required String note}) async =>
      _msg(await _account.call('POST', '/api/app/agent', body: {'action': 'request', 'phone': phone, 'scopes': scopes, 'note': note}));

  /// Stops acting for a farmer, or withdraws a request not yet answered.
  Future<String> end(String mandateId) async =>
      _msg(await _account.call('POST', '/api/app/agent', body: {'action': 'end', 'id': mandateId}));

  Future<FarmerView> farmer(String farmerId) async => FarmerView(await _account.call('GET', '/api/app/agent/$farmerId'));

  /// Signs off the stage in the farmer's name (agent_stage_complete).
  Future<String> completeStage(String farmerId, String stageId) async =>
      _msg(await _account.call('POST', '/api/app/agent/$farmerId', body: {'action': 'complete', 'stage_id': stageId}));

  /// Records a photo as the stage's evidence in the farmer's name (agent_stage_evidence_add).
  Future<String> addEvidence(String farmerId, String stageId, {required String kind, required List<int> photo, String caption = ''}) async =>
      _msg(await _account.call('POST', '/api/app/agent/$farmerId', body: {
        'action': 'evidence',
        'stage_id': stageId,
        'kind': kind,
        'caption': caption,
        'photo': base64Encode(photo),
      }));

  Future<MyAgentsView> myAgents() async => MyAgentsView.fromJson(await _account.call('GET', '/api/app/agent/mine'));

  Future<String> answer(String mandateId, {required bool accept}) async => _msg(await _account.call('POST', '/api/app/agent/mine',
      body: {'action': 'answer', 'id': mandateId, 'decision': accept ? 'accept' : 'decline'}));

  Future<String> endMine(String mandateId) async =>
      _msg(await _account.call('POST', '/api/app/agent/mine', body: {'action': 'end', 'id': mandateId}));

  /// Objects to a line an agent wrote (agent_write_object); the reason is what the agent reads.
  Future<String> object(int actionId, String reason) async => _msg(await _account.call('POST', '/api/app/agent/mine',
      body: {'action': 'object', 'action_id': actionId, 'reason': reason}));
}
