/// النفير — العمل المشترك: الدعوات المفتوحة، والفزعة، وما أُنجز، والمؤشّرات.
///
/// The same board as /nafir on the website. Acts — answering a call, pledging,
/// signing the charter — happen on the website under the person's name, so
/// each item ends with the address of its page there.
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api.dart';
import '../i18n.dart';
import '../nafir.dart';
import '../theme.dart';
import '../ui.dart';

class NafirScreen extends StatefulWidget {
  const NafirScreen({super.key});

  @override
  State<NafirScreen> createState() => _NafirScreenState();
}

class _NafirScreenState extends State<NafirScreen> {
  final _api = SudagriApi();
  late Future<NafirBoard> _future;

  @override
  void initState() {
    super.initState();
    _future = _api.nafirBoard();
  }

  @override
  void dispose() {
    _api.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(tr('النفير — العمل المشترك', 'Nafir — working together'))),
      body: RefreshIndicator(
        onRefresh: () async => setState(() => _future = _api.nafirBoard()),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
          children: [
            IntroNote(
              tr('«المؤمن للمؤمن كالبنيان يشدّ بعضه بعضاً». هنا يدعو المزارع '
              'جيرانه إلى حصادٍ أو تطهير قناة، ويطلب مَن أصابته جائحةٌ فزعةً '
              'غير مالية. قيمٌ يعرفها الريف السوداني — صارت أداةً أوسع.', '“A believer to a believer is like a building whose parts hold each other up.” Here a farmer calls the neighbours to a harvest or to clear a canal, and someone struck by disaster asks for faza that is not money. Values the Sudanese countryside knows — made into a wider tool.'),
              icon: Icons.groups_outlined,
            ),
            const SizedBox(height: 16),
            FutureBuilder<NafirBoard>(
              future: _future,
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const LoadingView(compact: true);
                }
                if (snapshot.hasError) {
                  return StateView.error(
                    snapshot.error,
                    compact: true,
                    onRetry: () => setState(() => _future = _api.nafirBoard()),
                  );
                }
                final b = snapshot.data!;
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    _Heading(tr('دعواتٌ مفتوحة', 'Open calls')),
                    if (b.open.isEmpty)
                      _Empty(
                          tr('لا دعوة مفتوحة الآن. كن أوّل مَن يدعو — من الموقع.', 'No call is open now. Be the first to call one — from the website.'))
                    else
                      ...b.open.map((c) => _CallCard(
                            call: c,
                            joined: b.joined[c.id] ?? 0,
                          )),
                    if (b.faza.isNotEmpty) ...[
                      const SizedBox(height: 20),
                      _Heading(tr('يطلبون الفزعة', 'Asking for faza')),
                      ...b.faza.map((r) => _FazaCard(request: r)),
                    ],
                    if (b.done.isNotEmpty) ...[
                      const SizedBox(height: 20),
                      _Heading(tr('ما أُنجز', 'What got done')),
                      ...b.done.map((c) => Card(
                            child: ListTile(
                              title: Text(c.outcome ?? c.title,
                                  style: const TextStyle(
                                      fontWeight: FontWeight.w700)),
                              subtitle: Text(
                                  tr('${c.kindLabel} · ${c.state} — ${c.locality} · حضره ${c.attended ?? 0}', '${c.kindLabel} · ${c.state} — ${c.locality} · ${c.attended ?? 0} came')),
                            ),
                          )),
                    ],
                    if (b.indicators != null) ...[
                      const SizedBox(height: 20),
                      _Heading(tr('هل تعمل القيم؟', 'Are the values working?')),
                      _Indicators(i: b.indicators!),
                    ],
                    const SizedBox(height: 20),
                    _SiteLink(
                      label: tr('الميثاق والشورى ونبض الثقة على الموقع', 'The charter, the shura and the trust pulse on the website'),
                      path: '/nafir/charter',
                    ),
                  ],
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _Heading extends StatelessWidget {
  const _Heading(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => SectionTitle(text);
}

class _Empty extends StatelessWidget {
  const _Empty(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Row(
        children: [
          const IconChip(Icons.campaign_outlined, size: 40),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              text,
              style: TextStyle(color: mutedOn(context), height: 1.6),
            ),
          ),
        ],
      ),
    ),
  );
}

class _CallCard extends StatelessWidget {
  const _CallCard({required this.call, required this.joined});

  final NafirCall call;
  final int joined;

  @override
  Widget build(BuildContext context) {
    final primary = textGreenOn(context);
    final progress = call.needed == 0
        ? 0.0
        : (joined / call.needed).clamp(0.0, 1.0);
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => _showDetails(context),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '${call.kindLabel} · ${call.state} — ${call.locality}',
                style: TextStyle(
                  fontSize: 12,
                  color: primary,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 4),
              Text(call.title,
                  style: const TextStyle(
                      fontSize: 15, fontWeight: FontWeight.w700, height: 1.5)),
              const SizedBox(height: 4),
              Text(call.startsOn,
                  style: TextStyle(fontSize: 12, color: mutedOn(context))),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(6),
                      child: LinearProgressIndicator(
                        value: progress,
                        minHeight: 8,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(tr('$joined من ${call.needed} لبّوا', '$joined of ${call.needed} answered'),
                      style: const TextStyle(fontSize: 12)),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showDetails(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 28),
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(call.title,
                  style: const TextStyle(
                      fontSize: 18, fontWeight: FontWeight.w800, height: 1.5)),
              const SizedBox(height: 4),
              Text(tr('يدعو إليه ${call.displayName} · ${call.startsOn}', 'Called by ${call.displayName} · ${call.startsOn}'),
                  style: TextStyle(color: mutedOn(context))),
              const SizedBox(height: 12),
              Text(call.description, style: const TextStyle(height: 1.8)),
              if (call.hosting != null) ...[
                const SizedBox(height: 10),
                Text(tr('يقدّم المضيف: ${call.hosting}', 'The host provides: ${call.hosting}'),
                    style: const TextStyle(fontWeight: FontWeight.w600)),
              ],
              if (call.bringTools != null) ...[
                const SizedBox(height: 6),
                Text(tr('احمل معك: ${call.bringTools}', 'Bring with you: ${call.bringTools}'),
                    style: const TextStyle(fontWeight: FontWeight.w600)),
              ],
              const SizedBox(height: 16),
              _SiteLink(label: tr('لبِّ النداء من الموقع', 'Answer the call on the website'), path: '/nafir/${call.id}'),
            ],
          ),
        ),
      ),
    );
  }
}

class _FazaCard extends StatelessWidget {
  const _FazaCard({required this.request});

  final FazaRequest request;

  @override
  Widget build(BuildContext context) {
    final accent = warnOn(context);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '${request.causeLabel} · ${request.state} — ${request.locality}',
              style: TextStyle(
                fontSize: 12,
                color: accent,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 4),
            Text(request.title,
                style: const TextStyle(
                    fontSize: 15, fontWeight: FontWeight.w700, height: 1.5)),
            const SizedBox(height: 8),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final n in request.needs)
                  Chip(
                    label: Text(fazaNeeds[n] ?? n,
                        style: const TextStyle(fontSize: 12)),
                    visualDensity: VisualDensity.compact,
                  ),
              ],
            ),
            const SizedBox(height: 8),
            _SiteLink(label: tr('افزع له من الموقع', 'Help them on the website'), path: '/nafir/faza/${request.id}'),
          ],
        ),
      ),
    );
  }
}

class _Indicators extends StatelessWidget {
  const _Indicators({required this.i});

  final NafirIndicators i;

  @override
  Widget build(BuildContext context) {
    final kept = i.pledgesTotal == 0
        ? '—'
        : tr('${(i.pledgesKept * 100 / i.pledgesTotal).round()}٪', '${(i.pledgesKept * 100 / i.pledgesTotal).round()}%');
    final pulse = i.pulseTrustPeople != null
        ? tr('${i.pulseTrustPeople!.toStringAsFixed(1)} / ٥', '${i.pulseTrustPeople!.toStringAsFixed(1)} / 5')
        : tr('${i.pulseCount} أجابوا', '${i.pulseCount} answered');
    final tiles = <(String, String, String)>[
      (tr('وقّعوا الميثاق', 'Signed the charter'), '${i.signers}', tr('منهم ${i.leaders} من القادة', '${i.leaders} of them leaders')),
      (tr('نفيرٌ أُنجز', 'Nafirs completed'), '${i.nafirDone}', tr('حضره ${i.attended}', '${i.attended} came')),
      (tr('عهود الفزعة الموفاة', 'Faza pledges kept'), kept, tr('${i.pledgesKept} من ${i.pledgesTotal}', '${i.pledgesKept} of ${i.pledgesTotal}')),
      (tr('أسئلة الشورى المُجابة', 'Shura questions answered'), tr('${i.shuraAnswered} من ${i.shuraTotal}', '${i.shuraAnswered} of ${i.shuraTotal}'), ''),
      (
        tr('نبض الثقة', 'Trust pulse'),
        pulse,
        i.pulseTrustPeople == null ? tr('يُعلن بعد ${i.pulseFloor} إجابات', 'Shown after ${i.pulseFloor} answers') : ''
      ),
    ];
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final (label, value, note) in tiles)
          SizedBox(
            width: (MediaQuery.sizeOf(context).width - 40) / 2,
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(label,
                        style:
                            TextStyle(fontSize: 12, color: mutedOn(context))),
                    const SizedBox(height: 4),
                    Text(
                      value,
                      style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w900,
                        color: textGreenOn(context),
                      ),
                    ),
                    if (note.isNotEmpty)
                      Text(note,
                          style: TextStyle(
                              fontSize: 11, color: mutedOn(context))),
                  ],
                ),
              ),
            ),
          ),
      ],
    );
  }
}

/// The website address of an act, copyable: the app cannot answer a call
/// itself until it has sign-in, and a link the person can paste into a
/// browser is honest about where the act happens.
class _SiteLink extends StatelessWidget {
  const _SiteLink({required this.label, required this.path});

  final String label;
  final String path;

  @override
  Widget build(BuildContext context) {
    final url = ApiConfig.siteUrl.isEmpty ? path : '${ApiConfig.siteUrl}$path';
    return OutlinedButton.icon(
      icon: const Icon(Icons.copy, size: 18),
      label: Text(label),
      onPressed: () async {
        await Clipboard.setData(ClipboardData(text: url));
        if (!context.mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(tr('نُسخ الرابط: $url', 'Link copied: $url'))),
        );
      },
    );
  }
}
