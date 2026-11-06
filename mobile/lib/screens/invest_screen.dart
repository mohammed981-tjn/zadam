/// «الاستثمار» (البند ٢٠٣): the website's /invest, /projects, /invest/mine, /lands (its investors part),
/// /my-project and /partners in one screen, in four tabs:
///
///   • الفرص — verified land looking for a partner and the projects on offer, with the site's trial labels, the
///     risk notice, «اطلب الشراكة» and the paid inspection report; open to a visitor, as on the website;
///   • طلباتي — the requests sent and what became of them (the owner's name and phone once accepted, and the way to
///     the agreement), the inspections asked for, the shares requested in projects, and «مشروعي»'s input lists;
///   • أرضي — the landowner's side: each land, the one-tap «اعرض أرضي على المستثمرين», and the requests on it to
///     accept or decline;
///   • الشركات — the verified partner companies.
///
/// Signing a partnership agreement is on the contracts screen (AgreementScreen).
library;

import 'package:flutter/material.dart';

import '../api.dart';
import '../contracts.dart' show ContractsApi, money;
import '../i18n.dart';
import '../invest.dart';
import '../theme.dart';
import '../ui.dart';
import 'account_screen.dart' show AccountScreen, openOnSite;
import 'contract_detail_screen.dart' show AgreementScreen, openLink;
import 'deal_ui.dart';
import 'invest_detail_screen.dart';

class InvestScreen extends StatefulWidget {
  const InvestScreen({super.key, this.api, this.contracts, this.initialTab = 0});

  /// The routes; stand-ins in tests.
  final InvestApi? api;
  final ContractsApi? contracts;
  final int initialTab;

  @override
  State<InvestScreen> createState() => _InvestScreenState();
}

class _InvestScreenState extends State<InvestScreen> {
  late final InvestApi _api = widget.api ?? InvestApi();
  late final ContractsApi _contracts = widget.contracts ?? ContractsApi();
  late Future<InvestOverview> _overview = _api.overview();
  Future<MyInvest>? _mine;

  @override
  void initState() {
    super.initState();
    if (_api.signedIn) _mine = _api.mine();
  }

  void _reload() => setState(() {
    _overview = _api.overview();
    _mine = _api.signedIn ? _api.mine() : null;
  });

  Future<void> _signIn() async {
    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => const AccountScreen()));
    if (mounted) _reload();
  }

  Future<void> _openAgreement(String interestId) async {
    final messenger = ScaffoldMessenger.of(context);
    final nav = Navigator.of(context);
    try {
      final id = await _contracts.openAgreement(interestId);
      await nav.push(
        MaterialPageRoute(
          builder: (_) => AgreementScreen(id: id, api: _contracts),
        ),
      );
      if (mounted) _reload();
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 4,
      initialIndex: widget.initialTab,
      child: Scaffold(
        appBar: AppBar(
          title: Text(tr('الاستثمار', 'Investment')),
          bottom: TabBar(
            isScrollable: true,
            tabAlignment: TabAlignment.start,
            tabs: [
              Tab(text: tr('الفرص', 'Opportunities')),
              Tab(text: tr('طلباتي', 'My requests')),
              Tab(text: tr('أرضي', 'My land')),
              Tab(text: tr('الشركات', 'Companies')),
            ],
          ),
        ),
        body: TabBarView(
          children: [
            _Future<InvestOverview>(future: _overview, onRetry: _reload, builder: _opportunities),
            _mine == null
                ? _SignInFirst(onSignIn: _signIn, what: tr('طلباتك واستثماراتك', 'your requests and investments'))
                : _Future<MyInvest>(future: _mine!, onRetry: _reload, builder: _myRequests),
            _mine == null
                ? _SignInFirst(onSignIn: _signIn, what: tr('أراضيك وعرضها على المستثمرين', 'your lands and offering them to investors'))
                : _Future<MyInvest>(future: _mine!, onRetry: _reload, builder: _myLand),
            _Future<InvestOverview>(future: _overview, onRetry: _reload, builder: _companies),
          ],
        ),
      ),
    );
  }

  // ── الفرص ──────────────────────────────────────────────────────────────

  Widget _opportunities(BuildContext context, InvestOverview o) => ListView(
    padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
    children: [
      HeroBand(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(tr('فرص الاستثمار', 'Investment opportunities'), style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
            SizedBox(height: 6),
            Text(
              tr('أراضٍ وثّقت سوداقري مستنداتها يبحث أصحابها عن شريك، ومشاريع مطروحة. أنت تموّل، وصاحب الأرض يقدّم '
              'الأرض والماء والعمل، وسوداقري تتحقّق وتتابع. المال لا يمرّ بالمنصّة، ولا أحد يَعِدك بربح.', 'Land whose documents Sudagri has verified, whose owners are looking for a partner, and projects on offer. You finance, the land owner brings the land, the water and the work, and Sudagri verifies and follows up. The money does not pass through the platform, and nobody promises you a profit.'),
              style: TextStyle(height: 1.7, fontSize: 13),
            ),
          ],
        ),
      ),
      const SizedBox(height: 12),
      RiskNotice(o.glossary.riskNotice),
      const SizedBox(height: 12),
      Card(
        child: ExpansionTile(
          shape: const Border(),
          title: Text(tr('كيف يستفيد المستثمر من صاحب الأرض', 'How an investor and a landowner work together'), style: TextStyle(fontWeight: FontWeight.w800)),
          childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
          expandedCrossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (final m in o.glossary.models) ...[
              Text(
                m.label,
                style: TextStyle(fontWeight: FontWeight.w800, color: textGreenOn(context)),
              ),
              Text(tr('المستثمر: ${m.investor}', 'Investor: ${m.investor}'), style: const TextStyle(height: 1.6, fontSize: 13)),
              Text(tr('صاحب الأرض: ${m.owner}', 'Landowner: ${m.owner}'), style: const TextStyle(height: 1.6, fontSize: 13)),
              const SizedBox(height: 8),
            ],
            Muted(tr('النسبة والأجرة والمدّة يتّفق عليها الطرفان كتابةً — سوداقري لا تحدّدها ولا تضمنها.', 'The share, the rent and the term are agreed in writing between the two — Sudagri neither sets nor guarantees them.'), size: 12),
          ],
        ),
      ),
      const SizedBox(height: 12),
      SectionTitle(
        o.lands.isEmpty ? tr('أراضٍ تبحث عن شريك', 'Land looking for a partner') : tr('أراضٍ تبحث عن شريك (${o.lands.length})', 'Land looking for a partner (${o.lands.length})'),
        subtitle: tr('الولاية والمساحة والتربة والماء، بلا اسمٍ ولا موقع حتى يقبل صاحبها', 'State, area, soil and water, with no name or location until its owner accepts'),
      ),
      if (o.landsFailed)
        Muted(tr('تعذّرت قراءة الأراضي الآن — والخلل عندنا. أعد المحاولة بعد قليل.', 'We couldn\'t load the land just now — the fault is ours. Try again shortly.'))
      else if (o.lands.isEmpty)
        StateView(
          icon: Icons.landscape_outlined,
          title: tr('لا أرض معروضة بعد.', 'No land on offer yet.'),
          message: tr('تظهر هنا الأرض بعد أن توثّقها الإدارة ويفتحها صاحبها للمستثمرين من «أرضي».', 'Land shows here after the administrators verify it and its owner opens it to investors from «My land».'),
          compact: true,
        )
      else
        for (final l in o.lands)
          LandOfferTile(
            land: l,
            signedIn: o.signedIn,
            inspectionsOn: o.inspectionsOn,
            feeLine: o.feeLine,
            glossary: o.glossary,
            api: _api,
            onChanged: _reload,
          ),
      if (o.inspectionsOn)
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Muted(
            tr('تقرير معاينةٍ مستقلّ: مفتّشٌ ليس طرفاً يزور الأرض ويكتب تقريراً بصوره. ${o.feeLine}${o.reports != null ? ' ${o.reports}' : ''}', 'An independent inspection report: an inspector who is not a party visits the land and writes a report with photos. ${o.feeLine}${o.reports != null ? ' ${o.reports}' : ''}'),
            size: 12,
          ),
        ),
      SectionTitle(o.projects.isEmpty ? tr('مشاريع مطروحة', 'Projects on offer') : tr('مشاريع مطروحة (${o.projects.length})', 'Projects on offer (${o.projects.length})')),
      if (o.projects.isEmpty)
        Muted(tr('لا مشروع مطروح بعد. المشروع فرصةٌ كتبها صاحبها بالمحصول والحصص، وراجعتها الإدارة قبل نشرها.', 'No project on offer yet. A project is an opportunity its owner wrote out with a crop and shares, reviewed by the administrators before publication.')),
      for (final p in o.projects) _ProjectTile(project: p, api: _api),
      const SizedBox(height: 12),
      DealCard(
        title: tr('عندك أرض وتبحث عن ممّول؟', 'Have land and looking for finance?'),
        children: [
          Muted(
            tr('سجّلها مجّاناً وارفع مستنداتها. بعد أن توثّقها الإدارة، اعرضها على المستثمرين من «أرضي» واختر نماذج الشراكة التي تقبلها.', 'Register it for free and upload its documents. After the administrators verify it, offer it to investors from «My land» and choose the partnership models you accept.'),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: [
              FilledButton(onPressed: () => DefaultTabController.of(context).animateTo(2), child: Text(tr('أرضي', 'My land'))),
              OutlinedButton(onPressed: () => openOnSite(context, '/lands/new'), child: Text(tr('سجّل أرضاً', 'Register land'))),
              OutlinedButton(
                onPressed: () => openOnSite(context, '/opportunities/new'),
                child: Text(tr('ارفع فرصة (على الموقع)', 'Post an opportunity (on the website)')),
              ),
            ],
          ),
        ],
      ),
    ],
  );

  // ── طلباتي ─────────────────────────────────────────────────────────────

  Widget _myRequests(BuildContext context, MyInvest m) => ListView(
    padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
    children: [
      IntroNote(tr('طلبات الشراكة التي أرسلتها. حين يقبل صاحب الأرض يظهر هنا اسمه وهاتفه وموقع الأرض.', 'The partnership requests you sent. Once an owner accepts, their name, phone and the land\'s location appear here.')),
      const SizedBox(height: 12),
      if (m.assigned.isNotEmpty) ...[
        SectionTitle(tr('معايناتٌ أُسندت إليك', 'Inspections assigned to you')),
        for (final i in m.assigned) _InspectionTile(item: i),
      ],
      if (m.asked.isNotEmpty) ...[
        SectionTitle(tr('طلبات المعاينة', 'Inspection requests')),
        for (final i in m.asked) _InspectionTile(item: i),
      ],
      SectionTitle(tr('طلبات الشراكة', 'Partnership requests')),
      if (m.interests.isEmpty)
        StateView(
          icon: Icons.handshake_outlined,
          title: tr('لم ترسل طلباً بعد.', 'You have not sent a request yet.'),
          message: tr('تصفّح فرص الاستثمار، واطلب الشراكة على أرضٍ موثّقة.', 'Browse the investment opportunities, and request a partnership on verified land.'),
          compact: true,
        ),
      for (final r in m.interests)
        DealCard(
          highlight: r.canOpenAgreement,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(r.place, style: const TextStyle(fontWeight: FontWeight.w800)),
                ),
                TagPill(r.statusLabel, gold: r.status == 'declined'),
              ],
            ),
            Muted('${r.area} · ${r.modelLabel}', size: 12),
            const SizedBox(height: 6),
            Text(r.message, style: const TextStyle(height: 1.6)),
            if (r.canOpenAgreement) ...[
              const Divider(height: 20),
              Text(
                tr('قَبِل صاحب الأرض — تواصلا', 'The owner accepted — get in touch'),
                style: TextStyle(fontWeight: FontWeight.w800, color: textGreenOn(context)),
              ),
              InfoLine(tr('صاحب الأرض', 'Landowner'), r.ownerName ?? '—'),
              if (r.ownerPhone != null)
                TextButton.icon(
                  onPressed: () => openLink(context, 'tel:${r.ownerPhone}'),
                  icon: const Icon(Icons.call_outlined, size: 18),
                  label: Text(r.ownerPhone!),
                )
              else
                Muted(tr('لم يضف هاتفاً بعد', 'none on file yet')),
              if (r.village != null) InfoLine(tr('القرية', 'Village'), r.village!),
              if (r.map != null)
                TextButton.icon(
                  onPressed: () => openLink(context, r.map!),
                  icon: const Icon(Icons.map_outlined, size: 18),
                  label: Text(tr('افتح الخريطة', 'Open the map')),
                ),
              Muted(
                tr('عاينا الأرض، واتّفقا كتابةً على النسبة أو الأجرة والمدّة قبل أيّ دفع. وللإشراف والحرث والحصاد شركاتٌ شريكة موثّقة.', 'Inspect the land and agree the share or rent and the term in writing before any payment. Verified partner companies offer supervision, ploughing and harvest.'),
                size: 12,
              ),
              const SizedBox(height: 8),
              FilledButton.icon(
                onPressed: () => _openAgreement(r.interestId),
                icon: const Icon(Icons.draw_outlined),
                label: Text(tr('اكتبا العقد ووقّعاه', 'Write the agreement and sign it together')),
              ),
            ],
            if (r.canWithdraw) ...[
              const SizedBox(height: 8),
              Align(
                alignment: AlignmentDirectional.centerStart,
                child: WarnButton(
                  label: tr('اسحب الطلب', 'Withdraw'),
                  onPressed: () async {
                    if (!await confirmStep(
                      context,
                      title: tr('اسحب الطلب', 'Withdraw'),
                      body: tr('يُسحب طلبك ولا يراه صاحب الأرض بعد ذلك.', 'Your request is withdrawn and the land owner no longer sees it.'),
                      go: tr('اسحب', 'Withdraw'),
                    )) {
                      return;
                    }
                    if (!context.mounted) return;
                    await runStep(context, () => _api.answerInterest(r.interestId, 'withdraw'), then: _reload);
                  },
                ),
              ),
            ],
          ],
        ),
      if (m.investments.isNotEmpty) ...[
        SectionTitle(tr('حصصي في المشاريع', 'My shares in projects')),
        for (final i in m.investments)
          DealCard(
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(i.project, style: const TextStyle(fontWeight: FontWeight.w700)),
                  ),
                  TagPill(i.statusLabel),
                ],
              ),
              Muted(tr('${i.shares} حصة · ${i.amount}', '${i.shares} shares · ${i.amount}'), size: 12),
            ],
          ),
      ],
      if (m.plans.isNotEmpty) ...[
        SectionTitle(
          tr('مشروعي — قائمة المدخلات', 'My project — input list'),
          subtitle: tr('تدفع لكلّ مورد مباشرةً، وتسجّل هنا ما دفعت وما استلمت', 'You pay each supplier directly, and record here what you paid and what you received'),
        ),
        for (final p in m.plans)
          DealCard(
            title: p.title,
            children: [
              Muted(tr('${p.crop} · ${p.feddans} فدان · ${p.statusLabel}', '${p.crop} · ${p.feddans} feddans · ${p.statusLabel}'), size: 12),
              const SizedBox(height: 6),
              Row(
                children: [
                  Expanded(child: InfoLine(tr('التكلفة المسعّرة', 'Priced cost'), '${p.costUsd} \$')),
                  Expanded(child: InfoLine(tr('ما دفعتَ', 'Paid'), '${money(p.paidSdg)} SDG')),
                ],
              ),
              Row(
                children: [
                  Expanded(child: InfoLine(tr('ما استلمتَ', 'Delivered'), tr('${p.delivered} من ${p.items}', '${p.delivered} of ${p.items}'))),
                  Expanded(child: InfoLine(tr('ما بقي دفعه', 'Left to pay'), '${p.remainingUsd} \$')),
                ],
              ),
              if (p.unpriced > 0) Muted(tr('${p.unpriced} بنود بلا سعر بعد، فلا تدخل التكلفة.', '${p.unpriced} items have no price yet, so they are not in the cost.'), size: 12),
              TextButton.icon(
                onPressed: () => openOnSite(context, '/my-project'),
                icon: const Icon(Icons.open_in_new, size: 18),
                label: Text(tr('سجّل الدفع والاستلام (على الموقع)', 'Record payment and delivery (on the website)')),
              ),
            ],
          ),
      ],
    ],
  );

  // ── أرضي ───────────────────────────────────────────────────────────────

  Widget _myLand(BuildContext context, MyInvest m) => FutureBuilder<InvestOverview>(
    future: _overview,
    builder: (context, snap) {
      final models = snap.data?.glossary.models ?? const <ModelInfo>[];
      return ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
        children: [
          IntroNote(
            tr('بعد توثيق الأرض تستطيع عرضها على المستثمرين: مشاركة بالمحصول، أو إيجار، أو تمويل مدخلات. '
            'لا يرى المستثمر اسمك ولا هاتفك ولا موقعها حتى تقبل طلبه.', 'Once the land is verified you can offer it to investors: crop sharing, a lease, or input finance. The investor sees neither your name, your phone nor its location until you accept their request.'),
          ),
          const SizedBox(height: 12),
          if (m.lands.isEmpty)
            StateView(
              icon: Icons.landscape_outlined,
              title: tr('لا أرض مسجّلة بعد', 'No land registered yet'),
              message: tr('سجّل أرضك من «حدّد أرضك» في الحساب أو على الموقع، وارفع مستنداتها لتوثّقها الإدارة.', 'Register your land from «Mark your land» in the account or on the website, and upload its documents for the administrators to verify.'),
              compact: true,
            ),
          for (final l in m.lands)
            DealCard(
              title: l.name,
              highlight: l.requests.any((r) => r.canDecide),
              children: [
                Muted(tr('${l.place} · ${l.feddans} فدان', '${l.place} · ${l.feddans} feddans'), size: 12),
                const SizedBox(height: 8),
                if (!l.investorsOn)
                  const SizedBox.shrink()
                else if (!l.verified)
                  Muted(tr('بعد توثيق الأرض تستطيع عرضها على المستثمرين.', 'Once the land is verified you can offer it to investors.'))
                else if (l.open) ...[
                  Text(
                    tr('أرضك معروضة في فرص الاستثمار بنماذج: ${l.modelLabels.join(' · ')}.', 'Your land is shown in the investment opportunities with the models: ${l.modelLabels.join(' · ')}.'),
                    style: const TextStyle(height: 1.6),
                  ),
                  Align(
                    alignment: AlignmentDirectional.centerStart,
                    child: WarnButton(
                      label: tr('أوقف عرضها', 'Stop showing it'),
                      onPressed: () =>
                          runStep(context, () => _api.setConsent(landId: l.id, open: false), then: _reload),
                    ),
                  ),
                ] else if (models.isNotEmpty)
                  ConsentForm(
                    landId: l.id,
                    models: models,
                    chosenBefore: l.models,
                    note: l.note,
                    api: _api,
                    onDone: _reload,
                  ),
                for (final i in l.inspections) ...[
                  const Divider(height: 20),
                  Text(
                    tr('طلب معاينةٍ من ${i.investorName ?? 'مستثمر'} — ${i.verdictLabel ?? i.statusLabel}', 'Inspection request from ${i.investorName ?? 'an investor'} — ${i.verdictLabel ?? i.statusLabel}'),
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                  Muted(tr('يُتحقَّق من: ${i.checks.join(' · ')}', 'To be checked: ${i.checks.join(' · ')}'), size: 12),
                  TextButton(
                    onPressed: () => openOnSite(context, '/invest/inspections/${i.id}'),
                    child: Text(tr('التفاصيل والردّ (على الموقع)', 'Details and reply (on the website)')),
                  ),
                ],
                for (final r in l.requests) ...[
                  const Divider(height: 20),
                  Text(
                    tr('${r.accepted ? 'شريكٌ قبلتَه: ' : 'طلب شراكة من '}${r.investorName ?? 'مستثمر'} — ${r.modelLabel}', '${r.accepted ? 'A partner you accepted: ' : 'Partnership request from '}${r.investorName ?? 'an investor'} — ${r.modelLabel}'),
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                  if (r.record != null) Muted(r.record!, size: 12),
                  Text(r.message, style: const TextStyle(height: 1.6)),
                  const SizedBox(height: 6),
                  if (r.canDecide)
                    Wrap(
                      spacing: 8,
                      children: [
                        FilledButton(
                          onPressed: () async {
                            if (!await confirmStep(
                              context,
                              title: tr('قبول الطلب', 'Accepting the request'),
                              body:
                                  tr('بقبولك يرى المستثمر اسمك وهاتفك وموقع الأرض، وترى هاتفه. اتّفقا كتابةً قبل أيّ دفع.', 'When you accept, the investor sees your name, your phone and the land\'s location, and you see their phone. Agree in writing before any payment.'),
                              go: tr('أقبل', 'Accept'),
                            )) {
                              return;
                            }
                            if (!context.mounted) return;
                            await runStep(context, () => _api.answerInterest(r.interestId, 'accept'), then: _reload);
                          },
                          child: Text(tr('أقبل وأكشف بياناتي له', 'Accept and share my details')),
                        ),
                        WarnButton(
                          label: tr('أعتذر', 'Decline'),
                          onPressed: () =>
                              runStep(context, () => _api.answerInterest(r.interestId, 'decline'), then: _reload),
                        ),
                      ],
                    )
                  else if (r.accepted) ...[
                    if (r.investorPhone != null)
                      TextButton.icon(
                        onPressed: () => openLink(context, 'tel:${r.investorPhone}'),
                        icon: const Icon(Icons.call_outlined, size: 18),
                        label: Text(r.investorPhone!),
                      ),
                    FilledButton.icon(
                      onPressed: () => _openAgreement(r.interestId),
                      icon: const Icon(Icons.draw_outlined),
                      label: Text(tr('اكتبا العقد ووقّعاه', 'Write the agreement and sign it together')),
                    ),
                  ],
                ],
              ],
            ),
          OutlinedButton.icon(
            onPressed: () => openOnSite(context, '/lands/new'),
            icon: const Icon(Icons.add_location_alt_outlined),
            label: Text(tr('سجّل أرضاً (على الموقع)', 'Register land (on the website)')),
          ),
        ],
      );
    },
  );

  // ── الشركات ────────────────────────────────────────────────────────────

  Widget _companies(BuildContext context, InvestOverview o) => ListView(
    padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
    children: [
      IntroNote(
        tr('شركاتٌ رأى المشرف سجلّها التجاري، تنفّذ الخدمات على المزارع: الميكنة، والريّ، والمدخلات، والحصاد، '
        'والتعبئة، والنقل، والإرشاد. والعقد الملزم لأيّ مزرعة هو عقد الخدمة نفسه: بمراحله، ودفعه بعد الإثبات.', 'Companies whose commercial registration the supervisor has seen, providing services on farms: machinery, irrigation, inputs, harvest, packing, transport and extension. The binding contract for any farm is the service contract itself: with its phases, and payment after proof.'),
      ),
      const SizedBox(height: 12),
      if (o.companies.isEmpty)
        StateView(icon: Icons.business_outlined, title: tr('لا شركة شريكة موثّقة بعد', 'No verified partner company yet'), compact: true),
      for (final c in o.companies)
        DealCard(
          title: c.name,
          children: [
            if (c.kinds.isNotEmpty) Wrap(spacing: 6, runSpacing: 6, children: [for (final k in c.kinds) TagPill(k)]),
            const SizedBox(height: 6),
            if (c.states.isNotEmpty) Muted(tr('الولايات: ${c.states.join('، ')}', 'States: ${c.states.join(', ')}'), size: 12),
            if (c.bio != null) Text(c.bio!, style: const TextStyle(height: 1.6)),
            if (c.phone != null)
              Align(
                alignment: AlignmentDirectional.centerStart,
                child: TextButton.icon(
                  onPressed: () => openLink(context, 'tel:${c.phone}'),
                  icon: const Icon(Icons.call_outlined, size: 18),
                  label: Text(c.phone!),
                ),
              ),
          ],
        ),
    ],
  );
}

class _ProjectTile extends StatelessWidget {
  const _ProjectTile({required this.project, required this.api});
  final ProjectCard project;
  final InvestApi api;

  @override
  Widget build(BuildContext context) {
    final p = project;
    return DealCard(
      children: [
        InkWell(
          onTap: () => Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) => ProjectScreen(slug: p.slug, api: api),
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (p.trialLabel != null) TagPill(p.trialLabel!, gold: true),
              if (p.demoLabel != null) TagPill(p.demoLabel!, gold: true),
              const SizedBox(height: 6),
              Row(
                children: [
                  Expanded(
                    child: Text(p.name, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                  ),
                  TagPill(p.riskLabel, gold: p.riskLevel != 'low'),
                ],
              ),
              Muted(p.location, size: 12),
              if (p.verifiedLand != null) ...[
                const SizedBox(height: 4),
                TagPill(p.verifiedLand!, icon: Icons.verified_outlined),
              ],
              if (p.description != null) Text(p.description!, maxLines: 2, overflow: TextOverflow.ellipsis),
              const SizedBox(height: 6),
              Row(
                children: [
                  Expanded(child: Muted(tr('${p.feddans} فدان · ${p.statusLabel}', '${p.feddans} feddans · ${p.statusLabel}'), size: 12)),
                  Muted(tr('${p.fundedPct}% ممول', '${p.fundedPct}% funded'), size: 12),
                ],
              ),
              const SizedBox(height: 4),
              LinearProgressIndicator(value: p.fundedPct / 100, minHeight: 6, borderRadius: BorderRadius.circular(4)),
              const SizedBox(height: 4),
              Muted(
                tr('الحصة من ${p.sharePrice}${p.expectedReturn != null ? ' · عائد متوقع ${p.expectedReturn}%' : ''}', 'Share from ${p.sharePrice}${p.expectedReturn != null ? ' · expected return ${p.expectedReturn}%' : ''}'),
                size: 12,
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _InspectionTile extends StatelessWidget {
  const _InspectionTile({required this.item});
  final InspectionItem item;

  @override
  Widget build(BuildContext context) => DealCard(
    children: [
      InkWell(
        onTap: () => openOnSite(context, '/invest/inspections/${item.id}'),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${item.place}${item.ref != null ? ' · ${item.ref}' : ''}',
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                  Muted(item.area, size: 12),
                ],
              ),
            ),
            TagPill(item.verdictLabel ?? item.statusLabel),
          ],
        ),
      ),
    ],
  );
}

class _SignInFirst extends StatelessWidget {
  const _SignInFirst({required this.onSignIn, required this.what});
  final VoidCallback onSignIn;
  final String what;

  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.all(16),
    children: [
      StateView(
        icon: Icons.lock_outline,
        title: tr('ادخل لترى $what', 'Sign in to see $what'),
        message: tr('حسابٌ واحد للاستثمار وللأرض، وهو حسابك في الموقع نفسه.', 'One account for investing and for land, and it is your account on the website too.'),
        compact: true,
      ),
      FilledButton.icon(onPressed: onSignIn, icon: const Icon(Icons.login), label: Text(tr('ادخل إلى حسابك', 'Sign in to your account'))),
    ],
  );
}

/// A tab's loading, error and pull-to-refresh.
class _Future<T> extends StatelessWidget {
  const _Future({required this.future, required this.onRetry, required this.builder});
  final Future<T> future;
  final VoidCallback onRetry;
  final Widget Function(BuildContext, T) builder;

  @override
  Widget build(BuildContext context) => RefreshIndicator(
    onRefresh: () async => onRetry(),
    child: FutureBuilder<T>(
      future: future,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) return const LoadingView();
        if (snap.hasError) {
          final e = snap.error;
          return StateView.error(e is ApiException ? e.message : tr('تعذّر التحميل.', 'Could not load.'), onRetry: onRetry, scrollable: true);
        }
        return builder(context, snap.data as T);
      },
    ),
  );
}
