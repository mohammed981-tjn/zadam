/// «وضع الوكيل» في التطبيق (البند ٢٠٣): two sides of one permission. «مزارعيّ» is the website's /agent, for a verified
/// company or cooperative acting for farmers who authorised it from their own account; «وكلائي» is /account/agents,
/// for the farmer — who asks to act for them, who does, everything an agent wrote in their name, and the objection.
library;

import 'package:flutter/material.dart';

import '../agent.dart';
import '../i18n.dart';
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
          title: Text(tr('وضع الوكيل', 'Agent mode')),
          bottom: TabBar(tabs: [Tab(text: tr('مزارعيّ', 'My farmers')), Tab(text: tr('وكلائي', 'My agents'))]),
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
      title: pending ? tr('اسحب الطلب', 'Withdraw') : tr('أنهِ العمل عنه', 'Stop acting for them'),
      message: pending ? tr('يُسحب طلبك قبل أن يجيب المزارع.', 'Your request is withdrawn before the farmer answers.') : tr('ينتهي الإذن، وما سُجّل باسم المزارع يبقى له.', 'The permission ends, and what was recorded in the farmer\'s name stays theirs.'),
      action: pending ? tr('اسحب', 'Withdraw') : tr('أنهِ', 'End'),
    );
    if (!sure || !mounted) return;
    if (await runStep(context, () => widget.api.end(m.id)) && mounted) _reload();
  }

  @override
  Widget build(BuildContext context) {
    return SignedInGate(
      why: tr('وضع الوكيل لشركةٍ أو جمعيّةٍ تعاونيّة موثّقة تعمل عن مزارعين أذنوا لها. ادخل بحساب جهتك.', 'Agent mode is for a verified company or cooperative acting for farmers who have allowed it. Sign in with your organisation\'s account.'),
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
                  IntroNote(
                    tr('تعمل جهتك عن المزارع الذي لا يحسن التطبيق أو لا يصل إليه: تسجّل أرضه وترفع أوراقها، وتتابع مواسمه وقطيعه. '
                    'لا يبدأ شيءٌ قبل أن يقبل المزارع من حسابه هو، وينهيه متى شاء، ويرى كلّ ما كتبتَه باسمه.', 'Your organisation acts for a farmer who is not at ease with the app or cannot reach it: it registers their land and uploads its papers, and follows their seasons and herds. Nothing starts before the farmer accepts from their own account; they end it whenever they like and see everything you wrote in their name.'),
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
          Text(
            tr('وضع الوكيل لشركةٍ أو جمعيّةٍ تعاونيّة موثّقة. سجّل جهتك أوّلاً، وحين تعتمدها الإدارة تعود إلى هنا.', 'Agent mode is for a verified company or cooperative. Register your organisation first; once the administrators approve it, come back here.'),
            style: TextStyle(height: 1.8),
          ),
          const SizedBox(height: 8),
          FilledButton(onPressed: () => openOnSite(context, '/partners/mine'), child: Text(tr('سجّل جهتك (في الموقع)', 'Register your organisation (on the website)'))),
        ]),
      ];
    }
    if (!b.ready) {
      return [
        InfoCard(children: [
          Text(
            c.active ? tr('«${c.name}» تنتظر توثيق الإدارة. يُفتح وضع الوكيل حين تُوثَّق.', '«${c.name}» is waiting for the administrators to verify it. Agent mode opens once it is verified.') : tr('«${c.name}» معطّلة، فلا تعمل عن أحد.', '«${c.name}» is suspended, so it does not act for anyone.'),
            style: const TextStyle(height: 1.8),
          ),
        ]),
      ];
    }
    return [
      InfoCard(children: [
        Text(tr('اطلب إذناً من مزارع', 'Ask a farmer for permission'), style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
        Muted(
          tr('يجب أن يكون للمزارع حسابٌ برقمه. يصله طلبك وسببه، ولا ترى اسمه حتى يقبل. ثلاثون طلباً في اليوم حدُّ الجهة.', 'The farmer needs an account under their number. They receive your request and its reason, and you do not see their name until they accept. Thirty requests a day is the limit.'),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _phone,
          keyboardType: TextInputType.phone,
          textDirection: TextDirection.ltr,
          decoration: InputDecoration(labelText: tr('رقم جوّال المزارع', 'The farmer\'s phone number'), hintText: '09xxxxxxxx'),
        ),
        const SizedBox(height: 8),
        Text(tr('ما تطلب الإذن فيه', 'What you ask permission for'), style: TextStyle(fontWeight: FontWeight.w700)),
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
          decoration: InputDecoration(
            labelText: tr('لماذا تطلب؟ يقرؤه المزارع قبل أن يقبل', 'Why are you asking? The farmer reads this before accepting'),
            hintText: tr('مثلاً: نحن جمعيّة مزارعي القرية، نسجّل أرضك ونرفع أوراقها كما اتّفقنا في الاجتماع.', 'For example: we are the village farmers\' cooperative; we will register your land and upload its papers as agreed at the meeting.'),
          ),
        ),
        FilledButton(onPressed: _busy ? null : _request, child: Text(tr('أرسل الطلب', 'Send request'))),
      ]),
      const SizedBox(height: 10),
      InfoCard(children: [
        Text(tr('سجّل مزارعاً بلا جوّال', 'Register a farmer who has no phone'), style: TextStyle(fontWeight: FontWeight.w800)),
        Muted(
          tr('لمن لا يملك جوّالاً: تقرأ عليه ورقة الموافقة بلغته، ويوقّعها أو يبصم عليها، ثمّ تصوّرها وتصوّره، وتراجعها الإدارة '
          'قبل أن تعمل عنه. يُفتح له حسابٌ من الموقع وحده، فهذه الخطوة في الموقع.', 'For someone with no phone: you read them the consent form in their language, they sign it or put their thumbprint on it, then you photograph it and them, and the administrators review it before you act for them. An account is opened for them on the website only, so this step is on the website.'),
        ),
        const SizedBox(height: 6),
        OutlinedButton.icon(
          onPressed: () => openOnSite(context, '/agent'),
          icon: const Icon(Icons.open_in_new_rounded, size: 18),
          label: Text(tr('افتحها في الموقع', 'Open it on the website')),
        ),
      ]),
      const SizedBox(height: 16),
      SectionTitle(tr('من أذن لك', 'Who has authorised you')),
      if (b.active.isEmpty) Muted(tr('لم يقبل أحدٌ بعد.', 'No one has accepted yet.')),
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
                    Muted(tr('${m.phone ?? ''} · ${m.scopesLabel} · منذ ${m.since}', '${m.phone ?? ''} · ${m.scopesLabel} · since ${m.since}')),
                  ]),
                ),
                const Icon(Icons.chevron_left_rounded),
              ]),
              Align(
                alignment: AlignmentDirectional.centerEnd,
                child: TextButton(onPressed: () => _end(m, pending: false), child: Text(tr('أنهِ العمل عنه', 'Stop acting for them'))),
              ),
            ],
          ),
        ),
      if (b.pending.isNotEmpty) ...[
        const SizedBox(height: 8),
        SectionTitle(tr('طلباتٌ تنتظر', 'Requests waiting')),
        for (final m in b.pending)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: InfoCard(children: [
              Text(m.managed ? tr('مزارعٌ بلا جوّال، ينتظر اعتماد الإدارة', 'A farmer without a phone, awaiting the administrators') : '…${m.phoneTail}', textDirection: m.managed ? null : TextDirection.ltr),
              Muted('${m.scopesLabel} · ${m.requested}'),
              Align(
                alignment: AlignmentDirectional.centerEnd,
                child: TextButton(onPressed: () => _end(m, pending: true), child: Text(tr('اسحب الطلب', 'Withdraw'))),
              ),
            ]),
          ),
      ],
      if (b.past.isNotEmpty) ...[
        const SizedBox(height: 8),
        SectionTitle(tr('ما مضى', 'Past')),
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
      title: tr('اعتراض', 'Object'),
      label: tr('لماذا؟ يقرؤه الوكيل', 'Why? The agent reads it'),
      help: objectionNote(stage: w.isStage),
      action: tr('أعترض', 'Object'),
      minLength: 3,
      maxLength: 500,
      lines: 3,
    );
    if (reason != null) await _run(() => widget.api.object(w.id, reason));
  }

  @override
  Widget build(BuildContext context) {
    return SignedInGate(
      why: tr('ادخل لترى من يطلب أن يعمل عنك، ومن يعمل عنك، وما كتبه باسمك.', 'Sign in to see who asks to act for you, who acts for you, and what they wrote in your name.'),
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
                  IntroNote(
                    tr('جمعيّةٌ أو شركةٌ موثّقة تستطيع أن تسجّل أرضك وترفع أوراقها وتتابع مواسمك وقطيعك عنك، إن أذنت لها. لا تعمل '
                    'إلا في ما أذنت فيه، وتُنهيه متى شئت، وما كتبته باسمك تراه هنا ويبقى لك.', 'A verified cooperative or company can register your land, upload its papers and follow your seasons and herds for you, if you allow it. It acts only in what you allowed, you end it whenever you like, and what it wrote in your name you see here and it stays yours.'),
                    icon: Icons.handshake_outlined,
                  ),
                  if (v.pending.isNotEmpty) ...[
                    const SizedBox(height: 16),
                    SectionTitle(tr('يطلبون إذنك', 'Asking for your permission')),
                    for (final m in v.pending) _pendingCard(m),
                  ],
                  const SizedBox(height: 16),
                  SectionTitle(tr('يعملون عنك الآن', 'Acting for you now')),
                  if (v.active.isEmpty) Muted(tr('لا أحد.', 'No one.')),
                  for (final m in v.active)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: InfoCard(children: [
                        Text(m.companyName, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900)),
                        Muted(tr('${m.companyPhone} · ${m.scopesLabel} · منذ ${m.since}', '${m.companyPhone} · ${m.scopesLabel} · since ${m.since}')),
                        Align(
                          alignment: AlignmentDirectional.centerEnd,
                          child: TextButton(
                            onPressed: () async {
                              if (await askSure(context,
                                  title: tr('أنهِ الإذن', 'End the permission'), message: tr('يتوقّف «${m.companyName}» عن العمل عنك. وما سُجّل باسمك يبقى لك.', '«${m.companyName}» stops acting for you. What was recorded in your name stays yours.'), action: tr('أنهِ', 'End'))) {
                                await _run(() => widget.api.endMine(m.id));
                              }
                            },
                            child: Text(tr('أنهِ الإذن', 'End the permission')),
                          ),
                        ),
                      ]),
                    ),
                  const SizedBox(height: 16),
                  SectionTitle(tr('ما كتبه الوكلاء باسمك', 'What agents wrote in your name')),
                  if (v.writes.isEmpty) Muted(tr('لا شيء.', 'Nothing.')),
                  for (final w in v.writes) _writeTile(w),
                  if (v.past.isNotEmpty) ...[
                    const SizedBox(height: 16),
                    SectionTitle(tr('ما مضى', 'Past')),
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
        Text(tr('يطلب أن يعمل عنك في:', 'Asks to act for you in:'), style: TextStyle(fontWeight: FontWeight.w700)),
        for (final s in m.scopesLong) Text('• $s', style: const TextStyle(height: 1.7)),
        const SizedBox(height: 6),
        Text(tr('سببه: ${m.note}', 'Their reason: ${m.note}'), style: const TextStyle(height: 1.7)),
        const SizedBox(height: 6),
        Muted(
          tr('لا يحذف شيئاً من مالك، ولا ينقل أرضك إلى غيرك، ولا يعرضها على المستثمرين. اقبل فقط إن كنت تعرف هذه الجهة.', 'It cannot delete anything of yours, move your land to anyone else, or offer it to investors. Accept only if you know this organisation.'),
        ),
        const SizedBox(height: 8),
        Wrap(spacing: 8, children: [
          FilledButton(onPressed: () => _run(() => widget.api.answer(m.id, accept: true)), child: Text(tr('أقبل', 'Accept'))),
          OutlinedButton(onPressed: () => _run(() => widget.api.answer(m.id, accept: false)), child: Text(tr('أعتذر', 'Decline'))),
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
              WarnText(tr('اعترضت: ${w.objectionReason}${w.reopened ? ' — وفُتحت المرحلة من جديد.' : ''}', 'You objected: ${w.objectionReason}${w.reopened ? ' — and the stage opened again.' : ''}')),
            Wrap(spacing: 6, children: [
              if (w.seasonId != null)
                TextButton(onPressed: () => openOnSite(context, '/seasons/${w.seasonId}'), child: Text(tr('الموسم', 'Season'))),
              if (w.canObject) TextButton(onPressed: () => _object(w), child: Text(tr('اعتراض', 'Object'))),
            ]),
          ],
        ),
      ),
    );
  }
}
