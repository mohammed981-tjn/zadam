/// صفحة الموسم (البند ٢٠٣): the website's /seasons/[id] inside the app — the figures, the standing crop's value, the
/// stages with «أضف دليلاً» (a photo or a PDF, as the website's upload) and «اعتمد المرحلة», the budget against the actual, the ledger, and «أضف قيداً», which is kept on the phone
/// when there is no network and sent when it is back.
library;

import 'package:flutter/material.dart';

import '../api.dart';
import '../seasons.dart';
import '../theme.dart';
import '../ui.dart';
import 'account_screen.dart';
import 'evidence_sheet.dart';
import 'seasons_screen.dart';

class SeasonScreen extends StatefulWidget {
  const SeasonScreen({super.key, required this.id, this.name, this.api, this.pick});

  final String id;

  /// The name from the list, for the title before (or without) the network.
  final String? name;
  final SeasonsApi? api;

  /// The camera, the gallery and the file chooser (the phone's own when null).
  final EvidencePicker? pick;

  @override
  State<SeasonScreen> createState() => _SeasonScreenState();
}

class _SeasonScreenState extends State<SeasonScreen> {
  late final SeasonsApi _api = widget.api ?? SeasonsApi();
  SeasonView? _view;
  ApiException? _error;
  bool _loading = true;
  List<OutboxItem> _pending = const [];
  List<(OutboxItem, String)> _refused = const [];
  String? _busyStage;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _readBox() async {
    final items = await _api.outbox.pending(_api.userId, LedgerOutbox.keyFor(widget.id));
    if (mounted) setState(() => _pending = items);
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      // What this season kept on the phone goes first, so the page it then reads already has it.
      final report = await _api.sendPending(seasonId: widget.id);
      if (mounted && report.refused.isNotEmpty) setState(() => _refused = report.refused);
      if (mounted && report.sent > 0) _say('أُرسل ${report.sent} من القيود المحفوظة على هاتفك.');
      final view = await _api.season(widget.id);
      if (!mounted) return;
      setState(() {
        _view = view;
        _error = null;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
    await _readBox();
    if (mounted) setState(() => _loading = false);
  }

  void _say(String m) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));

  Future<void> _addEntry() async {
    final v = _view;
    await showLedgerEntrySheet(
      context,
      title: 'قيد مصروف أو إيراد',
      stages: v?.stages ?? const [],
      rateHint: v?.rateHint,
      suggestedRate: v?.rate,
      note: v == null ? 'لا اتّصال الآن: يُحفظ القيد على هاتفك ويُرسَل حين تعود الشبكة وتفتح هذا الموسم.' : null,
      onSubmit: (fields) async {
        try {
          final kept = await _api.addOrKeep(widget.id, fields);
          if (kept == null) {
            if (mounted) _say('سُجّل القيد في دفتر الموسم.');
            await _load();
            return null;
          }
          if (!keptOk(kept)) return keptMessage(kept);
          if (mounted) _say(keptMessage(kept));
          await _readBox();
          return null;
        } on ApiException catch (e) {
          return e.message;
        }
      },
    );
  }

  /// «أضف دليلاً»: the website's «ارفع الدليل» on the stage, so that «اعتمد المرحلة» then passes.
  Future<void> _evidence(StageView s) async {
    final message = await showEvidenceSheet(
      context,
      title: 'أضف دليلاً',
      subtitle: s.name,
      kinds: stageEvidenceKinds,
      pick: widget.pick,
      send: (kind, caption, file) => _api.addEvidence(widget.id, s.id, kind: kind, caption: caption, file: file),
    );
    if (message == null || !mounted) return;
    _say(message);
    await _load();
  }

  Future<void> _complete(StageView s) async {
    setState(() => _busyStage = s.id);
    try {
      final m = await _api.completeStage(widget.id, s.id);
      if (mounted) _say(m);
      await _load();
    } on ApiException catch (e) {
      if (mounted) {
        await showDialog<void>(
          context: context,
          builder: (c) => AlertDialog(
            title: const Text('لم تُعتمد المرحلة'),
            content: Text(e.message, style: const TextStyle(height: 1.7)),
            actions: [TextButton(onPressed: () => Navigator.pop(c), child: const Text('حسناً'))],
          ),
        );
      }
    }
    if (mounted) setState(() => _busyStage = null);
  }

  @override
  Widget build(BuildContext context) {
    final v = _view;
    return Scaffold(
      appBar: AppBar(title: Text(v?.name ?? widget.name ?? 'الموسم')),
      floatingActionButton: (v == null ? _error != null && isOutage(_error!) : v.canWrite)
          ? FloatingActionButton.extended(
              onPressed: _addEntry,
              icon: const Icon(Icons.add),
              label: const Text('أضف قيداً'),
            )
          : null,
      body: _loading && v == null && _error == null
          ? const LoadingView()
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
                children: [
                  if (_error != null)
                    Card(child: StateView.error(_error!.message, onRetry: _load, compact: true)),
                  if (_refused.isNotEmpty)
                    Card(
                      color: warnTintOn(context),
                      child: Padding(
                        padding: const EdgeInsets.all(14),
                        child: Text(
                          'رفض الموقع قيوداً كانت على هاتفك، فلم تُحفظ:\n'
                          '${_refused.map((r) => '${pendingLine(r.$1)} — ${r.$2}').join('\n')}',
                          style: const TextStyle(height: 1.7),
                        ),
                      ),
                    ),
                  if (_pending.isNotEmpty) _PendingCard(items: _pending, onSend: _load),
                  if (v != null) ..._content(context, v),
                ],
              ),
            ),
    );
  }

  List<Widget> _content(BuildContext context, SeasonView v) {
    final muted = TextStyle(color: mutedOn(context), fontSize: 12, height: 1.6);
    return [
      FadeIn(
        child: HeroBand(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(v.name, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
              const SizedBox(height: 6),
              Text(
                [v.crop, v.station, '${amount2(v.feddans)} فدان', v.irrigation, if (v.location != null && v.location!.isNotEmpty) v.location!]
                    .join(' · '),
                style: TextStyle(color: mutedOn(context), height: 1.6),
              ),
              const SizedBox(height: 10),
              Wrap(spacing: 6, runSpacing: 6, children: [
                TagPill(seasonStatusLabel(v.status)),
                if (!v.isOwner && v.partnershipId != null) const TagPill('شريكٌ بعقدٍ موقَّع', icon: Icons.handshake_outlined),
              ]),
            ],
          ),
        ),
      ),
      if (!v.isOwner && v.partnershipId != null) ...[
        const SizedBox(height: 10),
        const IntroNote(
          'أنت شريكٌ في هذا الموسم بعقدٍ موقَّع: تقرأ مراحله وأدلّته ودفتره كما يكتبها صاحب الأرض، ولا تكتب فيه.',
          icon: Icons.handshake_outlined,
        ),
      ],
      if (v.isOwner && v.status == 'active') ...[
        const SizedBox(height: 10),
        Wrap(spacing: 8, runSpacing: 8, children: [
          OutlinedButton.icon(
            onPressed: () => openOnSite(context, '/contracts/new?season=${v.id}'),
            icon: const Icon(Icons.open_in_new, size: 18),
            label: const Text('اطلب خدمة لهذا الموسم'),
          ),
        ]),
      ],
      const SizedBox(height: 14),
      GridView.count(
        crossAxisCount: 2,
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        mainAxisSpacing: 10,
        crossAxisSpacing: 10,
        childAspectRatio: 1.7,
        children: [
          _Stat('التقدّم', '${v.pct}%', '${v.done} من ${v.total} مراحل'),
          _Stat('مصروف', '\$${n0(v.t('costs'))}', 'من ميزانية \$${n0(v.t('planned_budget'))}'),
          _Stat('مُفرَج عنه', '\$${n0(v.t('released'))}', 'بعد اعتماد المراحل'),
          _Stat('صافي الربح', '\$${n0(v.t('profit'))}', '\$${v.t('profit_per_feddan').toStringAsFixed(0)} للفدان'),
        ],
      ),
      if (v.cropValue != null) ...[
        const SizedBox(height: 14),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const SectionTitle('قيمة محصولك القائم — تقدير'),
              Text(v.cropValue!.headline, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
              const SizedBox(height: 8),
              Text(v.cropValue!.note, style: TextStyle(color: mutedOn(context), height: 1.7, fontSize: 13)),
              const SizedBox(height: 6),
              Text(
                'تقديرٌ يُعرض ولا يُكتب في الدفتر: الدفتر يبقى بالتكلفة، وقيمة المحصول تُقيَّد يوم البيع. غلّتك الحقيقيّة وسعر يوم البيع قد يختلفان كثيراً.',
                style: muted,
              ),
            ]),
          ),
        ),
      ],
      if (v.t('costs') > 0) ...[
        const SizedBox(height: 14),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const SectionTitle('لكلّ فدان'),
              _Pairs([
                ('التكلفة حتى الآن', '\$${n0(v.t('cost_per_feddan'))}'),
                ('الخطّة', '\$${n0(v.t('planned_per_feddan'))}'),
                ('المبيع', '\$${n0(v.t('revenue_per_feddan'))}'),
                ('الهامش', v.totals['margin_pct'] == null ? '—' : '${v.totals['margin_pct']!.toStringAsFixed(0)}%'),
              ]),
              const SizedBox(height: 6),
              Text(
                'الهامش = الربح ÷ المبيع، ولا يظهر قبل أن يُسجَّل بيع. كلّ الأرقام بالدولار كما في دفتر الموسم.',
                style: muted,
              ),
            ]),
          ),
        ),
      ],
      const SizedBox(height: 18),
      const SectionTitle('خط الموسم'),
      for (final (i, s) in v.stages.indexed) FadeIn(delay: i, child: _stageCard(context, v, s)),
      const SizedBox(height: 18),
      const SectionTitle('دفتر الحسابات', subtitle: 'القوائم الماليّة وميزان المراجعة في «الدفتر المحاسبيّ».'),
      if (v.varianceSpent > 0 && v.stages.isNotEmpty) _varianceCard(context, v),
      if (v.byCategory.isNotEmpty)
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              for (final (label, amount, share) in v.byCategory) _Row(label, '\$${n0(amount)}', trailing: '$share%'),
              const Divider(),
              _Row('الإيراد', '\$${n0(v.t('revenue'))}', strong: true),
            ]),
          ),
        ),
      if (v.entries.isNotEmpty) ...[
        const SizedBox(height: 8),
        Text('أحدث القيود', style: TextStyle(fontWeight: FontWeight.w800, color: inkOn(context))),
        const SizedBox(height: 4),
        for (final e in v.entries)
          Card(
            child: ListTile(
              dense: true,
              title: Text([e.label, if (e.description != null && e.description!.isNotEmpty) e.description!].join(' · ')),
              subtitle: Text([
                e.entryDate,
                e.paidFromLabel,
                if (e.currency == 'SDG' && e.fxRate != null) 'بسعر ${amount2(e.fxRate!)}',
              ].join(' · ')),
              trailing: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(e.paid, style: const TextStyle(fontWeight: FontWeight.w800)),
                  if (e.currency == 'SDG') Text('\$${amount2(e.amountUsd)}', style: muted),
                ],
              ),
            ),
          ),
      ] else if (v.canWrite)
        const StateView(
          icon: Icons.receipt_long_outlined,
          title: 'لا قيود بعد',
          message: 'سجّل أوّل مصروفٍ أو بيعٍ من «أضف قيداً»، ولو بلا شبكة.',
          compact: true,
        ),
      if (v.credit.isNotEmpty) ...[
        const SizedBox(height: 14),
        const SectionTitle('الآجل', subtitle: '«سدّدتُ» و«قبضتُ» من صفحة الموسم في الموقع.'),
        if (v.revaluation != null && v.rate != null) _revaluationCard(context, v),
        for (final e in v.credit)
          Card(
            child: ListTile(
              dense: true,
              title: Text([e.label, if (e.description != null && e.description!.isNotEmpty) e.description!, e.entryDate].join(' · ')),
              subtitle: Text(
                e.settledOn == null ? (e.isRevenue ? 'لم يُقبض بعد' : 'لم يُسدَّد بعد') : (e.isRevenue ? 'قُبض في ${e.settledOn}' : 'سُدِّد في ${e.settledOn}'),
                style: TextStyle(color: e.settledOn == null ? warnOn(context) : textGreenOn(context)),
              ),
              trailing: Text(e.paid, style: const TextStyle(fontWeight: FontWeight.w800)),
            ),
          ),
        if (v.isOwner)
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: TextButton.icon(
              onPressed: () => openOnSite(context, '/seasons/${v.id}'),
              icon: const Icon(Icons.open_in_new, size: 18),
              label: const Text('سدِّد أو اقبض من الموقع'),
            ),
          ),
      ],
      if (v.bandP50 != null) ...[
        const SizedBox(height: 12),
        Text(
          'للمقارنة: الوسيط المتوقع لهذا المحصول \$${v.bandP50!.toStringAsFixed(0)} صافي ربح للفدان، ونتيجتك حتى الآن \$${v.t('profit_per_feddan').toStringAsFixed(0)}.',
          style: TextStyle(color: mutedOn(context), height: 1.7, fontSize: 13),
        ),
      ],
      if (v.canWrite && v.total > 0 && v.done == v.total) ...[
        const SizedBox(height: 14),
        OutlinedButton.icon(
          onPressed: () => openOnSite(context, '/seasons/${v.id}'),
          icon: const Icon(Icons.open_in_new, size: 18),
          label: const Text('أغلق الموسم واحتسبه في سجلي (من الموقع)'),
        ),
      ],
    ];
  }

  Widget _stageCard(BuildContext context, SeasonView v, StageView s) {
    final scheme = Theme.of(context).colorScheme;
    return Card(
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: s.completed ? scheme.primary.withValues(alpha: 0.5) : scheme.outline),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              if (s.completed) ...[Icon(Icons.check_circle, color: textGreenOn(context), size: 20), const SizedBox(width: 6)],
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(s.name, style: const TextStyle(fontWeight: FontWeight.w800)),
                  Text(
                    '${s.plannedStart} ← ${s.plannedEnd}${s.waterM3 > 0 ? ' · ${n0(s.waterM3)} م³' : ''}',
                    style: TextStyle(color: mutedOn(context), fontSize: 12),
                  ),
                ]),
              ),
              Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                Text('\$${n0(s.budget)}', style: const TextStyle(fontWeight: FontWeight.w800)),
                if (s.spent > 0)
                  Text(
                    'صُرف \$${n0(s.spent)}',
                    style: TextStyle(
                      fontSize: 12,
                      color: s.left < 0 ? warnOn(context) : mutedOn(context),
                      fontWeight: s.left < 0 ? FontWeight.w800 : FontWeight.normal,
                    ),
                  ),
                TagPill(s.released ? 'مُفرَج عنه' : 'محجوز', gold: !s.released),
              ]),
            ]),
            if (s.activities.isNotEmpty) ...[
              const SizedBox(height: 8),
              for (final a in s.activities) Text('• $a', style: TextStyle(color: mutedOn(context), fontSize: 12, height: 1.6)),
            ],
            if (!s.released && s.reason != null) ...[
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                decoration: BoxDecoration(color: scheme.surface, borderRadius: BorderRadius.circular(10)),
                child: Text(s.reason!, style: TextStyle(color: mutedOn(context), fontSize: 12, height: 1.6)),
              ),
            ],
            if (s.evidence.isNotEmpty) ...[
              const SizedBox(height: 8),
              Wrap(spacing: 6, runSpacing: 6, children: [for (final e in s.evidence) TagPill(e, icon: Icons.photo_outlined)]),
            ],
            if (v.canWrite && !s.completed) ...[
              const SizedBox(height: 10),
              if (s.evidence.isEmpty)
                Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Text(
                    'لا تُعتمد مرحلةٌ بلا دليل: صورةٌ من الحقل أو فاتورةٌ أو تقرير معاينة.',
                    style: TextStyle(color: mutedOn(context), fontSize: 12, height: 1.6),
                  ),
                ),
              Wrap(spacing: 8, runSpacing: 8, children: [
                OutlinedButton.icon(
                  onPressed: _busyStage == null ? () => _evidence(s) : null,
                  icon: const Icon(Icons.add_a_photo_outlined, size: 18),
                  label: const Text('أضف دليلاً'),
                ),
                FilledButton(
                  onPressed: _busyStage == null ? () => _complete(s) : null,
                  child: _busyStage == s.id
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Text('اعتمد المرحلة'),
                ),
              ]),
            ],
          ],
        ),
      ),
    );
  }

  Widget _varianceCard(BuildContext context, SeasonView v) {
    final left = v.variancePlanned - v.varianceSpent;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('الميزانيّة مقابل الفعليّ', style: TextStyle(fontWeight: FontWeight.w800, color: inkOn(context))),
          const SizedBox(height: 8),
          for (final s in v.stages)
            _Row(
              s.name,
              'صُرف \$${n0(s.spent)} من \$${n0(s.budget)}',
              trailing: s.left < 0 ? 'تجاوز \$${n0(-s.left)}' : '\$${n0(s.left)}',
              warn: s.left < 0,
            ),
          if (v.unassigned > 0) _Row('بلا مرحلة', '\$${n0(v.unassigned)}'),
          const Divider(),
          _Row(
            'المجموع',
            'صُرف \$${n0(v.varianceSpent)} من \$${n0(v.variancePlanned)}',
            trailing: left < 0 ? 'تجاوز \$${n0(-left)}' : '\$${n0(left)}',
            strong: true,
            warn: left < 0,
          ),
          if (v.unassigned > 0)
            Text(
              '«بلا مرحلة»: قيودٌ لم تُختر لها مرحلة. اختر المرحلة عند القيد فيُحسب على خطّتها.',
              style: TextStyle(color: mutedOn(context), fontSize: 12, height: 1.6),
            ),
        ]),
      ),
    );
  }

  Widget _revaluationCard(BuildContext context, SeasonView v) {
    final r = v.revaluation!;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('بسعر اليوم (${amount2(v.rate!)} جنيهاً للدولار، السوق الموازي، ${v.rateDate})',
              style: const TextStyle(fontWeight: FontWeight.w800)),
          if (r.payableBooked > 0)
            Text('ما عليك بالجنيه قُيِّد بـ\$${n0(r.payableBooked)}، ويساوي اليوم \$${n0(r.payableToday)}.'),
          if (r.receivableBooked > 0)
            Text('ما لك بالجنيه قُيِّد بـ\$${n0(r.receivableBooked)}، ويساوي اليوم \$${n0(r.receivableToday)}.'),
          Text(
            r.difference.abs() < 0.5
                ? 'لا فرق يُذكر.'
                : r.difference > 0
                    ? 'فرق الصرف لصالحك: \$${n0(r.difference)}'
                    : 'فرق الصرف عليك: \$${n0(-r.difference)}',
            style: TextStyle(fontWeight: FontWeight.w800, color: r.difference < 0 ? warnOn(context) : textGreenOn(context)),
          ),
          Text('تقديرٌ لا يُكتب في الدفتر: الفرق يُقيَّد يوم السداد بسعر ذلك اليوم.',
              style: TextStyle(color: mutedOn(context), fontSize: 12)),
        ]),
      ),
    );
  }
}

class _PendingCard extends StatelessWidget {
  const _PendingCard({required this.items, required this.onSend});
  final List<OutboxItem> items;
  final Future<void> Function() onSend;

  @override
  Widget build(BuildContext context) {
    return Card(
      color: leafTintOn(context),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 8),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            Icon(Icons.cloud_upload_outlined, color: textGreenOn(context)),
            const SizedBox(width: 8),
            Expanded(
              child: Text('${items.length} قيدٌ على هاتفك ينتظر الإرسال',
                  style: const TextStyle(fontWeight: FontWeight.w800)),
            ),
            TextButton(onPressed: onSend, child: const Text('أرسل الآن')),
          ]),
          for (final i in items)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(pendingLine(i), style: const TextStyle(fontSize: 13, height: 1.6)),
            ),
        ]),
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat(this.label, this.value, this.sub);
  final String label;
  final String value;
  final String sub;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.center, children: [
          Text(label, style: TextStyle(color: mutedOn(context), fontSize: 12)),
          FittedBox(child: Text(value, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900))),
          Text(sub, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: mutedOn(context), fontSize: 11)),
        ]),
      ),
    );
  }
}

class _Pairs extends StatelessWidget {
  const _Pairs(this.pairs);
  final List<(String, String)> pairs;

  @override
  Widget build(BuildContext context) {
    return Wrap(spacing: 18, runSpacing: 10, children: [
      for (final (l, v) in pairs)
        Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
          Text(l, style: TextStyle(color: mutedOn(context), fontSize: 12)),
          Text(v, style: const TextStyle(fontWeight: FontWeight.w900)),
        ]),
    ]);
  }
}

class _Row extends StatelessWidget {
  const _Row(this.label, this.value, {this.trailing, this.strong = false, this.warn = false});
  final String label;
  final String value;
  final String? trailing;
  final bool strong;
  final bool warn;

  @override
  Widget build(BuildContext context) {
    final style = TextStyle(fontWeight: strong ? FontWeight.w800 : FontWeight.w500, height: 1.6);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(children: [
        Expanded(child: Text(label, style: style)),
        Text(value, style: style),
        if (trailing != null) ...[
          const SizedBox(width: 10),
          Text(trailing!,
              style: style.copyWith(color: warn ? warnOn(context) : null, fontWeight: warn ? FontWeight.w800 : style.fontWeight)),
        ],
      ]),
    );
  }
}
