/// «عقودي» (البند ٢٠٣): every contract the reader is a party to — partnership agreements, forward contracts and
/// service contracts — with what waits for them, each opening to its full text, terms, phases and status, and to
/// signing or declining where the website lets this person do so. A new contract is written on the website.
library;

import 'package:flutter/material.dart';

import '../account.dart';
import '../api.dart';
import '../contracts.dart';
import '../i18n.dart';
import '../theme.dart';
import '../ui.dart';
import 'account_screen.dart' show AccountScreen, openOnSite;
import 'contract_detail_screen.dart';
import 'deal_ui.dart';

class ContractsScreen extends StatefulWidget {
  const ContractsScreen({super.key, this.api});

  /// The routes; a stand-in in tests. When one is given the screen does not ask for the phone's session.
  final ContractsApi? api;

  @override
  State<ContractsScreen> createState() => _ContractsScreenState();
}

class _ContractsScreenState extends State<ContractsScreen> {
  late final ContractsApi _api = widget.api ?? ContractsApi();
  Future<ContractsOverview>? _data;

  bool get _signedIn => widget.api != null || accountController.value != null;

  @override
  void initState() {
    super.initState();
    if (_signedIn) _data = _api.overview();
  }

  void _reload() => setState(() {
    _data = _api.overview();
  });

  Future<void> _open(Widget screen) async {
    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => screen));
    if (mounted) _reload();
  }

  void _newContract() {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: EdgeInsets.fromLTRB(20, 0, 20, 8),
              child: Text(tr('العقد الجديد يُكتب على الموقع، ثمّ تقرؤه وتوقّعه هنا.', 'A new contract is written on the website, then you read it and sign it here.'), textAlign: TextAlign.center),
            ),
            ListTile(
              leading: const Icon(Icons.handyman_outlined),
              title: Text(tr('عقد خدمة', 'Service contract')),
              subtitle: Text(tr('مع مقدّم خدمة موثّق، على موسمك أو قطيعك', 'With a verified service provider, on your season or herd')),
              onTap: () {
                Navigator.pop(ctx);
                openOnSite(context, '/contracts/new');
              },
            ),
            ListTile(
              leading: const Icon(Icons.event_available_outlined),
              title: Text(tr('عقد آجل', 'Forward contract')),
              subtitle: Text(tr('سعرٌ معروفٌ قبل الحصاد، بين المشتري والمزارع', 'A price known before harvest, between the buyer and the farmer')),
              onTap: () {
                Navigator.pop(ctx);
                openOnSite(context, '/market/forward/new');
              },
            ),
            ListTile(
              leading: const Icon(Icons.handshake_outlined),
              title: Text(tr('عقد شراكة', 'Partnership contract')),
              subtitle: Text(tr('يُفتح من طلب شراكةٍ قَبِله صاحب الأرض، في «الاستثمار»', 'Opened from a partnership request the land owner accepted, in «Investment»')),
              onTap: () => Navigator.pop(ctx),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(tr('عقودي', 'My contracts')),
        actions: [
          if (_signedIn)
            IconButton(tooltip: tr('عقد جديد', 'New contract'), icon: const Icon(Icons.add_circle_outline), onPressed: _newContract),
        ],
      ),
      body: !_signedIn
          ? ListView(
              padding: const EdgeInsets.all(16),
              children: [
                StateView(
                  icon: Icons.lock_outline,
                  title: tr('ادخل لترى عقودك', 'Sign in to see your contracts'),
                  message: tr('عقودك بين طرفيها وحدهما. ادخل بحسابك في الموقع نفسه لتقرأها وتوقّعها.', 'Your contracts are between their two parties only. Sign in with your account on the website to read and sign them.'),
                  compact: true,
                ),
                FilledButton.icon(
                  icon: const Icon(Icons.login),
                  label: Text(tr('ادخل إلى حسابك', 'Sign in to your account')),
                  onPressed: () async {
                    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => const AccountScreen()));
                    if (mounted && accountController.value != null) _reload();
                  },
                ),
              ],
            )
          : RefreshIndicator(
              onRefresh: () async => _reload(),
              child: FutureBuilder<ContractsOverview>(
                future: _data,
                builder: (context, snap) {
                  if (snap.connectionState != ConnectionState.done) return const LoadingView();
                  if (snap.hasError) {
                    final e = snap.error;
                    return StateView.error(
                      e is ApiException ? e.message : tr('تعذّر تحميل العقود.', 'Could not load the contracts.'),
                      onRetry: _reload,
                      scrollable: true,
                    );
                  }
                  return _Overview(data: snap.data!, api: _api, open: _open, onNew: _newContract);
                },
              ),
            ),
    );
  }
}

class _Overview extends StatelessWidget {
  const _Overview({required this.data, required this.api, required this.open, required this.onNew});
  final ContractsOverview data;
  final ContractsApi api;
  final Future<void> Function(Widget) open;
  final VoidCallback onNew;

  @override
  Widget build(BuildContext context) {
    final waiting = data.waitingForMe;
    final openForward = [
      for (final f in data.forward)
        if (f.open) f,
    ];
    final closedForward = [
      for (final f in data.forward)
        if (!f.open) f,
    ];
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
      children: [
        HeroBand(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(tr('عقودك كلّها في مكانٍ واحد', 'All your contracts in one place'), style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
              const SizedBox(height: 6),
              Text(
                tr('تقرأ نصّ كلّ عقدٍ وشروطه ومراحله، وتوقّع أو تعتذر حيث يحقّ لك. والمنصّة تحفظ التواقيع وما جرى، '
                'ولا تحمل مالاً: الدفع بين الطرفين مباشرةً.', 'You read each contract\'s text, terms and phases, and sign or decline where you are entitled to. The platform keeps the signatures and what happened, and holds no money: payment is directly between the two parties.'),
                style: TextStyle(height: 1.7, fontSize: 13),
              ),
              if (waiting > 0) ...[const SizedBox(height: 10), TagPill(tr('$waiting ينتظر خطوتك', '$waiting waiting for your step'), icon: Icons.edit_note)],
            ],
          ),
        ),
        const SizedBox(height: 16),
        if (data.isEmpty)
          StateView(
            icon: Icons.description_outlined,
            title: tr('لا توجد عقود بعد', 'No contracts yet'),
            message:
                tr('عقد الخدمات يربطك بمكتب هندسة زراعية أو مزوّد موثّق، ويقسّم العمل إلى مراحل لكل منها تاريخ ومبلغ. '
                'والعقد الآجل سعرٌ معروف قبل الحصاد. وعقد الشراكة يُكتب بعد أن يقبل صاحب الأرض طلبك.', 'A service contract links you with an agricultural engineering office or a verified provider, and splits the work into phases, each with a date and an amount. A forward contract is a price known before harvest. A partnership contract is written after the land owner accepts your request.'),
            compact: true,
          ),
        if (data.agreements.isNotEmpty) ...[
          SectionTitle(tr('عقود الشراكة', 'Partnership contracts'), subtitle: tr('بين المستثمر وصاحب الأرض، وتوقَّع بالإصبع والاسم', 'Between the investor and the land owner, signed with a finger and a name')),
          for (final a in data.agreements)
            DealCard(
              highlight: a.waitingForMe,
              children: [
                InkWell(
                  onTap: () => open(AgreementScreen(id: a.id, api: api)),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(a.title, style: const TextStyle(fontWeight: FontWeight.w800)),
                      const SizedBox(height: 4),
                      Muted('${partyRoleLabel[a.me] ?? ''} · ${a.statusLabel}${a.ref != null ? ' · ${a.ref}' : ''}'),
                      if (a.waitingForMe) ...[
                        const SizedBox(height: 8),
                        TagPill(tr('ينتظر توقيعك', 'Waiting for your signature'), icon: Icons.draw_outlined),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          const SizedBox(height: 8),
        ],
        if (data.forwardDisputes.isNotEmpty) ...[
          SectionTitle(tr('نزاعاتٌ تنتظر الإدارة', 'Disputes awaiting the administration')),
          for (final f in data.forwardDisputes) _ForwardTile(row: f, me: data.me, api: api, open: open),
        ],
        if (openForward.isNotEmpty || closedForward.isNotEmpty) ...[
          SectionTitle(tr('العقود الآجلة', 'Forward contracts'), subtitle: tr('يقترحه أحدكما ويوقّعه الآخر، ولا تتغيّر شروطه بعد ذلك', 'One of you proposes it and the other signs it, and its terms do not change after that')),
          for (final f in openForward) _ForwardTile(row: f, me: data.me, api: api, open: open),
          if (closedForward.isNotEmpty) ...[
            Padding(padding: const EdgeInsets.only(bottom: 8), child: Muted(tr('ما أُقفل', 'Closed'))),
            for (final f in closedForward) _ForwardTile(row: f, me: data.me, api: api, open: open),
          ],
          const SizedBox(height: 8),
        ],
        if (data.service.isNotEmpty) ...[
          SectionTitle(tr('عقود الخدمات', 'Service contracts'), subtitle: tr('كل عقد مقسّم إلى مراحل، وكل مرحلة تُدفع بعد إثبات تنفيذها', 'Each contract is split into phases, and each phase is paid after its work is proven')),
          for (final c in data.service)
            DealCard(
              children: [
                InkWell(
                  onTap: () => open(ServiceContractScreen(id: c.id, api: api)),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(c.title, style: const TextStyle(fontWeight: FontWeight.w700)),
                            const SizedBox(height: 2),
                            Muted(tr('${c.providerName ?? 'مقدّم خدمة'} — ${c.statusLabel}', '${c.providerName ?? 'Service provider'} — ${c.statusLabel}'), size: 12),
                          ],
                        ),
                      ),
                      Text('${money(c.total)} ${c.currency}', style: const TextStyle(fontWeight: FontWeight.w800)),
                    ],
                  ),
                ),
              ],
            ),
        ],
        const SizedBox(height: 12),
        OutlinedButton.icon(onPressed: onNew, icon: const Icon(Icons.add), label: Text(tr('عقد جديد (على الموقع)', 'New contract (on the website)'))),
      ],
    );
  }
}

class _ForwardTile extends StatelessWidget {
  const _ForwardTile({required this.row, required this.me, required this.api, required this.open});
  final ForwardRow row;
  final String me;
  final ContractsApi api;
  final Future<void> Function(Widget) open;

  @override
  Widget build(BuildContext context) {
    final mine = row.waitingFor(me);
    return DealCard(
      highlight: mine,
      children: [
        InkWell(
          onTap: () => open(ForwardContractScreen(id: row.id, api: api)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Muted('${row.ref} · ${row.side(me)} · ${row.statusLabel}', size: 12),
              const SizedBox(height: 4),
              Text(
                tr('${row.crop} · ${amount(row.quantity)} ${row.unit} · ${amount(row.price)} ${row.currency} للوحدة', '${row.crop} · ${amount(row.quantity)} ${row.unit} · ${amount(row.price)} ${row.currency} per unit'),
                style: const TextStyle(fontWeight: FontWeight.w800),
              ),
              Muted(tr('التسليم: ${day(row.deliveryFrom)} – ${day(row.deliveryTo)} · ${row.place}', 'Delivery: ${day(row.deliveryFrom)} – ${day(row.deliveryTo)} · ${row.place}'), size: 12),
              if (mine) ...[
                const SizedBox(height: 8),
                Text(
                  tr('ينتظرك', 'Waiting for you'),
                  style: TextStyle(color: textGreenOn(context), fontWeight: FontWeight.w800),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}
