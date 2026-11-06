/// «عقودي» (البند ٢٠٣): every contract the reader is a party to — partnership agreements, forward contracts and
/// service contracts — with what waits for them, each opening to its full text, terms, phases and status, and to
/// signing or declining where the website lets this person do so. A new contract is written on the website.
library;

import 'package:flutter/material.dart';

import '../account.dart';
import '../api.dart';
import '../contracts.dart';
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
            const Padding(
              padding: EdgeInsets.fromLTRB(20, 0, 20, 8),
              child: Text('العقد الجديد يُكتب على الموقع، ثمّ تقرؤه وتوقّعه هنا.', textAlign: TextAlign.center),
            ),
            ListTile(
              leading: const Icon(Icons.handyman_outlined),
              title: const Text('عقد خدمة'),
              subtitle: const Text('مع مقدّم خدمة موثّق، على موسمك أو قطيعك'),
              onTap: () {
                Navigator.pop(ctx);
                openOnSite(context, '/contracts/new');
              },
            ),
            ListTile(
              leading: const Icon(Icons.event_available_outlined),
              title: const Text('عقد آجل'),
              subtitle: const Text('سعرٌ معروفٌ قبل الحصاد، بين المشتري والمزارع'),
              onTap: () {
                Navigator.pop(ctx);
                openOnSite(context, '/market/forward/new');
              },
            ),
            ListTile(
              leading: const Icon(Icons.handshake_outlined),
              title: const Text('عقد شراكة'),
              subtitle: const Text('يُفتح من طلب شراكةٍ قَبِله صاحب الأرض، في «الاستثمار»'),
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
        title: const Text('عقودي'),
        actions: [
          if (_signedIn)
            IconButton(tooltip: 'عقد جديد', icon: const Icon(Icons.add_circle_outline), onPressed: _newContract),
        ],
      ),
      body: !_signedIn
          ? ListView(
              padding: const EdgeInsets.all(16),
              children: [
                const StateView(
                  icon: Icons.lock_outline,
                  title: 'ادخل لترى عقودك',
                  message: 'عقودك بين طرفيها وحدهما. ادخل بحسابك في الموقع نفسه لتقرأها وتوقّعها.',
                  compact: true,
                ),
                FilledButton.icon(
                  icon: const Icon(Icons.login),
                  label: const Text('ادخل إلى حسابك'),
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
                      e is ApiException ? e.message : 'تعذّر تحميل العقود.',
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
              const Text('عقودك كلّها في مكانٍ واحد', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
              const SizedBox(height: 6),
              const Text(
                'تقرأ نصّ كلّ عقدٍ وشروطه ومراحله، وتوقّع أو تعتذر حيث يحقّ لك. والمنصّة تحفظ التواقيع وما جرى، '
                'ولا تحمل مالاً: الدفع بين الطرفين مباشرةً.',
                style: TextStyle(height: 1.7, fontSize: 13),
              ),
              if (waiting > 0) ...[const SizedBox(height: 10), TagPill('$waiting ينتظر خطوتك', icon: Icons.edit_note)],
            ],
          ),
        ),
        const SizedBox(height: 16),
        if (data.isEmpty)
          StateView(
            icon: Icons.description_outlined,
            title: 'لا توجد عقود بعد',
            message:
                'عقد الخدمات يربطك بمكتب هندسة زراعية أو مزوّد موثّق، ويقسّم العمل إلى مراحل لكل منها تاريخ ومبلغ. '
                'والعقد الآجل سعرٌ معروف قبل الحصاد. وعقد الشراكة يُكتب بعد أن يقبل صاحب الأرض طلبك.',
            compact: true,
          ),
        if (data.agreements.isNotEmpty) ...[
          const SectionTitle('عقود الشراكة', subtitle: 'بين المستثمر وصاحب الأرض، وتوقَّع بالإصبع والاسم'),
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
                        const TagPill('ينتظر توقيعك', icon: Icons.draw_outlined),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          const SizedBox(height: 8),
        ],
        if (data.forwardDisputes.isNotEmpty) ...[
          const SectionTitle('نزاعاتٌ تنتظر الإدارة'),
          for (final f in data.forwardDisputes) _ForwardTile(row: f, me: data.me, api: api, open: open),
        ],
        if (openForward.isNotEmpty || closedForward.isNotEmpty) ...[
          const SectionTitle('العقود الآجلة', subtitle: 'يقترحه أحدكما ويوقّعه الآخر، ولا تتغيّر شروطه بعد ذلك'),
          for (final f in openForward) _ForwardTile(row: f, me: data.me, api: api, open: open),
          if (closedForward.isNotEmpty) ...[
            Padding(padding: const EdgeInsets.only(bottom: 8), child: Muted('ما أُقفل')),
            for (final f in closedForward) _ForwardTile(row: f, me: data.me, api: api, open: open),
          ],
          const SizedBox(height: 8),
        ],
        if (data.service.isNotEmpty) ...[
          const SectionTitle('عقود الخدمات', subtitle: 'كل عقد مقسّم إلى مراحل، وكل مرحلة تُدفع بعد إثبات تنفيذها'),
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
                            Muted('${c.providerName ?? 'مقدّم خدمة'} — ${c.statusLabel}', size: 12),
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
        OutlinedButton.icon(onPressed: onNew, icon: const Icon(Icons.add), label: const Text('عقد جديد (على الموقع)')),
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
                '${row.crop} · ${amount(row.quantity)} ${row.unit} · ${amount(row.price)} ${row.currency} للوحدة',
                style: const TextStyle(fontWeight: FontWeight.w800),
              ),
              Muted('التسليم: ${day(row.deliveryFrom)} – ${day(row.deliveryTo)} · ${row.place}', size: 12),
              if (mine) ...[
                const SizedBox(height: 8),
                Text(
                  'ينتظرك',
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
