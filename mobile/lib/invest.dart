/// «الاستثمار» في التطبيق (البند ٢٠٣): what the website's /invest, /projects, /projects/[slug], /invest/mine,
/// /my-project and /partners show an investor and a landowner, read and acted on in the app.
///
/// Browsing is open to a visitor, as on the website: signed out, the app reads the same route without a session
/// (plain HTTP to [ApiConfig.siteUrl]) and the site reads as the anonymous visitor reads. Signed in, every request
/// goes with the app's session ([AccountController.call]) and the site reads and writes as that person, through the
/// same steps the website's buttons take — the risk notice acknowledged, the land's own models, the owner's consent.
/// Signing the partnership agreement is in contracts.dart.
library;

import 'dart:convert';

import 'package:http/http.dart' as http;

import 'account.dart';
import 'api.dart';
import 'contracts.dart' show AppCall;

String _s(Object? v) => v is String ? v : (v == null ? '' : '$v');
String? _sn(Object? v) => v is String && v.isNotEmpty ? v : null;
num _n(Object? v) => v is num ? v : (num.tryParse('$v') ?? 0);
bool _b(Object? v) => v == true;
List<Map<String, dynamic>> _list(Object? v) => [
  for (final e in (v as List? ?? const []))
    if (e is Map) e.cast<String, dynamic>(),
];
List<String> _strings(Object? v) => [for (final e in (v as List? ?? const [])) '$e'];

/// A partnership model, as the site names it, with what each side brings.
class ModelInfo {
  const ModelInfo({required this.key, required this.label, this.investor = '', this.owner = ''});
  final String key;
  final String label;
  final String investor;
  final String owner;

  factory ModelInfo.fromJson(Map<String, dynamic> j) =>
      ModelInfo(key: _s(j['key']), label: _s(j['label']), investor: _s(j['investor']), owner: _s(j['owner']));
}

/// What an inspector can check, as the site lists it.
class CheckInfo {
  const CheckInfo({required this.key, required this.label, required this.detail});
  final String key;
  final String label;
  final String detail;

  factory CheckInfo.fromJson(Map<String, dynamic> j) =>
      CheckInfo(key: _s(j['key']), label: _s(j['label']), detail: _s(j['detail']));
}

/// What the offer card offers the reader.
enum OfferAction {
  /// The reader's own land.
  mine,

  /// The reader already asked; [LandOffer.interestLabel] says what became of it.
  asked,

  /// A visitor: sign up as an investor first.
  signIn,

  /// «اطلب الشراكة».
  request,
}

/// One verified land offered to investors: no name, no village, no owner until the owner accepts.
class LandOffer {
  const LandOffer({
    required this.landId,
    required this.place,
    required this.models,
    required this.water,
    required this.soilLabel,
    required this.climate,
    required this.crops,
    required this.mine,
    required this.documentsOnFile,
    this.area,
    this.waterPerFeddan,
    this.soil,
    this.soilConfidence,
    this.note,
    this.interestStatus,
    this.interestLabel,
    this.inspectionId,
    this.inspectionLabel,
  });

  final String landId;
  final String place;
  final String? area;
  final int documentsOnFile;
  final List<ModelInfo> models;
  final String water;
  final String? waterPerFeddan;
  final String soilLabel;
  final String? soil;
  final String? soilConfidence;
  final String climate;
  final List<String> crops;
  final String? note;
  final bool mine;
  final String? interestStatus;
  final String? interestLabel;

  /// The reader's own open inspection on this land.
  final String? inspectionId;
  final String? inspectionLabel;

  /// The card's button, as LandOfferCard decides it.
  OfferAction action({required bool signedIn}) => mine
      ? OfferAction.mine
      : interestStatus != null
      ? OfferAction.asked
      : !signedIn
      ? OfferAction.signIn
      : OfferAction.request;

  /// «اطلب تقرير معاينةٍ مستقلّ»: for a member, on a land not theirs, with no inspection of theirs open on it.
  bool canAskInspection({required bool signedIn, required bool inspectionsOn}) =>
      inspectionsOn && !mine && signedIn && inspectionId == null;

  factory LandOffer.fromJson(Map<String, dynamic> j) {
    final insp = j['inspection'] as Map?;
    return LandOffer(
      landId: _s(j['land_id']),
      place: _s(j['place']),
      area: _sn(j['area']),
      documentsOnFile: _n(j['documents_on_file']).toInt(),
      models: [for (final m in _list(j['models'])) ModelInfo.fromJson(m)],
      water: _s(j['water']),
      waterPerFeddan: _sn(j['water_per_feddan']),
      soilLabel: _s(j['soil_label']),
      soil: _sn(j['soil']),
      soilConfidence: _sn(j['soil_confidence']),
      climate: _s(j['climate']),
      crops: _strings(j['crops']),
      note: _sn(j['note']),
      mine: _b(j['mine']),
      interestStatus: _sn(j['interest_status']),
      interestLabel: _sn(j['interest_label']),
      inspectionId: _sn(insp?['id']),
      inspectionLabel: _sn(insp?['label']),
    );
  }
}

/// A project on offer, as its card shows it.
class ProjectCard {
  const ProjectCard({
    required this.slug,
    required this.name,
    required this.location,
    required this.statusLabel,
    required this.riskLevel,
    required this.riskLabel,
    required this.feddans,
    required this.fundedPct,
    required this.sharePrice,
    this.description,
    this.expectedReturn,
    this.trialLabel,
    this.demoLabel,
    this.verifiedLand,
  });

  final String slug;
  final String name;
  final String location;
  final String? description;
  final String statusLabel;
  final String riskLevel;
  final String riskLabel;
  final num feddans;
  final int fundedPct;
  final String sharePrice;
  final num? expectedReturn;

  /// «فرصة تجريبيّة: منفّذها من فريق المنصّة» — the site's label on a trial opportunity.
  final String? trialLabel;

  /// «نموذج توضيحي — ليس عرضاً حقيقياً».
  final String? demoLabel;
  final String? verifiedLand;

  factory ProjectCard.fromJson(Map<String, dynamic> j) => ProjectCard(
    slug: _s(j['slug']),
    name: _s(j['name']),
    location: _s(j['location']),
    description: _sn(j['description']),
    statusLabel: _s(j['status_label']),
    riskLevel: _s(j['risk_level']),
    riskLabel: _s(j['risk_label']),
    feddans: _n(j['total_feddans']),
    fundedPct: _n(j['funded_pct']).toInt(),
    sharePrice: _s(j['share_price']),
    expectedReturn: j['expected_return'] as num?,
    trialLabel: _sn(j['trial_label']),
    demoLabel: _sn(j['demo_label']),
    verifiedLand: _sn(j['verified_land']),
  );
}

class PartnerCompany {
  const PartnerCompany({
    required this.name,
    required this.kinds,
    required this.states,
    this.phone,
    this.whatsapp,
    this.bio,
  });
  final String name;
  final List<String> kinds;
  final List<String> states;
  final String? phone;
  final String? whatsapp;
  final String? bio;

  factory PartnerCompany.fromJson(Map<String, dynamic> j) => PartnerCompany(
    name: _s(j['name']),
    kinds: _strings(j['kinds']),
    states: _strings(j['states']),
    phone: _sn(j['phone']),
    whatsapp: _sn(j['whatsapp']),
    bio: _sn(j['bio']),
  );
}

/// The words every investment page needs: the risk notice, the models, the inspection checks.
class InvestGlossary {
  const InvestGlossary({required this.riskNotice, required this.models, required this.checks});
  final String riskNotice;
  final List<ModelInfo> models;
  final List<CheckInfo> checks;

  factory InvestGlossary.fromJson(Map<String, dynamic> j) => InvestGlossary(
    riskNotice: _s(j['risk_notice']),
    models: [for (final m in _list(j['models'])) ModelInfo.fromJson(m)],
    checks: [for (final c in _list(j['checks'])) CheckInfo.fromJson(c)],
  );
}

class InvestOverview {
  const InvestOverview({
    required this.signedIn,
    required this.landsFailed,
    required this.lands,
    required this.projects,
    required this.inspectionsOn,
    required this.feeLine,
    required this.companies,
    required this.glossary,
    this.reports,
  });

  final bool signedIn;
  final bool landsFailed;
  final List<LandOffer> lands;
  final List<ProjectCard> projects;
  final bool inspectionsOn;
  final String feeLine;
  final String? reports;
  final List<PartnerCompany> companies;
  final InvestGlossary glossary;

  factory InvestOverview.fromJson(Map<String, dynamic> j) => InvestOverview(
    signedIn: _b(j['signed_in']),
    landsFailed: _b(j['lands_failed']),
    lands: [for (final l in _list(j['lands'])) LandOffer.fromJson(l)],
    projects: [for (final p in _list(j['projects'])) ProjectCard.fromJson(p)],
    inspectionsOn: _b(j['inspections_on']),
    feeLine: _s(j['fee_line']),
    reports: _sn(j['reports']),
    companies: [for (final c in _list(j['companies'])) PartnerCompany.fromJson(c)],
    glossary: InvestGlossary.fromJson(j),
  );
}

/// One opportunity's page.
class ProjectDetail {
  const ProjectDetail({
    required this.signedIn,
    required this.card,
    required this.study,
    required this.updates,
    required this.investmentOpen,
    required this.isSubmitter,
    required this.glossary,
    this.trialNote,
    this.demoNote,
    this.offer,
    this.ownLandId,
    this.ownLandModels = const [],
    this.ownLandNote,
    this.inspectionsOn = false,
    this.feeLine = '',
  });

  /// The inspection request on the land's card, as on /invest.
  final bool inspectionsOn;
  final String feeLine;

  final bool signedIn;
  final ProjectCard card;
  final List<(String, String)> study;
  final String? trialNote;
  final String? demoNote;
  final List<(String, String?, String)> updates;
  final bool investmentOpen;
  final bool isSubmitter;
  final LandOffer? offer;
  final String? ownLandId;
  final List<String> ownLandModels;
  final String? ownLandNote;
  final InvestGlossary glossary;

  factory ProjectDetail.fromJson(Map<String, dynamic> j) {
    final own = j['own_land'] as Map?;
    return ProjectDetail(
      signedIn: _b(j['signed_in']),
      card: ProjectCard.fromJson((j['project'] as Map?)?.cast<String, dynamic>() ?? const {}),
      study: [for (final r in _list(j['study'])) (_s(r['label']), _s(r['value']))],
      trialNote: _sn(j['trial_note']),
      demoNote: _sn(j['demo_note']),
      updates: [for (final u in _list(j['updates'])) (_s(u['title']), _sn(u['body']), _s(u['at']))],
      investmentOpen: _b(j['investment_open']),
      isSubmitter: _b(j['is_submitter']),
      offer: j['offer'] is Map ? LandOffer.fromJson((j['offer'] as Map).cast<String, dynamic>()) : null,
      ownLandId: _sn(own?['id']),
      ownLandModels: _strings(own?['models']),
      ownLandNote: _sn(own?['note']),
      inspectionsOn: _b(j['inspections_on']),
      feeLine: _s(j['fee_line']),
      glossary: InvestGlossary.fromJson(j),
    );
  }
}

/// A partnership request the reader sent.
class MyInterest {
  const MyInterest({
    required this.interestId,
    required this.place,
    required this.area,
    required this.modelLabel,
    required this.message,
    required this.status,
    required this.statusLabel,
    this.ownerName,
    this.ownerPhone,
    this.village,
    this.map,
  });

  final String interestId;
  final String place;
  final String area;
  final String modelLabel;
  final String message;
  final String status;
  final String statusLabel;
  final String? ownerName;
  final String? ownerPhone;
  final String? village;
  final String? map;

  bool get canWithdraw => status == 'pending';

  /// «اكتبا العقد ووقّعاه هنا» once the owner accepted.
  bool get canOpenAgreement => status == 'accepted';

  factory MyInterest.fromJson(Map<String, dynamic> j) => MyInterest(
    interestId: _s(j['interest_id']),
    place: _s(j['place']),
    area: _s(j['area']),
    modelLabel: _s(j['model_label']),
    message: _s(j['message']),
    status: _s(j['status']),
    statusLabel: _s(j['status_label']),
    ownerName: _sn(j['owner_name']),
    ownerPhone: _sn(j['owner_phone']),
    village: _sn(j['village']),
    map: _sn(j['map']),
  );
}

class InspectionItem {
  const InspectionItem({
    required this.id,
    required this.role,
    required this.place,
    required this.area,
    required this.statusLabel,
    required this.checks,
    this.ref,
    this.verdictLabel,
    this.investorName,
  });
  final String id;
  final String? ref;
  final String role;
  final String place;
  final String area;
  final String statusLabel;
  final String? verdictLabel;
  final List<String> checks;
  final String? investorName;

  factory InspectionItem.fromJson(Map<String, dynamic> j) => InspectionItem(
    id: _s(j['id']),
    ref: _sn(j['ref']),
    role: _s(j['role']),
    place: _s(j['place']),
    area: _s(j['area']),
    statusLabel: _s(j['status_label']),
    verdictLabel: _sn(j['verdict_label']),
    checks: _strings(j['checks']),
    investorName: _sn(j['investor_name']),
  );
}

class Investment {
  const Investment({
    required this.project,
    required this.shares,
    required this.amount,
    required this.statusLabel,
    this.slug,
  });
  final String project;
  final String? slug;
  final int shares;
  final String amount;
  final String statusLabel;

  factory Investment.fromJson(Map<String, dynamic> j) => Investment(
    project: _s(j['project']),
    slug: _sn(j['slug']),
    shares: _n(j['shares']).toInt(),
    amount: _s(j['amount']),
    statusLabel: _s(j['status_label']),
  );
}

/// A «مشروعي» input list, in totals.
class InputPlan {
  const InputPlan({
    required this.title,
    required this.crop,
    required this.feddans,
    required this.statusLabel,
    required this.items,
    required this.costUsd,
    required this.paidSdg,
    required this.paidItems,
    required this.delivered,
    required this.remainingUsd,
    required this.unpriced,
  });
  final String title;
  final String crop;
  final num feddans;
  final String statusLabel;
  final int items;
  final num costUsd;
  final num paidSdg;
  final int paidItems;
  final int delivered;
  final num remainingUsd;
  final int unpriced;

  factory InputPlan.fromJson(Map<String, dynamic> j) => InputPlan(
    title: _s(j['title']),
    crop: _s(j['crop']),
    feddans: _n(j['feddans']),
    statusLabel: _s(j['status_label']),
    items: _n(j['items']).toInt(),
    costUsd: _n(j['costUsd']),
    paidSdg: _n(j['paidSdg']),
    paidItems: _n(j['paidItems']).toInt(),
    delivered: _n(j['delivered']).toInt(),
    remainingUsd: _n(j['remainingUsd']),
    unpriced: _n(j['unpriced']).toInt(),
  );
}

/// A request on the reader's own land.
class LandRequest {
  const LandRequest({
    required this.interestId,
    required this.modelLabel,
    required this.message,
    required this.status,
    this.investorName,
    this.investorPhone,
    this.record,
  });
  final String interestId;
  final String modelLabel;
  final String message;
  final String status;
  final String? investorName;
  final String? investorPhone;

  /// Who is asking: the country of their number, since when, what they did on Sudagri.
  final String? record;

  bool get canDecide => status == 'pending';
  bool get accepted => status == 'accepted';

  factory LandRequest.fromJson(Map<String, dynamic> j) => LandRequest(
    interestId: _s(j['interest_id']),
    modelLabel: _s(j['model_label']),
    message: _s(j['message']),
    status: _s(j['status']),
    investorName: _sn(j['investor_name']),
    investorPhone: _sn(j['investor_phone']),
    record: _sn(j['record']),
  );
}

/// One of the reader's lands, as its investors section on /lands shows it.
class OwnerLand {
  const OwnerLand({
    required this.id,
    required this.name,
    required this.place,
    required this.feddans,
    required this.verified,
    required this.investorsOn,
    required this.open,
    required this.models,
    required this.modelLabels,
    required this.requests,
    required this.inspections,
    this.note,
  });

  final String id;
  final String name;
  final String place;
  final num feddans;
  final bool verified;

  /// False on a database the investor migration has not reached: nothing is offered that would fail.
  final bool investorsOn;
  final bool open;
  final List<String> models;
  final List<String> modelLabels;
  final String? note;
  final List<LandRequest> requests;
  final List<InspectionItem> inspections;

  /// «اعرض أرضي على المستثمرين»: a verified land not yet offered.
  bool get canOffer => investorsOn && verified && !open;

  /// «أوقف عرضها».
  bool get canClose => investorsOn && verified && open;

  factory OwnerLand.fromJson(Map<String, dynamic> j) => OwnerLand(
    id: _s(j['id']),
    name: _s(j['name']),
    place: _s(j['place']),
    feddans: _n(j['feddans']),
    verified: _b(j['verified']),
    investorsOn: _b(j['investors_on']),
    open: _b(j['open_to_investors']),
    models: _strings(j['models']),
    modelLabels: _strings(j['model_labels']),
    note: _sn(j['note']),
    requests: [for (final r in _list(j['requests'])) LandRequest.fromJson(r)],
    inspections: [for (final i in _list(j['inspections'])) InspectionItem.fromJson(i)],
  );
}

/// The one-tap pre-fill of «اعرض أرضي على المستثمرين» (OpenToInvestorsForm): the models chosen last time, or all of
/// them when none were.
Set<String> consentDefaults(List<String> chosenBefore, List<ModelInfo> all) => chosenBefore.isEmpty
    ? {for (final m in all) m.key}
    : {
        for (final m in all)
          if (chosenBefore.contains(m.key)) m.key,
      };

class MyInvest {
  const MyInvest({
    required this.interests,
    required this.inspections,
    required this.investments,
    required this.plans,
    required this.lands,
  });

  final List<MyInterest> interests;

  /// The inspections the reader asked for (as an investor) or was assigned (as an inspector).
  final List<InspectionItem> inspections;
  final List<Investment> investments;
  final List<InputPlan> plans;
  final List<OwnerLand> lands;

  List<InspectionItem> get asked => [
    for (final i in inspections)
      if (i.role == 'investor') i,
  ];
  List<InspectionItem> get assigned => [
    for (final i in inspections)
      if (i.role == 'inspector') i,
  ];

  factory MyInvest.fromJson(Map<String, dynamic> j) => MyInvest(
    interests: [for (final r in _list(j['interests'])) MyInterest.fromJson(r)],
    inspections: [for (final i in _list(j['inspections'])) InspectionItem.fromJson(i)],
    investments: [for (final i in _list(j['investments'])) Investment.fromJson(i)],
    plans: [for (final p in _list(j['plans'])) InputPlan.fromJson(p)],
    lands: [for (final l in _list(j['lands'])) OwnerLand.fromJson(l)],
  );
}

/// The investment routes. Signed out, browsing goes without a session, as a visitor reads the website.
class InvestApi {
  InvestApi({AppCall? call, http.Client? client, String? siteUrl, bool Function()? signedIn})
    : _call = call ?? accountController.call,
      _client = client ?? http.Client(),
      _site = siteUrl ?? ApiConfig.siteUrl,
      _signedIn = signedIn ?? (() => accountController.value != null);

  final AppCall _call;
  final http.Client _client;
  final String _site;
  final bool Function() _signedIn;

  bool get signedIn => _signedIn();

  /// A read open to a visitor: with the session when there is one, else plain.
  Future<Map<String, dynamic>> _read(String path) async {
    if (_signedIn()) return _call('GET', path);
    if (_site.isEmpty) throw ApiException('التطبيق غير مضبوط للاتصال بالموقع.');
    late final http.Response res;
    try {
      res = await _client.get(Uri.parse('$_site$path')).timeout(const Duration(seconds: 30));
    } catch (_) {
      throw ApiException('تعذّر الاتصال. تحقّق من الشبكة وأعد المحاولة.');
    }
    Map<String, dynamic> body;
    try {
      body = jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>;
    } catch (_) {
      body = const {};
    }
    if (res.statusCode != 200) throw ApiException(body['error'] as String? ?? 'تعذّر الطلب (${res.statusCode}).');
    return body;
  }

  Future<InvestOverview> overview() async => InvestOverview.fromJson(await _read('/api/app/invest'));

  Future<ProjectDetail> project(String slug) async =>
      ProjectDetail.fromJson(await _read('/api/app/invest/projects/${Uri.encodeComponent(slug)}'));

  Future<MyInvest> mine() async => MyInvest.fromJson(await _call('GET', '/api/app/invest/mine'));

  Future<String> requestPartnership({
    required String landId,
    required String model,
    required String message,
    required bool riskAcknowledged,
  }) async => _s(
    (await _call(
      'POST',
      '/api/app/invest/interest',
      body: {'land_id': landId, 'model': model, 'message': message, 'risk_ack': riskAcknowledged ? 'yes' : 'no'},
    ))['message'],
  );

  /// [action] is 'withdraw' (the investor), or 'accept' / 'decline' (the landowner).
  Future<String> answerInterest(String interestId, String action) async =>
      _s((await _call('POST', '/api/app/invest/interest/$interestId', body: {'action': action}))['message']);

  Future<String> requestInspection({required String landId, required List<String> checks, String note = ''}) async =>
      _s(
        (await _call(
          'POST',
          '/api/app/invest/inspection',
          body: {'land_id': landId, 'checks': checks, 'note': note},
        ))['message'],
      );

  Future<String> setConsent({
    required String landId,
    required bool open,
    List<String> models = const [],
    String note = '',
  }) async => _s(
    (await _call(
      'POST',
      '/api/app/invest/consent',
      body: {'land_id': landId, 'open': open, 'models': models, 'note': note},
    ))['message'],
  );
}
