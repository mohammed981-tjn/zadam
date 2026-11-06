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
          title: const Text('الاستثمار'),
          bottom: const TabBar(
            isScrollable: true,
            tabAlignment: TabAlignment.start,
            tabs: [
              Tab(text: 'الفرص'),
              Tab(text: 'طلباتي'),
              Tab(text: 'أرضي'),
              Tab(text: 'الشركات'),
            ],
          ),
        ),
        body: TabBarView(
          children: [
            _Future<InvestOverview>(future: _overview, onRetry: _reload, builder: _opportunities),
            _mine == null
                ? _SignInFirst(onSignIn: _signIn, what: 'طلباتك واستثماراتك')
                : _Future<MyInvest>(future: _mine!, onRetry: _reload, builder: _myRequests),
            _mine == null
                ? _SignInFirst(onSignIn: _signIn, what: 'أراضيك وعرضها على المستثمرين')
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
      const HeroBand(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('فرص الاستثمار', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
            SizedBox(height: 6),
            Text(
              'أراضٍ وثّقت سوداقري مستنداتها يبحث أصحابها عن شريك، ومشاريع مطروحة. أنت تموّل، وصاحب الأرض يقدّم '
              'الأرض والماء والعمل، وسوداقري تتحقّق وتتابع. المال لا يمرّ بالمنصّة، ولا أحد يَعِدك بربح.',
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
          title: const Text('كيف يستفيد المستثمر من صاحب الأرض', style: TextStyle(fontWeight: FontWeight.w800)),
          childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
          expandedCrossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (final m in o.glossary.models) ...[
              Text(
                m.label,
                style: TextStyle(fontWeight: FontWeight.w800, color: textGreenOn(context)),
              ),
              Text('المستثمر: ${m.investor}', style: const TextStyle(height: 1.6, fontSize: 13)),
              Text('صاحب الأرض: ${m.owner}', style: const TextStyle(height: 1.6, fontSize: 13)),
              const SizedBox(height: 8),
            ],
            const Muted('النسبة والأجرة والمدّة يتّفق عليها الطرفان كتابةً — سوداقري لا تحدّدها ولا تضمنها.', size: 12),
          ],
        ),
      ),
      const SizedBox(height: 12),
      SectionTitle(
        o.lands.isEmpty ? 'أراضٍ تبحث عن شريك' : 'أراضٍ تبحث عن شريك (${o.lands.length})',
        subtitle: 'الولاية والمساحة والتربة والماء، بلا اسمٍ ولا موقع حتى يقبل صاحبها',
      ),
      if (o.landsFailed)
        const Muted('تعذّرت قراءة الأراضي الآن — والخلل عندنا. أعد المحاولة بعد قليل.')
      else if (o.lands.isEmpty)
        const StateView(
          icon: Icons.landscape_outlined,
          title: 'لا أرض معروضة بعد.',
          message: 'تظهر هنا الأرض بعد أن توثّقها الإدارة ويفتحها صاحبها للمستثمرين من «أرضي».',
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
            'تقرير معاينةٍ مستقلّ: مفتّشٌ ليس طرفاً يزور الأرض ويكتب تقريراً بصوره. ${o.feeLine}${o.reports != null ? ' ${o.reports}' : ''}',
            size: 12,
          ),
        ),
      SectionTitle(o.projects.isEmpty ? 'مشاريع مطروحة' : 'مشاريع مطروحة (${o.projects.length})'),
      if (o.projects.isEmpty)
        const Muted('لا مشروع مطروح بعد. المشروع فرصةٌ كتبها صاحبها بالمحصول والحصص، وراجعتها الإدارة قبل نشرها.'),
      for (final p in o.projects) _ProjectTile(project: p, api: _api),
      const SizedBox(height: 12),
      DealCard(
        title: 'عندك أرض وتبحث عن ممّول؟',
        children: [
          const Muted(
            'سجّلها مجّاناً وارفع مستنداتها. بعد أن توثّقها الإدارة، اعرضها على المستثمرين من «أرضي» واختر نماذج الشراكة التي تقبلها.',
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: [
              FilledButton(onPressed: () => DefaultTabController.of(context).animateTo(2), child: const Text('أرضي')),
              OutlinedButton(onPressed: () => openOnSite(context, '/lands/new'), child: const Text('سجّل أرضاً')),
              OutlinedButton(
                onPressed: () => openOnSite(context, '/opportunities/new'),
                child: const Text('ارفع فرصة (على الموقع)'),
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
      const IntroNote('طلبات الشراكة التي أرسلتها. حين يقبل صاحب الأرض يظهر هنا اسمه وهاتفه وموقع الأرض.'),
      const SizedBox(height: 12),
      if (m.assigned.isNotEmpty) ...[
        const SectionTitle('معايناتٌ أُسندت إليك'),
        for (final i in m.assigned) _InspectionTile(item: i),
      ],
      if (m.asked.isNotEmpty) ...[
        const SectionTitle('طلبات المعاينة'),
        for (final i in m.asked) _InspectionTile(item: i),
      ],
      const SectionTitle('طلبات الشراكة'),
      if (m.interests.isEmpty)
        StateView(
          icon: Icons.handshake_outlined,
          title: 'لم ترسل طلباً بعد.',
          message: 'تصفّح فرص الاستثمار، واطلب الشراكة على أرضٍ موثّقة.',
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
                'قَبِل صاحب الأرض — تواصلا',
                style: TextStyle(fontWeight: FontWeight.w800, color: textGreenOn(context)),
              ),
              InfoLine('صاحب الأرض', r.ownerName ?? '—'),
              if (r.ownerPhone != null)
                TextButton.icon(
                  onPressed: () => openLink(context, 'tel:${r.ownerPhone}'),
                  icon: const Icon(Icons.call_outlined, size: 18),
                  label: Text(r.ownerPhone!),
                )
              else
                const Muted('لم يضف هاتفاً بعد'),
              if (r.village != null) InfoLine('القرية', r.village!),
              if (r.map != null)
                TextButton.icon(
                  onPressed: () => openLink(context, r.map!),
                  icon: const Icon(Icons.map_outlined, size: 18),
                  label: const Text('افتح الخريطة'),
                ),
              const Muted(
                'عاينا الأرض، واتّفقا كتابةً على النسبة أو الأجرة والمدّة قبل أيّ دفع. وللإشراف والحرث والحصاد شركاتٌ شريكة موثّقة.',
                size: 12,
              ),
              const SizedBox(height: 8),
              FilledButton.icon(
                onPressed: () => _openAgreement(r.interestId),
                icon: const Icon(Icons.draw_outlined),
                label: const Text('اكتبا العقد ووقّعاه'),
              ),
            ],
            if (r.canWithdraw) ...[
              const SizedBox(height: 8),
              Align(
                alignment: AlignmentDirectional.centerStart,
                child: WarnButton(
                  label: 'اسحب الطلب',
                  onPressed: () async {
                    if (!await confirmStep(
                      context,
                      title: 'اسحب الطلب',
                      body: 'يُسحب طلبك ولا يراه صاحب الأرض بعد ذلك.',
                      go: 'اسحب',
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
        const SectionTitle('حصصي في المشاريع'),
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
              Muted('${i.shares} حصة · ${i.amount}', size: 12),
            ],
          ),
      ],
      if (m.plans.isNotEmpty) ...[
        const SectionTitle(
          'مشروعي — قائمة المدخلات',
          subtitle: 'تدفع لكلّ مورد مباشرةً، وتسجّل هنا ما دفعت وما استلمت',
        ),
        for (final p in m.plans)
          DealCard(
            title: p.title,
            children: [
              Muted('${p.crop} · ${p.feddans} فدان · ${p.statusLabel}', size: 12),
              const SizedBox(height: 6),
              Row(
                children: [
                  Expanded(child: InfoLine('التكلفة المسعّرة', '${p.costUsd} \$')),
                  Expanded(child: InfoLine('ما دفعتَ', '${money(p.paidSdg)} SDG')),
                ],
              ),
              Row(
                children: [
                  Expanded(child: InfoLine('ما استلمتَ', '${p.delivered} من ${p.items}')),
                  Expanded(child: InfoLine('ما بقي دفعه', '${p.remainingUsd} \$')),
                ],
              ),
              if (p.unpriced > 0) Muted('${p.unpriced} بنود بلا سعر بعد، فلا تدخل التكلفة.', size: 12),
              TextButton.icon(
                onPressed: () => openOnSite(context, '/my-project'),
                icon: const Icon(Icons.open_in_new, size: 18),
                label: const Text('سجّل الدفع والاستلام (على الموقع)'),
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
          const IntroNote(
            'بعد توثيق الأرض تستطيع عرضها على المستثمرين: مشاركة بالمحصول، أو إيجار، أو تمويل مدخلات. '
            'لا يرى المستثمر اسمك ولا هاتفك ولا موقعها حتى تقبل طلبه.',
          ),
          const SizedBox(height: 12),
          if (m.lands.isEmpty)
            StateView(
              icon: Icons.landscape_outlined,
              title: 'لا أرض مسجّلة بعد',
              message: 'سجّل أرضك من «حدّد أرضك» في الحساب أو على الموقع، وارفع مستنداتها لتوثّقها الإدارة.',
              compact: true,
            ),
          for (final l in m.lands)
            DealCard(
              title: l.name,
              highlight: l.requests.any((r) => r.canDecide),
              children: [
                Muted('${l.place} · ${l.feddans} فدان', size: 12),
                const SizedBox(height: 8),
                if (!l.investorsOn)
                  const SizedBox.shrink()
                else if (!l.verified)
                  const Muted('بعد توثيق الأرض تستطيع عرضها على المستثمرين.')
                else if (l.open) ...[
                  Text(
                    'أرضك معروضة في فرص الاستثمار بنماذج: ${l.modelLabels.join(' · ')}.',
                    style: const TextStyle(height: 1.6),
                  ),
                  Align(
                    alignment: AlignmentDirectional.centerStart,
                    child: WarnButton(
                      label: 'أوقف عرضها',
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
                    'طلب معاينةٍ من ${i.investorName ?? 'مستثمر'} — ${i.verdictLabel ?? i.statusLabel}',
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                  Muted('يُتحقَّق من: ${i.checks.join(' · ')}', size: 12),
                  TextButton(
                    onPressed: () => openOnSite(context, '/invest/inspections/${i.id}'),
                    child: const Text('التفاصيل والردّ (على الموقع)'),
                  ),
                ],
                for (final r in l.requests) ...[
                  const Divider(height: 20),
                  Text(
                    '${r.accepted ? 'شريكٌ قبلتَه: ' : 'طلب شراكة من '}${r.investorName ?? 'مستثمر'} — ${r.modelLabel}',
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
                              title: 'قبول الطلب',
                              body:
                                  'بقبولك يرى المستثمر اسمك وهاتفك وموقع الأرض، وترى هاتفه. اتّفقا كتابةً قبل أيّ دفع.',
                              go: 'أقبل',
                            )) {
                              return;
                            }
                            if (!context.mounted) return;
                            await runStep(context, () => _api.answerInterest(r.interestId, 'accept'), then: _reload);
                          },
                          child: const Text('أقبل وأكشف بياناتي له'),
                        ),
                        WarnButton(
                          label: 'أعتذر',
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
                      label: const Text('اكتبا العقد ووقّعاه'),
                    ),
                  ],
                ],
              ],
            ),
          OutlinedButton.icon(
            onPressed: () => openOnSite(context, '/lands/new'),
            icon: const Icon(Icons.add_location_alt_outlined),
            label: const Text('سجّل أرضاً (على الموقع)'),
          ),
        ],
      );
    },
  );

  // ── الشركات ────────────────────────────────────────────────────────────

  Widget _companies(BuildContext context, InvestOverview o) => ListView(
    padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
    children: [
      const IntroNote(
        'شركاتٌ رأى المشرف سجلّها التجاري، تنفّذ الخدمات على المزارع: الميكنة، والريّ، والمدخلات، والحصاد، '
        'والتعبئة، والنقل، والإرشاد. والعقد الملزم لأيّ مزرعة هو عقد الخدمة نفسه: بمراحله، ودفعه بعد الإثبات.',
      ),
      const SizedBox(height: 12),
      if (o.companies.isEmpty)
        const StateView(icon: Icons.business_outlined, title: 'لا شركة شريكة موثّقة بعد', compact: true),
      for (final c in o.companies)
        DealCard(
          title: c.name,
          children: [
            if (c.kinds.isNotEmpty) Wrap(spacing: 6, runSpacing: 6, children: [for (final k in c.kinds) TagPill(k)]),
            const SizedBox(height: 6),
            if (c.states.isNotEmpty) Muted('الولايات: ${c.states.join('، ')}', size: 12),
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
                  Expanded(child: Muted('${p.feddans} فدان · ${p.statusLabel}', size: 12)),
                  Muted('${p.fundedPct}% ممول', size: 12),
                ],
              ),
              const SizedBox(height: 4),
              LinearProgressIndicator(value: p.fundedPct / 100, minHeight: 6, borderRadius: BorderRadius.circular(4)),
              const SizedBox(height: 4),
              Muted(
                'الحصة من ${p.sharePrice}${p.expectedReturn != null ? ' · عائد متوقع ${p.expectedReturn}%' : ''}',
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
        title: 'ادخل لترى $what',
        message: 'حسابٌ واحد للاستثمار وللأرض، وهو حسابك في الموقع نفسه.',
        compact: true,
      ),
      FilledButton.icon(onPressed: onSignIn, icon: const Icon(Icons.login), label: const Text('ادخل إلى حسابك')),
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
          return StateView.error(e is ApiException ? e.message : 'تعذّر التحميل.', onRetry: onRetry, scrollable: true);
        }
        return builder(context, snap.data as T);
      },
    ),
  );
}
