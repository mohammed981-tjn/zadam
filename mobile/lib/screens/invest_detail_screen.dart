/// The investment pieces shared by «الاستثمار» and an opportunity's own page (البند ٢٠٣): the verified land's offer
/// card with «اطلب الشراكة» and the inspection request, the landowner's one-tap «اعرض أرضي على المستثمرين», and the
/// opportunity page itself (/projects/[slug]): its trial label, its study, the risk notice and the way to partner.
library;

import 'package:flutter/material.dart';

import '../api.dart';
import '../contracts.dart' show day;
import '../invest.dart';
import '../theme.dart';
import '../ui.dart';
import 'account_screen.dart' show AccountScreen, openOnSite;
import 'deal_ui.dart';

/// The risk notice (backlog 136), as the website puts it before every request.
class RiskNotice extends StatelessWidget {
  const RiskNotice(this.text, {super.key, this.lead = 'قبل أن تبدأ: '});
  final String text;
  final String lead;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(
      color: warnTintOn(context),
      borderRadius: BorderRadius.circular(14),
      border: Border.all(color: warnOn(context).withValues(alpha: 0.35)),
    ),
    child: Text.rich(
      TextSpan(
        children: [
          TextSpan(
            text: lead,
            style: const TextStyle(fontWeight: FontWeight.w800),
          ),
          TextSpan(text: text),
        ],
      ),
      style: const TextStyle(height: 1.7, fontSize: 13),
    ),
  );
}

/// One verified land offered to investors: no name, no village, no owner until the owner accepts.
class LandOfferTile extends StatelessWidget {
  const LandOfferTile({
    super.key,
    required this.land,
    required this.signedIn,
    required this.inspectionsOn,
    required this.feeLine,
    required this.glossary,
    required this.api,
    required this.onChanged,
  });

  final LandOffer land;
  final bool signedIn;
  final bool inspectionsOn;
  final String feeLine;
  final InvestGlossary glossary;
  final InvestApi api;

  /// After a request: reload what the reader sees.
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context) {
    final l = land;
    final action = l.action(signedIn: signedIn);
    return DealCard(
      children: [
        Row(
          children: [
            Expanded(
              child: Text(l.place, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15.5)),
            ),
            const TagPill('أرض موثّقة', icon: Icons.verified_outlined),
          ],
        ),
        Muted([?l.area, if (l.documentsOnFile > 0) '${l.documentsOnFile} مستندات في الملفّ'].join(' · ')),
        const SizedBox(height: 8),
        Wrap(spacing: 6, runSpacing: 6, children: [for (final m in l.models) TagPill(m.label)]),
        const SizedBox(height: 10),
        InfoLine('مصدر المياه', l.water),
        InfoLine('المياه للفدان (يعلنها المالك)', l.waterPerFeddan ?? '—'),
        InfoLine(l.soilLabel, [l.soil ?? '—', ?l.soilConfidence].join(' · ')),
        InfoLine('المنطقة المناخيّة', l.climate),
        if (l.crops.isNotEmpty) InfoLine('المحاصيل التي يريدها', l.crops.join(' · ')),
        if (l.note != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text('«${l.note}»', style: const TextStyle(fontStyle: FontStyle.italic, height: 1.6)),
          ),
        switch (action) {
          OfferAction.mine => const Muted('هذه أرضك.'),
          OfferAction.asked => TagPill(l.interestLabel ?? 'أرسلتَ طلباً'),
          OfferAction.signIn => FilledButton(
            onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const AccountScreen())),
            child: const Text('سجّل كمستثمر لتطلب الشراكة'),
          ),
          OfferAction.request => FilledButton.icon(
            icon: const Icon(Icons.handshake_outlined),
            label: const Text('اطلب الشراكة'),
            onPressed: () async {
              final sent = await showPartnershipRequest(context, land: l, glossary: glossary, api: api);
              if (sent) onChanged();
            },
          ),
        },
        if (inspectionsOn && !l.mine && signedIn) ...[
          const Divider(height: 24),
          if (l.inspectionLabel != null)
            TextButton(
              onPressed: () => openOnSite(context, '/invest/inspections/${l.inspectionId}'),
              child: Text('معاينتك: ${l.inspectionLabel}'),
            )
          else if (l.canAskInspection(signedIn: signedIn, inspectionsOn: inspectionsOn))
            TextButton.icon(
              icon: const Icon(Icons.fact_check_outlined, size: 18),
              label: const Text('اطلب تقرير معاينةٍ مستقلّ قبل أن تقرّر'),
              onPressed: () async {
                final sent = await showInspectionRequest(
                  context,
                  land: l,
                  glossary: glossary,
                  feeLine: feeLine,
                  api: api,
                );
                if (sent) onChanged();
              },
            ),
        ],
      ],
    );
  }
}

/// «اطلب الشراكة»: the model, a message, and the risk notice acknowledged. True when sent.
Future<bool> showPartnershipRequest(
  BuildContext context, {
  required LandOffer land,
  required InvestGlossary glossary,
  required InvestApi api,
}) async {
  final sent = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => _RequestSheet(land: land, glossary: glossary, api: api),
  );
  return sent == true;
}

class _RequestSheet extends StatefulWidget {
  const _RequestSheet({required this.land, required this.glossary, required this.api});
  final LandOffer land;
  final InvestGlossary glossary;
  final InvestApi api;

  @override
  State<_RequestSheet> createState() => _RequestSheetState();
}

class _RequestSheetState extends State<_RequestSheet> {
  late String _model = widget.land.models.isEmpty ? '' : widget.land.models.first.key;
  final _message = TextEditingController();
  bool _ack = false;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _message.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final messenger = ScaffoldMessenger.of(context);
    final nav = Navigator.of(context);
    try {
      final said = await widget.api.requestPartnership(
        landId: widget.land.landId,
        model: _model,
        message: _message.text.trim(),
        riskAcknowledged: _ack,
      );
      messenger.showSnackBar(SnackBar(content: Text(said)));
      nav.pop(true);
    } on ApiException catch (e) {
      setState(() {
        _busy = false;
        _error = e.message;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final ready = _model.isNotEmpty && _message.text.trim().length >= 10 && _ack && !_busy;
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 0, 16, 16 + MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'اطلب الشراكة — ${widget.land.place}',
              style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
            ),
            const SizedBox(height: 8),
            const Text('نموذج الشراكة', style: TextStyle(fontWeight: FontWeight.w700)),
            RadioGroup<String>(
              groupValue: _model,
              onChanged: (v) => setState(() => _model = v ?? _model),
              child: Column(
                children: [
                  for (final m in widget.land.models)
                    RadioListTile<String>(contentPadding: EdgeInsets.zero, value: m.key, title: Text(m.label)),
                ],
              ),
            ),
            TextField(
              key: const Key('interest-message'),
              controller: _message,
              maxLines: 3,
              maxLength: 1000,
              onChanged: (_) => setState(() {}),
              decoration: const InputDecoration(
                labelText: 'رسالتك لصاحب الأرض',
                hintText: 'من أنت، وماذا تقترح، ومتى تريد البدء.',
              ),
            ),
            const Muted(
              'يصل صاحبَ الأرض إشعار. يرى اسمك، والبلد الذي سجّلت منه رقمك، وعدد عقودك الموقّعة على سوداقري؛ '
              'وهاتفك وموقع الأرض لا يُكشفان إلا بعد قبوله.',
              size: 12,
            ),
            const SizedBox(height: 10),
            RiskNotice(widget.glossary.riskNotice, lead: 'قبل أن ترسل: '),
            CheckboxListTile(
              key: const Key('risk-ack'),
              contentPadding: EdgeInsets.zero,
              controlAffinity: ListTileControlAffinity.leading,
              value: _ack,
              onChanged: (v) => setState(() => _ack = v ?? false),
              title: const Text('قرأتُ هذا وفهمته.'),
            ),
            if (_error != null) Text(_error!, style: TextStyle(color: warnOn(context))),
            const SizedBox(height: 6),
            FilledButton(
              key: const Key('interest-send'),
              onPressed: ready ? _send : null,
              child: const Text('أرسل الطلب'),
            ),
          ],
        ),
      ),
    );
  }
}

/// «اطلب تقرير معاينةٍ مستقلّ»: what the inspector checks (all, to start with), a note, the fee. True when sent.
Future<bool> showInspectionRequest(
  BuildContext context, {
  required LandOffer land,
  required InvestGlossary glossary,
  required String feeLine,
  required InvestApi api,
}) async {
  final sent = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => _InspectionSheet(land: land, glossary: glossary, feeLine: feeLine, api: api),
  );
  return sent == true;
}

class _InspectionSheet extends StatefulWidget {
  const _InspectionSheet({required this.land, required this.glossary, required this.feeLine, required this.api});
  final LandOffer land;
  final InvestGlossary glossary;
  final String feeLine;
  final InvestApi api;

  @override
  State<_InspectionSheet> createState() => _InspectionSheetState();
}

class _InspectionSheetState extends State<_InspectionSheet> {
  late final Set<String> _checks = {for (final c in widget.glossary.checks) c.key};
  final _note = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);
    final nav = Navigator.of(context);
    try {
      final said = await widget.api.requestInspection(
        landId: widget.land.landId,
        checks: [
          for (final c in widget.glossary.checks)
            if (_checks.contains(c.key)) c.key,
        ],
        note: _note.text.trim(),
      );
      messenger.showSnackBar(SnackBar(content: Text(said)));
      nav.pop(true);
    } on ApiException catch (e) {
      setState(() {
        _busy = false;
        _error = e.message;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 0, 16, 16 + MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('ما الذي يتحقّق منه المفتّش؟', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
            for (final c in widget.glossary.checks)
              CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                controlAffinity: ListTileControlAffinity.leading,
                value: _checks.contains(c.key),
                onChanged: (v) => setState(() => v == true ? _checks.add(c.key) : _checks.remove(c.key)),
                title: Text(c.label, style: const TextStyle(fontWeight: FontWeight.w700)),
                subtitle: Text(c.detail, style: const TextStyle(fontSize: 12)),
              ),
            TextField(
              controller: _note,
              maxLines: 2,
              maxLength: 1000,
              decoration: const InputDecoration(labelText: 'ما يهمّك أكثر (اختياري)'),
            ),
            Muted(
              '${widget.feeLine} يزور الأرضَ مفتّشٌ تعيّنه سوداقري بعد موافقة صاحبها، وليس طرفاً في شيء. '
              'ولا تعرف اسم صاحب الأرض ولا موقعها من التقرير.',
              size: 12,
            ),
            if (_error != null) Text(_error!, style: TextStyle(color: warnOn(context))),
            const SizedBox(height: 8),
            FilledButton(onPressed: _checks.isNotEmpty && !_busy ? _send : null, child: const Text('اطلب المعاينة')),
          ],
        ),
      ),
    );
  }
}

/// «اعرض أرضي على المستثمرين», one tap: every model ticked, or the ones chosen last time, and a line for investors.
class ConsentForm extends StatefulWidget {
  const ConsentForm({
    super.key,
    required this.landId,
    required this.models,
    required this.chosenBefore,
    required this.api,
    required this.onDone,
    this.note,
  });

  final String landId;
  final List<ModelInfo> models;
  final List<String> chosenBefore;
  final String? note;
  final InvestApi api;
  final VoidCallback onDone;

  @override
  State<ConsentForm> createState() => _ConsentFormState();
}

class _ConsentFormState extends State<ConsentForm> {
  late final Set<String> _chosen = consentDefaults(widget.chosenBefore, widget.models);
  late final _note = TextEditingController(text: widget.note ?? '');
  bool _busy = false;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _offer() async {
    setState(() => _busy = true);
    await runStep(
      context,
      () => widget.api.setConsent(
        landId: widget.landId,
        open: true,
        models: [
          for (final m in widget.models)
            if (_chosen.contains(m.key)) m.key,
        ],
        note: _note.text.trim(),
      ),
      then: widget.onDone,
    );
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text('ما الشراكة التي تقبلها؟', style: TextStyle(fontWeight: FontWeight.w700)),
        for (final m in widget.models)
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            value: _chosen.contains(m.key),
            onChanged: (v) => setState(() => v == true ? _chosen.add(m.key) : _chosen.remove(m.key)),
            title: Text(m.label, style: const TextStyle(fontWeight: FontWeight.w700)),
            subtitle: Text(m.owner, style: const TextStyle(fontSize: 12)),
          ),
        TextField(
          controller: _note,
          maxLines: 2,
          maxLength: 500,
          decoration: const InputDecoration(
            labelText: 'سطرٌ عن أرضك للمستثمر (اختياري)',
            hintText: 'مثال: أرضٌ على النيل بمضخّة تعمل، زرعتُها بامية وطماطم، وأريد ممّولاً للموسم الشتوي.',
          ),
        ),
        const Muted('لا تكتب اسمك ولا هاتفك هنا — يُكشفان بعد موافقتك.', size: 12),
        const SizedBox(height: 8),
        FilledButton.icon(
          key: const Key('offer-land'),
          onPressed: _chosen.isNotEmpty && !_busy ? _offer : null,
          icon: const Icon(Icons.campaign_outlined),
          label: const Text('اعرض أرضي على المستثمرين'),
        ),
      ],
    );
  }
}

// ── صفحة الفرصة ──────────────────────────────────────────────────────────────

class ProjectScreen extends StatefulWidget {
  const ProjectScreen({super.key, required this.slug, this.api});
  final String slug;
  final InvestApi? api;

  @override
  State<ProjectScreen> createState() => _ProjectScreenState();
}

class _ProjectScreenState extends State<ProjectScreen> {
  late final InvestApi _api = widget.api ?? InvestApi();
  late Future<ProjectDetail> _data = _api.project(widget.slug);

  void _reload() => setState(() {
    _data = _api.project(widget.slug);
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('فرصة استثمار')),
      body: RefreshIndicator(
        onRefresh: () async => _reload(),
        child: FutureBuilder<ProjectDetail>(
          future: _data,
          builder: (context, snap) {
            if (snap.connectionState != ConnectionState.done) return const LoadingView();
            if (snap.hasError) {
              final e = snap.error;
              return StateView.error(
                e is ApiException ? e.message : 'تعذّر فتح الفرصة.',
                onRetry: _reload,
                scrollable: true,
              );
            }
            final d = snap.data!;
            final p = d.card;
            return ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
              children: [
                if (d.trialNote != null) RiskNotice(d.trialNote!, lead: 'فرصة تجريبيّة. '),
                if (d.demoNote != null) RiskNotice(d.demoNote!, lead: 'نموذج توضيحي. '),
                const SizedBox(height: 10),
                Muted(p.location),
                Text(p.name, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    TagPill(p.statusLabel),
                    TagPill(p.riskLabel, gold: p.riskLevel != 'low'),
                    TagPill('${p.feddans} فدان'),
                    if (p.verifiedLand != null) TagPill(p.verifiedLand!, icon: Icons.verified_outlined),
                    if (p.expectedReturn != null) TagPill('عائد سنوي متوقع ${p.expectedReturn}%'),
                  ],
                ),
                if (p.description != null) ...[
                  const SizedBox(height: 12),
                  Text(p.description!, style: const TextStyle(height: 1.8)),
                ],
                const SizedBox(height: 14),
                DealCard(
                  title: 'دراسة الفرصة',
                  children: [
                    for (final r in d.study)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 6),
                        child: Row(
                          children: [
                            Expanded(child: Muted(r.$1)),
                            Flexible(
                              child: Text(r.$2, style: const TextStyle(fontWeight: FontWeight.w700)),
                            ),
                          ],
                        ),
                      ),
                    const Muted(
                      'ما تشهد به المنصّة أنّ ما يقوله العرض مسنودٌ بأوراق — لا أنّ الموسم سيربح. تلك تبقى مخاطرةً تخصّك.',
                      size: 12,
                    ),
                  ],
                ),
                RiskNotice(d.glossary.riskNotice),
                const SizedBox(height: 12),
                if (p.verifiedLand != null) _PartnerSection(detail: d, api: _api, onChanged: _reload),
                DealCard(
                  title: d.investmentOpen ? 'الاستثمار بالحصص' : 'الدفع عبر المنصّة لم يُفتح بعد',
                  children: [
                    if (!d.investmentOpen)
                      const Muted(
                        'لا تستقبل المنصّة أموالاً حتى تكتمل الترتيبات القانونية وترتيبُ حفظ المال. اترك بياناتك وسنبلغك أوّل ما يُفتح.',
                      ),
                    Text('سعر الحصة الاسترشادي: ${p.sharePrice}', style: const TextStyle(fontWeight: FontWeight.w700)),
                    if (d.investmentOpen) ...[
                      Muted('${p.fundedPct}% ممول'),
                      const SizedBox(height: 6),
                      FilledButton(
                        onPressed: () => openOnSite(context, '/projects/${p.slug}'),
                        child: const Text('استثمر على الموقع'),
                      ),
                    ],
                  ],
                ),
                const SectionTitle('آخر التقارير الميدانية'),
                if (d.updates.isEmpty) const Muted('لا توجد تقارير منشورة بعد لهذا المشروع.'),
                for (final u in d.updates)
                  DealCard(
                    title: u.$1,
                    children: [
                      Muted(day(u.$3), size: 12),
                      if (u.$2 != null) Text(u.$2!, style: const TextStyle(height: 1.7)),
                    ],
                  ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _PartnerSection extends StatelessWidget {
  const _PartnerSection({required this.detail, required this.api, required this.onChanged});
  final ProjectDetail detail;
  final InvestApi api;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context) {
    final d = detail;
    return DealCard(
      title: 'الشراكة مع صاحب الأرض',
      children: [
        const Muted(
          'تختار نوع الشراكة وتكتب لصاحب الأرض، فيصله إشعار. وحين يقبل يُكتب العقد ويوقّعه الطرفان على المنصّة، ثمّ يبدأ '
          'الموسم وتتابعه بالصور والمصروفات. المال بينكما مباشرةً، لا يمرّ بالمنصّة.',
          size: 12,
        ),
        const SizedBox(height: 8),
        if (d.offer != null)
          LandOfferTile(
            land: d.offer!,
            signedIn: true,
            inspectionsOn: d.inspectionsOn,
            feeLine: d.feeLine,
            glossary: d.glossary,
            api: api,
            onChanged: onChanged,
          )
        else if (!d.signedIn)
          FilledButton(
            onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const AccountScreen())),
            child: const Text('سجّل كمستثمر لتطلب الشراكة'),
          )
        else if (d.ownLandId != null) ...[
          const Text('أرضك لم تُعرض على المستثمرين بعد.', style: TextStyle(fontWeight: FontWeight.w700)),
          const Muted(
            'اختر الشراكات التي تقبلها، فيظهر للمستثمرين هنا وفي «فرص الاستثمار» زرّ «اطلب الشراكة». لا يرون اسمك ولا موقع الأرض حتى تقبل طلباً.',
            size: 12,
          ),
          ConsentForm(
            landId: d.ownLandId!,
            models: d.glossary.models,
            chosenBefore: d.ownLandModels,
            note: d.ownLandNote,
            api: api,
            onDone: onChanged,
          ),
        ] else if (d.isSubmitter)
          const Muted(
            'ليظهر للمستثمرين زرّ «اطلب الشراكة» هنا، افتح أرض هذا المشروع لهم من «أرضي» واختر نوع الشراكة الذي تقبله.',
          )
        else
          const Muted('لم يفتح صاحب الأرض باب الشراكة بعد.'),
      ],
    );
  }
}
