/// «وضع الوكيل» في التطبيق (البند ٢٠٣): two sides of one permission. «مزارعيّ» is the website's /agent, for a verified
/// company or cooperative acting for farmers who authorised it from their own account; «وكلائي» is /account/agents,
/// for the farmer — who asks to act for them, who does, everything an agent wrote in their name, and the objection.
library;

import 'package:flutter/material.dart';

import '../agent.dart';
import '../theme.dart';
import '../ui.dart';
import 'account_screen.dart' show openOnSite;
import 'agent_farmer_screen.dart';
import 'suppliers_kit.dart';

class AgentScreen extends StatefulWidget {
  const AgentScreen({super.key, this.api, this.initialTab = 0});

  /// The calls, for a test to stand in for; the app's own otherwise.
  final AgentApi? api;
  final int initialTab;

  @override
  State<AgentScreen> createState() => _AgentScreenState();
}

class _AgentScreenState extends State<AgentScreen> {
  late final calls = widget.api ?? AgentApi();

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      initialIndex: widget.initialTab,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('وضع الوكيل'),
          bottom: const TabBar(tabs: [Tab(text: 'مزارعيّ'), Tab(text: 'وكلائي')]),
        ),
        body: TabBarView(children: [FarmersTab(api: calls), MyAgentsTab(api: calls)]),
      ),
    );
  }
}

// ── «مزارعيّ»: the organisation's side ─────────────────────────────────────

class FarmersTab extends StatefulWidget {
  const FarmersTab({super.key, required this.api});
  final AgentApi api;

  @override
  State<FarmersTab> createState() => _FarmersTabState();
}

class _FarmersTabState extends State<FarmersTab> {
  Future<AgentBoard>? _board;
  final _phone = TextEditingController();
  final _note = TextEditingController();
  final _scopes = <String>{'lands'};
  bool _busy = false;

  void _reload() => setState(() => _board = widget.api.board());

  Future<void> _request() async {
    setState(() => _busy = true);
    final ok = await runStep(context, () => widget.api.request(phone: _phone.text, scopes: _scopes.toList(), note: _note.text));
    if (!mounted) return;
    setState(() => _busy = false);
    if (ok) {
      _phone.clear();
      _note.clear();
      _reload();
    }
  }

  Future<void> _end(AgentFarmer m, {required bool pending}) async {
    final sure = await askSure(
      context,
      title: pending ? 'اسحب الطلب' : 'أنهِ العمل عنه',
      message: pending ? 'يُسحب طلبك قبل أن يجيب المزارع.' : 'ينتهي الإذن، وما سُجّل باسم المزارع يبقى له.',
      action: pending ? 'اسحب' : 'أنهِ',
    );
    if (!sure || !mounted) return;
    if (await runStep(context, () => widget.api.end(m.id)) && mounted) _reload();
  }

  @override
  Widget build(BuildContext context) {
    return SignedInGate(
      why: 'وضع الوكيل لشركةٍ أو جمعيّةٍ تعاونيّة موثّقة تعمل عن مزارعين أذنوا لها. ادخل بحساب جهتك.',
      builder: (context) {
        _board ??= widget.api.board();
        return FutureBuilder<AgentBoard>(
          future: _board,
          builder: (context, snap) {
            if (snap.connectionState != ConnectionState.done) return const LoadingView();
            if (snap.hasError) return StateView.error(snap.error, onRetry: _reload, scrollable: true);
            final b = snap.data!;
            return RefreshIndicator(
              onRefresh: () async => _reload(),
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 40),
                children: [
                  const IntroNote(
                    'تعمل جهتك عن المزارع الذي لا يحسن التطبيق أو لا يصل إليه: تسجّل أرضه وترفع أوراقها، وتتابع مواسمه وقطيعه. '
                    'لا يبدأ شيءٌ قبل أن يقبل المزارع من حسابه هو، وينهيه متى شاء، ويرى كلّ ما كتبتَه باسمه.',
                    icon: Icons.groups_2_outlined,
                  ),
                  const SizedBox(height: 12),
                  ..._content(b),
                ],
              ),
            );
          },
        );
      },
    );
  }

  List<Widget> _content(AgentBoard b) {
    final c = b.company;
    if (c == null) {
      return [
        InfoCard(children: [
          const Text(
            'وضع الوكيل لشركةٍ أو جمعيّةٍ تعاونيّة موثّقة. سجّل جهتك أوّلاً، وحين تعتمدها الإدارة تعود إلى هنا.',
            style: TextStyle(height: 1.8),
          ),
          const SizedBox(height: 8),
          FilledButton(onPressed: () => openOnSite(context, '/partners/mine'), child: const Text('سجّل جهتك (في الموقع)')),
        ]),
      ];
    }
    if (!b.ready) {
      return [
        InfoCard(children: [
          Text(
            c.active ? '«${c.name}» تنتظر توثيق الإدارة. يُفتح وضع الوكيل حين تُوثَّق.' : '«${c.name}» معطّلة، فلا تعمل عن أحد.',
            style: const TextStyle(height: 1.8),
          ),
        ]),
      ];
    }
    return [
      InfoCard(children: [
        const Text('اطلب إذناً من مزارع', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
        const Muted(
          'يجب أن يكون للمزارع حسابٌ برقمه. يصله طلبك وسببه، ولا ترى اسمه حتى يقبل. ثلاثون طلباً في اليوم حدُّ الجهة.',
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _phone,
          keyboardType: TextInputType.phone,
          textDirection: TextDirection.ltr,
          decoration: const InputDecoration(labelText: 'رقم جوّال المزارع', hintText: '09xxxxxxxx'),
        ),
        const SizedBox(height: 8),
        const Text('ما تطلب الإذن فيه', style: TextStyle(fontWeight: FontWeight.w700)),
        for (final e in agentScopeLong.entries)
          CheckboxListTile(
            value: _scopes.contains(e.key),
            onChanged: (on) => setState(() => on == true ? _scopes.add(e.key) : _scopes.remove(e.key)),
            title: Text(e.value, style: const TextStyle(fontSize: 13.5)),
            controlAffinity: ListTileControlAffinity.leading,
            contentPadding: EdgeInsets.zero,
            dense: true,
          ),
        TextField(
          controller: _note,
          maxLength: 300,
          maxLines: 3,
          decoration: const InputDecoration(
            labelText: 'لماذا تطلب؟ يقرؤه المزارع قبل أن يقبل',
            hintText: 'مثلاً: نحن جمعيّة مزارعي القرية، نسجّل أرضك ونرفع أوراقها كما اتّفقنا في الاجتماع.',
          ),
        ),
        FilledButton(onPressed: _busy ? null : _request, child: const Text('أرسل الطلب')),
      ]),
      const SizedBox(height: 10),
      InfoCard(children: [
        const Text('سجّل مزارعاً بلا جوّال', style: TextStyle(fontWeight: FontWeight.w800)),
        const Muted(
          'لمن لا يملك جوّالاً: تقرأ عليه ورقة الموافقة بلغته، ويوقّعها أو يبصم عليها، ثمّ تصوّرها وتصوّره، وتراجعها الإدارة '
          'قبل أن تعمل عنه. يُفتح له حسابٌ من الموقع وحده، فهذه الخطوة في الموقع.',
        ),
        const SizedBox(height: 6),
        OutlinedButton.icon(
          onPressed: () => openOnSite(context, '/agent'),
          icon: const Icon(Icons.open_in_new_rounded, size: 18),
          label: const Text('افتحها في الموقع'),
        ),
      ]),
      const SizedBox(height: 16),
      const SectionTitle('من أذن لك'),
      if (b.active.isEmpty) const Muted('لم يقبل أحدٌ بعد.'),
      for (final m in b.active)
        Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: InfoCard(
            onTap: () async {
              await Navigator.of(context).push(MaterialPageRoute(builder: (_) => AgentFarmerScreen(farmerId: m.farmerId!, api: widget.api)));
              if (mounted) _reload();
            },
            children: [
              Row(children: [
                const IconChip(Icons.person_outline_rounded, size: 38),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(m.fullName, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: textGreenOn(context))),
                    Muted('${m.phone ?? ''} · ${m.scopesLabel} · منذ ${m.since}'),
                  ]),
                ),
                const Icon(Icons.chevron_left_rounded),
              ]),
              Align(
                alignment: AlignmentDirectional.centerEnd,
                child: TextButton(onPressed: () => _end(m, pending: false), child: const Text('أنهِ العمل عنه')),
              ),
            ],
          ),
        ),
      if (b.pending.isNotEmpty) ...[
        const SizedBox(height: 8),
        const SectionTitle('طلباتٌ تنتظر'),
        for (final m in b.pending)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: InfoCard(children: [
              Text(m.managed ? 'مزارعٌ بلا جوّال، ينتظر اعتماد الإدارة' : '…${m.phoneTail}', textDirection: m.managed ? null : TextDirection.ltr),
              Muted('${m.scopesLabel} · ${m.requested}'),
              Align(
                alignment: AlignmentDirectional.centerEnd,
                child: TextButton(onPressed: () => _end(m, pending: true), child: const Text('اسحب الطلب')),
              ),
            ]),
          ),
      ],
      if (b.past.isNotEmpty) ...[
        const SizedBox(height: 8),
        const SectionTitle('ما مضى'),
        for (final m in b.past) Muted('…${m.phoneTail} · ${m.scopesLabel} · ${m.statusLabel} · ${m.endedOn}'),
      ],
    ];
  }
}

// ── «وكلائي»: the farmer's side ────────────────────────────────────────────

class MyAgentsTab extends StatefulWidget {
  const MyAgentsTab({super.key, required this.api});
  final AgentApi api;

  @override
  State<MyAgentsTab> createState() => _MyAgentsTabState();
}

class _MyAgentsTabState extends State<MyAgentsTab> {
  Future<MyAgentsView>? _view;

  void _reload() => setState(() => _view = widget.api.myAgents());

  Future<void> _run(Future<String> Function() step) async {
    if (await runStep(context, step) && mounted) _reload();
  }

  Future<void> _object(AgentWrite w) async {
    final reason = await askText(
      context,
      title: 'اعتراض',
      label: 'لماذا؟ يقرؤه الوكيل',
      help: objectionNote(stage: w.isStage),
      action: 'أعترض',
      minLength: 3,
      maxLength: 500,
      lines: 3,
    );
    if (reason != null) await _run(() => widget.api.object(w.id, reason));
  }

  @override
  Widget build(BuildContext context) {
    return SignedInGate(
      why: 'ادخل لترى من يطلب أن يعمل عنك، ومن يعمل عنك، وما كتبه باسمك.',
      builder: (context) {
        _view ??= widget.api.myAgents();
        return FutureBuilder<MyAgentsView>(
          future: _view,
          builder: (context, snap) {
            if (snap.connectionState != ConnectionState.done) return const LoadingView();
            if (snap.hasError) return StateView.error(snap.error, onRetry: _reload, scrollable: true);
            final v = snap.data!;
            return RefreshIndicator(
              onRefresh: () async => _reload(),
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 40),
                children: [
                  const IntroNote(
                    'جمعيّةٌ أو شركةٌ موثّقة تستطيع أن تسجّل أرضك وترفع أوراقها وتتابع مواسمك وقطيعك عنك، إن أذنت لها. لا تعمل '
                    'إلا في ما أذنت فيه، وتُنهيه متى شئت، وما كتبته باسمك تراه هنا ويبقى لك.',
                    icon: Icons.handshake_outlined,
                  ),
                  if (v.pending.isNotEmpty) ...[
                    const SizedBox(height: 16),
                    const SectionTitle('يطلبون إذنك'),
                    for (final m in v.pending) _pendingCard(m),
                  ],
                  const SizedBox(height: 16),
                  const SectionTitle('يعملون عنك الآن'),
                  if (v.active.isEmpty) const Muted('لا أحد.'),
                  for (final m in v.active)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: InfoCard(children: [
                        Text(m.companyName, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900)),
                        Muted('${m.companyPhone} · ${m.scopesLabel} · منذ ${m.since}'),
                        Align(
                          alignment: AlignmentDirectional.centerEnd,
                          child: TextButton(
                            onPressed: () async {
                              if (await askSure(context,
                                  title: 'أنهِ الإذن', message: 'يتوقّف «${m.companyName}» عن العمل عنك. وما سُجّل باسمك يبقى لك.', action: 'أنهِ')) {
                                await _run(() => widget.api.endMine(m.id));
                              }
                            },
                            child: const Text('أنهِ الإذن'),
                          ),
                        ),
                      ]),
                    ),
                  const SizedBox(height: 16),
                  const SectionTitle('ما كتبه الوكلاء باسمك'),
                  if (v.writes.isEmpty) const Muted('لا شيء.'),
                  for (final w in v.writes) _writeTile(w),
                  if (v.past.isNotEmpty) ...[
                    const SizedBox(height: 16),
                    const SectionTitle('ما مضى'),
                    for (final m in v.past) Muted('${m.companyName} · ${m.statusLabel} · ${m.endedOn}'),
                  ],
                ],
              ),
            );
          },
        );
      },
    );
  }

  Widget _pendingCard(MyAgent m) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: InfoCard(highlight: true, children: [
        Text(m.companyName, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900)),
        Muted('${m.companyPhone} · ${m.requested}'),
        const SizedBox(height: 6),
        const Text('يطلب أن يعمل عنك في:', style: TextStyle(fontWeight: FontWeight.w700)),
        for (final s in m.scopesLong) Text('• $s', style: const TextStyle(height: 1.7)),
        const SizedBox(height: 6),
        Text('سببه: ${m.note}', style: const TextStyle(height: 1.7)),
        const SizedBox(height: 6),
        const Muted(
          'لا يحذف شيئاً من مالك، ولا ينقل أرضك إلى غيرك، ولا يعرضها على المستثمرين. اقبل فقط إن كنت تعرف هذه الجهة.',
        ),
        const SizedBox(height: 8),
        Wrap(spacing: 8, children: [
          FilledButton(onPressed: () => _run(() => widget.api.answer(m.id, accept: true)), child: const Text('أقبل')),
          OutlinedButton(onPressed: () => _run(() => widget.api.answer(m.id, accept: false)), child: const Text('أعتذر')),
        ]),
      ]),
    );
  }

  Widget _writeTile(AgentWrite w) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: w.onSeason ? warnTintOn(context) : null,
          border: w.onSeason ? null : Border.all(color: Theme.of(context).colorScheme.outline),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Muted(w.at, size: 11.5),
            Text(w.mark, style: const TextStyle(fontSize: 13.5, height: 1.6)),
            if (w.onSeason) Muted(w.label),
            if (w.objectionReason != null)
              WarnText('اعترضت: ${w.objectionReason}${w.reopened ? ' — وفُتحت المرحلة من جديد.' : ''}'),
            Wrap(spacing: 6, children: [
              if (w.seasonId != null)
                TextButton(onPressed: () => openOnSite(context, '/seasons/${w.seasonId}'), child: const Text('الموسم')),
              if (w.canObject) TextButton(onPressed: () => _object(w), child: const Text('اعتراض')),
            ]),
          ],
        ),
      ),
    );
  }
}
