import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api.dart';
import '../herds.dart';
import '../i18n.dart';
import '../lands.dart' show fmt0;
import '../theme.dart';
import '../ui.dart';

/// «القطعان» (البند ٢٠٣): the website's /herds in the app — the person's livestock production cycles, the
/// livestock diseases FAO holds for Sudan and its neighbours with the person's own states first, a new cycle with its
/// stages, and each cycle's stages and export readiness.
class HerdsScreen extends StatefulWidget {
  const HerdsScreen({super.key, this.api});

  /// For tests; the app's signed-in account otherwise.
  final HerdsApi? api;

  @override
  State<HerdsScreen> createState() => _HerdsScreenState();
}

class _HerdsScreenState extends State<HerdsScreen> {
  late final HerdsApi _api = widget.api ?? HerdsApi();
  late Future<HerdsPage> _page = _api.page();

  Future<void> _reload() async {
    final next = _api.page();
    setState(() { _page = next; });
    try {
      await next;
    } catch (_) {
      // Shown by the builder.
    }
  }

  Future<void> _new(List<SpeciesChoice> species) async {
    final id = await Navigator.of(context)
        .push<String>(MaterialPageRoute(builder: (_) => NewHerdScreen(api: _api, species: species)));
    if (!mounted) return;
    await _reload();
    if (id != null && mounted) {
      await Navigator.of(context).push(MaterialPageRoute(builder: (_) => HerdScreen(id: id, api: _api)));
    }
  }

  Future<void> _open(HerdSummary h) async {
    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => HerdScreen(id: h.id, name: h.name, api: _api)));
    if (mounted) await _reload();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(tr('القطعان', 'Herds'))),
      body: FutureBuilder<HerdsPage>(
        future: _page,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) return const LoadingView();
          if (snap.hasError) return StateView.error(snap.error, onRetry: _reload, scrollable: true);
          final p = snap.data!;
          return RefreshIndicator(
            onRefresh: _reload,
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
              children: [
                IntroNote(
                  tr('كل دورة مقسّمة إلى مراحل بتواريخها وتقدير علفها، ويمكن التعاقد على خدماتها البيطرية والتغذوية بالمراحل.', 'Each cycle is divided into stages with their dates and feed estimates, and its veterinary and feeding services can be contracted stage by stage.'),
                  icon: Icons.pets_outlined,
                ),
                const SizedBox(height: 12),
                FilledButton.icon(
                  key: const Key('new-herd'),
                  onPressed: p.species.isEmpty ? null : () => _new(p.species),
                  icon: const Icon(Icons.add),
                  label: Text(tr('دورة جديدة', 'New cycle')),
                ),
                const SizedBox(height: 14),
                _DiseaseCard(watch: p.diseases),
                const SizedBox(height: 14),
                SectionTitle(tr('قطعاني', 'My herds'), subtitle: p.herds.isEmpty ? null : tr('${p.herds.length} دورة', '${p.herds.length} cycles')),
                if (p.herds.isEmpty)
                  StateView(
                    icon: Icons.pets_outlined,
                    title: tr('لا توجد دورات بعد', 'No cycles yet'),
                    message: tr('الدورة هي ما يقابل الموسم في الجانب الحيواني: قطيع له بداية ونهاية، ومراحل من '
                        'الاقتناء والحجر الصحي حتى التسويق، لكل مرحلة تاريخ وميزانية.', 'A cycle is the livestock counterpart of a season: a herd with a beginning and an end, and stages from acquisition and quarantine to marketing, each with a date and a budget.'),
                    compact: true,
                  )
                else
                  for (final (i, h) in p.herds.indexed)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: FadeIn(
                        delay: i,
                        child: Card(
                          child: ListTile(
                            onTap: () => _open(h),
                            leading: const IconChip(Icons.pets_outlined, size: 40),
                            title: Text(h.name, style: const TextStyle(fontWeight: FontWeight.w800)),
                            subtitle: Text(
                              tr('${h.kindLine}\nالمراحل المنجزة: ${h.stagesDone} من ${h.stagesTotal}', '${h.kindLine}\nStages completed: ${h.stagesDone} of ${h.stagesTotal}'),
                              style: const TextStyle(height: 1.6),
                            ),
                            isThreeLine: true,
                            trailing: Text(tr('${fmt0(h.headCount)} رأس', '${fmt0(h.headCount)} head'), style: const TextStyle(fontWeight: FontWeight.w800)),
                          ),
                        ),
                      ),
                    ),
              ],
            ),
          );
        },
      ),
    );
  }
}

/// «أمراض الماشية في السودان وجيرانه» — what reached FAO in the last twelve months, the person's states first.
class _DiseaseCard extends StatelessWidget {
  const _DiseaseCard({required this.watch});
  final DiseaseWatch? watch;

  @override
  Widget build(BuildContext context) {
    final w = watch;
    final muted = TextStyle(color: mutedOn(context), fontSize: 12.5, height: 1.7);
    return Card(
      key: const Key('disease-watch'),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SectionTitle(tr('أمراض الماشية في السودان وجيرانه', 'Livestock diseases in Sudan and next door')),
            if (w == null)
              Text(tr('تعذّر الوصول إلى بيانات الفاو عن أمراض الماشية الآن.', 'FAO\'s livestock disease data could not be reached just now.'), style: muted)
            else ...[
              Text(
                tr('ما وصل إلى الفاو في آخر ١٢ شهراً. يصل الحدث إلى الجدول بعد أسابيع من وقوعه، ولا يظهر هنا إلّا ما أُبلغ عنه.', 'What reached FAO in the last 12 months. An event reaches the table weeks after it happens, and only what was reported shows here.'),
                style: muted,
              ),
              if (w.alerts.isNotEmpty) ...[
                const SizedBox(height: 10),
                Container(
                  key: const Key('disease-alert'),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(color: warnTintOn(context), borderRadius: BorderRadius.circular(14)),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(children: [
                        Icon(Icons.warning_amber_rounded, color: warnOn(context), size: 20),
                        const SizedBox(width: 6),
                        Flexible(
                          child: Text(tr('مرضٌ مُبلَّغٌ عنه في ولايتك', 'A disease reported in your state'),
                              style: TextStyle(fontWeight: FontWeight.w800, color: warnOn(context))),
                        ),
                      ]),
                      const SizedBox(height: 4),
                      for (final a in w.alerts)
                        Text(tr('«${a.land}» في ${a.state}: ${a.diseases.join('، ')}', '«${a.land}» in ${a.state}: ${a.diseases.join(', ')}'), style: const TextStyle(height: 1.7)),
                      const SizedBox(height: 4),
                      Text(
                        tr('اتّصل بالطبيب البيطريّ في محليّتك أو بوزارة الثروة الحيوانيّة في الولاية عن التطعيم وعزل القطيع.', 'Call the veterinarian in your locality or the state livestock ministry about vaccination and isolating the herd.'),
                        style: TextStyle(fontSize: 12.5, height: 1.7),
                      ),
                    ],
                  ),
                ),
              ],
              if (w.nearest.isNotEmpty) ...[
                const SizedBox(height: 8),
                for (final n in w.nearest) Text(n, style: const TextStyle(fontSize: 12.5, height: 1.7)),
              ],
              if (!w.hasLands) ...[
                const SizedBox(height: 8),
                Text(
                  tr('أضف أرضك بولايتها وموقعها في «أراضيّ» ليصلك إشعارٌ إن أُبلغ عن مرضٍ في ولايتك، ولو لم تفتح هذه الصفحة.', 'Add your land with its state and location in «My lands» to get a notification if a disease is reported in your state, even if you do not open this page.'),
                  style: muted,
                ),
              ],
              if (!w.sudanEvents) ...[
                const SizedBox(height: 8),
                Text(tr('لم يصل إلى الفاو حدثٌ في السودان خلال هذه الفترة.', 'No event in Sudan reached FAO in this period.')),
              ],
              if (w.groups.isNotEmpty) ...[
                const SizedBox(height: 10),
                for (final g in w.groups)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          flex: 3,
                          child: Text(
                            tr('${g.country}${g.states.isEmpty ? '' : ' (${g.states.join('، ')})'}', '${g.country}${g.states.isEmpty ? '' : ' (${g.states.join(', ')})'}'),
                            style: const TextStyle(fontSize: 13),
                          ),
                        ),
                        Expanded(flex: 3, child: Text(g.disease, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13))),
                        SizedBox(width: 30, child: Text('${g.count}', textAlign: TextAlign.center)),
                        Expanded(flex: 2, child: Text(g.latest, style: muted)),
                      ],
                    ),
                  ),
              ],
              const SizedBox(height: 8),
              Text(w.source, style: muted),
              if (w.sourceUrl != null)
                Align(
                  alignment: AlignmentDirectional.centerStart,
                  child: TextButton(
                    onPressed: () => launchUrl(Uri.parse(w.sourceUrl!), mode: LaunchMode.externalApplication),
                    child: const Text('FAO EMPRES-i'),
                  ),
                ),
            ],
          ],
        ),
      ),
    );
  }
}

/// «دورة إنتاج حيواني جديدة»: species, purpose, head count and start date; the stages are generated by the site.
class NewHerdScreen extends StatefulWidget {
  const NewHerdScreen({super.key, required this.api, required this.species});
  final HerdsApi api;
  final List<SpeciesChoice> species;

  @override
  State<NewHerdScreen> createState() => _NewHerdScreenState();
}

class _NewHerdScreenState extends State<NewHerdScreen> {
  final _name = TextEditingController();
  final _breed = TextEditingController();
  final _heads = TextEditingController();
  final _budget = TextEditingController();
  final _start = TextEditingController(text: DateTime.now().toIso8601String().substring(0, 10));
  late SpeciesChoice _species = widget.species.first;
  late String? _purpose = _species.purposes.firstOrNull?.key;
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    for (final c in [_name, _breed, _heads, _budget, _start]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    final heads = int.tryParse(_heads.text.trim());
    if (_name.text.trim().isEmpty) return setState(() => _error = tr('اسم الدورة مطلوب.', 'The cycle name is required.'));
    if (heads == null || heads <= 0 || _purpose == null) {
      return setState(() => _error = tr('اكتب عدد الرؤوس واختر الغرض.', 'Enter the number of head and choose the purpose.'));
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final id = await widget.api.create(
        name: _name.text.trim(),
        species: _species.key,
        purpose: _purpose!,
        headCount: heads,
        startDate: _start.text.trim(),
        budgetPerHead: num.tryParse(_budget.text.trim()),
        breed: _breed.text.trim(),
      );
      if (mounted) Navigator.of(context).pop(id);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(tr('دورة جديدة', 'New cycle'))),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          IntroNote(
            tr('أدخل النوع والغرض والعدد وتاريخ البدء، وسيولّد النظام مراحل الدورة بتواريخها وتقدير العلف لكل مرحلة وحصتها من الميزانية.', 'Enter the species, purpose, number of head and start date, and the system will generate the cycle\'s stages with their dates, the feed estimate for each stage and its share of the budget.'),
          ),
          const SizedBox(height: 12),
          TextField(key: const Key('herd-name'), controller: _name, decoration: InputDecoration(labelText: tr('اسم الدورة', 'Cycle name'))),
          const SizedBox(height: 8),
          DropdownButtonFormField<String>(
            isExpanded: true,
            initialValue: _species.key,
            decoration: InputDecoration(labelText: tr('النوع', 'Species')),
            items: [for (final s in widget.species) DropdownMenuItem(value: s.key, child: Text(s.label))],
            onChanged: (v) => setState(() {
              _species = widget.species.firstWhere((s) => s.key == v, orElse: () => _species);
              _purpose = _species.purposes.firstOrNull?.key;
            }),
          ),
          const SizedBox(height: 8),
          DropdownButtonFormField<String>(
            key: ValueKey('purpose-${_species.key}'),
            isExpanded: true,
            initialValue: _purpose,
            decoration: InputDecoration(labelText: tr('الغرض', 'Purpose')),
            items: [for (final p in _species.purposes) DropdownMenuItem(value: p.key, child: Text(p.label))],
            onChanged: (v) => setState(() => _purpose = v),
          ),
          const SizedBox(height: 8),
          TextField(controller: _breed, decoration: InputDecoration(labelText: tr('السلالة (اختياري)', 'Breed (optional)'))),
          const SizedBox(height: 8),
          TextField(
            key: const Key('herd-heads'),
            controller: _heads,
            keyboardType: TextInputType.number,
            decoration: InputDecoration(labelText: tr('عدد الرؤوس', 'Head')),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _start,
            textDirection: TextDirection.ltr,
            decoration: InputDecoration(labelText: tr('تاريخ البدء (سنة-شهر-يوم)', 'Start date (year-month-day)')),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _budget,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: InputDecoration(labelText: tr('الميزانية للرأس (اختياري)', 'Budget per head (optional)'), hintText: tr('مثال: 45000', 'e.g. 45000')),
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
          ],
          const SizedBox(height: 16),
          FilledButton(
            key: const Key('herd-save'),
            onPressed: _saving ? null : _save,
            child: Text(_saving ? tr('يُحفظ…', 'Saving…') : tr('أنشئ الدورة', 'Create the cycle')),
          ),
        ],
      ),
    );
  }
}

/// One production cycle: its stages, the budget, and — for cattle, sheep, goats and camels — its export readiness.
class HerdScreen extends StatefulWidget {
  const HerdScreen({super.key, required this.id, this.name = '', this.api});
  final String id;
  final String name;
  final HerdsApi? api;

  @override
  State<HerdScreen> createState() => _HerdScreenState();
}

class _HerdScreenState extends State<HerdScreen> {
  late final HerdsApi _api = widget.api ?? HerdsApi();
  String _destination = 'sa';
  late Future<HerdDetail> _detail = _api.detail(widget.id, destination: _destination);
  bool _busy = false;

  Future<void> _reload() async {
    final next = _api.detail(widget.id, destination: _destination);
    setState(() { _detail = next; });
    try {
      await next;
    } catch (_) {
      // Shown by the builder.
    }
  }

  Future<void> _run(Future<String> Function() step) async {
    if (_busy) return;
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _busy = true);
    try {
      messenger.showSnackBar(SnackBar(content: Text(await step())));
      await _reload();
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.name.isEmpty ? tr('دورة إنتاج حيواني', 'Livestock cycle') : widget.name)),
      body: FutureBuilder<HerdDetail>(
        future: _detail,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done && !snap.hasData) return const LoadingView();
          if (snap.hasError) return StateView.error(snap.error, onRetry: _reload, scrollable: true);
          final d = snap.data!;
          return RefreshIndicator(
            onRefresh: _reload,
            child: AbsorbPointer(
              absorbing: _busy,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
                children: [
                  HeroBand(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(d.herd.name, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
                        const SizedBox(height: 4),
                        Text(tr('${d.herd.kindLine} — ${fmt0(d.herd.headCount)} رأس', '${d.herd.kindLine} — ${fmt0(d.herd.headCount)} head')),
                        const SizedBox(height: 12),
                        Row(
                          children: [
                            _Stat(tr('المراحل المنجزة', 'Stages completed'), '${d.done} / ${d.stageCount}'),
                            _Stat(tr('العلف التقديري', 'Estimated feed'), tr('${fmt0(d.feedKg)} كجم', '${fmt0(d.feedKg)} kg')),
                            _Stat(tr('الميزانية', 'Budget'), d.budget > 0 ? fmt0(d.budget) : '—',
                                below: d.budget > 0 ? tr('${fmt0(d.perHead)} للرأس', '${fmt0(d.perHead)} per head') : null),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                  _BudgetCard(detail: d, run: (perHead) => _run(() => _api.setBudget(widget.id, perHead))),
                  const SizedBox(height: 12),
                  IntroNote(
                    tr('تقدير العلف مبنٍ على متوسطات استهلاك المادة الجافة كنسبة من وزن الحيوان، وليس حساباً مرجعياً كاحتياج '
                    'المحاصيل المائي. اعتمده كنقطة بداية وعدّله على واقع قطيعك.', 'The feed estimate is built on average dry-matter intake as a share of the animal\'s weight, not a reference calculation like the crops\' water requirement. Use it as a starting point and adjust it to your herd\'s reality.'),
                    icon: Icons.info_outline,
                  ),
                  const SizedBox(height: 12),
                  for (final s in d.stages)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: _StageCard(
                        stage: s,
                        onComplete: d.active && s.canComplete ? () => _run(() => _api.completeStage(widget.id, s.id)) : null,
                      ),
                    ),
                  if (d.readiness != null) ...[
                    const SizedBox(height: 6),
                    _ReadinessCard(
                      readiness: d.readiness!,
                      headCount: d.herd.headCount,
                      active: d.active,
                      onDestination: (k) {
                        _destination = k;
                        _reload();
                      },
                      addHealth: (body) => _run(() => _api.addHealth(
                            widget.id,
                            choice: body.choice,
                            doneOn: body.doneOn,
                            heads: body.heads,
                            result: body.result,
                            vet: body.vet,
                            product: body.product,
                            batch: body.batch,
                            note: body.note,
                          )),
                      addTags: (prefix, from, to) => _run(() => _api.addTags(widget.id, prefix: prefix, from: from, to: to)),
                    ),
                  ],
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat(this.label, this.value, {this.below});
  final String label;
  final String value;
  final String? below;

  @override
  Widget build(BuildContext context) => Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: TextStyle(color: mutedOn(context), fontSize: 11.5)),
            Text(value, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900)),
            if (below != null) Text(below!, style: TextStyle(color: mutedOn(context), fontSize: 11)),
          ],
        ),
      );
}

class _BudgetCard extends StatefulWidget {
  const _BudgetCard({required this.detail, required this.run});
  final HerdDetail detail;
  final void Function(num perHead) run;

  @override
  State<_BudgetCard> createState() => _BudgetCardState();
}

class _BudgetCardState extends State<_BudgetCard> {
  late final _perHead = TextEditingController(text: widget.detail.perHead > 0 ? '${widget.detail.perHead}' : '');

  @override
  void dispose() {
    _perHead.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final d = widget.detail;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (d.budget == 0) ...[
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(color: warnTintOn(context), borderRadius: BorderRadius.circular(12)),
                child: Text(
                  tr('لم تُدخَل ميزانيّةٌ لهذه الدورة. حقلُ «الميزانية للرأس» اختياريٌّ عند الإنشاء، وتُرك فارغاً — فالأصفارُ '
                  'ليست حساباً فشل، بل رقماً لم يُكتب. اكتبه الآن ويُقسَّم على المراحل بنسبة العلف.', 'No budget was entered for this cycle. The «Budget per head» field is optional at creation and was left empty — so the zeros are not a failed calculation but a number never written. Enter it now and it is split across the stages in proportion to feed.'),
                  style: TextStyle(height: 1.7),
                ),
              ),
              const SizedBox(height: 10),
            ],
            TextField(
              key: const Key('budget-per-head'),
              controller: _perHead,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: InputDecoration(
                labelText: tr('الميزانية للرأس — وتُقسَّم على المراحل بنسبة العلف', 'Budget per head — split across the stages in proportion to feed'),
                hintText: tr('مثال: 45000', 'e.g. 45000'),
              ),
            ),
            const SizedBox(height: 8),
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: FilledButton(
                onPressed: () {
                  final v = num.tryParse(_perHead.text.trim());
                  if (v != null) widget.run(v);
                },
                child: Text(d.budget > 0 ? tr('حدّث الميزانية', 'Update budget') : tr('أضف الميزانية', 'Add budget')),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StageCard extends StatelessWidget {
  const _StageCard({required this.stage, this.onComplete});
  final HerdStageRow stage;
  final VoidCallback? onComplete;

  @override
  Widget build(BuildContext context) {
    final s = stage;
    final facts = <(String, String)>[
      (tr('من', 'From'), s.plannedStart ?? '—'),
      (tr('إلى', 'To'), s.plannedEnd ?? '—'),
      (tr('المدّة', 'Duration'), s.days == null ? '—' : tr('${s.days} يوماً', '${s.days} days')),
      (tr('العلف التقديري', 'Estimated feed'), s.feedKg == null ? '—' : tr('${fmt0(s.feedKg!)} كجم', '${fmt0(s.feedKg!)} kg')),
      (tr('حصّتها من الميزانية', 'Share of budget'), s.budget > 0 ? fmt0(s.budget) : tr('لم تُدخَل', 'Not entered')),
      if (s.feedShare != null) (tr('من علف الدورة', 'Of the cycle\'s feed'), tr('${s.feedShare}٪', '${s.feedShare}%')),
    ];
    return Card(
      color: s.completed ? leafTintOn(context) : null,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text('${s.order}. ${s.name}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                ),
                TagPill(s.completed ? tr('منجزة', 'Done') : tr('مفتوحة', 'Open'), gold: !s.completed),
              ],
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 16,
              runSpacing: 6,
              children: [
                for (final (k, v) in facts)
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(k, style: TextStyle(color: mutedOn(context), fontSize: 11)),
                      Text(v, style: const TextStyle(fontWeight: FontWeight.w600)),
                    ],
                  ),
              ],
            ),
            if (onComplete != null) ...[
              const SizedBox(height: 10),
              Align(
                alignment: AlignmentDirectional.centerStart,
                child: OutlinedButton(onPressed: onComplete, child: Text(tr('اعتمد المرحلة', 'Sign off stage'))),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class HealthDraft {
  const HealthDraft({
    required this.choice,
    required this.doneOn,
    required this.heads,
    this.result = '',
    this.vet = '',
    this.product = '',
    this.batch = '',
    this.note = '',
  });
  final String choice;
  final String doneOn;
  final int heads;
  final String result;
  final String vet;
  final String product;
  final String batch;
  final String note;
}

/// «الجاهزيّة للتصدير»: the checklist for a destination, the ear tags and the health record, and adding to them.
class _ReadinessCard extends StatefulWidget {
  const _ReadinessCard({
    required this.readiness,
    required this.headCount,
    required this.active,
    required this.onDestination,
    required this.addHealth,
    required this.addTags,
  });

  final Readiness readiness;
  final int headCount;
  final bool active;
  final void Function(String destination) onDestination;
  final void Function(HealthDraft draft) addHealth;
  final void Function(String prefix, int from, int? to) addTags;

  @override
  State<_ReadinessCard> createState() => _ReadinessCardState();
}

class _ReadinessCardState extends State<_ReadinessCard> {
  String? _choice;
  String _result = '';
  final _doneOn = TextEditingController(text: DateTime.now().toIso8601String().substring(0, 10));
  late final _heads = TextEditingController(text: '${widget.headCount}');
  final _vet = TextEditingController();
  final _product = TextEditingController();
  final _batch = TextEditingController();
  final _note = TextEditingController();
  final _prefix = TextEditingController();
  final _from = TextEditingController();
  final _to = TextEditingController();

  @override
  void dispose() {
    for (final c in [_doneOn, _heads, _vet, _product, _batch, _note, _prefix, _from, _to]) {
      c.dispose();
    }
    super.dispose();
  }

  static const _marks = {
    'ok': (Icons.check_circle_outline, false),
    'missing': (Icons.cancel_outlined, true),
    'warn': (Icons.warning_amber_rounded, true),
    'info': (Icons.info_outline, false),
  };

  @override
  Widget build(BuildContext context) {
    final r = widget.readiness;
    final isTest = _choice?.startsWith('test:') ?? false;
    final muted = TextStyle(color: mutedOn(context), fontSize: 12, height: 1.6);
    return Card(
      key: const Key('readiness'),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SectionTitle(
              tr('الجاهزيّة للتصدير', 'Export readiness'),
              subtitle: tr('سجلٌّ تحفظه لقطيعك تقدّمه للمصدّر وللطبيب البيطريّ في المحجر. يساعد المحجر ولا يغني عنه.', 'A record you keep for your herd and give to the exporter and to the veterinarian at the quarantine. It helps the quarantine and does not replace it.'),
            ),
            Wrap(
              spacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                Text(tr('الوجهة:', 'Destination:'), style: TextStyle(fontWeight: FontWeight.w700)),
                for (final d in r.destinations)
                  ChoiceChip(
                    label: Text(d.label),
                    selected: d.key == r.destination,
                    onSelected: (_) => widget.onDestination(d.key),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            Text(r.verdict, style: TextStyle(fontWeight: FontWeight.w800, color: r.met ? textGreenOn(context) : null)),
            const SizedBox(height: 8),
            for (final l in r.lines)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(
                      (_marks[l.status] ?? _marks['info']!).$1,
                      size: 20,
                      color: (_marks[l.status] ?? _marks['info']!).$2 ? warnOn(context) : textGreenOn(context),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(l.title, style: const TextStyle(fontWeight: FontWeight.w700)),
                          Text(l.detail, style: const TextStyle(fontSize: 12.5, height: 1.6)),
                          InkWell(
                            onTap: l.sourceUrl == null
                                ? null
                                : () => launchUrl(Uri.parse(l.sourceUrl!), mode: LaunchMode.externalApplication),
                            child: Text(tr('المصدر: ${l.source} (${l.sourceMeta})', 'Source: ${l.source} (${l.sourceMeta})'),
                                style: muted.copyWith(decoration: TextDecoration.underline)),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            Text(r.note, style: muted),
            const Divider(height: 24),
            Text(tr('أرقام الآذان', 'Ear tags'), style: TextStyle(fontWeight: FontWeight.w800)),
            Text(
              tr('مرقَّمٌ في القطيع: ${r.tagsPresent} من ${widget.headCount} رأساً'
              '${r.tagsOther.isEmpty ? '' : ' · ${r.tagsOther.join(' · ')}'}', 'Tagged in the herd: ${r.tagsPresent} of ${widget.headCount} head${r.tagsOther.isEmpty ? '' : ' · ${r.tagsOther.join(' · ')}'}'),
            ),
            if (r.tagSample.isNotEmpty) Text(r.tagSample.join(', '), textDirection: TextDirection.ltr, style: muted),
            if (widget.active) ...[
              const SizedBox(height: 6),
              Row(
                children: [
                  Expanded(child: TextField(controller: _prefix, textDirection: TextDirection.ltr, decoration: InputDecoration(labelText: tr('الحرف الثابت', 'Prefix'), hintText: 'SD-'))),
                  const SizedBox(width: 8),
                  Expanded(child: TextField(controller: _from, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: tr('من', 'From')))),
                  const SizedBox(width: 8),
                  Expanded(child: TextField(controller: _to, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: tr('إلى', 'To')))),
                ],
              ),
              const SizedBox(height: 6),
              Align(
                alignment: AlignmentDirectional.centerStart,
                child: OutlinedButton(
                  onPressed: () {
                    final from = int.tryParse(_from.text.trim());
                    if (from == null) return;
                    widget.addTags(_prefix.text.trim(), from, int.tryParse(_to.text.trim()));
                  },
                  child: Text(tr('أضف الأرقام', 'Add the tags')),
                ),
              ),
            ],
            const Divider(height: 24),
            Text(tr('سجلّ الصحّة', 'Health record'), style: TextStyle(fontWeight: FontWeight.w800)),
            if (r.records.isEmpty) Text(tr('لم يُسجَّل تطعيمٌ ولا فحصٌ ولا علاجٌ بعد.', 'No vaccination, test or treatment recorded yet.'), style: muted),
            for (final h in r.records)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 3),
                child: Text(
                  tr('${h.kind}: ${h.item} · ${h.doneOn} · ${h.heads} رأساً'
                  '${h.result != null ? ' · ${h.result}' : ''}${h.vet != null ? ' · ${h.vet}' : ''}'
                  '${h.withdrawn ? ' · (سُحب)' : ''}', '${h.kind}: ${h.item} · ${h.doneOn} · ${h.heads} head${h.result != null ? ' · ${h.result}' : ''}${h.vet != null ? ' · ${h.vet}' : ''}${h.withdrawn ? ' · (withdrawn)' : ''}'),
                  style: TextStyle(
                    height: 1.6,
                    decoration: h.withdrawn ? TextDecoration.lineThrough : null,
                    color: h.withdrawn ? mutedOn(context) : null,
                  ),
                ),
              ),
            if (widget.active)
              ExpansionTile(
                tilePadding: EdgeInsets.zero,
                title: Text(tr('سجّل تطعيماً أو فحصاً أو علاجاً', 'Record a vaccination, test or treatment'), style: TextStyle(fontWeight: FontWeight.w700)),
                children: [
                  DropdownButtonFormField<String>(
                    isExpanded: true,
                    initialValue: _choice,
                    decoration: InputDecoration(labelText: tr('ماذا', 'What')),
                    items: [
                      for (final i in r.items)
                        DropdownMenuItem(
                          value: i.choice,
                          child: Text(tr('${switch (i.kind) { 'vaccination' => 'تطعيم', 'test' => 'فحص', _ => 'علاج' }}: ${i.label}', '${switch (i.kind) { 'vaccination' => 'Vaccination', 'test' => 'Test', _ => 'Treatment' }}: ${i.label}')),
                        ),
                    ],
                    onChanged: (v) => setState(() => _choice = v),
                  ),
                  Row(
                    children: [
                      Expanded(child: TextField(controller: _doneOn, textDirection: TextDirection.ltr, decoration: InputDecoration(labelText: tr('التاريخ', 'Date')))),
                      const SizedBox(width: 8),
                      Expanded(child: TextField(controller: _heads, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: tr('عدد الرؤوس', 'Head')))),
                    ],
                  ),
                  if (isTest)
                    DropdownButtonFormField<String>(
                      initialValue: _result,
                      decoration: InputDecoration(labelText: tr('النتيجة', 'Outcome')),
                      items: [
                        DropdownMenuItem(value: '', child: Text('—')),
                        DropdownMenuItem(value: 'negative', child: Text(tr('سلبيّ (سليم)', 'Negative'))),
                        DropdownMenuItem(value: 'positive', child: Text(tr('إيجابيّ', 'Positive'))),
                      ],
                      onChanged: (v) => setState(() => _result = v ?? ''),
                    ),
                  TextField(controller: _vet, maxLength: 120, decoration: InputDecoration(labelText: tr('الطبيب البيطريّ', 'Veterinarian'))),
                  TextField(controller: _product, maxLength: 120, decoration: InputDecoration(labelText: tr('المنتج أو اللقاح', 'Product or vaccine'))),
                  TextField(controller: _batch, maxLength: 60, textDirection: TextDirection.ltr, decoration: InputDecoration(labelText: tr('رقم التشغيلة', 'Batch number'))),
                  TextField(controller: _note, maxLength: 500, decoration: InputDecoration(labelText: tr('ملاحظة', 'Note'))),
                  Align(
                    alignment: AlignmentDirectional.centerStart,
                    child: FilledButton(
                      onPressed: _choice == null
                          ? null
                          : () => widget.addHealth(HealthDraft(
                                choice: _choice!,
                                doneOn: _doneOn.text.trim(),
                                heads: int.tryParse(_heads.text.trim()) ?? 0,
                                result: isTest ? _result : '',
                                vet: _vet.text.trim(),
                                product: _product.text.trim(),
                                batch: _batch.text.trim(),
                                note: _note.text.trim(),
                              )),
                      child: Text(tr('سجّل', 'Record')),
                    ),
                  ),
                  const SizedBox(height: 8),
                ],
              ),
          ],
        ),
      ),
    );
  }
}
