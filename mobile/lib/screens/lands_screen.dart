import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api.dart';
import '../lands.dart';
import '../theme.dart';
import '../ui.dart';
import 'account_screen.dart' show openOnSite;
import 'evidence_sheet.dart';
import 'land_map_screen.dart';

/// «أراضيّ» (البند ٢٠٣): the person's lands as the website lists them, and each land's card.
///
/// From the list, «حدّد أرضاً جديدة» opens the map the app already draws a land on (LandMapScreen). A land opens
/// its card: the boundary on the satellite map, the area, the soil, the water from FAO's satellites, the nearest
/// climate station, the review and its note, the documents, whether it is listed and open to investors and partner
/// companies, the requests waiting on it, its water and soil tests and its seasons — and the owner's steps on it,
/// which go through the website's own functions.
class LandsScreen extends StatefulWidget {
  const LandsScreen({super.key, this.api});

  /// For tests; the app's signed-in account otherwise.
  final LandsApi? api;

  @override
  State<LandsScreen> createState() => _LandsScreenState();
}

class _LandsScreenState extends State<LandsScreen> {
  late final LandsApi _api = widget.api ?? LandsApi();
  late Future<List<LandSummary>> _lands = _api.mine();

  Future<void> _reload() async {
    final next = _api.mine();
    setState(() { _lands = next; });
    try {
      await next;
    } catch (_) {
      // Shown by the builder.
    }
  }

  Future<void> _add() async {
    final saved = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => const LandMapScreen()));
    if (saved == true && mounted) await _reload();
  }

  Future<void> _open(LandSummary l) async {
    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => LandCardScreen(id: l.id, name: l.name, api: _api)));
    if (mounted) await _reload();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('أراضيّ')),
      floatingActionButton: FloatingActionButton.extended(
        key: const Key('add-land'),
        onPressed: _add,
        icon: const Icon(Icons.add_location_alt),
        label: const Text('حدّد أرضاً جديدة'),
      ),
      body: FutureBuilder<List<LandSummary>>(
        future: _lands,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) return const LoadingView();
          if (snap.hasError) return StateView.error(snap.error, onRetry: _reload, scrollable: true);
          final lands = snap.data ?? const [];
          return RefreshIndicator(
            onRefresh: _reload,
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
              children: [
                const IntroNote(
                  'أرضك المسجّلة هي أساس كل موسم وكل فرصة تعرضها لاحقاً. لا تظهر لأحد حتى تعتمدها الإدارة، '
                  'وموقعها الدقيق لك وللإدارة وحدكما.',
                  icon: Icons.landscape_outlined,
                ),
                const SizedBox(height: 14),
                if (lands.isEmpty)
                  const StateView(
                    icon: Icons.landscape_outlined,
                    title: 'لم تسجّل أرضاً بعد',
                    message: 'ابدأ بأرض واحدة — التسجيل مجاني ولا يظهر لأحد حتى تعتمده الإدارة. '
                        'حدّدها بالمشي حولها أو بالنقر على الخريطة.',
                    compact: true,
                  )
                else
                  for (final (i, l) in lands.indexed)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: FadeIn(delay: i, child: _LandTile(land: l, onTap: () => _open(l))),
                    ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _LandTile extends StatelessWidget {
  const _LandTile({required this.land, required this.onTap});
  final LandSummary land;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final l = land;
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              IconChip(l.verified ? Icons.verified : Icons.landscape_outlined, warn: l.verification == 'rejected'),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(l.name, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                    const SizedBox(height: 2),
                    Text(
                      [
                        [l.state, ?l.locality].join(' · '),
                        '${l.feddans} فدان',
                        ?l.station,
                      ].join(' · '),
                      style: TextStyle(color: mutedOn(context), fontSize: 12.5, height: 1.6),
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        TagPill(l.verificationLabel, gold: !l.verified),
                        TagPill(l.documentsLine, icon: Icons.description_outlined),
                        if (l.listed) const TagPill('معروضة', icon: Icons.storefront_outlined),
                        if (l.openToInvestors == true) const TagPill('مفتوحة للمستثمرين', icon: Icons.handshake_outlined),
                        if (l.openToPartners == true) const TagPill('مفتوحة للشركات', icon: Icons.agriculture),
                      ],
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_left, color: mutedOn(context)),
            ],
          ),
        ),
      ),
    );
  }
}

const _satellite = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg';

/// One land's card.
class LandCardScreen extends StatefulWidget {
  const LandCardScreen({super.key, required this.id, this.name = '', this.api, this.pick});

  final String id;
  final String name;
  final LandsApi? api;

  /// The camera, the gallery and the file chooser (the phone's own when null).
  final EvidencePicker? pick;

  @override
  State<LandCardScreen> createState() => _LandCardScreenState();
}

class _LandCardScreenState extends State<LandCardScreen> {
  late final LandsApi _api = widget.api ?? LandsApi();
  late Future<LandCard> _card = _api.card(widget.id);
  late Future<LandWater> _water = _api.water(widget.id);
  bool _busy = false;

  Future<void> _reload() async {
    final next = _api.card(widget.id);
    setState(() { _card = next; });
    try {
      await next;
    } catch (_) {
      // Shown by the builder.
    }
  }

  /// One of the owner's steps: the website's sentence for what happened, then the card again.
  Future<void> _run(Future<String> Function() step) async {
    if (_busy) return;
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _busy = true);
    try {
      final message = await step();
      messenger.showSnackBar(SnackBar(content: Text(message)));
      await _reload();
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// «ارفع المستند»: the website's upload under «مستندات الأرض», a photo or a PDF.
  Future<void> _upload(LandCard c) async {
    final kinds = [for (final k in c.documentKinds) (k.key, k.label)];
    if (kinds.isEmpty) return;
    final message = await showEvidenceSheet(
      context,
      title: 'ارفع المستند',
      subtitle: c.name,
      kinds: kinds,
      pick: widget.pick,
      note: 'إثبات الحيازة أو العقد أو التصريح صورةً أو PDF حتى ١٠ ميجابايت. وصورة الأرض الملتقطة فيها يُحفظ وقتها ومكانها، ولا يبقيان في الملفّ نفسه.',
      send: (kind, caption, file) => _api.addDocument(
        widget.id,
        kind: kind,
        kindLabel: kinds.firstWhere((k) => k.$1 == kind).$2,
        caption: caption,
        file: file,
      ),
    );
    if (message == null || !mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
    await _reload();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.name.isEmpty ? 'بطاقة الأرض' : widget.name)),
      body: FutureBuilder<LandCard>(
        future: _card,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done && !snap.hasData) return const LoadingView();
          if (snap.hasError) return StateView.error(snap.error, onRetry: _reload, scrollable: true);
          final c = snap.data!;
          return RefreshIndicator(
            onRefresh: _reload,
            child: AbsorbPointer(
              absorbing: _busy,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
                children: [
                  _Header(card: c),
                  const SizedBox(height: 12),
                  _Facts(card: c),
                  if (c.boundary.length >= 3 || c.hasLocation) ...[
                    const SizedBox(height: 12),
                    _BoundaryMap(card: c),
                  ],
                  const SizedBox(height: 12),
                  _WaterBox(water: _water, onRetry: () => setState(() { _water = _api.water(widget.id); })),
                  const SizedBox(height: 12),
                  _DocumentsBox(card: c, onUpload: () => _upload(c)),
                  if (c.verified && c.listed) ...[
                    const SizedBox(height: 12),
                    const _OfferBox(),
                  ],
                  if (c.openToInvestors != null) ...[
                    const SizedBox(height: 12),
                    _InvestorsBox(card: c, api: _api, run: _run),
                  ],
                  const SizedBox(height: 12),
                  _PartnersBox(card: c, api: _api, run: _run),
                  const SizedBox(height: 12),
                  _TestsBox(card: c, api: _api, run: _run),
                  const SizedBox(height: 12),
                  _SeasonsBox(card: c),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

/// A titled card on the land's page.
class _Box extends StatelessWidget {
  const _Box({required this.title, required this.icon, required this.children, this.subtitle});
  final String title;
  final String? subtitle;
  final IconData icon;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                IconChip(icon, size: 34),
                const SizedBox(width: 10),
                Expanded(child: SectionTitle(title, subtitle: subtitle)),
              ],
            ),
            ...children,
          ],
        ),
      ),
    );
  }
}

class _Muted extends StatelessWidget {
  const _Muted(this.text);
  final String text;

  @override
  Widget build(BuildContext context) =>
      Text(text, style: TextStyle(color: mutedOn(context), fontSize: 12.5, height: 1.7));
}

class _Header extends StatelessWidget {
  const _Header({required this.card});
  final LandCard card;

  @override
  Widget build(BuildContext context) {
    final c = card;
    return HeroBand(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(c.name, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
          const SizedBox(height: 4),
          Text([c.state, ?c.locality, ?c.village].join(' · '), style: TextStyle(color: mutedOn(context))),
          const SizedBox(height: 10),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              TagPill(c.verificationLabel, gold: !c.verified, icon: c.verified ? Icons.verified : Icons.hourglass_top),
              TagPill(c.documentsLine, icon: Icons.description_outlined),
              TagPill(c.listed ? 'معروضة' : 'غير معروضة', gold: !c.listed),
              if (c.openToInvestors != null)
                TagPill(c.openToInvestors! ? 'مفتوحة للمستثمرين' : 'غير معروضة على المستثمرين', gold: !c.openToInvestors!),
              if (c.openToPartners != null)
                TagPill(c.openToPartners! ? 'مفتوحة للشركات الشريكة' : 'مغلقة أمام الشركات', gold: !c.openToPartners!),
            ],
          ),
          if (c.verificationNote != null) ...[
            const SizedBox(height: 10),
            Container(
              key: const Key('verification-note'),
              width: double.infinity,
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(color: warnTintOn(context), borderRadius: BorderRadius.circular(12)),
              child: Text('ملاحظة المراجعة: ${c.verificationNote}', style: const TextStyle(height: 1.7)),
            ),
          ],
        ],
      ),
    );
  }
}

class _Facts extends StatelessWidget {
  const _Facts({required this.card});
  final LandCard card;

  @override
  Widget build(BuildContext context) {
    final c = card;
    final facts = <(String, String)>[
      ('المساحة', '${c.feddans} فدان'),
      ('أقرب محطّة مناخ', c.station ?? '—'),
      ('مصدر المياه', c.waterSourceLabel ?? '—'),
      ('المياه للفدان', c.waterPerFeddan == null ? '—' : '${fmt0(c.waterPerFeddan!)} م³'),
      ('التربة', c.soilNote ?? '—'),
      (
        'التربة من الأقمار',
        c.soil == null
            ? 'تُقرأ حين يُعرف موقع الأرض'
            : '${c.soil!.name}${c.soil!.probability != null ? ' (احتمال ${c.soil!.probability}٪)' : ''}',
      ),
      ('زُرع سابقاً', c.previousCrops ?? '—'),
      ('الحيازة', c.tenure ?? '—'),
    ];
    return _Box(
      title: 'الأرض',
      icon: Icons.info_outline,
      children: [
        LayoutBuilder(
          builder: (context, box) {
            final w = (box.maxWidth - 12) / 2;
            return Wrap(
              spacing: 12,
              runSpacing: 10,
              children: [
                for (final (k, v) in facts)
                  SizedBox(
                    width: w,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(k, style: TextStyle(color: mutedOn(context), fontSize: 11.5)),
                        Text(v, style: const TextStyle(fontWeight: FontWeight.w700, height: 1.5)),
                      ],
                    ),
                  ),
              ],
            );
          },
        ),
        if (c.soil != null) ...[
          const SizedBox(height: 8),
          const _Muted('التربة من الأقمار تقديرٌ لا فحص، ويبقى فحص الماء والتربة عندك هو الأصل.'),
        ],
      ],
    );
  }
}

class _BoundaryMap extends StatelessWidget {
  const _BoundaryMap({required this.card});
  final LandCard card;

  @override
  Widget build(BuildContext context) {
    final c = card;
    final points = [for (final (lat, lng) in c.boundary) LatLng(lat, lng)];
    final centre = c.hasLocation ? LatLng(c.latitude!.toDouble(), c.longitude!.toDouble()) : null;
    final primary = Theme.of(context).colorScheme.primary;
    return _Box(
      title: 'الحدود على الخريطة',
      icon: Icons.map_outlined,
      subtitle: points.length >= 3
          ? 'كما رُسمت في التطبيق (${points.length} ركناً)${c.drawnFeddans != null ? ' تحيط بـ ${c.drawnFeddans!.toStringAsFixed(2)} فدان' : ''}.'
          : 'لم تُرسم حدودها بعد؛ النقطة موقعها المسجّل.',
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(14),
          child: SizedBox(
            height: 240,
            child: FlutterMap(
              options: MapOptions(
                initialCenter: centre ?? (points.isNotEmpty ? points.first : const LatLng(15.0, 32.5)),
                initialZoom: 16,
                maxZoom: 19,
                initialCameraFit: points.length >= 3
                    ? CameraFit.bounds(bounds: LatLngBounds.fromPoints(points), padding: const EdgeInsets.all(28))
                    : null,
              ),
              children: [
                TileLayer(urlTemplate: _satellite, maxNativeZoom: 16, userAgentPackageName: 'com.sudagri.app'),
                if (points.length >= 3)
                  PolygonLayer(polygons: [
                    Polygon(
                      points: points,
                      color: primary.withValues(alpha: 0.25),
                      borderColor: Colors.white,
                      borderStrokeWidth: 2,
                    ),
                  ])
                else if (centre != null)
                  MarkerLayer(markers: [
                    Marker(
                      point: centre,
                      width: 18,
                      height: 18,
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          color: primary,
                          shape: BoxShape.circle,
                          border: Border.all(color: Colors.white, width: 2),
                        ),
                      ),
                    ),
                  ]),
                const RichAttributionWidget(
                  attributions: [TextSourceAttribution('EOxCloudless 2016 — EOX IT Services (Copernicus Sentinel)')],
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 6),
        const _Muted('موقع الأرض وحدودها لك وللإدارة وحدكما.'),
      ],
    );
  }
}

class _WaterBox extends StatelessWidget {
  const _WaterBox({required this.water, required this.onRetry});
  final Future<LandWater> water;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return _Box(
      title: 'ماء أرضك من الأقمار الصناعيّة — الفاو',
      icon: Icons.water_drop_outlined,
      children: [
        FutureBuilder<LandWater>(
          future: water,
          builder: (context, snap) {
            if (snap.connectionState != ConnectionState.done) {
              return const LoadingView(label: 'يُقرأ ماء أرضك من أقمار الفاو…', compact: true);
            }
            if (snap.hasError) return StateView.error(snap.error, onRetry: onRetry, compact: true);
            final w = snap.data!;
            if (!w.located || w.rows.isEmpty) return _Muted(w.note);
            final head = TextStyle(color: mutedOn(context), fontSize: 11.5);
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const _Muted(
                  'ما خرج من الأرض فعلاً كلّ عشرة أيّام: نتح المحصول وتبخّر التربة معاً، كما قاسته أقمار الفاو. '
                  'حين يرتفع والمحصول قائم فهو يشرب؛ وحين يقترب من الصفر فالأرض بور أو عطشى.',
                ),
                const SizedBox(height: 8),
                Table(
                  columnWidths: const {0: FlexColumnWidth(2.2)},
                  children: [
                    TableRow(children: [
                      Text('الفترة', style: head),
                      Text('مم/يوم', style: head),
                      Text('م³ للفدان', style: head),
                      Text('للأرض كلّها', style: head),
                    ]),
                    for (final r in w.rows)
                      TableRow(children: [
                        Padding(padding: const EdgeInsets.symmetric(vertical: 4), child: Text(r.period)),
                        Text(r.mmPerDay.toStringAsFixed(1), style: const TextStyle(fontWeight: FontWeight.w700)),
                        Text(fmt0(r.m3PerFeddan)),
                        Text('${fmt0(r.m3Land)} م³'),
                      ]),
                  ],
                ),
                const SizedBox(height: 6),
                _Muted(w.note),
                if (w.source != null)
                  Align(
                    alignment: AlignmentDirectional.centerStart,
                    child: TextButton(
                      onPressed: () => launchUrl(Uri.parse(w.source!), mode: LaunchMode.externalApplication),
                      child: const Text('FAO WaPOR'),
                    ),
                  ),
              ],
            );
          },
        ),
      ],
    );
  }
}

class _DocumentsBox extends StatelessWidget {
  const _DocumentsBox({required this.card, required this.onUpload});
  final LandCard card;
  final VoidCallback onUpload;

  @override
  Widget build(BuildContext context) {
    final c = card;
    return _Box(
      title: 'مستندات الأرض',
      icon: Icons.description_outlined,
      subtitle: c.documentsLine,
      children: [
        Wrap(
          spacing: 6,
          runSpacing: 6,
          children: [
            for (final k in c.documentKinds) TagPill(k.have ? '✓ ${k.label}' : k.label, gold: !k.have),
          ],
        ),
        if (c.documents.isNotEmpty) ...[
          const SizedBox(height: 8),
          for (final d in c.documents)
            Padding(
              padding: const EdgeInsets.only(bottom: 2),
              child: _Muted(d.caption == null ? d.label : '${d.label} — ${d.caption}'),
            ),
        ],
        const SizedBox(height: 8),
        const _Muted('يُعدّ الموقع المستندات من الملفّات المرفوعة نفسها، فيظهر هنا ما يظهر هناك.'),
        Align(
          alignment: AlignmentDirectional.centerStart,
          child: OutlinedButton.icon(
            onPressed: onUpload,
            icon: const Icon(Icons.upload_file, size: 18),
            label: const Text('ارفع المستند'),
          ),
        ),
      ],
    );
  }
}

class _OfferBox extends StatelessWidget {
  const _OfferBox();

  @override
  Widget build(BuildContext context) {
    return _Box(
      title: 'اعرض أرضك',
      icon: Icons.storefront_outlined,
      children: [
        const _Muted(
          '١. للمستثمرين — من قسم «المستثمرون» أدناه: تظهر في المشاريع وفرص الاستثمار بلا اسمك ولا موقعها حتى توافق.\n'
          '٢. للشركات الشريكة — من قسمها أدناه: تعرض عليك الشركة المطابقة حرثاً أو ريّاً أو حصاداً أو إشرافاً.\n'
          '٣. مشروعٌ بالمحصول والحصص باسمك — تُفتح استمارته في الموقع مملوءةً من أرضك.',
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            OutlinedButton(onPressed: () => openOnSite(context, '/opportunities/new'), child: const Text('اكتب مشروعاً على هذه الأرض')),
            OutlinedButton(onPressed: () => openOnSite(context, '/seasons/new'), child: const Text('ابدأ موسماً')),
          ],
        ),
      ],
    );
  }
}

typedef _Runner = Future<void> Function(Future<String> Function() step);

class _InvestorsBox extends StatefulWidget {
  const _InvestorsBox({required this.card, required this.api, required this.run});
  final LandCard card;
  final LandsApi api;
  final _Runner run;

  @override
  State<_InvestorsBox> createState() => _InvestorsBoxState();
}

class _InvestorsBoxState extends State<_InvestorsBox> {
  // The models chosen last time; all of them when none were, as the website's form.
  late final Set<String> _models = widget.card.investorModelsChosen.isEmpty
      ? {for (final m in widget.card.investorModels) m.key}
      : {...widget.card.investorModelsChosen};
  late final _note = TextEditingController(text: widget.card.investorNote ?? '');
  bool _form = false;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.card;
    final id = c.id;
    final labels = {for (final m in c.investorModels) m.key: m.label};
    return _Box(
      title: 'المستثمرون',
      icon: Icons.handshake_outlined,
      children: [
        if (!c.verified)
          const _Muted('بعد توثيق الأرض تستطيع عرضها على المستثمرين: مشاركة بالمحصول، أو إيجار، أو تمويل مدخلات.')
        else if (c.openToInvestors == true) ...[
          _Muted(
            'أرضك معروضة في فرص الاستثمار بنماذج: ${c.investorModelsChosen.map((m) => labels[m] ?? m).join(' · ')}. '
            'لا يرى المستثمر اسمك ولا هاتفك ولا موقعها حتى تقبل طلبه.',
          ),
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: OutlinedButton(
              key: const Key('investors-close'),
              onPressed: () => widget.run(() => widget.api.setInvestors(id, open: false)),
              child: const Text('أوقف عرضها'),
            ),
          ),
        ] else if (!_form) ...[
          const _Muted('تبحث عن ممّول؟ اعرض أرضك على المستثمرين — دون اسمك أو موقعها حتى توافق.'),
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: FilledButton(
              key: const Key('investors-offer'),
              onPressed: () => setState(() => _form = true),
              child: const Text('اعرضها'),
            ),
          ),
        ] else ...[
          const Text('ما الشراكة التي تقبلها؟', style: TextStyle(fontWeight: FontWeight.w800)),
          for (final m in c.investorModels)
            CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              controlAffinity: ListTileControlAffinity.leading,
              value: _models.contains(m.key),
              onChanged: (v) => setState(() => v == true ? _models.add(m.key) : _models.remove(m.key)),
              title: Text(m.label, style: const TextStyle(fontWeight: FontWeight.w700)),
              subtitle: Text(m.detail),
            ),
          TextField(
            controller: _note,
            maxLength: 500,
            maxLines: 2,
            decoration: const InputDecoration(
              labelText: 'سطرٌ عن أرضك للمستثمر (اختياري)',
              helperText: 'لا تكتب اسمك ولا هاتفك هنا — يُكشفان بعد موافقتك.',
            ),
          ),
          const SizedBox(height: 8),
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: FilledButton(
              key: const Key('investors-submit'),
              onPressed: () => widget.run(
                () => widget.api.setInvestors(id, open: true, models: _models.toList(), note: _note.text.trim()),
              ),
              child: const Text('اعرض أرضي على المستثمرين'),
            ),
          ),
        ],
        for (final i in c.inspections) ...[
          const Divider(height: 20),
          Text('طلب معاينةٍ من ${i.name ?? 'مستثمر'} — ${i.state}', style: const TextStyle(fontWeight: FontWeight.w700)),
          _Muted('يُتحقَّق من: ${i.checks.join(' · ')}'),
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: TextButton(
              onPressed: () => openOnSite(context, '/invest/inspections/${i.id}'),
              child: Text(i.status == 'requested' ? 'وافق على الزيارة أو اعتذر من الموقع' : 'التفاصيل في الموقع'),
            ),
          ),
        ],
        for (final r in c.investorRequests) ...[
          const Divider(height: 20),
          Text(
            '${r.accepted ? 'شريكٌ قبلتَه: ' : 'طلب شراكة من '}${r.name ?? 'مستثمر'} — ${r.model}',
            style: const TextStyle(fontWeight: FontWeight.w700),
          ),
          if (r.record != null) _Muted(r.record!),
          Text(r.message, style: const TextStyle(height: 1.7)),
          const SizedBox(height: 6),
          if (r.accepted) ...[
            _Muted('هاتفه: ${r.phone ?? 'لم يضف هاتفاً بعد'} · اتّفقا كتابةً قبل أيّ دفع.'),
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: TextButton(
                onPressed: () => openOnSite(context, '/lands'),
                child: const Text('اكتبا العقد ووقّعاه في الموقع'),
              ),
            ),
          ] else if (r.pending)
            Wrap(
              spacing: 8,
              children: [
                FilledButton(
                  onPressed: () => widget.run(() => widget.api.decideInvestor(id, r.id, accept: true)),
                  child: const Text('أقبل وأكشف بياناتي له'),
                ),
                OutlinedButton(
                  onPressed: () => widget.run(() => widget.api.decideInvestor(id, r.id, accept: false)),
                  child: const Text('أعتذر'),
                ),
              ],
            ),
        ],
      ],
    );
  }
}

class _PartnersBox extends StatefulWidget {
  const _PartnersBox({required this.card, required this.api, required this.run});
  final LandCard card;
  final LandsApi api;
  final _Runner run;

  @override
  State<_PartnersBox> createState() => _PartnersBoxState();
}

class _PartnersBoxState extends State<_PartnersBox> {
  late final Set<String> _crops = {...widget.card.cropKeys};

  @override
  Widget build(BuildContext context) {
    final c = widget.card;
    final id = c.id;
    return _Box(
      title: 'الشركات الزراعيّة الشريكة',
      icon: Icons.agriculture,
      children: [
        if (c.openToPartners == null)
          const _Muted(
            'قريباً تستطيع أن تفتح أرضك للشركات الشريكة، فتعرض عليك الشركة المطابقة خدماتها دون أن ترى اسمك أو موقع أرضك قبل موافقتك.',
          )
        else if (!c.verified)
          const _Muted('بعد توثيق الأرض تستطيع فتحها للشركات الشريكة.')
        else ...[
          _Muted(
            'مجموعة أرضك: ${c.partnerGroup}. '
            '${c.openToPartners! ? 'أرضك مفتوحة للشركات المطابقة. ترى الشركة الولاية والمحليّة والمساحة والمجموعة فقط، ولا ترى اسمك ولا موقع الأرض حتى تقبل طلبها.' : 'افتحها للشركات الشريكة لتعرض عليك الشركات المطابقة خدماتها. لا ترى الشركة اسمك ولا موقع الأرض حتى تقبل طلبها.'}',
          ),
          if (!c.openToPartners!) ...[
            const SizedBox(height: 8),
            Text('المحاصيل التي تريدها في أرضك (اختياري، حتى ٨) — ${_crops.length}',
                style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
            const SizedBox(height: 6),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final crop in c.partnerCrops)
                  FilterChip(
                    label: Text(crop.label),
                    selected: _crops.contains(crop.key),
                    onSelected: (on) => setState(() {
                      if (!on) {
                        _crops.remove(crop.key);
                      } else if (_crops.length < 8) {
                        _crops.add(crop.key);
                      }
                    }),
                  ),
              ],
            ),
          ],
          const SizedBox(height: 8),
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: c.openToPartners!
                ? OutlinedButton(
                    key: const Key('partners-close'),
                    onPressed: () => widget.run(() => widget.api.setPartners(id, open: false)),
                    child: const Text('أغلقها أمام الشركات'),
                  )
                : FilledButton(
                    key: const Key('partners-open'),
                    onPressed: () => widget.run(() => widget.api.setPartners(id, open: true, crops: _crops.toList())),
                    child: const Text('افتح أرضي للشركات الشريكة'),
                  ),
          ),
        ],
        for (final p in c.partnerRequests) ...[
          const Divider(height: 20),
          Text(
            'طلب من ${p.company ?? 'شركة شريكة'}${p.kinds.isEmpty ? '' : ' — ${p.kinds.join(' · ')}'}',
            style: const TextStyle(fontWeight: FontWeight.w700),
          ),
          Text(p.message, style: const TextStyle(height: 1.7)),
          if (p.phone != null) _Muted('هاتف الشركة: ${p.phone}'),
          const SizedBox(height: 6),
          Wrap(
            spacing: 8,
            children: [
              FilledButton(
                onPressed: () => widget.run(() => widget.api.decidePartner(id, p.id, accept: true)),
                child: const Text('أقبل وأكشف بياناتي لهم'),
              ),
              OutlinedButton(
                onPressed: () => widget.run(() => widget.api.decidePartner(id, p.id, accept: false)),
                child: const Text('أعتذر'),
              ),
            ],
          ),
        ],
      ],
    );
  }
}

class _TestsBox extends StatefulWidget {
  const _TestsBox({required this.card, required this.api, required this.run});
  final LandCard card;
  final LandsApi api;
  final _Runner run;

  @override
  State<_TestsBox> createState() => _TestsBoxState();
}

class _TestsBoxState extends State<_TestsBox> {
  String _kind = 'water';
  final _date = TextEditingController(text: DateTime.now().toIso8601String().substring(0, 10));
  final _ec = TextEditingController();
  final _ph = TextEditingController();
  final _sar = TextEditingController();
  final _om = TextEditingController();
  final _lab = TextEditingController();
  final _note = TextEditingController();

  @override
  void dispose() {
    for (final c in [_date, _ec, _ph, _sar, _om, _lab, _note]) {
      c.dispose();
    }
    super.dispose();
  }

  static num? _n(TextEditingController c) => num.tryParse(c.text.trim().replaceAll('٫', '.'));

  Widget _numField(TextEditingController c, String label) => Expanded(
        child: TextField(
          controller: c,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          textDirection: TextDirection.ltr,
          decoration: InputDecoration(labelText: label),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final c = widget.card;
    return _Box(
      title: 'فحوص الماء والتربة',
      icon: Icons.science_outlined,
      children: [
        if (c.tests.isEmpty)
          const _Muted('لم يُسجَّل فحصٌ بعد. الفحص يكشف ملوحة الماء والتربة قبل أن يُزرع ما لا يحتملها.'),
        for (final t in c.tests) ...[
          Text('${t.kindLabel} · ${t.testedOn}${t.lab != null ? ' · ${t.lab}' : ''}',
              style: const TextStyle(fontWeight: FontWeight.w800)),
          Text(t.values, textDirection: TextDirection.ltr),
          if (t.reading != null) _Muted(t.reading!),
          if (t.note != null) _Muted(t.note!),
          if (t.deletable)
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: TextButton(
                onPressed: () => widget.run(() => widget.api.deleteTest(c.id, t.id)),
                child: const Text('احذفه (كُتب خطأً)'),
              ),
            ),
          const Divider(height: 16),
        ],
        if (c.soilCrops != null) ...[
          Text('ملوحة تربتك في آخر فحص (${c.soilCrops!.testedOn}): ${c.soilCrops!.ec} dS/m',
              style: const TextStyle(fontWeight: FontWeight.w700)),
          _Muted(c.soilCrops!.full.isEmpty
              ? 'لا محصول في قائمتنا يعطي حاصله كاملاً عند هذه الملوحة بحسب الفاو ٢٩.'
              : 'محاصيل تعطي حاصلها كاملاً عند هذه الملوحة، بحسب الفاو ٢٩: ${c.soilCrops!.full.join('، ')}.'),
          const Divider(height: 16),
        ],
        ExpansionTile(
          key: const Key('add-test'),
          tilePadding: EdgeInsets.zero,
          initiallyExpanded: c.tests.isEmpty,
          title: const Text('أضف فحصاً', style: TextStyle(fontWeight: FontWeight.w800)),
          children: [
            DropdownButtonFormField<String>(
              initialValue: _kind,
              decoration: const InputDecoration(labelText: 'النوع'),
              items: const [
                DropdownMenuItem(value: 'water', child: Text('ماء')),
                DropdownMenuItem(value: 'soil', child: Text('تربة')),
              ],
              onChanged: (v) => setState(() => _kind = v ?? _kind),
            ),
            TextField(
              controller: _date,
              textDirection: TextDirection.ltr,
              decoration: const InputDecoration(labelText: 'تاريخ الفحص (سنة-شهر-يوم)'),
            ),
            Row(children: [_numField(_ec, 'الملوحة EC'), const SizedBox(width: 8), _numField(_ph, 'الحموضة pH')]),
            Row(children: [
              _numField(_sar, 'الصوديوم SAR'),
              if (_kind == 'soil') ...[const SizedBox(width: 8), _numField(_om, 'المادّة العضويّة ٪')],
            ]),
            TextField(controller: _lab, maxLength: 120, decoration: const InputDecoration(labelText: 'المختبر (اختياري)')),
            TextField(controller: _note, maxLength: 500, decoration: const InputDecoration(labelText: 'ملاحظة (اختياري)')),
            const SizedBox(height: 8),
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: FilledButton(
                onPressed: () => widget.run(() => widget.api.addTest(
                      c.id,
                      kind: _kind,
                      testedOn: _date.text.trim(),
                      ec: _n(_ec),
                      ph: _n(_ph),
                      sar: _n(_sar),
                      organic: _kind == 'soil' ? _n(_om) : null,
                      lab: _lab.text.trim(),
                      note: _note.text.trim(),
                    )),
                child: const Text('احفظ الفحص'),
              ),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ],
    );
  }
}

class _SeasonsBox extends StatelessWidget {
  const _SeasonsBox({required this.card});
  final LandCard card;

  @override
  Widget build(BuildContext context) {
    final c = card;
    return _Box(
      title: 'مواسم هذه الأرض',
      icon: Icons.event_note_outlined,
      children: [
        if (c.seasons.isEmpty) const _Muted('لا موسم مسجَّلٌ على هذه الأرض بعد.'),
        for (final s in c.seasons)
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(s.name, style: const TextStyle(fontWeight: FontWeight.w700)),
            subtitle: Text(s.line),
            trailing: TagPill(s.status),
          ),
      ],
    );
  }
}
