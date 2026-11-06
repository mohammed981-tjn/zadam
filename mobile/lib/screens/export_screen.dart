import 'package:flutter/material.dart';

import '../account.dart';
import '../api.dart';
import '../export.dart';
import '../prices.dart' show arDay;
import '../theme.dart';
import '../ui.dart';
import 'prices_screen.dart' show BoardHero, BoardView, PanelCard, SourceLink, openSite;

/// التصدير (البند ٢٠٣): the website's export file in the app — choose the
/// product, then the destination; see what that pair asks for, each document
/// with its mode and the day it took effect, and when its rules were last
/// checked and against what; and the reader's own offers, each with the
/// readiness the database computes, saved and moved as on the website.
class ExportScreen extends StatefulWidget {
  const ExportScreen({super.key, this.client});

  /// A stand-in for tests; the real client otherwise.
  final ExportClient? client;

  @override
  State<ExportScreen> createState() => _ExportScreenState();
}

class _ExportScreenState extends State<ExportScreen> with SingleTickerProviderStateMixin {
  late final ExportClient _client = widget.client ?? ExportClient();
  late final TabController _tabs = TabController(length: 3, vsync: this);
  late Future<ExportChoices> _choices = _client.choices();

  String? _commodity;
  String? _destination;

  /// Bumped when «احفظ عرضاً على هذا الطريق» carries the pair to the form.
  int _prefill = 0;

  void _reloadChoices() => setState(() => _choices = _client.choices());

  void _saveOnThisPair() {
    setState(() => _prefill++);
    _tabs.animateTo(1);
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('التصدير'),
        bottom: TabBar(
          controller: _tabs,
          tabs: const [Tab(text: 'الشروط'), Tab(text: 'عروضي'), Tab(text: 'الدراسة')],
        ),
      ),
      body: FutureBuilder<ExportChoices>(
        future: _choices,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) return const LoadingView();
          if (snap.hasError) {
            final e = snap.error;
            return StateView.error(e is ApiException ? e.message : 'تعذّر تحميل المنتجات والوجهات.', onRetry: _reloadChoices);
          }
          final choices = snap.data!;
          return TabBarView(
            controller: _tabs,
            children: [
              _RulesTab(
                client: _client,
                choices: choices,
                commodity: _commodity,
                destination: _destination,
                onCommodity: (v) => setState(() => _commodity = v),
                onDestination: (v) => setState(() => _destination = v),
                onSave: _saveOnThisPair,
              ),
              _OffersTab(
                client: _client,
                choices: choices,
                commodity: _commodity,
                destination: _destination,
                prefill: _prefill,
              ),
              BoardView<ExportStudy>(
                key: const PageStorageKey('export-study'),
                load: _client.study,
                build: (context, s, _) => studyView(context, s),
              ),
            ],
          );
        },
      ),
    );
  }
}

Widget _muted(BuildContext context, String text, {double size = 12.5}) =>
    Text(text, style: TextStyle(color: mutedOn(context), fontSize: size, height: 1.7));

/// The destination list under its region headings: a heading is a disabled item.
List<DropdownMenuItem<String>> destinationItems(BuildContext context, ExportChoices choices) => [
      for (final g in choices.grouped) ...[
        DropdownMenuItem<String>(
          value: 'group:${g.group}',
          enabled: false,
          child: Text(g.group, style: TextStyle(fontWeight: FontWeight.w800, color: mutedOn(context), fontSize: 12.5)),
        ),
        for (final d in g.items)
          DropdownMenuItem<String>(
            value: d.id,
            child: Padding(padding: const EdgeInsetsDirectional.only(start: 10), child: Text(d.label)),
          ),
      ],
    ];

// ═══════════════════════════════════════════════════════════════════════════
// الشروط والمستندات
// ═══════════════════════════════════════════════════════════════════════════

class _RulesTab extends StatefulWidget {
  const _RulesTab({
    required this.client,
    required this.choices,
    required this.commodity,
    required this.destination,
    required this.onCommodity,
    required this.onDestination,
    required this.onSave,
  });

  final ExportClient client;
  final ExportChoices choices;
  final String? commodity;
  final String? destination;
  final ValueChanged<String?> onCommodity;
  final ValueChanged<String?> onDestination;
  final VoidCallback onSave;

  @override
  State<_RulesTab> createState() => _RulesTabState();
}

class _RulesTabState extends State<_RulesTab> with AutomaticKeepAliveClientMixin {
  Future<CorridorRules>? _rules;
  String _pair = '';

  @override
  bool get wantKeepAlive => true;

  void _load() {
    final c = widget.commodity, d = widget.destination;
    final pair = c == null || d == null ? '' : '$c|$d';
    if (pair == _pair) return;
    _pair = pair;
    _rules = pair.isEmpty ? null : widget.client.corridor(c!, d!);
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    _load();
    final ch = widget.choices;
    final commodity = ch.commodities.where((c) => c.id == widget.commodity).firstOrNull;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 40),
      children: [
        const BoardHero(
          icon: Icons.local_shipping_outlined,
          title: 'ممرّ الصادر السوداني',
          text: 'أبوابُ العالم مفتوحةٌ أمام السودان بلا رسوم. والشحنات تُردّ. الفارقُ ليس السوق ولا الجمارك — بل الإثبات.',
        ),
        const SizedBox(height: 14),
        const IntroNote(
          'اختر المنتج ثمّ الوجهة، فترى ما تطلبه: كلّ مستندٍ بنوعه (إلزاميّ أو مشروط أو مستحسَن) وتاريخ سريانه، ومتى رُوجعت '
          'قواعد هذا الطريق آخر مرّة وعلى أيّ مصدر.',
        ),
        const SizedBox(height: 14),
        PanelCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              DropdownButtonFormField<String>(
                key: const Key('export-commodity'),
                initialValue: widget.commodity,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'المنتج'),
                items: [for (final c in ch.commodities) DropdownMenuItem(value: c.id, child: Text(c.label))],
                onChanged: widget.onCommodity,
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                key: const Key('export-destination'),
                initialValue: widget.destination,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'الوجهة'),
                items: destinationItems(context, ch),
                onChanged: widget.onDestination,
              ),
              if (widget.commodity != null && widget.destination != null) ...[
                const SizedBox(height: 10),
                _muted(context, ch.pairNote(widget.commodity!, widget.destination!)),
              ],
              if (commodity?.hsCode != null) _muted(context, 'البند الجمركي: ${commodity!.hsCode}'),
            ],
          ),
        ),
        const SizedBox(height: 14),
        if (_rules == null)
          _muted(context, 'الجاهزيّة تُحسب على عرضٍ محفوظ: احفظه مسوّدةً في «عروضي» فترى ما ينقصه بالاسم.')
        else
          FutureBuilder<CorridorRules>(
            key: ValueKey(_pair),
            future: _rules,
            builder: (context, snap) {
              if (snap.connectionState != ConnectionState.done) return const LoadingView(compact: true);
              if (snap.hasError) {
                final e = snap.error;
                return StateView.error(
                  e is ApiException ? e.message : 'تعذّر تحميل الشروط.',
                  compact: true,
                  onRetry: () => setState(() => _pair = ''),
                );
              }
              return CorridorView(rules: snap.data!, onSave: widget.onSave);
            },
          ),
      ],
    );
  }
}

/// What one pair asks for, in the website's words.
class CorridorView extends StatelessWidget {
  const CorridorView({super.key, required this.rules, this.onSave});
  final CorridorRules rules;
  final VoidCallback? onSave;

  @override
  Widget build(BuildContext context) {
    final save = onSave == null
        ? const SizedBox.shrink()
        : FilledButton.icon(
            onPressed: onSave,
            icon: const Icon(Icons.save_outlined, size: 20),
            label: const Text('احفظ عرضاً على هذا الطريق'),
          );
    if (!rules.studied) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const PanelCard(
            key: Key('corridor-unstudied'),
            gold: true,
            child: StateView(
              icon: Icons.help_outline_rounded,
              title: 'لم تُدرس شروط هذه الوجهة لهذا المنتج بعد',
              message: 'اسأل المصدّرَ المرخَّص عن مستنداتها. وإن حفظت عرضاً عليها فصفحته تقول ذلك صراحةً، ولا تقول «جاهز».',
              warn: true,
              compact: true,
            ),
          ),
          const SizedBox(height: 12),
          save,
        ],
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SectionTitle('المستندات المطلوبة اليوم'),
        for (final r in rules.inForce) Padding(padding: const EdgeInsets.only(bottom: 10), child: RequirementTile(r: r)),
        if (rules.upcoming.isNotEmpty) ...[
          const SizedBox(height: 4),
          const SectionTitle('تسري قريباً', subtitle: 'لائحةٌ أُقرّت ولم يحن موعدها: استعدّ لها من الآن.'),
          for (final r in rules.upcoming) Padding(padding: const EdgeInsets.only(bottom: 10), child: RequirementTile(r: r)),
        ],
        if (rules.rules != null) ...[
          const SizedBox(height: 4),
          PanelCard(
            key: const Key('corridor-review'),
            gold: rules.rules!.stale,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  rules.rules!.line,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    height: 1.6,
                    color: rules.rules!.stale ? warnOn(context) : inkOn(context),
                  ),
                ),
                if (rules.rules!.lastReviewedAt != null)
                  _muted(context, 'آخر مراجعة: ${arDay(rules.rules!.lastReviewedAt!.toIso8601String())} · عدد المراجعات: ${rules.rules!.reviewedCount}', size: 12),
                if (rules.rules!.sourceNote != null) ...[
                  const SizedBox(height: 6),
                  Text('روجعت على:', style: TextStyle(fontSize: 12, color: mutedOn(context), fontWeight: FontWeight.w700)),
                  SelectableText(rules.rules!.sourceNote!, style: const TextStyle(fontSize: 12.5, height: 1.75)),
                ],
              ],
            ),
          ),
        ],
        const SizedBox(height: 12),
        _muted(context, 'الجاهزيّة تُحسب على عرضٍ محفوظ: احفظه مسوّدةً فترى ما ينقصه بالاسم، ثمّ ترفع الأدلّة وترسله.'),
        const SizedBox(height: 8),
        save,
      ],
    );
  }
}

class RequirementTile extends StatelessWidget {
  const RequirementTile({super.key, required this.r});
  final Requirement r;

  @override
  Widget build(BuildContext context) {
    final pill = r.mode == 'required'
        ? TagPill(r.modeLabel, icon: Icons.priority_high_rounded)
        : r.mode == 'conditional'
            ? TagPill(r.modeLabel, gold: true)
            : Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: Theme.of(context).colorScheme.outline),
                ),
                child: Text(r.modeLabel, style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: mutedOn(context))),
              );
    return PanelCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Expanded(child: Text(r.name, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14))),
            const SizedBox(width: 8),
            pill,
          ]),
          if (r.note != null) ...[const SizedBox(height: 4), _muted(context, r.note!)],
          const SizedBox(height: 4),
          Row(children: [
            Icon(Icons.event_outlined, size: 14, color: mutedOn(context)),
            const SizedBox(width: 4),
            Expanded(child: _muted(context, r.dateLine, size: 12)),
          ]),
        ],
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// عروضي وجاهزيّتها
// ═══════════════════════════════════════════════════════════════════════════

class _OffersTab extends StatefulWidget {
  const _OffersTab({required this.client, required this.choices, required this.commodity, required this.destination, required this.prefill});
  final ExportClient client;
  final ExportChoices choices;
  final String? commodity;
  final String? destination;
  final int prefill;

  @override
  State<_OffersTab> createState() => _OffersTabState();
}

class _OffersTabState extends State<_OffersTab> with AutomaticKeepAliveClientMixin {
  Future<List<MyOffer>>? _offers;
  String? _token;

  @override
  bool get wantKeepAlive => true;

  void _reload() => setState(() => _offers = widget.client.offers());

  @override
  Widget build(BuildContext context) {
    super.build(context);
    return ValueListenableBuilder<Session?>(
      valueListenable: accountController,
      builder: (context, session, _) {
        if (session == null) {
          return const StateView(
            key: Key('offers-signed-out'),
            icon: Icons.lock_outline_rounded,
            title: 'ادخل إلى حسابك لترى عروضك',
            message: 'العروض لأصحابها: ادخل من «حسابي» ثمّ عُد إلى هنا لتحفظ عرضاً مسوّدةً وترى جاهزيّة مستنداته، وترسله للمراجعة.',
            scrollable: true,
          );
        }
        if (_offers == null || _token != session.accessToken) {
          _token = session.accessToken;
          _offers = widget.client.offers();
        }
        return RefreshIndicator(
          onRefresh: () async {
            _reload();
            try {
              await _offers;
            } catch (_) {
              // Shown by the builder.
            }
          },
          child: FutureBuilder<List<MyOffer>>(
            future: _offers,
            builder: (context, snap) {
              if (snap.connectionState != ConnectionState.done) return const LoadingView();
              if (snap.hasError) {
                final e = snap.error;
                return StateView.error(e is ApiException ? e.message : 'تعذّر تحميل عروضك.', onRetry: _reload, scrollable: true);
              }
              final offers = snap.data!;
              return ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 40),
                children: [
                  const BoardHero(
                    icon: Icons.inventory_2_outlined,
                    title: 'عروضي للتصدير',
                    text: 'يُحفظ العرض مسوّدةً أوّلاً. لا يراه أحدٌ حتى ترسله، ولا يُنشر حتى يراجعه موظّفٌ ويتأكّد أنّ أدلّتك تسند '
                        'ما تقوله. وجاهزيّة مستنداته تُحسب في القاعدة: الإلزاميُّ الناقص يعني «غير جاهز» مهما بلغت النسبة.',
                  ),
                  const SizedBox(height: 14),
                  OfferForm(
                    key: ValueKey('offer-form-${widget.prefill}'),
                    client: widget.client,
                    choices: widget.choices,
                    commodity: widget.commodity,
                    destination: widget.destination,
                    open: widget.prefill > 0 || offers.isEmpty,
                    onSaved: _reload,
                  ),
                  const SizedBox(height: 18),
                  const SectionTitle('عروضك'),
                  if (offers.isEmpty) _muted(context, 'لا عروضَ بعد.'),
                  for (final o in offers)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: OfferCard(offer: o, client: widget.client, onMoved: _reload),
                    ),
                ],
              );
            },
          ),
        );
      },
    );
  }
}

/// One offer and its readiness: «٧ من ٨ — وما هو الثامن».
class OfferCard extends StatefulWidget {
  const OfferCard({super.key, required this.offer, required this.client, required this.onMoved});
  final MyOffer offer;
  final ExportClient client;
  final VoidCallback onMoved;

  @override
  State<OfferCard> createState() => _OfferCardState();
}

class _OfferCardState extends State<OfferCard> {
  bool _busy = false;

  Future<void> _move(String to) async {
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _busy = true);
    try {
      final msg = await widget.client.move(widget.offer.id, to);
      messenger.showSnackBar(SnackBar(content: Text(msg)));
      widget.onMoved();
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final o = widget.offer;
    final r = o.readiness;
    return PanelCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(children: [
            Expanded(child: Text(o.reference, textDirection: TextDirection.ltr, textAlign: TextAlign.start, style: const TextStyle(fontFamily: 'monospace', fontSize: 13))),
            TagPill(o.statusLabel, gold: o.status == 'rejected' || o.status == 'withdrawn'),
          ]),
          const SizedBox(height: 4),
          if (o.commodity != null || o.destination != null)
            Text('${o.commodity ?? '—'} ← ${o.destination ?? '—'}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
          _muted(context, '${o.quantity} ${o.uom} · ${o.value} دولار'),
          _muted(context, o.statusHelp, size: 12),
          if (o.rejectionReason != null)
            Container(
              margin: const EdgeInsets.only(top: 8),
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(color: warnTintOn(context), borderRadius: BorderRadius.circular(12)),
              child: Text('سببُ الإعادة: ${o.rejectionReason}', style: TextStyle(color: warnOn(context), fontSize: 13, height: 1.6)),
            ),
          const SizedBox(height: 10),
          ReadinessPanel(readiness: r, lines: o.lines, rules: o.rules),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final (i, m) in o.moves.indexed)
                i == 0
                    ? FilledButton(onPressed: _busy ? null : () => _move(m.to), child: Text(m.label))
                    : OutlinedButton(onPressed: _busy ? null : () => _move(m.to), child: Text(m.label)),
              TextButton.icon(
                onPressed: () => openSite(context, '/export/offers/${o.id}'),
                icon: const Icon(Icons.open_in_new_rounded, size: 18),
                label: const Text('الأدلّة وسلسلة العهدة (في الموقع)'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// The verdict larger than the percentage, and the missing documents named —
/// the website's ReadinessPanel.
class ReadinessPanel extends StatelessWidget {
  const ReadinessPanel({super.key, required this.readiness, required this.lines, this.rules});
  final Readiness readiness;
  final List<ReadinessLine> lines;
  final RulesStatus? rules;

  @override
  Widget build(BuildContext context) {
    final r = readiness;
    final ready = r.ready && !r.unstudied;
    return Container(
      key: const Key('readiness'),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: ready ? leafTintOn(context) : Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(children: [
            const Expanded(child: Text('جاهزيّةُ المستندات', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13))),
            if (!r.unstudied) Text('${r.score}٪', style: TextStyle(color: mutedOn(context), fontSize: 13)),
          ]),
          const SizedBox(height: 4),
          Text(
            r.verdict,
            style: TextStyle(
              fontWeight: FontWeight.w800,
              fontSize: 14,
              height: 1.6,
              color: ready || r.unstudied ? inkOn(context) : warnOn(context),
            ),
          ),
          if (!r.unstudied) ...[
            const SizedBox(height: 8),
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: LinearProgressIndicator(
                value: r.score / 100,
                minHeight: 7,
                semanticsLabel: 'اكتمل ${r.score} بالمئة من وزن المستندات',
              ),
            ),
          ],
          if (lines.isNotEmpty) ...[
            const SizedBox(height: 10),
            for (final l in lines)
              Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(
                      l.satisfied ? Icons.check_circle_rounded : Icons.radio_button_unchecked_rounded,
                      size: 18,
                      color: l.satisfied ? textGreenOn(context) : warnOn(context),
                      semanticLabel: l.satisfied ? 'مرفوع' : 'ناقص',
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text.rich(TextSpan(children: [
                            TextSpan(text: l.name, style: TextStyle(fontSize: 13, fontWeight: l.satisfied ? FontWeight.w400 : FontWeight.w700)),
                            TextSpan(text: ' (${l.modeLabel})', style: TextStyle(fontSize: 11.5, color: mutedOn(context))),
                          ])),
                          if (l.note != null) _muted(context, l.note!, size: 11.5),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
          ],
          if (r.sourceNote != null) _muted(context, r.sourceNote!, size: 11.5),
          if (rules != null)
            Text(rules!.line, style: TextStyle(fontSize: 11.5, height: 1.6, color: rules!.stale ? warnOn(context) : mutedOn(context))),
        ],
      ),
    );
  }
}

/// «عرضٌ جديد»: the website's form, saved as a draft through the same checks.
class OfferForm extends StatefulWidget {
  const OfferForm({
    super.key,
    required this.client,
    required this.choices,
    required this.onSaved,
    this.commodity,
    this.destination,
    this.open = false,
  });

  final ExportClient client;
  final ExportChoices choices;
  final VoidCallback onSaved;
  final String? commodity;
  final String? destination;
  final bool open;

  @override
  State<OfferForm> createState() => _OfferFormState();
}

class _OfferFormState extends State<OfferForm> {
  late final OfferDraft _d = OfferDraft(commodityId: widget.commodity ?? '', destinationId: widget.destination ?? '');
  final _quantity = TextEditingController();
  final _price = TextEditingController();
  final _plot = TextEditingController();
  final _area = TextEditingController();
  final _lat = TextEditingController();
  final _lon = TextEditingController();
  final _boundary = TextEditingController();
  String? _message;
  bool _ok = false;
  bool _saving = false;

  @override
  void dispose() {
    for (final c in [_quantity, _price, _plot, _area, _lat, _lon, _boundary]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    _d
      ..quantity = _quantity.text
      ..unitPrice = _price.text
      ..plotRef = _plot.text
      ..areaHectares = _area.text
      ..latitude = _lat.text
      ..longitude = _lon.text
      ..boundary = _boundary.text;
    final problem = _d.problem;
    if (problem != null) {
      setState(() {
        _message = problem;
        _ok = false;
      });
      return;
    }
    setState(() => _saving = true);
    try {
      final msg = await widget.client.saveOffer(_d);
      if (!mounted) return;
      setState(() {
        _message = msg;
        _ok = true;
      });
      widget.onSaved();
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _message = e.message;
          _ok = false;
        });
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Widget _field(TextEditingController c, String label, {Key? key, String? hint, bool number = true, int lines = 1}) => Padding(
        padding: const EdgeInsets.only(top: 10),
        child: TextField(
          key: key,
          controller: c,
          minLines: lines,
          maxLines: lines == 1 ? 1 : lines + 2,
          keyboardType: number ? const TextInputType.numberWithOptions(decimal: true, signed: true) : TextInputType.text,
          textDirection: number ? TextDirection.ltr : null,
          decoration: InputDecoration(labelText: label, hintText: hint),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final ch = widget.choices;
    final grades = ch.grades.where((g) => g.commodityId == _d.commodityId).toList();
    return PanelCard(
      padding: EdgeInsets.zero,
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          key: const Key('offer-form'),
          initiallyExpanded: widget.open,
          leading: const IconChip(Icons.add_rounded, size: 36),
          title: const Text('عرضٌ جديد', style: TextStyle(fontWeight: FontWeight.w800)),
          subtitle: _muted(context, 'يُحفظ مسوّدة. ثمّ ترى جاهزيّة مستنداته وترسله للمراجعة.', size: 12),
          childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          children: [
            DropdownButtonFormField<String>(
              key: const Key('offer-commodity'),
              initialValue: _d.commodityId.isEmpty ? null : _d.commodityId,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'المنتج'),
              items: [for (final c in ch.commodities) DropdownMenuItem(value: c.id, child: Text(c.label))],
              onChanged: (v) => setState(() {
                _d.commodityId = v ?? '';
                _d.gradeId = '';
              }),
            ),
            const SizedBox(height: 10),
            DropdownButtonFormField<String>(
              key: const Key('offer-destination'),
              initialValue: _d.destinationId.isEmpty ? null : _d.destinationId,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'الوجهة'),
              items: destinationItems(context, ch),
              onChanged: (v) => setState(() => _d.destinationId = v ?? ''),
            ),
            if (_d.commodityId.isNotEmpty && _d.destinationId.isNotEmpty) ...[
              const SizedBox(height: 6),
              _muted(context, ch.pairNote(_d.commodityId, _d.destinationId), size: 12),
            ],
            if (grades.isNotEmpty) ...[
              const SizedBox(height: 10),
              DropdownButtonFormField<String>(
                key: ValueKey('offer-grade-${_d.commodityId}'),
                initialValue: _d.gradeId,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'الدرجة (اختياريّ)'),
                items: [
                  const DropdownMenuItem(value: '', child: Text('بلا درجة')),
                  for (final g in grades) DropdownMenuItem(value: g.id, child: Text(g.name)),
                ],
                onChanged: (v) => setState(() => _d.gradeId = v ?? ''),
              ),
            ],
            _field(_quantity, 'الكمّية', key: const Key('offer-quantity')),
            const SizedBox(height: 10),
            DropdownButtonFormField<String>(
              initialValue: _d.uom,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'الوحدة'),
              items: [
                const DropdownMenuItem(value: '', child: Text('الافتراضيّة للمنتج')),
                for (final u in ch.uoms) DropdownMenuItem(value: u.code, child: Text(u.name)),
              ],
              onChanged: (v) => setState(() => _d.uom = v ?? ''),
            ),
            _field(_price, 'سعر الوحدة (دولار)', key: const Key('offer-price')),
            const SizedBox(height: 14),
            Text('المنشأ', style: TextStyle(fontWeight: FontWeight.w800, color: textGreenOn(context))),
            _muted(context, 'اللائحة الأوروبيّة تطلب إحداثيّة القطعة، ومضلّع حدودها إن زادت على أربعة هكتارات.', size: 12),
            _field(_plot, 'اسم القطعة أو رقمها', key: const Key('offer-plot'), number: false),
            _field(_area, 'المساحة (هكتار، اختياريّ)'),
            _field(_lat, 'خطّ العرض', key: const Key('offer-lat'), hint: '13.183333'),
            _field(_lon, 'خطّ الطول', key: const Key('offer-lon'), hint: '30.216667'),
            _field(_boundary, 'حدود القطعة GeoJSON (للأكبر من ٤ هكتارات)', number: false, lines: 2),
            if (_message != null) ...[
              const SizedBox(height: 10),
              Text(
                _message!,
                key: const Key('offer-message'),
                style: TextStyle(color: _ok ? textGreenOn(context) : warnOn(context), fontSize: 13, height: 1.7, fontWeight: FontWeight.w600),
              ),
            ],
            const SizedBox(height: 12),
            FilledButton(
              key: const Key('offer-submit'),
              onPressed: _saving ? null : _save,
              child: Text(_saving ? 'جارٍ الحفظ…' : 'احفظ مسوّدة'),
            ),
          ],
        ),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// دراسة الممرّ — the website's /export
// ═══════════════════════════════════════════════════════════════════════════

/// The study as the website's /export lays it out: the headline figures, the
/// paradox, what Sudan sells, the four gates, the money knot, the coming
/// regulations with their dates, and the study's limits — each with its source.
List<Widget> studyView(BuildContext context, ExportStudy s) {
  Widget para(String t) => Text(t, style: TextStyle(fontSize: 13.5, height: 1.85, color: inkOn(context)));
  Widget title(String t) => Text(t, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15, height: 1.45));
  Widget cite(StudySource src) => SourceLink(src.url, label: 'المصدر: ${src.label}');
  return [
    const BoardHero(
      icon: Icons.public_rounded,
      title: 'ممرّ الصادر السوداني',
      text: 'أبوابُ العالم مفتوحةٌ أمام السودان بلا رسوم. والشحنات تُردّ. الفارقُ ليس السوق ولا الجمارك — بل الإثبات. '
          'كلُّ رقمٍ هنا مقروءٌ من غيرنا، ومعه مصدره.',
    ),
    for (final f in s.headline)
      PanelCard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(f.value, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: accentOn(context))),
          title(f.label),
          if (f.note != null) _muted(context, f.note!),
          cite(f.source),
        ]),
      ),
    const SectionTitle('المفارقة: بابٌ مفتوح وشحنةٌ ترتدّ'),
    PanelCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        para('يُظنّ أن عائق الصادر السوداني هو الرسوم أو الحظر. ليس كذلك. ترتيب «كل شيء عدا السلاح» يمنح أقلَّ البلدان نمواً — '
            'والسودان منها — دخولاً بلا رسومٍ وبلا حصص لكل المنتجات عدا الأسلحة. وفي لائحة الأفضليات الجديدة السارية من أول '
            'يناير 2027، بقي هذا الترتيب وحده بلا تاريخ انتهاء. ومع ذلك تُردّ الشحنات:'),
        const SizedBox(height: 6),
        for (final p in s.rejectionPoints) para('• $p'),
        cite(s.rejectionSource),
        const SizedBox(height: 6),
        para('حين تكون الرسوم صفراً ويبقى الرفض قائماً، فالقيدُ ليس تجارياً بل إثباتيّ. والقيد الإثباتي — على خلاف الرسوم '
            'والحصص — مسألةُ سجلّاتٍ مرتبطةٍ ومُوقَّتةٍ ومحفوظة، لا مسألةَ تفاوضٍ بين دول.'),
      ]),
    ),
    const SectionTitle('ما يبيعه السودان'),
    for (final c in s.commodities)
      PanelCard(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [Expanded(child: title(c.name)), if (c.share != null) TagPill(c.share!)]),
          _muted(context, 'السوق: ${c.markets}'),
          _muted(context, 'ما يحكم قبولها: ${c.gate}'),
        ]),
      ),
    cite(s.commoditiesSource),
    if (s.beyond.isNotEmpty)
      _muted(context, 'وما وراء هذه: ${s.beyond.join(' · ')}. وكلُّها تمرّ من البوّابات نفسها — فمن يجتازها لسلعةٍ يجتازها لبقيّتها.'),
    const SectionTitle(
      'البوّابات الأربع',
      subtitle: 'كل شحنةٍ مغادرة تمرّ بأربع بوّاباتٍ مستقلّة. وتعطّلُ واحدةٍ يوقف الصفقة كلَّها مهما سلمت البقية — ولذلك '
          'يُستعدّ لأربعتها معاً لا لأسهلها.',
    ),
    for (final g in s.gates)
      PanelCard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(g.n, style: TextStyle(fontSize: 12, color: textGreenOn(context), fontWeight: FontWeight.w700)),
          title(g.title),
          for (final p in g.body) Padding(padding: const EdgeInsets.only(top: 4), child: para(p)),
          const SizedBox(height: 4),
          _muted(context, 'من يحملها: ${g.holder}'),
          cite(g.source),
        ]),
      ),
    const SectionTitle('العقدة المالية — ولماذا الإثبات يساوي سعراً'),
    PanelCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        for (final p in s.moneyKnot) Padding(padding: const EdgeInsets.only(bottom: 6), child: para(p)),
        cite(s.moneyKnotSource),
      ]),
    ),
    const SectionTitle(
      'نافذةٌ تُغلق: اللوائح القادمة',
      subtitle: 'ما يجعل هذا التوقيت مختلفاً أن أوروبا تنقل عبء الإثبات من الجمرك إلى المورِّد، بمواعيدَ محدَّدة.',
    ),
    for (final d in s.deadlines)
      PanelCard(
        key: ValueKey('study-deadline-${d.what}'),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(child: title(d.what)),
            const SizedBox(width: 8),
            Flexible(child: TagPill(d.when, gold: true, icon: Icons.event_outlined)),
          ]),
          const SizedBox(height: 4),
          _muted(context, 'ما يطلبه: ${d.asks}'),
          _muted(context, 'أثره: ${d.effect}'),
          cite(d.source),
        ]),
      ),
    const SectionTitle('ماذا يعني هذا لمن ينتج'),
    PanelCard(
      child: para('أن ما يُطلب منك ليس بضاعةً أفضل، بل سجلّاً أوضح: من أين جاءت، ومتى، وبأيّ إحداثيّة، ومن شهد عليها، وبأيّ ورقةٍ '
          'تسافر. وهذه كلُّها أشياء تُسجَّل وقت العمل أو لا تُسجَّل أبداً — فصورةُ مرحلةٍ لم تُلتقط في حينها لا تُصنع بعد الحصاد.'),
    ),
    const SectionTitle('حدود هذه الدراسة'),
    for (final l in s.limits)
      PanelCard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          title(l.title),
          _muted(context, l.body),
          cite(l.source),
        ]),
      ),
  ];
}
