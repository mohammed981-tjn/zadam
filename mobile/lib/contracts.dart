/// «عقودي» في التطبيق (البند ٢٠٣): service contracts, forward contracts and partnership agreements, read and signed
/// on the phone.
///
/// Everything goes through the website's routes under /api/app/contracts with the app's session
/// ([AccountController.call]). Those routes take the same steps the website's own buttons take — the same database
/// functions and triggers, through row-level security — so the phone can do nothing the website would not let the
/// same person do. Writing a new contract stays on the website.
///
/// The rules here that decide which buttons to show are copies of the website's (src/app/contracts/[id]/page.tsx,
/// src/app/market/forward/[id]/page.tsx, src/app/invest/agreements/[id]/page.tsx). They are a courtesy, not a
/// boundary: a button the database would refuse is not offered, and a request sent anyway is refused there.
/// scripts/verify-app-contracts-invest.ts holds the labels here to the website's.
library;

import 'dart:ui';

import 'account.dart';
import 'i18n.dart';

/// A signed-in request to a route under /api/app — [AccountController.call], or a stand-in in tests.
typedef AppCall = Future<Map<String, dynamic>> Function(String method, String path, {Map<String, dynamic>? body});

String _s(Object? v) => v is String ? v : (v == null ? '' : '$v');
String? _sn(Object? v) => v is String && v.isNotEmpty ? v : null;
num _n(Object? v) => v is num ? v : (num.tryParse('$v') ?? 0);
bool _b(Object? v) => v == true;
List<Map<String, dynamic>> _list(Object? v) => [
  for (final e in (v as List? ?? const []))
    if (e is Map) e.cast<String, dynamic>(),
];
List<String> _strings(Object? v) => [for (final e in (v as List? ?? const [])) '$e'];

/// Whole numbers with thousands separators, as the website prints money.
String money(num v) {
  final whole = v.round().abs().toString();
  final grouped = whole.replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => ',');
  return v < 0 ? '-$grouped' : grouped;
}

/// Up to two decimals, as the forward contract prints quantities and prices.
String amount(num v) {
  if (v == v.roundToDouble()) return money(v);
  final fixed = v.toStringAsFixed(2).replaceFirst(RegExp(r'0+$'), '');
  final parts = fixed.split('.');
  return '${money(num.parse(parts[0]))}.${parts[1]}';
}

/// A date (yyyy-mm-dd or a timestamp) as day/month/year.
String day(String? iso) {
  final d = iso == null ? null : DateTime.tryParse(iso);
  if (d == null) return iso ?? '';
  final l = d.isUtc ? d.toLocal() : d;
  return '${l.day}/${l.month}/${l.year}';
}

// ── عقود الخدمة ──────────────────────────────────────────────────────────────

/// The contract's own state, in the words of /contracts and /contracts/[id].
Map<String, String> get serviceStatusLabel => <String, String>{
  'draft': tr('مسودة', 'Draft'),
  'proposed': tr('معروض', 'Offered'),
  'active': tr('سارٍ', 'Active'),
  'completed': tr('منجز', 'Completed'),
  'cancelled': tr('ملغى', 'Cancelled'),
  'disputed': tr('متنازع عليه', 'Disputed'),
};

/// What each state means for the reader, as the contract page says it.
Map<String, String> get serviceStatusSays => <String, String>{
  'draft': tr('لم يُعرض بعد على مقدّم الخدمة. عدّل ما شئت — المراحل والأسعار ما تزال قابلة للتغيير، ولا عمل يبدأ.', 'Not yet offered to the service provider. Change what you like — the phases and prices can still change, and no work starts.'),
  'proposed': tr('بانتظار قبول مقدّم الخدمة. والشروط تجمّدت لحظة العرض: لا يُغيَّر سعر ولا كمية ولا تُضاف مرحلة أو تُحذف، حتى يُسحب العرض.', 'Waiting for the service provider to accept. The terms froze the moment it was offered: no price or quantity changes and no phase is added or removed until the offer is withdrawn.'),
  'active': tr('وقّع الطرفان. المراحل تتحرّك الآن، والدفع يتبع الإثبات.', 'Both parties signed. The phases move now, and payment follows proof.'),
  'completed': tr('أُقفل بعد اعتماد كل مراحله.', 'Closed after all its phases were approved.'),
  'cancelled': tr('أُلغي قبل أن يسري.', 'Cancelled before it took effect.'),
  'disputed': tr('أُعلن عليه نزاع. ولا يتحرّك بعدها إلا بقرار من الإدارة.', 'A dispute was declared on it. After that it moves only by a decision of the administrators.'),
};

Map<String, String> get milestoneStatusLabel => <String, String>{
  'pending': tr('لم تبدأ', 'Not started'),
  'in_progress': tr('جارية', 'In progress'),
  'submitted': tr('سُلّمت — بانتظار الاعتماد', 'Delivered — awaiting approval'),
  'approved': tr('معتمدة', 'Approved'),
  'paid': tr('مدفوعة', 'Paid'),
  'rejected': tr('مرفوضة', 'Rejected'),
};

Map<String, String> get evidenceKindLabel => <String, String>{
  'photo': tr('صورة', 'Photo'),
  'invoice': tr('فاتورة', 'Invoice'),
  'inspection': tr('معاينة', 'Inspection'),
  'report': tr('تقرير', 'Report'),
  'note': tr('ملاحظة', 'Note'),
};

class ContractMove {
  const ContractMove(this.status, this.label, {this.danger = false});
  final String status;
  final String label;

  /// Cancelling or disputing: drawn as an outline, never filled.
  final bool danger;
}

/// The steps open to this reader on a service contract now — a copy of `contractMoves` on the website, which is
/// itself a copy of `enforce_contract_status`. [isClient] is the contract's own client, not an administrator.
List<ContractMove> contractMoves(
  String status, {
  required bool isClient,
  required bool isProvider,
  required bool isAdmin,
}) {
  final moves = <ContractMove>[];
  if (status == 'draft') {
    if (isClient) moves.add(ContractMove('proposed', tr('اعرضه على مقدّم الخدمة', 'Propose it to the service provider')));
    if (isClient) moves.add(ContractMove('cancelled', tr('ألغِ المسودة', 'Cancel the draft'), danger: true));
  } else if (status == 'proposed') {
    // Accepting is the provider's signature: the contract becomes binding on both.
    if (isProvider) moves.add(ContractMove('active', tr('أقبل العقد', 'Accept the contract')));
    if (isClient) moves.add(ContractMove('draft', tr('اسحب العرض للتعديل', 'Withdraw the proposal to edit it')));
    if (isClient || isProvider) moves.add(ContractMove('cancelled', tr('ألغِ العقد', 'Cancel the contract'), danger: true));
  } else if (status == 'active') {
    if (isClient) moves.add(ContractMove('completed', tr('أقفل العقد', 'Close the contract')));
  } else if (status == 'disputed' && isAdmin) {
    moves.add(ContractMove('active', tr('أعِده سارياً', 'Make it active again')));
    moves.add(ContractMove('completed', tr('أقفله منجزاً', 'Close it as completed')));
    moves.add(ContractMove('cancelled', tr('أقفله ملغى', 'Close it as cancelled'), danger: true));
  }
  // والنزاعُ بابٌ لا يُغلق: من «سارٍ» ومن «منجز» ومن «ملغى» سواء، ولأيّ الطرفين.
  if (const ['active', 'completed', 'cancelled'].contains(status) && (isClient || isProvider)) {
    moves.add(ContractMove('disputed', tr('أعلن نزاعاً', 'Declare a dispute'), danger: true));
  }
  return moves;
}

/// The next step of a phase, and whose it is (the handoff of 20 August: the provider starts and submits, the client
/// approves and pays).
class MilestoneNext {
  const MilestoneNext(this.status, this.label, this.actor);
  final String status;
  final String label;

  /// 'provider' or 'client'.
  final String actor;
}

Map<String, MilestoneNext> get milestoneNext => <String, MilestoneNext>{
  'pending': MilestoneNext('in_progress', tr('ابدأ التنفيذ', 'Start the work'), 'provider'),
  'in_progress': MilestoneNext('submitted', tr('سلّم المرحلة', 'Hand over the phase'), 'provider'),
  'submitted': MilestoneNext('approved', tr('اعتمد المرحلة', 'Approve the phase'), 'client'),
  'approved': MilestoneNext('paid', tr('سجّل الدفع', 'Record payment'), 'client'),
};

Map<String, String> get _waitingOn => <String, String>{'provider': tr('بانتظار مقدّم الخدمة', 'Waiting for the service provider'), 'client': tr('بانتظار العميل', 'Waiting for the client')};

class Evidence {
  const Evidence({required this.kind, this.caption, this.capturedAt, this.latitude, this.longitude});
  final String kind;
  final String? caption;
  final String? capturedAt;
  final num? latitude;
  final num? longitude;

  factory Evidence.fromJson(Map<String, dynamic> j) => Evidence(
    kind: _s(j['kind']),
    caption: _sn(j['caption']),
    capturedAt: _sn(j['captured_at']),
    latitude: j['latitude'] as num?,
    longitude: j['longitude'] as num?,
  );
}

class Milestone {
  const Milestone({
    required this.id,
    required this.seq,
    required this.title,
    required this.status,
    required this.quantity,
    required this.unit,
    required this.unitPrice,
    required this.amount,
    required this.requiresEvidence,
    required this.evidence,
    this.plannedStart,
    this.plannedEnd,
  });

  final String id;
  final int seq;
  final String title;
  final String status;
  final num quantity;
  final String unit;
  final num unitPrice;
  final num amount;
  final String? plannedStart;
  final String? plannedEnd;
  final bool requiresEvidence;
  final List<Evidence> evidence;

  factory Milestone.fromJson(Map<String, dynamic> j) => Milestone(
    id: _s(j['id']),
    seq: _n(j['seq']).toInt(),
    title: _s(j['title']),
    status: _s(j['status']),
    quantity: _n(j['quantity']),
    unit: _s(j['unit']),
    unitPrice: _n(j['unit_price']),
    amount: _n(j['amount']),
    plannedStart: _sn(j['planned_start']),
    plannedEnd: _sn(j['planned_end']),
    requiresEvidence: _b(j['requires_evidence']),
    evidence: [for (final e in _list(j['evidence'])) Evidence.fromJson(e)],
  );
}

class ServiceContract {
  const ServiceContract({
    required this.id,
    required this.title,
    required this.status,
    required this.currency,
    required this.total,
    required this.paid,
    required this.isClient,
    required this.isProvider,
    required this.isAdmin,
    required this.milestones,
    this.providerName,
    this.signedAt,
    this.seasonId,
  });

  final String id;
  final String title;
  final String status;
  final String currency;
  final num total;
  final num paid;
  final String? providerName;
  final String? signedAt;
  final String? seasonId;
  final bool isClient;
  final bool isProvider;
  final bool isAdmin;
  final List<Milestone> milestones;

  String get statusLabel => serviceStatusLabel[status] ?? status;
  String get says => serviceStatusSays[status] ?? '';

  List<ContractMove> get moves => contractMoves(status, isClient: isClient, isProvider: isProvider, isAdmin: isAdmin);

  /// The work moves only on a contract in force.
  bool get running => status == 'active';

  /// Whether the next step of [m] is this reader's to take. A person can be both sides at once — a provider
  /// contracting a season they own — and an administrator counts as the client, as on the website.
  bool isMine(Milestone m) {
    final next = milestoneNext[m.status];
    if (!running || next == null) return false;
    return next.actor == 'client' ? (isClient || isAdmin) : isProvider;
  }

  /// A submitted phase that needs proof and has none cannot be approved yet.
  bool blocked(Milestone m) => m.status == 'submitted' && m.requiresEvidence && m.evidence.isEmpty;

  /// What a phase waits for, when it is not the reader's step — the website's sentence.
  String? waitingText(Milestone m) {
    final next = milestoneNext[m.status];
    if (next == null || isMine(m)) return null;
    return running
        ? '${_waitingOn[next.actor]}: ${next.label}.'
        : tr('المراحل لا تتحرّك ما دام العقد «$statusLabel» — لا عمل قبل الاتفاق.', 'The phases do not move while the contract is «$statusLabel» — no work before agreement.');
  }

  factory ServiceContract.fromJson(Map<String, dynamic> j) => ServiceContract(
    id: _s(j['id']),
    title: _s(j['title']),
    status: _s(j['status']),
    currency: _s(j['currency']),
    total: _n(j['total_amount']),
    paid: _n(j['paid']),
    providerName: _sn(j['provider_name']),
    signedAt: _sn(j['signed_at']),
    seasonId: _sn(j['season_id']),
    isClient: _b(j['is_client']),
    isProvider: _b(j['is_provider']),
    isAdmin: _b(j['is_admin']),
    milestones: [for (final m in _list(j['milestones'])) Milestone.fromJson(m)],
  );
}

class ServiceContractRow {
  const ServiceContractRow({
    required this.id,
    required this.title,
    required this.status,
    required this.currency,
    required this.total,
    this.providerName,
  });
  final String id;
  final String title;
  final String status;
  final String currency;
  final num total;
  final String? providerName;

  String get statusLabel => serviceStatusLabel[status] ?? status;

  factory ServiceContractRow.fromJson(Map<String, dynamic> j) => ServiceContractRow(
    id: _s(j['id']),
    title: _s(j['title']),
    status: _s(j['status']),
    currency: _s(j['currency']),
    total: _n(j['total_amount']),
    providerName: _sn(j['provider_name']),
  );
}

// ── العقد الآجل ──────────────────────────────────────────────────────────────

/// The states a forward contract is still open in (FORWARD_OPEN).
const forwardOpen = ['proposed', 'signed', 'delivered', 'cancel_requested', 'disputed'];

class ForwardRow {
  const ForwardRow({
    required this.id,
    required this.ref,
    required this.crop,
    required this.quantity,
    required this.unit,
    required this.price,
    required this.currency,
    required this.deliveryFrom,
    required this.deliveryTo,
    required this.place,
    required this.status,
    required this.statusLabel,
    required this.buyerId,
    required this.farmerId,
    required this.proposedBy,
    this.cancelRequestedBy,
  });

  final String id;
  final String ref;
  final String crop;
  final num quantity;
  final String unit;
  final num price;
  final String currency;
  final String deliveryFrom;
  final String deliveryTo;
  final String place;
  final String status;
  final String statusLabel;
  final String buyerId;
  final String farmerId;
  final String proposedBy;
  final String? cancelRequestedBy;

  bool get open => forwardOpen.contains(status);

  String side(String me) => buyerId == me
      ? tr('أنت المشتري', 'You are the buyer')
      : farmerId == me
      ? tr('أنت المزارع', 'You are the farmer')
      : tr('نزاعٌ ينتظر الإدارة', 'A dispute awaiting the administration');

  /// «ينتظرك», as the list on the website marks it.
  bool waitingFor(String me) =>
      (status == 'proposed' && proposedBy != me) ||
      (status == 'delivered' && farmerId == me) ||
      (status == 'cancel_requested' && cancelRequestedBy != me);

  factory ForwardRow.fromJson(Map<String, dynamic> j) => ForwardRow(
    id: _s(j['id']),
    ref: _s(j['ref']),
    crop: _s(j['crop']),
    quantity: _n(j['quantity']),
    unit: _s(j['unit']),
    price: _n(j['price']),
    currency: _s(j['currency']),
    deliveryFrom: _s(j['delivery_from']),
    deliveryTo: _s(j['delivery_to']),
    place: _s(j['delivery_place']),
    status: _s(j['status']),
    statusLabel: _s(j['status_label']),
    buyerId: _s(j['buyer_id']),
    farmerId: _s(j['farmer_id']),
    proposedBy: _s(j['proposed_by']),
    cancelRequestedBy: _sn(j['cancel_requested_by']),
  );
}

class ForwardEvent {
  const ForwardEvent({required this.at, required this.label, this.actor, this.note});
  final String at;
  final String label;
  final String? actor;
  final String? note;

  factory ForwardEvent.fromJson(Map<String, dynamic> j) =>
      ForwardEvent(at: _s(j['at']), label: _s(j['label']), actor: _sn(j['actor']), note: _sn(j['note']));
}

/// One step a reader can take on a forward contract from the phone.
class ForwardAction {
  const ForwardAction(
    this.step,
    this.label, {
    this.prompt,
    this.needsReason = false,
    this.secondary = false,
    this.onSite = false,
  });
  final String step;
  final String label;

  /// The sentence above the buttons on the website.
  final String? prompt;

  /// Asks for a reason the other side reads (at least five letters, as the website's box).
  final bool needsReason;
  final bool secondary;

  /// Taken on the website: it needs the delivery form or the administration's ruling.
  final bool onSite;
}

class ForwardContract {
  const ForwardContract({
    required this.row,
    required this.me,
    required this.isAdmin,
    required this.grade,
    required this.tolerance,
    required this.value,
    required this.paymentTerms,
    required this.latePctWeek,
    required this.lateCapPct,
    required this.breachPct,
    required this.forceMajeure,
    required this.farmerName,
    required this.buyerName,
    required this.proposedAt,
    required this.events,
    this.farmerPhone,
    this.buyerPhone,
    this.advancePercent,
    this.notes,
    this.consigneeName,
    this.consigneePhone,
    this.signedAt,
    this.deliveredQuantity,
    this.deliveredOn,
    this.gradeMet,
    this.deliveryNote,
    this.penaltyAwarded,
    this.penaltyPayer,
  });

  final ForwardRow row;
  final String me;
  final bool isAdmin;
  final String grade;
  final num tolerance;
  final num value;
  final String paymentTerms;
  final num? advancePercent;
  final String? notes;
  final String? consigneeName;
  final String? consigneePhone;
  final num latePctWeek;
  final num lateCapPct;
  final num breachPct;
  final bool forceMajeure;
  final String farmerName;
  final String? farmerPhone;
  final String buyerName;
  final String? buyerPhone;
  final String proposedAt;
  final String? signedAt;
  final num? deliveredQuantity;
  final String? deliveredOn;
  final bool? gradeMet;
  final String? deliveryNote;
  final num? penaltyAwarded;
  final String? penaltyPayer;
  final List<ForwardEvent> events;

  bool get isBuyer => row.buyerId == me;
  bool get isFarmer => row.farmerId == me;
  bool get party => isBuyer || isFarmer;

  /// What waits for the reader, as the contract page offers it.
  List<ForwardAction> get actions {
    final s = row.status;
    final out = <ForwardAction>[];
    if (s == 'proposed' && party && row.proposedBy != me) {
      final prompt = tr('بتوقيعك يصير العقد ملزماً لكما بشروطه أعلاه. وقّع إن كنت تعرف الطرف الآخر واتّفقتما على هذا.', 'Signing makes the contract bind you both by the terms above. Sign if you know the other side and agreed this.');
      out.add(ForwardAction('sign', tr('أوقّع العقد', 'I sign the contract'), prompt: prompt));
      out.add(ForwardAction('decline', tr('أعتذر', 'Decline'), secondary: true));
    }
    if (s == 'proposed' && row.proposedBy == me) {
      out.add(ForwardAction('withdraw', tr('اسحب الاقتراح', 'Withdraw the proposal'), prompt: tr('ينتظر توقيع الطرف الآخر.', 'Awaiting the other side\'s signature.'), secondary: true));
    }
    if (s == 'signed' && isBuyer) {
      out.add(ForwardAction('deliver', tr('سجّل التسليم', 'Record the delivery'), prompt: tr('سجّل ما استلمت', 'Record what you received'), onSite: true));
    }
    if (s == 'delivered' && isFarmer) {
      out.add(
        ForwardAction('confirm', tr('أؤكّد التسليم', 'I confirm the delivery'), prompt: tr('إن كان ما سجّله المشتري صحيحاً فأكّده، فيُقفل العقد.', 'If what the buyer recorded is right, confirm it and the contract closes.')),
      );
    }
    if (s == 'cancel_requested' && party && row.cancelRequestedBy != me) {
      out.add(
        ForwardAction(
          'cancel_yes',
          tr('أقبل الإلغاء', 'Accept cancellation'),
          prompt: tr('يطلب الطرف الآخر إلغاء العقد. لا يُلغى إلا إن قبلت.', 'The other side asks to cancel the contract. It is cancelled only if you accept.'),
        ),
      );
      out.add(ForwardAction('cancel_no', tr('أرفض، والعقد قائم', 'Refuse: the contract stands'), secondary: true));
    }
    if ((s == 'signed' || s == 'delivered') && party) {
      out.add(
        ForwardAction('cancel', tr('أرسل طلب الإلغاء', 'Send the request'), prompt: tr('اطلب الإلغاء', 'Ask to cancel'), needsReason: true, secondary: true),
      );
    }
    if ((s == 'signed' || s == 'delivered' || s == 'cancel_requested') && party) {
      out.add(
        ForwardAction(
          'dispute',
          tr('ارفع النزاع', 'Raise the dispute'),
          prompt: tr('حين لا تتّفقان: تسمع الإدارة الطرفين وتكتب ما فصلت به.', 'When you cannot agree: the administration hears both sides and writes down its decision.'),
          needsReason: true,
          secondary: true,
        ),
      );
    }
    if (s == 'disputed' && isAdmin) {
      out.add(ForwardAction('resolve', tr('الفصل في النزاع', 'Decide the dispute'), onSite: true));
    }
    return out;
  }

  factory ForwardContract.fromJson(Map<String, dynamic> j) => ForwardContract(
    row: ForwardRow.fromJson({...j, 'unit': j['unit_label'] ?? j['unit']}),
    me: _s(j['me']),
    isAdmin: _b(j['is_admin']),
    grade: _s(j['grade']),
    tolerance: _n(j['tolerance_percent']),
    value: _n(j['value']),
    paymentTerms: _s(j['payment_terms']),
    advancePercent: j['advance_percent'] as num?,
    notes: _sn(j['notes']),
    consigneeName: _sn(j['consignee_name']),
    consigneePhone: _sn(j['consignee_phone']),
    latePctWeek: _n(j['late_penalty_pct_week']),
    lateCapPct: _n(j['late_penalty_cap_pct']),
    breachPct: _n(j['breach_penalty_pct']),
    forceMajeure: _b(j['force_majeure']),
    farmerName: _s(j['farmer_name']),
    farmerPhone: _sn(j['farmer_phone']),
    buyerName: _s(j['buyer_name']),
    buyerPhone: _sn(j['buyer_phone']),
    proposedAt: _s(j['proposed_at']),
    signedAt: _sn(j['signed_at']),
    deliveredQuantity: j['delivered_quantity'] as num?,
    deliveredOn: _sn(j['delivered_on']),
    gradeMet: j['grade_met'] as bool?,
    deliveryNote: _sn(j['delivery_note']),
    penaltyAwarded: j['penalty_awarded'] as num?,
    penaltyPayer: _sn(j['penalty_payer']),
    events: [for (final e in _list(j['events'])) ForwardEvent.fromJson(e)],
  );
}

// ── عقد الشراكة ──────────────────────────────────────────────────────────────

class AgreementRow {
  const AgreementRow({
    required this.id,
    required this.title,
    required this.model,
    required this.status,
    required this.version,
    required this.me,
    required this.signedByMe,
    required this.waiting,
    this.ref,
  });

  final String id;
  final String? ref;
  final String title;
  final String model;
  final String status;
  final int version;

  /// 'owner', 'investor' or 'manager'.
  final String me;
  final bool signedByMe;

  /// The roles that have not signed the current version.
  final List<String> waiting;

  bool get signed => status == 'signed';

  /// The current version waits for the reader's own signature.
  bool get waitingForMe => !signed && !signedByMe;

  String get statusLabel => signed ? tr('موقَّعٌ ومقفل', 'Signed and locked') : tr('مسوّدة — النسخة $version', 'Draft — version $version');

  factory AgreementRow.fromJson(Map<String, dynamic> j) => AgreementRow(
    id: _s(j['id']),
    ref: _sn(j['ref']),
    title: _s(j['title']),
    model: _s(j['model']),
    status: _s(j['status']),
    version: _n(j['version']).toInt(),
    me: _s(j['me']),
    signedByMe: _b(j['signed_by_me']),
    waiting: _strings(j['waiting']),
  );
}

Map<String, String> get partyRoleLabel => <String, String>{'owner': tr('صاحب الأرض', 'Landowner'), 'investor': tr('المستثمر', 'Investor'), 'manager': tr('الشركة المديرة', 'Managing company')};

class Clause {
  const Clause(this.title, this.body);
  final String title;
  final List<String> body;
}

class AgreementSignature {
  const AgreementSignature({
    required this.role,
    required this.label,
    required this.fullName,
    required this.signature,
    required this.signedAt,
  });
  final String role;
  final String label;
  final String fullName;

  /// The SVG path the signer drew, in the 600×200 space.
  final String signature;
  final String signedAt;

  factory AgreementSignature.fromJson(Map<String, dynamic> j) => AgreementSignature(
    role: _s(j['role']),
    label: _s(j['label']),
    fullName: _s(j['full_name']),
    signature: _s(j['signature']),
    signedAt: _s(j['signed_at']),
  );
}

class Agreement {
  const Agreement({
    required this.id,
    required this.title,
    required this.model,
    required this.status,
    required this.version,
    required this.termsHash,
    required this.me,
    required this.earlierSignatures,
    required this.clauses,
    required this.roles,
    required this.signatures,
    required this.shares,
    required this.seasons,
    this.ref,
    this.signedAt,
    this.rent,
    this.statementRows = const [],
    this.statementNote,
    this.hasStatement = false,
  });

  final String id;
  final String? ref;
  final String title;
  final String model;
  final String status;
  final int version;
  final String termsHash;
  final String? signedAt;

  /// 'owner', 'investor', 'manager' or 'admin'.
  final String me;
  final int earlierSignatures;
  final List<Clause> clauses;
  final List<(String, String)> roles;
  final List<AgreementSignature> signatures;
  final List<(String, num)> shares;
  final String? rent;
  final List<(String, String, String)> seasons;
  final bool hasStatement;
  final List<(String, String)> statementRows;
  final String? statementNote;

  bool get signed => status == 'signed';
  bool get managed => model == 'managed';
  AgreementSignature? signatureOf(String role) {
    for (final s in signatures) {
      if (s.role == role) return s;
    }
    return null;
  }

  /// The reader's own signature on this version.
  AgreementSignature? get mine => signatureOf(me);

  /// The roles still to sign.
  List<String> get waitingLabels => [
    for (final r in roles)
      if (signatureOf(r.$1) == null) r.$2,
  ];

  /// The signing form, as the website shows it: on an unsigned agreement, to a party who has not signed this
  /// version. An administrator reads it and signs nothing.
  bool get canSign => !signed && me != 'admin' && mine == null;

  /// The terms are written by the landowner and the investor (on the website); a managing company reads and signs.
  bool get canEditTerms => !signed && (me == 'owner' || me == 'investor');

  String get shortHash => termsHash.length > 16 ? '${termsHash.substring(0, 16)}…' : termsHash;

  factory Agreement.fromJson(Map<String, dynamic> j) {
    final st = j['statement'] as Map?;
    return Agreement(
      id: _s(j['id']),
      ref: _sn(j['ref']),
      title: _s(j['title']),
      model: _s(j['model']),
      status: _s(j['status']),
      version: _n(j['version']).toInt(),
      termsHash: _s(j['terms_hash']),
      signedAt: _sn(j['signed_at']),
      me: _s(j['me']),
      earlierSignatures: _n(j['earlier_signatures']).toInt(),
      clauses: [for (final c in _list(j['clauses'])) Clause(_s(c['title']), _strings(c['body']))],
      roles: [for (final r in _list(j['roles'])) (_s(r['role']), _s(r['label']))],
      signatures: [for (final s in _list(j['signatures'])) AgreementSignature.fromJson(s)],
      shares: [for (final s in _list(j['shares'])) (_s(s['label']), _n(s['pct']))],
      rent: _sn(j['rent']),
      seasons: [for (final s in _list(j['seasons'])) (_s(s['id']), _s(s['name']), _s(s['status_label']))],
      hasStatement: st != null,
      statementRows: [for (final r in _list(st?['rows'])) (_s(r['label']), _s(r['value']))],
      statementNote: _sn(st?['note']),
    );
  }
}

/// What the harvest-split calculator worked out.
class HarvestSplit {
  const HarvestSplit({required this.parties, required this.profitLabel, required this.profit, required this.notes});
  final List<(String, String, String, String)> parties;
  final String profitLabel;
  final String profit;
  final List<String> notes;

  factory HarvestSplit.fromJson(Map<String, dynamic> j) => HarvestSplit(
    parties: [for (final p in _list(j['parties'])) (_s(p['label']), _s(p['received']), _s(p['paid']), _s(p['net']))],
    profitLabel: _s(j['profit_label']),
    profit: _s(j['profit']),
    notes: _strings(j['notes']),
  );
}

// ── التوقيع ──────────────────────────────────────────────────────────────────

/// A signature drawn with a finger, kept as the website's pad keeps it (src/components/invest/SignaturePad.tsx):
/// an SVG path in a fixed 600×200 space, move and line commands and whole numbers only, so the database can check
/// its shape (`signature ~ '^[ML0-9 .-]+$'`) and both the site and the app can draw it back at any size.
class SignatureDrawing {
  SignatureDrawing();

  static const width = 600;
  static const height = 200;

  /// The website's pad counts line points and calls the signature ready from eight.
  static const readyFrom = 8;

  /// The table's limit on a signature's length.
  static const maxLength = 30000;

  final List<List<(int, int)>> _strokes = [];
  int _lines = 0;

  bool get isEmpty => _strokes.isEmpty;
  int get lines => _lines;

  (int, int) _point(Offset at, Size box) =>
      (((at.dx / box.width) * width).round().clamp(0, width), ((at.dy / box.height) * height).round().clamp(0, height));

  /// The finger touched the box at [at] (in a box of [box]).
  void start(Offset at, Size box) => _strokes.add([_point(at, box)]);

  /// The finger moved to [at]. A point that has not moved in the 600×200 space adds nothing.
  void extend(Offset at, Size box) {
    if (_strokes.isEmpty) {
      start(at, box);
      return;
    }
    final p = _point(at, box);
    if (_strokes.last.last == p) return;
    _strokes.last.add(p);
    _lines++;
  }

  void clear() {
    _strokes.clear();
    _lines = 0;
  }

  /// The path the website stores: "M x y L x y …".
  String get path => [
    for (final s in _strokes)
      ['M ${s.first.$1} ${s.first.$2}', for (final p in s.skip(1)) 'L ${p.$1} ${p.$2}'].join(' '),
  ].join(' ');

  /// Ready to send: enough drawn, and within the table's limits.
  bool get ready {
    if (_lines < readyFrom) return false;
    final d = path;
    return d.length >= 20 && d.length <= maxLength;
  }

  /// The strokes in a box of [box], for drawing.
  List<List<Offset>> strokesIn(Size box) => [
    for (final s in _strokes) [for (final p in s) Offset(p.$1 * box.width / width, p.$2 * box.height / height)],
  ];
}

/// A stored signature's path, as strokes in a box of [box]. Anything that is not a move or a line is skipped, as
/// the website draws only what the signer drew.
List<List<Offset>> signatureStrokes(String d, Size box) {
  final out = <List<Offset>>[];
  final parts = d.trim().split(RegExp(r'\s+'));
  for (var i = 0; i + 2 < parts.length; i += 3) {
    final x = double.tryParse(parts[i + 1]);
    final y = double.tryParse(parts[i + 2]);
    if (x == null || y == null) continue;
    final at = Offset(x * box.width / SignatureDrawing.width, y * box.height / SignatureDrawing.height);
    if (parts[i] == 'M' || out.isEmpty) {
      out.add([at]);
    } else if (parts[i] == 'L') {
      out.last.add(at);
    }
  }
  return out;
}

// ── القائمة ──────────────────────────────────────────────────────────────────

class ContractsOverview {
  const ContractsOverview({
    required this.me,
    required this.isAdmin,
    required this.service,
    required this.forward,
    required this.forwardDisputes,
    required this.agreements,
  });

  final String me;
  final bool isAdmin;
  final List<ServiceContractRow> service;
  final List<ForwardRow> forward;
  final List<ForwardRow> forwardDisputes;
  final List<AgreementRow> agreements;

  bool get isEmpty => service.isEmpty && forward.isEmpty && agreements.isEmpty && forwardDisputes.isEmpty;

  /// How many contracts wait for the reader's step: a signature, a confirmation, an answer.
  int get waitingForMe =>
      forward.where((f) => f.waitingFor(me)).length + agreements.where((a) => a.waitingForMe).length;

  factory ContractsOverview.fromJson(Map<String, dynamic> j) => ContractsOverview(
    me: _s(j['me']),
    isAdmin: _b(j['is_admin']),
    service: [for (final r in _list(j['service'])) ServiceContractRow.fromJson(r)],
    forward: [for (final r in _list(j['forward'])) ForwardRow.fromJson(r)],
    forwardDisputes: [for (final r in _list(j['forward_disputes'])) ForwardRow.fromJson(r)],
    agreements: [for (final r in _list(j['agreements'])) AgreementRow.fromJson(r)],
  );
}

/// The contracts routes, with the app's session.
class ContractsApi {
  ContractsApi({AppCall? call}) : _call = call ?? accountController.call;

  final AppCall _call;

  Future<ContractsOverview> overview() async => ContractsOverview.fromJson(await _call('GET', '/api/app/contracts'));

  /// Opens (or reopens) the agreement of an accepted partnership request; its id.
  Future<String> openAgreement(String interestId) async =>
      _s((await _call('POST', '/api/app/contracts', body: {'interest_id': interestId}))['id']);

  Future<ServiceContract> service(String id) async =>
      ServiceContract.fromJson(await _call('GET', '/api/app/contracts/service/$id'));

  Future<void> moveService(String id, String status) async =>
      _call('POST', '/api/app/contracts/service/$id', body: {'status': status});

  Future<ForwardContract> forward(String id) async =>
      ForwardContract.fromJson(await _call('GET', '/api/app/contracts/forward/$id'));

  /// A step on a forward contract; the sentence to show.
  Future<String> forwardStep(String id, String step, {String? reason}) async =>
      _s((await _call('POST', '/api/app/contracts/forward/$id', body: {'step': step, 'reason': ?reason}))['message']);

  Future<Agreement> agreement(String id) async =>
      Agreement.fromJson(await _call('GET', '/api/app/contracts/agreements/$id'));

  /// Signs [agreement] as shown; the sentence to show (sealed with its reference, or waiting for the other party).
  Future<String> sign(
    Agreement agreement, {
    required String fullName,
    required String signature,
    required bool agree,
  }) async => _s(
    (await _call(
      'POST',
      '/api/app/contracts/agreements/${agreement.id}/sign',
      body: {
        'version': agreement.version,
        'hash': agreement.termsHash,
        'full_name': fullName,
        'signature': signature,
        'agree': agree ? 'yes' : 'no',
      },
    ))['message'],
  );

  Future<HarvestSplit> split(String id, Map<String, String> amounts) async =>
      HarvestSplit.fromJson(await _call('POST', '/api/app/contracts/agreements/$id/split', body: amounts));
}
