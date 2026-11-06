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
import '../i18n.dart';
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
            e is ApiException ? e.message : tr('تعذّر فتح العقد.', 'Could not open the contract.'),
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
        ? tr('بقبولك يسري العقد ويصير ملزماً للطرفين بمراحله وأسعاره، وتبدأ المراحل في التحرّك.', 'By accepting, the contract takes effect and binds both parties to its phases and prices, and the phases start to move.')
        : mv.status == 'proposed'
        ? tr('يصل العرض إلى مقدّم الخدمة، وتتجمّد الشروط: لا يُغيَّر سعر ولا كمية حتى يُسحب العرض.', 'The offer reaches the service provider and the terms freeze: no price or quantity changes until the offer is withdrawn.')
        : tr('ستُنفَّذ هذه الخطوة على العقد «${c.title}».', 'This step will be taken on the contract «${c.title}».');
    if (!await confirmStep(context, title: mv.label, body: binding, go: mv.label)) return;
    if (!mounted) return;
    await runStep(context, () async {
      await _api.moveService(c.id, mv.status);
      return tr('تمّ: ${mv.label}.', 'Done: ${mv.label}.');
    }, then: _reload);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(tr('عقد خدمات', 'Service contract'))),
      body: _Loaded<ServiceContract>(
        future: _data,
        onRetry: _reload,
        builder: (c) => ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
          children: [
            Text(c.title, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
            Muted(tr('مع ${c.providerName ?? 'مقدّم خدمة'} — ${c.milestones.length} مراحل', 'With ${c.providerName ?? 'a service provider'} — ${c.milestones.length} phases')),
            const SizedBox(height: 12),
            DealCard(
              children: [
                Row(
                  children: [
                    Expanded(child: InfoLine(tr('إجمالي العقد', 'Contract total'), '${money(c.total)} ${c.currency}')),
                    Expanded(child: InfoLine(tr('المدفوع', 'Paid'), money(c.paid))),
                    Expanded(child: InfoLine(tr('المتبقّي', 'Remaining'), money(c.total - c.paid))),
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
                    if (c.signedAt != null) Muted(tr('وُقّع ${day(c.signedAt)}', 'Signed ${day(c.signedAt)}'), size: 12),
                  ],
                ),
                const SizedBox(height: 8),
                Text(c.says, style: const TextStyle(height: 1.7)),
                const SizedBox(height: 10),
                if (c.moves.isEmpty)
                  Muted(
                    c.status == 'proposed'
                        ? tr('بانتظار الطرف الآخر — لا خطوة لك الآن.', 'Waiting for the other party — there is nothing for you to do now.')
                        : tr('لا خطوة متاحة لك على هذا العقد الآن.', 'There is no step available to you on this contract right now.'),
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
            IntroNote(
              tr('الدفع يتبع الإثبات: لا تُعتمد مرحلة قبل رفع صورة أو تقرير من الموقع، ولا تُعتمد قبل اعتماد المرحلة التي '
              'تسبقها، ولا يُسجَّل دفع قبل الاعتماد. هذه قواعد في قاعدة البيانات نفسها — لا يمكن تجاوزها من أي شاشة.', 'Payment follows proof: no phase is approved before a photo or a report is uploaded on the website, nor before the phase before it is approved, and no payment is recorded before approval. These are rules in the database itself — no screen can get around them.'),
              icon: Icons.verified_user_outlined,
            ),
            const SizedBox(height: 14),
            for (final m in c.milestones) _MilestoneCard(contract: c, m: m),
            if (c.seasonId != null)
              TextButton.icon(
                onPressed: () => openOnSite(context, '/seasons/${c.seasonId}'),
                icon: const Icon(Icons.open_in_new, size: 18),
                label: Text(tr('الموسم الذي بُني عليه هذا العقد', 'The season this contract was built on')),
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
          tr('${money(m.quantity)} ${m.unit} × ${money(m.unitPrice)} = ${money(m.amount)}'
          '${m.plannedStart != null ? ' — من ${m.plannedStart}${m.plannedEnd != null ? ' إلى ${m.plannedEnd}' : ''}' : ''}', '${money(m.quantity)} ${m.unit} × ${money(m.unitPrice)} = ${money(m.amount)}${m.plannedStart != null ? ' — from ${m.plannedStart}${m.plannedEnd != null ? ' to ${m.plannedEnd}' : ''}' : ''}'),
        ),
        const SizedBox(height: 6),
        if (m.evidence.isEmpty)
          Muted(m.requiresEvidence ? tr('لا يوجد إثبات بعد', 'No proof yet') : tr('لا يتطلب إثباتاً', 'No proof required'), size: 12)
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
                      e.capturedAt != null ? tr('التُقط ${day(e.capturedAt)}', 'Taken ${day(e.capturedAt)}') : tr('بلا تاريخ التقاط', 'No capture date'),
                      e.latitude != null && e.longitude != null
                          ? '${e.latitude!.toStringAsFixed(4)}, ${e.longitude!.toStringAsFixed(4)}'
                          : tr('بلا إحداثيات', 'No coordinates'),
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
              tr('ارفع إثبات تنفيذ واحداً على الأقل قبل الاعتماد.', 'Upload at least one proof of delivery before approval.'),
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
            label: Text(tr('${next.label} (على الموقع)', '${next.label} (on the website)')),
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
        hint: a.step == 'dispute' ? tr('ما الخلاف؟', 'What is the disagreement?') : tr('السبب: يقرؤه الطرف الآخر', 'The reason: the other side reads it'),
        go: a.label,
      );
      if (reason == null) return;
    } else if (a.step == 'sign') {
      final ok = await confirmStep(
        context,
        title: tr('توقيع العقد الآجل', 'Signing the forward contract'),
        body:
            tr('بتوقيعك يصير العقد ملزماً لكما بشروطه: ${c.row.crop}، ${amount(c.row.quantity)} ${c.row.unit}، '
            'بسعر ${amount(c.row.price)} ${c.row.currency} للوحدة، يُسلَّم بين ${day(c.row.deliveryFrom)} و${day(c.row.deliveryTo)}. '
            'وقّع إن كنت تعرف الطرف الآخر واتّفقتما على هذا.', 'By signing, the contract binds you both by its terms: ${c.row.crop}, ${amount(c.row.quantity)} ${c.row.unit}, at ${amount(c.row.price)} ${c.row.currency} per unit, delivered between ${day(c.row.deliveryFrom)} and ${day(c.row.deliveryTo)}. Sign if you know the other side and agreed this.'),
        go: tr('أوقّع العقد', 'I sign the contract'),
      );
      if (!ok) return;
    } else if (a.step == 'decline' || a.step == 'withdraw' || a.step == 'cancel_yes') {
      if (!await confirmStep(context, title: a.label, body: tr('لا رجعة في هذه الخطوة.', 'There is no going back on this step.'), go: a.label)) return;
    }
    if (!mounted) return;
    await runStep(context, () => _api.forwardStep(c.row.id, a.step, reason: reason), then: _reload);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(tr('عقدٌ آجل', 'Forward contract'))),
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
              Text(tr('عقد بيعٍ آجل: ${r.crop}', 'Forward sale contract: ${r.crop}'), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
              const SizedBox(height: 12),
              DealCard(
                children: [
                  Text(
                    tr('اتّفق ${c.farmerName}${c.farmerPhone != null ? ' (${c.farmerPhone})' : ''} (المزارع، البائع) و'
                    '${c.buyerName}${c.buyerPhone != null ? ' (${c.buyerPhone})' : ''} (المشتري) على ما يلي:', '${c.farmerName}${c.farmerPhone != null ? ' (${c.farmerPhone})' : ''} (the farmer, the seller) and ${c.buyerName}${c.buyerPhone != null ? ' (${c.buyerPhone})' : ''} (the buyer) agreed on the following:'),
                    style: const TextStyle(height: 1.8),
                  ),
                  const SizedBox(height: 6),
                  for (final (i, line) in [
                    tr('يبيع المزارع ويشتري المشتري ${amount(r.quantity)} ${r.unit} من ${r.crop}، بزيادةٍ أو نقصٍ حتى ${c.tolerance}٪ لا يُعدّ إخلالاً.', 'The farmer sells and the buyer buys ${amount(r.quantity)} ${r.unit} of ${r.crop}; more or less by up to ${c.tolerance}% is not a breach.'),
                    tr('بالدرجة: ${c.grade}', 'Grade: ${c.grade}'),
                    tr('بسعر ${amount(r.price)} ${r.currency} لل${r.unit}، فقيمة العقد ${amount(c.value)} ${r.currency}.', 'At ${amount(r.price)} ${r.currency} per ${r.unit}, so the contract\'s value is ${amount(c.value)} ${r.currency}.'),
                    tr('يُسلَّم بين ${day(r.deliveryFrom)} و${day(r.deliveryTo)} في ${r.place}.', 'Delivered between ${day(r.deliveryFrom)} and ${day(r.deliveryTo)} at ${r.place}.'),
                    tr('الدفع: ${c.paymentTerms}${c.advancePercent != null && c.advancePercent! > 0 ? '، ومقدَّمٌ ${c.advancePercent}٪ عند التوقيع.' : ''}', 'Payment: ${c.paymentTerms}${c.advancePercent != null && c.advancePercent! > 0 ? ', with an advance of ${c.advancePercent}% on signing.' : ''}'),
                    if (c.consigneeName != null)
                      tr('يستلم عن المشتري: ${c.consigneeName} (${c.consigneePhone ?? ''})، ويسجّل المشتري الاستلام حين يخبره.', 'Receiving for the buyer: ${c.consigneeName} (${c.consigneePhone ?? ''}), and the buyer records the receipt when told.'),
                    tr('الشرط الجزائيّ: على من يتأخّر في التسليم ${c.latePctWeek}٪ من قيمة العقد عن كلّ أسبوعٍ بعد آخر موعد، حتى '
                        '${c.lateCapPct}٪؛ وعلى من يمتنع عن التسليم أو الاستلام ${c.breachPct}٪ من قيمة العقد للطرف الآخر.'
                        '${c.forceMajeure ? ' وتُعفى القوّة القاهرة: حربٌ، أو سيلٌ، أو جراد، أو إغلاقُ طريق.' : ''}', 'Penalty: whoever is late delivering owes ${c.latePctWeek}% of the contract\'s value for every week after the last date, up to ${c.lateCapPct}%; whoever refuses to deliver or to receive owes ${c.breachPct}% of the contract\'s value to the other side.${c.forceMajeure ? ' Force majeure is excused: war, flood, locusts, or a closed road.' : ''}'),
                    if (c.notes != null) c.notes!,
                    tr('يدفع المشتري للمزارع مباشرةً؛ سوداقري لا تحمل المال ولا تضمن التسليم ولا السداد. لا تتغيّر هذه الشروط '
                        'بعد التوقيع، ولا يُلغى العقد إلا باتّفاق الطرفين أو بفصل الإدارة في نزاع.', 'The buyer pays the farmer directly; Sudagri holds no money and guarantees neither delivery nor payment. These terms do not change after signing, and the contract is cancelled only by agreement of both parties or by the administrators\' decision in a dispute.'),
                  ].indexed)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 4),
                      child: Text('${i + 1}. $line', style: const TextStyle(height: 1.7, fontSize: 13.5)),
                    ),
                  const SizedBox(height: 4),
                  Muted(
                    tr('اقتُرح ووقّعه مقترحه في ${day(c.proposedAt)}'
                    '${c.signedAt != null ? '، ووقّعه الطرف الآخر في ${day(c.signedAt)}' : ''}.', 'Proposed, and signed by its proposer, on ${day(c.proposedAt)}${c.signedAt != null ? ', and signed by the other side on ${day(c.signedAt)}' : ''}.'),
                    size: 12,
                  ),
                ],
              ),
              if (c.penaltyAwarded != null)
                DealCard(
                  children: [
                    Text(
                      tr('حكمت الإدارة بغرامة ${amount(c.penaltyAwarded!)} ${r.currency} '
                      '${c.penaltyPayer == 'farmer' ? 'يدفعها المزارع للمشتري مباشرةً.' : 'يدفعها المشتري للمزارع مباشرةً.'}', 'The administrators awarded a penalty of ${amount(c.penaltyAwarded!)} ${r.currency} ${c.penaltyPayer == 'farmer' ? 'paid by the farmer to the buyer directly.' : 'paid by the buyer to the farmer directly.'}'),
                    ),
                  ],
                ),
              if (c.deliveredOn != null)
                DealCard(
                  title: tr('التسليم كما سجّله المشتري', 'The delivery as the buyer recorded it'),
                  children: [
                    Text(
                      tr('${amount(c.deliveredQuantity ?? 0)} ${r.unit} · ${day(c.deliveredOn)} · '
                      '${c.gradeMet == true ? 'مطابقٌ للدرجة' : 'خالف الدرجة'}', '${amount(c.deliveredQuantity ?? 0)} ${r.unit} · ${day(c.deliveredOn)} · ${c.gradeMet == true ? 'meets the grade' : 'did not meet the grade'}'),
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
                                  label: Text(tr('${a.label} (على الموقع)', '${a.label} (on the website)')),
                                )
                              : a.secondary
                              ? WarnButton(label: a.label, onPressed: () => _take(c, a))
                              : FilledButton(onPressed: () => _take(c, a), child: Text(a.label)),
                      ],
                    ),
                  ],
                ),
              SectionTitle(tr('ما جرى على العقد', 'What happened to the contract')),
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
      appBar: AppBar(title: Text(tr('عقد الشراكة', 'Partnership agreement'))),
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
                    ? (a.managed ? tr('موقَّعٌ من الأطراف الثلاثة ومقفل', 'Signed by all three parties and sealed') : tr('موقَّعٌ من الطرفين ومقفل', 'Signed by both parties and sealed'))
                    : tr('مسوّدة — النسخة ${a.version}', 'Draft — version ${a.version}'),
              ),
            ),
            const SizedBox(height: 8),
            Text(a.title, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, height: 1.4)),
            if (a.signed && a.ref != null)
              Text(
                tr('رقم العقد: ${a.ref}', 'Agreement no.: ${a.ref}'),
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
                          tr('شهدت سوداقري', 'Witnessed by Sudagri'),
                          style: TextStyle(fontWeight: FontWeight.w900, color: textGreenOn(context)),
                        ),
                        Muted(
                          a.managed
                              ? tr('وقّع الأطراف الثلاثة النسخة ${a.version} من هذا العقد بحساباتهم، وأُقفل في ${day(a.signedAt)}.', 'All three parties signed version ${a.version} of this agreement with their accounts, and it was sealed on ${day(a.signedAt)}.')
                              : tr('وقّع الطرفان النسخة ${a.version} من هذا العقد بحسابيهما، وأُقفل في ${day(a.signedAt)}.', 'Both parties signed version ${a.version} of this agreement with their accounts, and it was sealed on ${day(a.signedAt)}.'),
                          size: 12,
                        ),
                        Muted(tr('بصمة العقد: ${a.shortHash}', 'The agreement\'s fingerprint: ${a.shortHash}'), size: 11),
                      ],
                    ),
                  )
                else
                  Muted(
                    tr('بصمة هذه النسخة: ${a.shortHash}'
                    '${a.earlierSignatures > 0 ? ' — عُدِّلت البنود بعد توقيعٍ سابق، فيلزم التوقيع من جديد.' : ''}', 'This version\'s fingerprint: ${a.shortHash}${a.earlierSignatures > 0 ? ' — the terms were changed after an earlier signature, so it must be signed again.' : ''}'),
                    size: 11,
                  ),
              ],
            ),
            _SplitCard(agreement: a, api: _api),
            if (a.signed && (a.me == 'owner' || a.me == 'investor'))
              DealCard(
                title: tr('الموسم', 'Season'),
                children: [
                  if (a.seasons.isEmpty)
                    Muted(
                      a.me == 'owner'
                          ? tr('ابدأ الموسم على أرض العقد: تُولَّد مراحله بتواريخها، وتسجّل فيها الصور والمصروفات، فيقرؤها شريكك.', 'Start the season on the agreement\'s land: its stages are generated with their dates, you record photos and spending in them, and your partner reads them.')
                          : tr('حين يبدأ صاحب الأرض الموسم يظهر هنا، فتقرأ مراحله وصوره ودفتره.', 'Once the landowner starts the season it appears here, and you read its stages, photos and ledger.'),
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
                        a.seasons.isEmpty ? tr('ابدأ الموسم (على الموقع)', 'Start the season (on the website)') : tr('ابدأ موسماً آخر من العقد (على الموقع)', 'Start another season from the agreement (on the website)'),
                      ),
                    ),
                ],
              ),
            if (a.hasStatement)
              DealCard(
                title: tr('الحساب بينكما', 'The account between you'),
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
                                text: tr('✓ وقّعتَ هذه النسخة. ', '✓ You have signed this version.'),
                                style: TextStyle(fontWeight: FontWeight.w800, color: textGreenOn(context)),
                              ),
                              if (a.waitingLabels.isNotEmpty)
                                TextSpan(text: tr('بقي توقيع: ${a.waitingLabels.join('، ')} — ووصله إشعار.', 'Still to sign: ${a.waitingLabels.join(', ')} — and they were notified.')),
                            ],
                          ),
                        ),
                      ],
                    ),
            if (a.canEditTerms)
              TextButton.icon(
                onPressed: () => openOnSite(context, '/invest/agreements/${a.id}'),
                icon: const Icon(Icons.edit_note),
                label: Text(a.version == 1 ? tr('اكتبا بنود العقد (على الموقع)', 'Write the agreement\'s terms together (on the website)') : tr('عدّل البنود (على الموقع)', 'Change the terms (on the website)')),
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
            Padding(padding: EdgeInsets.symmetric(vertical: 10), child: Text(tr('لم يوقّع بعد', 'Not signed yet')))
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
      title: tr('وقّع العقد', 'Sign the agreement'),
      highlight: true,
      children: [
        TextField(
          key: const Key('sign-name'),
          controller: _name,
          maxLength: 120,
          decoration: InputDecoration(labelText: tr('اسمك الكامل كما في إثبات هويّتك', 'Your full name, as on your ID')),
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
          title: Text(
            tr('قرأتُ العقد كاملاً وأوافق على بنوده، وأعلم أنّ سوداقري تحفظه وتشهد عليه ولا تمسك مالاً ولا تضمن ربحاً.', 'I have read the whole agreement and accept its terms; I understand Sudagri keeps and witnesses it, holds no money and guarantees no profit.'),
            style: TextStyle(fontSize: 13, height: 1.6),
          ),
        ),
        Align(
          alignment: AlignmentDirectional.centerStart,
          child: FilledButton.icon(
            key: const Key('sign-button'),
            onPressed: _complete && !_busy ? _sign : null,
            icon: const Icon(Icons.draw_outlined),
            label: Text(tr('أوقّع', 'Sign')),
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
      ('cost_owner', tr('صاحب الأرض', 'Landowner')),
      ('cost_investor', tr('المستثمر', 'Investor')),
      if (a.managed) ('cost_manager', tr('الشركة المديرة', 'Managing company')),
    ];
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: ExpansionTile(
        shape: const Border(),
        title: Text(tr('كيف يُقسم الحصاد؟ (حاسبة)', 'How will the harvest be split? (calculator)'), style: TextStyle(fontWeight: FontWeight.w800)),
        childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        expandedCrossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final s in a.shares) Text(tr('${s.$1}: ${s.$2}٪', '${s.$1}: ${s.$2}%')),
          if (a.rent != null) Text(tr('الأجرة في العقد: ${a.rent}', 'The rent in the agreement: ${a.rent}')),
          const SizedBox(height: 6),
          Muted(
            tr('اكتب ما تتوقّعه أو ما حدث بالدولار؛ تظهر القسمة بحسب نصّ هذا العقد. حاسبةٌ للتقدير، ولا تضمن المنصّة عائداً.', 'Enter what you expect, or what happened, in US dollars; the split follows this agreement\'s text. An estimate only — the platform guarantees no return.'),
            size: 12,
          ),
          TextField(
            controller: _f('revenue'),
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: InputDecoration(
              labelText: a.model == 'musaqah' ? tr('قيمة الثمر المباع (\$)', 'Value of the fruit sold (\$)') : tr('ثمن المحصول المباع (\$)', 'Price of the crop sold (\$)'),
            ),
          ),
          if (a.model == 'lease')
            TextField(
              controller: _f('rent'),
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: InputDecoration(labelText: tr('الأجرة بالدولار (\$)', 'The rent in dollars (\$)')),
            ),
          for (final p in parties)
            TextField(
              controller: _f(p.$1),
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: InputDecoration(labelText: tr('تكلفة دفعها ${p.$2} (\$)', 'A cost paid by ${p.$2} (\$)')),
            ),
          const SizedBox(height: 10),
          OutlinedButton(onPressed: _work, child: Text(tr('احسب القسمة', 'Work out the split'))),
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
                child: Text(tr('${p.$1}: يستلم ${p.$2} · دفع ${p.$3} · الصافي ${p.$4}', '${p.$1}: receives ${p.$2} · paid ${p.$3} · net ${p.$4}')),
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
    messenger.showSnackBar(SnackBar(content: Text(tr('تعذّر فتح الرابط.', 'Could not open the link.'))));
  }
}
