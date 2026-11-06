/// One contract on the phone (البند ٢٠٣): a service contract with its phases and proofs, a forward contract with its
/// text and history, or a partnership agreement with its clauses, signatures and the signing form.
///
/// Every step goes to the website's route, which takes the website's own step with this person's session. The
/// buttons shown are the website's (see contracts.dart); what the database refuses comes back in its words.
library;

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api.dart';
import '../contracts.dart';
import '../secure_screen.dart';
import '../theme.dart';
import '../ui.dart';
import 'account_screen.dart' show openOnSite;
import 'deal_ui.dart';

/// A detail screen's loading, error and pull-to-refresh, around [build].
class _Loaded<T> extends StatelessWidget {
  const _Loaded({required this.future, required this.onRetry, required this.builder});
  final Future<T> future;
  final VoidCallback onRetry;
  final Widget Function(T data) builder;

  @override
  Widget build(BuildContext context) => RefreshIndicator(
    onRefresh: () async => onRetry(),
    child: FutureBuilder<T>(
      future: future,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) return const LoadingView();
        if (snap.hasError) {
          final e = snap.error;
          return StateView.error(
            e is ApiException ? e.message : 'تعذّر فتح العقد.',
            onRetry: onRetry,
            scrollable: true,
          );
        }
        return builder(snap.data as T);
      },
    ),
  );
}

// ── عقد الخدمة ───────────────────────────────────────────────────────────────

class ServiceContractScreen extends StatefulWidget {
  const ServiceContractScreen({super.key, required this.id, this.api});
  final String id;
  final ContractsApi? api;

  @override
  State<ServiceContractScreen> createState() => _ServiceContractScreenState();
}

class _ServiceContractScreenState extends State<ServiceContractScreen> {
  late final ContractsApi _api = widget.api ?? ContractsApi();
  late Future<ServiceContract> _data = _api.service(widget.id);

  void _reload() => setState(() {
    _data = _api.service(widget.id);
  });

  Future<void> _move(ServiceContract c, ContractMove mv) async {
    final binding = mv.status == 'active'
        ? 'بقبولك يسري العقد ويصير ملزماً للطرفين بمراحله وأسعاره، وتبدأ المراحل في التحرّك.'
        : mv.status == 'proposed'
        ? 'يصل العرض إلى مقدّم الخدمة، وتتجمّد الشروط: لا يُغيَّر سعر ولا كمية حتى يُسحب العرض.'
        : 'ستُنفَّذ هذه الخطوة على العقد «${c.title}».';
    if (!await confirmStep(context, title: mv.label, body: binding, go: mv.label)) return;
    if (!mounted) return;
    await runStep(context, () async {
      await _api.moveService(c.id, mv.status);
      return 'تمّ: ${mv.label}.';
    }, then: _reload);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('عقد خدمات')),
      body: _Loaded<ServiceContract>(
        future: _data,
        onRetry: _reload,
        builder: (c) => ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
          children: [
            Text(c.title, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
            Muted('مع ${c.providerName ?? 'مقدّم خدمة'} — ${c.milestones.length} مراحل'),
            const SizedBox(height: 12),
            DealCard(
              children: [
                Row(
                  children: [
                    Expanded(child: InfoLine('إجمالي العقد', '${money(c.total)} ${c.currency}')),
                    Expanded(child: InfoLine('المدفوع', money(c.paid))),
                    Expanded(child: InfoLine('المتبقّي', money(c.total - c.paid))),
                  ],
                ),
              ],
            ),
            DealCard(
              children: [
                Wrap(
                  spacing: 8,
                  runSpacing: 6,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    TagPill(c.statusLabel, gold: c.status == 'cancelled' || c.status == 'disputed'),
                    if (c.signedAt != null) Muted('وُقّع ${day(c.signedAt)}', size: 12),
                  ],
                ),
                const SizedBox(height: 8),
                Text(c.says, style: const TextStyle(height: 1.7)),
                const SizedBox(height: 10),
                if (c.moves.isEmpty)
                  Muted(
                    c.status == 'proposed'
                        ? 'بانتظار الطرف الآخر — لا خطوة لك الآن.'
                        : 'لا خطوة متاحة لك على هذا العقد الآن.',
                  )
                else
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final mv in c.moves)
                        mv.danger
                            ? WarnButton(label: mv.label, onPressed: () => _move(c, mv))
                            : FilledButton(onPressed: () => _move(c, mv), child: Text(mv.label)),
                    ],
                  ),
              ],
            ),
            const IntroNote(
              'الدفع يتبع الإثبات: لا تُعتمد مرحلة قبل رفع صورة أو تقرير من الموقع، ولا تُعتمد قبل اعتماد المرحلة التي '
              'تسبقها، ولا يُسجَّل دفع قبل الاعتماد. هذه قواعد في قاعدة البيانات نفسها — لا يمكن تجاوزها من أي شاشة.',
              icon: Icons.verified_user_outlined,
            ),
            const SizedBox(height: 14),
            for (final m in c.milestones) _MilestoneCard(contract: c, m: m),
            if (c.seasonId != null)
              TextButton.icon(
                onPressed: () => openOnSite(context, '/seasons/${c.seasonId}'),
                icon: const Icon(Icons.open_in_new, size: 18),
                label: const Text('الموسم الذي بُني عليه هذا العقد'),
              ),
          ],
        ),
      ),
    );
  }
}

class _MilestoneCard extends StatelessWidget {
  const _MilestoneCard({required this.contract, required this.m});
  final ServiceContract contract;
  final Milestone m;

  @override
  Widget build(BuildContext context) {
    final next = milestoneNext[m.status];
    final waiting = contract.waitingText(m);
    return DealCard(
      highlight: contract.isMine(m),
      children: [
        Row(
          children: [
            Expanded(
              child: Text('${m.seq}. ${m.title}', style: const TextStyle(fontWeight: FontWeight.w800)),
            ),
            TagPill(milestoneStatusLabel[m.status] ?? m.status, gold: m.status == 'rejected'),
          ],
        ),
        const SizedBox(height: 4),
        Muted(
          '${money(m.quantity)} ${m.unit} × ${money(m.unitPrice)} = ${money(m.amount)}'
          '${m.plannedStart != null ? ' — من ${m.plannedStart}${m.plannedEnd != null ? ' إلى ${m.plannedEnd}' : ''}' : ''}',
        ),
        const SizedBox(height: 6),
        if (m.evidence.isEmpty)
          Muted(m.requiresEvidence ? 'لا يوجد إثبات بعد' : 'لا يتطلب إثباتاً', size: 12)
        else
          for (final e in m.evidence)
            Container(
              margin: const EdgeInsets.only(top: 6),
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: leafTintOn(context).withValues(alpha: 0.5),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${evidenceKindLabel[e.kind] ?? e.kind}${e.caption != null ? ' — ${e.caption}' : ''}',
                    style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                  ),
                  Muted(
                    [
                      e.capturedAt != null ? 'التُقط ${day(e.capturedAt)}' : 'بلا تاريخ التقاط',
                      e.latitude != null && e.longitude != null
                          ? '${e.latitude!.toStringAsFixed(4)}, ${e.longitude!.toStringAsFixed(4)}'
                          : 'بلا إحداثيات',
                    ].join(' · '),
                    size: 12,
                  ),
                ],
              ),
            ),
        if (contract.blocked(m))
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
              'ارفع إثبات تنفيذ واحداً على الأقل قبل الاعتماد.',
              style: TextStyle(color: warnOn(context), fontSize: 12),
            ),
          ),
        if (waiting != null) Padding(padding: const EdgeInsets.only(top: 8), child: Muted(waiting, size: 12)),
        if (next != null && contract.isMine(m)) ...[
          const SizedBox(height: 8),
          // Moving a phase and uploading its proof are on the website: the proof is a file from the field.
          OutlinedButton.icon(
            onPressed: () => openOnSite(context, '/contracts/${contract.id}'),
            icon: const Icon(Icons.open_in_new, size: 18),
            label: Text('${next.label} (على الموقع)'),
          ),
        ],
      ],
    );
  }
}

// ── العقد الآجل ──────────────────────────────────────────────────────────────

class ForwardContractScreen extends StatefulWidget {
  const ForwardContractScreen({super.key, required this.id, this.api});
  final String id;
  final ContractsApi? api;

  @override
  State<ForwardContractScreen> createState() => _ForwardContractScreenState();
}

class _ForwardContractScreenState extends State<ForwardContractScreen> {
  late final ContractsApi _api = widget.api ?? ContractsApi();
  late Future<ForwardContract> _data = _api.forward(widget.id);

  void _reload() => setState(() {
    _data = _api.forward(widget.id);
  });

  Future<void> _take(ForwardContract c, ForwardAction a) async {
    if (a.onSite) return openOnSite(context, '/market/forward/${c.row.id}');
    String? reason;
    if (a.needsReason) {
      reason = await askReason(
        context,
        title: a.prompt ?? a.label,
        hint: a.step == 'dispute' ? 'ما الخلاف؟' : 'السبب: يقرؤه الطرف الآخر',
        go: a.label,
      );
      if (reason == null) return;
    } else if (a.step == 'sign') {
      final ok = await confirmStep(
        context,
        title: 'توقيع العقد الآجل',
        body:
            'بتوقيعك يصير العقد ملزماً لكما بشروطه: ${c.row.crop}، ${amount(c.row.quantity)} ${c.row.unit}، '
            'بسعر ${amount(c.row.price)} ${c.row.currency} للوحدة، يُسلَّم بين ${day(c.row.deliveryFrom)} و${day(c.row.deliveryTo)}. '
            'وقّع إن كنت تعرف الطرف الآخر واتّفقتما على هذا.',
        go: 'أوقّع العقد',
      );
      if (!ok) return;
    } else if (a.step == 'decline' || a.step == 'withdraw' || a.step == 'cancel_yes') {
      if (!await confirmStep(context, title: a.label, body: 'لا رجعة في هذه الخطوة.', go: a.label)) return;
    }
    if (!mounted) return;
    await runStep(context, () => _api.forwardStep(c.row.id, a.step, reason: reason), then: _reload);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('عقدٌ آجل')),
      body: _Loaded<ForwardContract>(
        future: _data,
        onRetry: _reload,
        builder: (c) {
          final r = c.row;
          // The website groups the buttons under the sentence of the first one in each group.
          final groups = <List<ForwardAction>>[];
          for (final a in c.actions) {
            if (a.prompt != null || groups.isEmpty) {
              groups.add([a]);
            } else {
              groups.last.add(a);
            }
          }
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
            children: [
              Muted('${r.ref} · ${r.statusLabel}', size: 12),
              Text('عقد بيعٍ آجل: ${r.crop}', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
              const SizedBox(height: 12),
              DealCard(
                children: [
                  Text(
                    'اتّفق ${c.farmerName}${c.farmerPhone != null ? ' (${c.farmerPhone})' : ''} (المزارع، البائع) و'
                    '${c.buyerName}${c.buyerPhone != null ? ' (${c.buyerPhone})' : ''} (المشتري) على ما يلي:',
                    style: const TextStyle(height: 1.8),
                  ),
                  const SizedBox(height: 6),
                  for (final (i, line) in [
                    'يبيع المزارع ويشتري المشتري ${amount(r.quantity)} ${r.unit} من ${r.crop}، بزيادةٍ أو نقصٍ حتى ${c.tolerance}٪ لا يُعدّ إخلالاً.',
                    'بالدرجة: ${c.grade}',
                    'بسعر ${amount(r.price)} ${r.currency} لل${r.unit}، فقيمة العقد ${amount(c.value)} ${r.currency}.',
                    'يُسلَّم بين ${day(r.deliveryFrom)} و${day(r.deliveryTo)} في ${r.place}.',
                    'الدفع: ${c.paymentTerms}${c.advancePercent != null && c.advancePercent! > 0 ? '، ومقدَّمٌ ${c.advancePercent}٪ عند التوقيع.' : ''}',
                    if (c.consigneeName != null)
                      'يستلم عن المشتري: ${c.consigneeName} (${c.consigneePhone ?? ''})، ويسجّل المشتري الاستلام حين يخبره.',
                    'الشرط الجزائيّ: على من يتأخّر في التسليم ${c.latePctWeek}٪ من قيمة العقد عن كلّ أسبوعٍ بعد آخر موعد، حتى '
                        '${c.lateCapPct}٪؛ وعلى من يمتنع عن التسليم أو الاستلام ${c.breachPct}٪ من قيمة العقد للطرف الآخر.'
                        '${c.forceMajeure ? ' وتُعفى القوّة القاهرة: حربٌ، أو سيلٌ، أو جراد، أو إغلاقُ طريق.' : ''}',
                    if (c.notes != null) c.notes!,
                    'يدفع المشتري للمزارع مباشرةً؛ سوداقري لا تحمل المال ولا تضمن التسليم ولا السداد. لا تتغيّر هذه الشروط '
                        'بعد التوقيع، ولا يُلغى العقد إلا باتّفاق الطرفين أو بفصل الإدارة في نزاع.',
                  ].indexed)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 4),
                      child: Text('${i + 1}. $line', style: const TextStyle(height: 1.7, fontSize: 13.5)),
                    ),
                  const SizedBox(height: 4),
                  Muted(
                    'اقتُرح ووقّعه مقترحه في ${day(c.proposedAt)}'
                    '${c.signedAt != null ? '، ووقّعه الطرف الآخر في ${day(c.signedAt)}' : ''}.',
                    size: 12,
                  ),
                ],
              ),
              if (c.penaltyAwarded != null)
                DealCard(
                  children: [
                    Text(
                      'حكمت الإدارة بغرامة ${amount(c.penaltyAwarded!)} ${r.currency} '
                      '${c.penaltyPayer == 'farmer' ? 'يدفعها المزارع للمشتري مباشرةً.' : 'يدفعها المشتري للمزارع مباشرةً.'}',
                    ),
                  ],
                ),
              if (c.deliveredOn != null)
                DealCard(
                  title: 'التسليم كما سجّله المشتري',
                  children: [
                    Text(
                      '${amount(c.deliveredQuantity ?? 0)} ${r.unit} · ${day(c.deliveredOn)} · '
                      '${c.gradeMet == true ? 'مطابقٌ للدرجة' : 'خالف الدرجة'}',
                    ),
                    if (c.deliveryNote != null) Muted(c.deliveryNote!),
                  ],
                ),
              for (final g in groups)
                DealCard(
                  highlight: !g.first.secondary,
                  children: [
                    if (g.first.prompt != null) ...[
                      Text(g.first.prompt!, style: const TextStyle(height: 1.7)),
                      const SizedBox(height: 10),
                    ],
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        for (final a in g)
                          a.onSite
                              ? OutlinedButton.icon(
                                  onPressed: () => _take(c, a),
                                  icon: const Icon(Icons.open_in_new, size: 18),
                                  label: Text('${a.label} (على الموقع)'),
                                )
                              : a.secondary
                              ? WarnButton(label: a.label, onPressed: () => _take(c, a))
                              : FilledButton(onPressed: () => _take(c, a), child: Text(a.label)),
                      ],
                    ),
                  ],
                ),
              const SectionTitle('ما جرى على العقد'),
              for (final e in c.events)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Text.rich(
                    TextSpan(
                      children: [
                        TextSpan(
                          text: '${day(e.at)} · ',
                          style: TextStyle(color: mutedOn(context)),
                        ),
                        TextSpan(text: e.label),
                        if (e.actor != null)
                          TextSpan(
                            text: ' (${e.actor})',
                            style: TextStyle(color: mutedOn(context)),
                          ),
                        if (e.note != null)
                          TextSpan(
                            text: '\n${e.note}',
                            style: TextStyle(color: mutedOn(context)),
                          ),
                      ],
                    ),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}

// ── عقد الشراكة ──────────────────────────────────────────────────────────────

class AgreementScreen extends StatefulWidget {
  const AgreementScreen({super.key, required this.id, this.api});
  final String id;
  final ContractsApi? api;

  @override
  State<AgreementScreen> createState() => _AgreementScreenState();
}

class _AgreementScreenState extends State<AgreementScreen> {
  late final ContractsApi _api = widget.api ?? ContractsApi();
  late Future<Agreement> _data = _api.agreement(widget.id);

  @override
  void initState() {
    super.initState();
    // The agreement lives on its page, as on the website: no copy is taken from the screen (Android).
    SecureScreen.on();
  }

  @override
  void dispose() {
    SecureScreen.off();
    super.dispose();
  }

  void _reload() => setState(() {
    _data = _api.agreement(widget.id);
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('عقد الشراكة')),
      body: _Loaded<Agreement>(
        future: _data,
        onRetry: _reload,
        builder: (a) => ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
          children: [
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: TagPill(
                a.signed
                    ? (a.managed ? 'موقَّعٌ من الأطراف الثلاثة ومقفل' : 'موقَّعٌ من الطرفين ومقفل')
                    : 'مسوّدة — النسخة ${a.version}',
              ),
            ),
            const SizedBox(height: 8),
            Text(a.title, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, height: 1.4)),
            if (a.signed && a.ref != null)
              Text(
                'رقم العقد: ${a.ref}',
                style: TextStyle(color: textGreenOn(context), fontWeight: FontWeight.w800),
              ),
            const SizedBox(height: 12),
            DealCard(
              children: [
                for (final (i, c) in a.clauses.indexed) ...[
                  Text('${i + 1}. ${c.title}', style: const TextStyle(fontWeight: FontWeight.w800)),
                  for (final b in c.body)
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text(b, style: const TextStyle(height: 1.75, fontSize: 13.5)),
                    ),
                  const SizedBox(height: 10),
                ],
                const Divider(),
                for (final r in a.roles) _SignatureBox(label: r.$2, signature: a.signatureOf(r.$1)),
                const SizedBox(height: 4),
                if (a.signed && a.signedAt != null)
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      border: Border.all(color: textGreenOn(context).withValues(alpha: 0.4), width: 2),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Column(
                      children: [
                        Text(
                          'شهدت سوداقري',
                          style: TextStyle(fontWeight: FontWeight.w900, color: textGreenOn(context)),
                        ),
                        Muted(
                          a.managed
                              ? 'وقّع الأطراف الثلاثة النسخة ${a.version} من هذا العقد بحساباتهم، وأُقفل في ${day(a.signedAt)}.'
                              : 'وقّع الطرفان النسخة ${a.version} من هذا العقد بحسابيهما، وأُقفل في ${day(a.signedAt)}.',
                          size: 12,
                        ),
                        Muted('بصمة العقد: ${a.shortHash}', size: 11),
                      ],
                    ),
                  )
                else
                  Muted(
                    'بصمة هذه النسخة: ${a.shortHash}'
                    '${a.earlierSignatures > 0 ? ' — عُدِّلت البنود بعد توقيعٍ سابق، فيلزم التوقيع من جديد.' : ''}',
                    size: 11,
                  ),
              ],
            ),
            _SplitCard(agreement: a, api: _api),
            if (a.signed && (a.me == 'owner' || a.me == 'investor'))
              DealCard(
                title: 'الموسم',
                children: [
                  if (a.seasons.isEmpty)
                    Muted(
                      a.me == 'owner'
                          ? 'ابدأ الموسم على أرض العقد: تُولَّد مراحله بتواريخها، وتسجّل فيها الصور والمصروفات، فيقرؤها شريكك.'
                          : 'حين يبدأ صاحب الأرض الموسم يظهر هنا، فتقرأ مراحله وصوره ودفتره.',
                    )
                  else
                    for (final s in a.seasons)
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text(s.$2),
                        subtitle: Text(s.$3),
                        trailing: const Icon(Icons.open_in_new, size: 18),
                        onTap: () => openOnSite(context, '/seasons/${s.$1}'),
                      ),
                  if (a.me == 'owner')
                    OutlinedButton(
                      onPressed: () => openOnSite(context, '/seasons/new?agreement=${a.id}'),
                      child: Text(
                        a.seasons.isEmpty ? 'ابدأ الموسم (على الموقع)' : 'ابدأ موسماً آخر من العقد (على الموقع)',
                      ),
                    ),
                ],
              ),
            if (a.hasStatement)
              DealCard(
                title: 'الحساب بينكما',
                children: [
                  for (final r in a.statementRows)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: Row(
                        children: [
                          Expanded(child: Muted(r.$1)),
                          Text(r.$2, style: const TextStyle(fontWeight: FontWeight.w800)),
                        ],
                      ),
                    ),
                  if (a.statementNote != null) Muted(a.statementNote!, size: 12),
                ],
              ),
            if (!a.signed && a.me != 'admin')
              a.canSign
                  ? _SignForm(agreement: a, api: _api, onSigned: _reload)
                  : DealCard(
                      children: [
                        Text.rich(
                          TextSpan(
                            children: [
                              TextSpan(
                                text: '✓ وقّعتَ هذه النسخة. ',
                                style: TextStyle(fontWeight: FontWeight.w800, color: textGreenOn(context)),
                              ),
                              if (a.waitingLabels.isNotEmpty)
                                TextSpan(text: 'بقي توقيع: ${a.waitingLabels.join('، ')} — ووصله إشعار.'),
                            ],
                          ),
                        ),
                      ],
                    ),
            if (a.canEditTerms)
              TextButton.icon(
                onPressed: () => openOnSite(context, '/invest/agreements/${a.id}'),
                icon: const Icon(Icons.edit_note),
                label: Text(a.version == 1 ? 'اكتبا بنود العقد (على الموقع)' : 'عدّل البنود (على الموقع)'),
              ),
          ],
        ),
      ),
    );
  }
}

class _SignatureBox extends StatelessWidget {
  const _SignatureBox({required this.label, this.signature});
  final String label;
  final AgreementSignature? signature;

  @override
  Widget build(BuildContext context) {
    final s = signature;
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Theme.of(context).scaffoldBackgroundColor,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Muted(label, size: 12),
          if (s == null)
            const Padding(padding: EdgeInsets.symmetric(vertical: 10), child: Text('لم يوقّع بعد'))
          else ...[
            SizedBox(height: 70, child: SignatureView(s.signature)),
            Text(s.fullName, style: const TextStyle(fontWeight: FontWeight.w800)),
            Muted(day(s.signedAt), size: 12),
          ],
        ],
      ),
    );
  }
}

/// «وقّع العقد»: the full name, the finger signature and the confirmation, as on the website.
class _SignForm extends StatefulWidget {
  const _SignForm({required this.agreement, required this.api, required this.onSigned});
  final Agreement agreement;
  final ContractsApi api;
  final VoidCallback onSigned;

  @override
  State<_SignForm> createState() => _SignFormState();
}

class _SignFormState extends State<_SignForm> {
  final _name = TextEditingController();
  final _drawing = SignatureDrawing();
  bool _agree = false;
  bool _busy = false;

  bool get _complete => _name.text.trim().length >= 5 && _drawing.ready && _agree;

  Future<void> _sign() async {
    setState(() => _busy = true);
    await runStep(
      context,
      () => widget.api.sign(widget.agreement, fullName: _name.text.trim(), signature: _drawing.path, agree: _agree),
      then: widget.onSigned,
    );
    if (mounted) setState(() => _busy = false);
  }

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return DealCard(
      title: 'وقّع العقد',
      highlight: true,
      children: [
        TextField(
          key: const Key('sign-name'),
          controller: _name,
          maxLength: 120,
          decoration: const InputDecoration(labelText: 'اسمك الكامل كما في إثبات هويّتك'),
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 6),
        SignaturePad(drawing: _drawing, onChanged: () => setState(() {})),
        CheckboxListTile(
          key: const Key('sign-agree'),
          contentPadding: EdgeInsets.zero,
          controlAffinity: ListTileControlAffinity.leading,
          value: _agree,
          onChanged: (v) => setState(() => _agree = v ?? false),
          title: const Text(
            'قرأتُ العقد كاملاً وأوافق على بنوده، وأعلم أنّ سوداقري تحفظه وتشهد عليه ولا تمسك مالاً ولا تضمن ربحاً.',
            style: TextStyle(fontSize: 13, height: 1.6),
          ),
        ),
        Align(
          alignment: AlignmentDirectional.centerStart,
          child: FilledButton.icon(
            key: const Key('sign-button'),
            onPressed: _complete && !_busy ? _sign : null,
            icon: const Icon(Icons.draw_outlined),
            label: const Text('أوقّع'),
          ),
        ),
      ],
    );
  }
}

/// «كيف يُقسم الحصاد؟»: the shares from the terms, and the website's calculator worked out on the site.
class _SplitCard extends StatefulWidget {
  const _SplitCard({required this.agreement, required this.api});
  final Agreement agreement;
  final ContractsApi api;

  @override
  State<_SplitCard> createState() => _SplitCardState();
}

class _SplitCardState extends State<_SplitCard> {
  final _fields = <String, TextEditingController>{};
  HarvestSplit? _result;
  String? _error;

  TextEditingController _f(String k) => _fields.putIfAbsent(k, TextEditingController.new);

  @override
  void dispose() {
    for (final c in _fields.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _work() async {
    try {
      final r = await widget.api.split(widget.agreement.id, {
        for (final e in _fields.entries) e.key: e.value.text.trim(),
      });
      setState(() {
        _result = r;
        _error = null;
      });
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final a = widget.agreement;
    final parties = [
      ('cost_owner', 'صاحب الأرض'),
      ('cost_investor', 'المستثمر'),
      if (a.managed) ('cost_manager', 'الشركة المديرة'),
    ];
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: ExpansionTile(
        shape: const Border(),
        title: const Text('كيف يُقسم الحصاد؟ (حاسبة)', style: TextStyle(fontWeight: FontWeight.w800)),
        childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        expandedCrossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final s in a.shares) Text('${s.$1}: ${s.$2}٪'),
          if (a.rent != null) Text('الأجرة في العقد: ${a.rent}'),
          const SizedBox(height: 6),
          const Muted(
            'اكتب ما تتوقّعه أو ما حدث بالدولار؛ تظهر القسمة بحسب نصّ هذا العقد. حاسبةٌ للتقدير، ولا تضمن المنصّة عائداً.',
            size: 12,
          ),
          TextField(
            controller: _f('revenue'),
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: InputDecoration(
              labelText: a.model == 'musaqah' ? 'قيمة الثمر المباع (\$)' : 'ثمن المحصول المباع (\$)',
            ),
          ),
          if (a.model == 'lease')
            TextField(
              controller: _f('rent'),
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(labelText: 'الأجرة بالدولار (\$)'),
            ),
          for (final p in parties)
            TextField(
              controller: _f(p.$1),
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: InputDecoration(labelText: 'تكلفة دفعها ${p.$2} (\$)'),
            ),
          const SizedBox(height: 10),
          OutlinedButton(onPressed: _work, child: const Text('احسب القسمة')),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(_error!, style: TextStyle(color: warnOn(context))),
            ),
          if (_result != null) ...[
            const SizedBox(height: 10),
            for (final p in _result!.parties)
              Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Text('${p.$1}: يستلم ${p.$2} · دفع ${p.$3} · الصافي ${p.$4}'),
              ),
            Text('${_result!.profitLabel}: ${_result!.profit}', style: const TextStyle(fontWeight: FontWeight.w800)),
            for (final n in _result!.notes) Muted('• $n', size: 12),
          ],
        ],
      ),
    );
  }
}

/// Opens a link outside the app (a map, a phone number).
Future<void> openLink(BuildContext context, String url) async {
  final messenger = ScaffoldMessenger.of(context);
  if (!await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication)) {
    messenger.showSnackBar(const SnackBar(content: Text('تعذّر فتح الرابط.')));
  }
}
