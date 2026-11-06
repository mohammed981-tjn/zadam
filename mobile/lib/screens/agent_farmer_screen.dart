/// A farmer the organisation acts for (البند ٢٠٣), as the website's /agent/[farmer]: their land, their seasons — and
/// in an active season, uploading a stage's evidence and signing the stage off in their name (agent_stage_complete,
/// agent_stage_evidence_add), each marked as the agent's, the farmer told, and reopened if they object — their herds,
/// and what the organisation wrote in their name.
library;

import 'package:flutter/material.dart';

import '../agent.dart';
import '../i18n.dart';
import '../theme.dart';
import '../ui.dart';
import 'account_screen.dart' show openOnSite;
import 'suppliers_kit.dart';

class AgentFarmerScreen extends StatefulWidget {
  const AgentFarmerScreen({super.key, required this.farmerId, required this.api});
  final String farmerId;
  final AgentApi api;

  @override
  State<AgentFarmerScreen> createState() => _AgentFarmerScreenState();
}

class _AgentFarmerScreenState extends State<AgentFarmerScreen> {
  late Future<FarmerView> _view = widget.api.farmer(widget.farmerId);

  void _reload() => setState(() => _view = widget.api.farmer(widget.farmerId));

  Future<void> _complete(FarmerStage g) async {
    final sure = await askSure(
      context,
      title: tr('اعتمد المرحلة باسمه', 'Sign off the stage in their name'),
      message: tr('تُعتمد «${g.name}» باسمك ويُخبَر المزارع. إن اعترض فُتحت من جديد.', '«${g.name}» is signed off in your name and the farmer is told. If they object, it opens again.'),
      action: tr('اعتمد', 'Approve'),
    );
    if (!sure || !mounted) return;
    if (await runStep(context, () => widget.api.completeStage(widget.farmerId, g.id)) && mounted) _reload();
  }

  Future<void> _evidence(FarmerStage g) async {
    var kind = 'photo';
    final caption = TextEditingController();
    final go = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setState) => AlertDialog(
          title: Text(tr('ارفع دليلاً باسمه', 'Upload evidence in their name')),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(g.name, style: const TextStyle(fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              Wrap(spacing: 6, children: [
                for (final e in evidenceKinds.entries)
                  ChoiceChip(label: Text(e.value), selected: kind == e.key, onSelected: (_) => setState(() => kind = e.key)),
              ]),
              const SizedBox(height: 8),
              TextField(controller: caption, maxLength: 300, decoration: InputDecoration(labelText: tr('وصفٌ قصير (اختياري)', 'A short description (optional)'))),
              Muted(tr('الصورة الملتقطة في الحقل أقوى دليل: يُحفظ وقتها ومكانها مع الدليل، ولا يبقيان في الملفّ نفسه.', 'A photo taken in the field is the strongest evidence: its time and place are kept with the evidence, not left in the file itself.')),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(tr('إلغاء', 'Cancel'))),
            FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(tr('صوّر وارفع', 'Photograph and upload'))),
          ],
        ),
      ),
    );
    if (go != true || !mounted) return;
    final photo = await takePhoto(context);
    if (photo == null || !mounted) return;
    final ok = await runStep(
      context,
      () => widget.api.addEvidence(widget.farmerId, g.id, kind: kind, photo: photo, caption: caption.text),
    );
    if (ok && mounted) _reload();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(tr('مزارعٌ تعمل عنه', 'A farmer you act for'))),
      body: FutureBuilder<FarmerView>(
        future: _view,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) return const LoadingView();
          if (snap.hasError) return StateView.error(snap.error, onRetry: _reload);
          final f = snap.data!;
          return RefreshIndicator(
            onRefresh: () async => _reload(),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 40),
              children: [
                HeroBand(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(f.fullName, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
                      const SizedBox(height: 4),
                      Text(tr('${f.phone ?? ''} · أذن لك في: ${f.scopesLabel}', '${f.phone ?? ''} · allowed you: ${f.scopesLabel}')),
                    ],
                  ),
                ),
                if (f.can('lands')) ..._lands(f),
                if (f.can('seasons')) ..._seasons(f),
                if (f.can('herds')) ..._herds(f),
                const SizedBox(height: 16),
                SectionTitle(tr('ما كتبتَه باسمه', 'What you wrote in their name'), subtitle: tr('يراه المزارع كما تراه، ولا يُمحى.', 'The farmer sees this as you do, and it is never erased.')),
                if (f.actions.isEmpty) Muted(tr('لا شيء بعد.', 'Nothing yet.')),
                for (final a in f.actions) Text('${a.at} · ${a.label}', style: const TextStyle(fontSize: 13, height: 1.8)),
              ],
            ),
          );
        },
      ),
    );
  }

  List<Widget> _lands(FarmerView f) => [
        const SizedBox(height: 16),
        SectionTitle(
          tr('أراضيه', 'Their land'),
          trailing: TextButton(
            onPressed: () => openOnSite(context, '/lands/new?for=${f.id}'),
            child: Text(tr('سجّل أرضاً باسمه', 'Register a land in their name')),
          ),
        ),
        if (f.lands.isEmpty) Muted(tr('لا أرض له بعد.', 'No land yet.')),
        for (final l in f.lands)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: InfoCard(children: [
              Text('${l['name'] ?? ''}', style: const TextStyle(fontWeight: FontWeight.w800)),
              Muted([
                '${l['state'] ?? ''}',
                if ((l['locality'] as String?)?.isNotEmpty == true) '${l['locality']}',
                tr('${l['feddans'] ?? ''} فدان', '${l['feddans'] ?? ''} feddans'),
                '${l['verification_label'] ?? ''}',
              ].join(' · ')),
              Align(
                alignment: AlignmentDirectional.centerEnd,
                child: TextButton(onPressed: () => openOnSite(context, '/agent/${f.id}'), child: Text(tr('مستنداتها (في الموقع)', 'Its documents (on the website)'))),
              ),
            ]),
          ),
      ];

  List<Widget> _seasons(FarmerView f) => [
        const SizedBox(height: 16),
        SectionTitle(
          tr('مواسمه', 'Their seasons'),
          subtitle: tr('في موسمه الجاري ترفع دليل المرحلة ثمّ تعتمدها باسمه. كلّ ذلك معلَّمٌ أنّه منك، ويُخبَر به، ويعترض '
              'عليه فتُفتح المرحلة من جديد.', 'In their current season you upload the stage\'s evidence, then sign it off in their name. All of it is marked as yours, they are told, and if they object the stage opens again.'),
        ),
        if (f.seasons.isEmpty) Muted(tr('لا موسم له بعد.', 'No season yet.')),
        for (final s in f.seasons)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: InfoCard(children: [
              Text(s.name, style: const TextStyle(fontWeight: FontWeight.w800)),
              Muted(tr('${s.cropName} · ${s.feddans} فدان · زُرع ${s.planted} · المراحل: ${s.stagesDone}/${s.stagesTotal}', '${s.cropName} · ${s.feddans} feddans · planted ${s.planted} · stages: ${s.stagesDone}/${s.stagesTotal}')),
              for (final g in s.stages) _stage(g),
            ]),
          ),
      ];

  Widget _stage(FarmerStage g) {
    return Container(
      margin: const EdgeInsets.only(top: 8),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: g.completed ? leafTintOn(context).withValues(alpha: 0.5) : null,
        border: Border.all(color: Theme.of(context).colorScheme.outline),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            if (g.completed) Icon(Icons.check_circle_rounded, size: 18, color: textGreenOn(context)),
            if (g.completed) const SizedBox(width: 6),
            Expanded(child: Text(g.name, style: const TextStyle(fontWeight: FontWeight.w700))),
          ]),
          Muted(tr('${g.plannedStart} ← ${g.plannedEnd} · ${g.evidenceCount} دليل${g.completed && g.byAgent ? ' · اعتمدتها أنت' : ''}', '${g.plannedStart} → ${g.plannedEnd} · ${g.evidenceCount} evidence${g.completed && g.byAgent ? ' · signed off by you' : ''}')),
          if (g.objected && !g.completed) WarnText(tr('اعترض المزارع على اعتمادك لها، فيعتمدها هو بنفسه.', 'The farmer objected to your sign-off, so they sign it off themselves.')),
          if (!g.completed)
            Wrap(spacing: 6, children: [
              OutlinedButton.icon(
                onPressed: () => _evidence(g),
                icon: const Icon(Icons.add_a_photo_outlined, size: 18),
                label: Text(tr('ارفع دليلاً باسمه', 'Upload evidence in their name')),
              ),
              if (g.canComplete)
                FilledButton(onPressed: () => _complete(g), child: Text(tr('اعتمد المرحلة باسمه', 'Sign off the stage in their name'))),
            ]),
        ],
      ),
    );
  }

  List<Widget> _herds(FarmerView f) => [
        const SizedBox(height: 16),
        SectionTitle(tr('قطيعه', 'Their herds')),
        if (f.herds.isEmpty) Muted(tr('لا قطيع له بعد.', 'No herd yet.')),
        for (final h in f.herds)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: InfoCard(children: [
              Text('${h['name'] ?? ''}', style: const TextStyle(fontWeight: FontWeight.w800)),
              Muted(tr('${h['head_count'] ?? ''} رأس · المراحل: ${h['stages_done'] ?? 0}/${h['stages_total'] ?? 0}', '${h['head_count'] ?? ''} head · stages: ${h['stages_done'] ?? 0}/${h['stages_total'] ?? 0}')),
            ]),
          ),
      ];
}
