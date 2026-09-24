/// النفير — العمل المشترك: الدعوات المفتوحة، والفزعة، وما أُنجز، والمؤشّرات.
///
/// The same board as /nafir on the website. Acts — answering a call, pledging,
/// signing the charter — happen on the website under the person's name, so
/// each item ends with the address of its page there.
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api.dart';
import '../nafir.dart';
import '../theme.dart';

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
      appBar: AppBar(title: const Text('النفير — العمل المشترك')),
      body: RefreshIndicator(
        onRefresh: () async => setState(() => _future = _api.nafirBoard()),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
          children: [
            Text(
              '«المؤمن للمؤمن كالبنيان يشدّ بعضه بعضاً». هنا يدعو المزارع '
              'جيرانه إلى حصادٍ أو تطهير قناة، ويطلب مَن أصابته جائحةٌ فزعةً '
              'غير مالية. قيمٌ يعرفها الريف السوداني — صارت أداةً أوسع.',
              style:
                  TextStyle(fontSize: 13, color: mutedOn(context), height: 1.8),
            ),
            const SizedBox(height: 16),
            FutureBuilder<NafirBoard>(
              future: _future,
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Padding(
                    padding: EdgeInsets.symmetric(vertical: 60),
                    child: Center(child: CircularProgressIndicator()),
                  );
                }
                if (snapshot.hasError) {
                  return Column(
                    children: [
                      Icon(Icons.cloud_off, size: 40, color: mutedOn(context)),
                      const SizedBox(height: 12),
                      Text('${snapshot.error}',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: mutedOn(context))),
                      const SizedBox(height: 16),
                      FilledButton(
                        onPressed: () =>
                            setState(() => _future = _api.nafirBoard()),
                        child: const Text('إعادة المحاولة'),
                      ),
                    ],
                  );
                }
                final b = snapshot.data!;
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const _Heading('دعواتٌ مفتوحة'),
                    if (b.open.isEmpty)
                      const _Empty(
                          'لا دعوة مفتوحة الآن. كن أوّل مَن يدعو — من الموقع.')
                    else
                      ...b.open.map((c) => _CallCard(
                            call: c,
                            joined: b.joined[c.id] ?? 0,
                          )),
                    if (b.faza.isNotEmpty) ...[
                      const SizedBox(height: 20),
                      const _Heading('يطلبون الفزعة'),
                      ...b.faza.map((r) => _FazaCard(request: r)),
                    ],
                    if (b.done.isNotEmpty) ...[
                      const SizedBox(height: 20),
                      const _Heading('ما أُنجز'),
                      ...b.done.map((c) => Card(
                            child: ListTile(
                              title: Text(c.outcome ?? c.title,
                                  style: const TextStyle(
                                      fontWeight: FontWeight.w700)),
                              subtitle: Text(
                                  '${c.kindLabel} · ${c.state} — ${c.locality} · حضره ${c.attended ?? 0}'),
                            ),
                          )),
                    ],
                    if (b.indicators != null) ...[
                      const SizedBox(height: 20),
                      const _Heading('هل تعمل القيم؟'),
                      _Indicators(i: b.indicators!),
                    ],
                    const SizedBox(height: 20),
                    const _SiteLink(
                      label: 'الميثاق والشورى ونبض الثقة على الموقع',
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
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(text,
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
      );
}

class _Empty extends StatelessWidget {
  const _Empty(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Text(text, style: TextStyle(color: mutedOn(context))),
        ),
      );
}

class _CallCard extends StatelessWidget {
  const _CallCard({required this.call, required this.joined});

  final NafirCall call;
  final int joined;

  @override
  Widget build(BuildContext context) {
    final primary = Theme.of(context).colorScheme.primary;
    final progress =
        call.needed == 0 ? 0.0 : (joined / call.needed).clamp(0.0, 1.0);
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () => _showDetails(context),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('${call.kindLabel} · ${call.state} — ${call.locality}',
                  style: TextStyle(fontSize: 12, color: primary)),
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
                      borderRadius: BorderRadius.circular(4),
                      child: LinearProgressIndicator(value: progress, minHeight: 6),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text('$joined من ${call.needed} لبّوا',
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
              Text('يدعو إليه ${call.displayName} · ${call.startsOn}',
                  style: TextStyle(color: mutedOn(context))),
              const SizedBox(height: 12),
              Text(call.description, style: const TextStyle(height: 1.8)),
              if (call.hosting != null) ...[
                const SizedBox(height: 10),
                Text('يقدّم المضيف: ${call.hosting}',
                    style: const TextStyle(fontWeight: FontWeight.w600)),
              ],
              if (call.bringTools != null) ...[
                const SizedBox(height: 6),
                Text('احمل معك: ${call.bringTools}',
                    style: const TextStyle(fontWeight: FontWeight.w600)),
              ],
              const SizedBox(height: 16),
              _SiteLink(label: 'لبِّ النداء من الموقع', path: '/nafir/${call.id}'),
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
    final accent = accentOn(context);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${request.causeLabel} · ${request.state} — ${request.locality}',
                style: TextStyle(fontSize: 12, color: accent)),
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
            _SiteLink(label: 'افزع له من الموقع', path: '/nafir/faza/${request.id}'),
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
        : '${(i.pledgesKept * 100 / i.pledgesTotal).round()}٪';
    final pulse = i.pulseTrustPeople != null
        ? '${i.pulseTrustPeople!.toStringAsFixed(1)} / ٥'
        : '${i.pulseCount} أجابوا';
    final tiles = <(String, String, String)>[
      ('وقّعوا الميثاق', '${i.signers}', 'منهم ${i.leaders} من القادة'),
      ('نفيرٌ أُنجز', '${i.nafirDone}', 'حضره ${i.attended}'),
      ('عهود الفزعة الموفاة', kept, '${i.pledgesKept} من ${i.pledgesTotal}'),
      ('أسئلة الشورى المُجابة', '${i.shuraAnswered} من ${i.shuraTotal}', ''),
      (
        'نبض الثقة',
        pulse,
        i.pulseTrustPeople == null ? 'يُعلن بعد ${i.pulseFloor} إجابات' : ''
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
                    Text(value,
                        style: TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.w900,
                            color: Theme.of(context).colorScheme.primary)),
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
          SnackBar(content: Text('نُسخ الرابط: $url')),
        );
      },
    );
  }
}
