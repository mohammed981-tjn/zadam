import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api.dart';
import '../i18n.dart';
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
      appBar: AppBar(title: Text(tr('أراضيّ', 'My lands'))),
      floatingActionButton: FloatingActionButton.extended(
        key: const Key('add-land'),
        onPressed: _add,
        icon: const Icon(Icons.add_location_alt),
        label: Text(tr('حدّد أرضاً جديدة', 'Mark a new land')),
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
                IntroNote(
                  tr('أرضك المسجّلة هي أساس كل موسم وكل فرصة تعرضها لاحقاً. لا تظهر لأحد حتى تعتمدها الإدارة، '
                  'وموقعها الدقيق لك وللإدارة وحدكما.', 'Your registered land is the base of every season and every opportunity you offer later. Nobody sees it until the administrators approve it, and its exact location is for you and the administrators alone.'),
                  icon: Icons.landscape_outlined,
                ),
                const SizedBox(height: 14),
                if (lands.isEmpty)
                  StateView(
                    icon: Icons.landscape_outlined,
                    title: tr('لم تسجّل أرضاً بعد', 'You have not registered a land yet'),
                    message: tr('ابدأ بأرض واحدة — التسجيل مجاني ولا يظهر لأحد حتى تعتمده الإدارة. '
                        'حدّدها بالمشي حولها أو بالنقر على الخريطة.', 'Start with one land — registration is free and nobody sees it until the administrators approve it. Mark it by walking around it or by tapping on the map.'),
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
                        tr('${l.feddans} فدان', '${l.feddans} feddans'),
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
                        if (l.listed) TagPill(tr('معروضة', 'Listed'), icon: Icons.storefront_outlined),
                        if (l.openToInvestors == true) TagPill(tr('مفتوحة للمستثمرين', 'Open to investors'), icon: Icons.handshake_outlined),
                        if (l.openToPartners == true) TagPill(tr('مفتوحة للشركات', 'Open to companies'), icon: Icons.agriculture),
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
      title: tr('ارفع المستند', 'Upload document'),
      subtitle: c.name,
      kinds: kinds,
      pick: widget.pick,
      note: tr('إثبات الحيازة أو العقد أو التصريح صورةً أو PDF حتى ١٠ ميجابايت. وصورة الأرض الملتقطة فيها يُحفظ وقتها ومكانها، ولا يبقيان في الملفّ نفسه.', 'Proof of tenure, the contract or the permit, as a photo or a PDF up to 10 MB. A photo of the land taken there keeps its time and place, not left in the file itself.'),
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
      appBar: AppBar(title: Text(widget.name.isEmpty ? tr('بطاقة الأرض', 'Land card') : widget.name)),
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
              TagPill(c.listed ? tr('معروضة', 'Listed') : tr('غير معروضة', 'Not listed'), gold: !c.listed),
              if (c.openToInvestors != null)
                TagPill(c.openToInvestors! ? tr('مفتوحة للمستثمرين', 'Open to investors') : tr('غير معروضة على المستثمرين', 'Not offered to investors'), gold: !c.openToInvestors!),
              if (c.openToPartners != null)
                TagPill(c.openToPartners! ? tr('مفتوحة للشركات الشريكة', 'Open to partner companies') : tr('مغلقة أمام الشركات', 'Closed to companies'), gold: !c.openToPartners!),
            ],
          ),
          if (c.verificationNote != null) ...[
            const SizedBox(height: 10),
            Container(
              key: const Key('verification-note'),
              width: double.infinity,
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(color: warnTintOn(context), borderRadius: BorderRadius.circular(12)),
              child: Text(tr('ملاحظة المراجعة: ${c.verificationNote}', 'Review note: ${c.verificationNote}'), style: const TextStyle(height: 1.7)),
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
      (tr('المساحة', 'Area'), tr('${c.feddans} فدان', '${c.feddans} feddans')),
      (tr('أقرب محطّة مناخ', 'Nearest climate station'), c.station ?? '—'),
      (tr('مصدر المياه', 'Water source'), c.waterSourceLabel ?? '—'),
      (tr('المياه للفدان', 'Water per feddan'), c.waterPerFeddan == null ? '—' : tr('${fmt0(c.waterPerFeddan!)} م³', '${fmt0(c.waterPerFeddan!)} m³')),
      (tr('التربة', 'Soil'), c.soilNote ?? '—'),
      (
        tr('التربة من الأقمار', 'Soil from satellites'),
        c.soil == null
            ? tr('تُقرأ حين يُعرف موقع الأرض', 'Read once the land\'s location is known')
            : tr('${c.soil!.name}${c.soil!.probability != null ? ' (احتمال ${c.soil!.probability}٪)' : ''}', '${c.soil!.name}${c.soil!.probability != null ? ' (probability ${c.soil!.probability}%)' : ''}'),
      ),
      (tr('زُرع سابقاً', 'Previously grown'), c.previousCrops ?? '—'),
      (tr('الحيازة', 'Tenure'), c.tenure ?? '—'),
    ];
    return _Box(
      title: tr('الأرض', 'Land'),
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
          _Muted(tr('التربة من الأقمار تقديرٌ لا فحص، ويبقى فحص الماء والتربة عندك هو الأصل.', 'The soil from satellites is an estimate, not a test; your own water and soil test remains the reference.')),
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
      title: tr('الحدود على الخريطة', 'The boundary on the map'),
      icon: Icons.map_outlined,
      subtitle: points.length >= 3
          ? tr('كما رُسمت في التطبيق (${points.length} ركناً)${c.drawnFeddans != null ? ' تحيط بـ ${c.drawnFeddans!.toStringAsFixed(2)} فدان' : ''}.', 'As drawn in the app (${points.length} corners)${c.drawnFeddans != null ? ' around ${c.drawnFeddans!.toStringAsFixed(2)} feddans' : ''}.')
          : tr('لم تُرسم حدودها بعد؛ النقطة موقعها المسجّل.', 'Its boundary is not drawn yet; the dot is its registered location.'),
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
        _Muted(tr('موقع الأرض وحدودها لك وللإدارة وحدكما.', 'The land\'s location and boundary are for you and the administrators alone.')),
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
      title: tr('ماء أرضك من الأقمار الصناعيّة — الفاو', 'Your land\'s water from satellites — FAO'),
      icon: Icons.water_drop_outlined,
      children: [
        FutureBuilder<LandWater>(
          future: water,
          builder: (context, snap) {
            if (snap.connectionState != ConnectionState.done) {
              return LoadingView(label: tr('يُقرأ ماء أرضك من أقمار الفاو…', 'Reading your land\'s water from FAO\'s satellites…'), compact: true);
            }
            if (snap.hasError) return StateView.error(snap.error, onRetry: onRetry, compact: true);
            final w = snap.data!;
            if (!w.located || w.rows.isEmpty) return _Muted(w.note);
            final head = TextStyle(color: mutedOn(context), fontSize: 11.5);
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _Muted(
                  tr('ما خرج من الأرض فعلاً كلّ عشرة أيّام: نتح المحصول وتبخّر التربة معاً، كما قاسته أقمار الفاو. '
                  'حين يرتفع والمحصول قائم فهو يشرب؛ وحين يقترب من الصفر فالأرض بور أو عطشى.', 'What actually left the land every ten days: the crop\'s transpiration and the soil\'s evaporation together, as FAO\'s satellites measured it. When it rises while the crop stands, it is drinking; when it nears zero, the land is fallow or thirsty.'),
                ),
                const SizedBox(height: 8),
                Table(
                  columnWidths: const {0: FlexColumnWidth(2.2)},
                  children: [
                    TableRow(children: [
                      Text(tr('الفترة', 'Period'), style: head),
                      Text(tr('مم/يوم', 'mm/day'), style: head),
                      Text(tr('م³ للفدان', 'm³ per feddan'), style: head),
                      Text(tr('للأرض كلّها', 'For the whole land'), style: head),
                    ]),
                    for (final r in w.rows)
                      TableRow(children: [
                        Padding(padding: const EdgeInsets.symmetric(vertical: 4), child: Text(r.period)),
                        Text(r.mmPerDay.toStringAsFixed(1), style: const TextStyle(fontWeight: FontWeight.w700)),
                        Text(fmt0(r.m3PerFeddan)),
                        Text(tr('${fmt0(r.m3Land)} م³', '${fmt0(r.m3Land)} m³')),
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
      title: tr('مستندات الأرض', 'Land documents'),
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
        _Muted(tr('يُعدّ الموقع المستندات من الملفّات المرفوعة نفسها، فيظهر هنا ما يظهر هناك.', 'The website lists the documents from the same uploaded files, so what shows there shows here.')),
        Align(
          alignment: AlignmentDirectional.centerStart,
          child: OutlinedButton.icon(
            onPressed: onUpload,
            icon: const Icon(Icons.upload_file, size: 18),
            label: Text(tr('ارفع المستند', 'Upload document')),
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
      title: tr('اعرض أرضك', 'Offer your land'),
      icon: Icons.storefront_outlined,
      children: [
        _Muted(
          tr('١. للمستثمرين — من قسم «المستثمرون» أدناه: تظهر في المشاريع وفرص الاستثمار بلا اسمك ولا موقعها حتى توافق.\n'
          '٢. للشركات الشريكة — من قسمها أدناه: تعرض عليك الشركة المطابقة حرثاً أو ريّاً أو حصاداً أو إشرافاً.\n'
          '٣. مشروعٌ بالمحصول والحصص باسمك — تُفتح استمارته في الموقع مملوءةً من أرضك.', '1. To investors — from the «Investors» section below: it shows in the projects and investment opportunities without your name or its location until you agree.\n2. To partner companies — from their section below: the matching company offers you ploughing, irrigation, harvest or supervision.\n3. A project with a crop and shares in your name — its form opens on the website, filled in from your land.'),
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            OutlinedButton(onPressed: () => openOnSite(context, '/opportunities/new'), child: Text(tr('اكتب مشروعاً على هذه الأرض', 'Write a project on this land'))),
            OutlinedButton(onPressed: () => openOnSite(context, '/seasons/new'), child: Text(tr('ابدأ موسماً', 'Start a season'))),
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
      title: tr('المستثمرون', 'Investors'),
      icon: Icons.handshake_outlined,
      children: [
        if (!c.verified)
          _Muted(tr('بعد توثيق الأرض تستطيع عرضها على المستثمرين: مشاركة بالمحصول، أو إيجار، أو تمويل مدخلات.', 'Once the land is verified you can offer it to investors: crop sharing, lease, or input finance.'))
        else if (c.openToInvestors == true) ...[
          _Muted(
            tr('أرضك معروضة في فرص الاستثمار بنماذج: ${c.investorModelsChosen.map((m) => labels[m] ?? m).join(' · ')}. '
            'لا يرى المستثمر اسمك ولا هاتفك ولا موقعها حتى تقبل طلبه.', 'Your land is shown in the investment opportunities with the models: ${c.investorModelsChosen.map((m) => labels[m] ?? m).join(' · ')}. The investor sees neither your name, your phone nor its location until you accept their request.'),
          ),
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: OutlinedButton(
              key: const Key('investors-close'),
              onPressed: () => widget.run(() => widget.api.setInvestors(id, open: false)),
              child: Text(tr('أوقف عرضها', 'Stop showing it')),
            ),
          ),
        ] else if (!_form) ...[
          _Muted(tr('تبحث عن ممّول؟ اعرض أرضك على المستثمرين — دون اسمك أو موقعها حتى توافق.', 'Looking for finance? Offer your land to investors — without your name or its location until you agree.')),
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: FilledButton(
              key: const Key('investors-offer'),
              onPressed: () => setState(() => _form = true),
              child: Text(tr('اعرضها', 'Offer it')),
            ),
          ),
        ] else ...[
          Text(tr('ما الشراكة التي تقبلها؟', 'Which partnerships do you accept?'), style: TextStyle(fontWeight: FontWeight.w800)),
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
            decoration: InputDecoration(
              labelText: tr('سطرٌ عن أرضك للمستثمر (اختياري)', 'A line about your land for investors (optional)'),
              helperText: tr('لا تكتب اسمك ولا هاتفك هنا — يُكشفان بعد موافقتك.', 'Don\'t write your name or phone here — they are shared after you agree.'),
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
              child: Text(tr('اعرض أرضي على المستثمرين', 'Offer my land to investors')),
            ),
          ),
        ],
        for (final i in c.inspections) ...[
          const Divider(height: 20),
          Text(tr('طلب معاينةٍ من ${i.name ?? 'مستثمر'} — ${i.state}', 'Inspection request from ${i.name ?? 'an investor'} — ${i.state}'), style: const TextStyle(fontWeight: FontWeight.w700)),
          _Muted(tr('يُتحقَّق من: ${i.checks.join(' · ')}', 'To be checked: ${i.checks.join(' · ')}')),
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: TextButton(
              onPressed: () => openOnSite(context, '/invest/inspections/${i.id}'),
              child: Text(i.status == 'requested' ? tr('وافق على الزيارة أو اعتذر من الموقع', 'Agree to the visit or decline on the website') : tr('التفاصيل في الموقع', 'The details are on the website')),
            ),
          ),
        ],
        for (final r in c.investorRequests) ...[
          const Divider(height: 20),
          Text(
            tr('${r.accepted ? 'شريكٌ قبلتَه: ' : 'طلب شراكة من '}${r.name ?? 'مستثمر'} — ${r.model}', '${r.accepted ? 'A partner you accepted: ' : 'Partnership request from '}${r.name ?? 'an investor'} — ${r.model}'),
            style: const TextStyle(fontWeight: FontWeight.w700),
          ),
          if (r.record != null) _Muted(r.record!),
          Text(r.message, style: const TextStyle(height: 1.7)),
          const SizedBox(height: 6),
          if (r.accepted) ...[
            _Muted(tr('هاتفه: ${r.phone ?? 'لم يضف هاتفاً بعد'} · اتّفقا كتابةً قبل أيّ دفع.', 'Their phone: ${r.phone ?? 'none on file yet'} · agree in writing before any payment.')),
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: TextButton(
                onPressed: () => openOnSite(context, '/lands'),
                child: Text(tr('اكتبا العقد ووقّعاه في الموقع', 'Write the agreement and sign it together on the website')),
              ),
            ),
          ] else if (r.pending)
            Wrap(
              spacing: 8,
              children: [
                FilledButton(
                  onPressed: () => widget.run(() => widget.api.decideInvestor(id, r.id, accept: true)),
                  child: Text(tr('أقبل وأكشف بياناتي له', 'Accept and share my details')),
                ),
                OutlinedButton(
                  onPressed: () => widget.run(() => widget.api.decideInvestor(id, r.id, accept: false)),
                  child: Text(tr('أعتذر', 'Decline')),
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
      title: tr('الشركات الزراعيّة الشريكة', 'Partner farming companies'),
      icon: Icons.agriculture,
      children: [
        if (c.openToPartners == null)
          _Muted(
            tr('قريباً تستطيع أن تفتح أرضك للشركات الشريكة، فتعرض عليك الشركة المطابقة خدماتها دون أن ترى اسمك أو موقع أرضك قبل موافقتك.', 'Soon you will be able to open your land to partner companies: a matching company offers you its services without seeing your name or your land’s location before you agree.'),
          )
        else if (!c.verified)
          _Muted(tr('بعد توثيق الأرض تستطيع فتحها للشركات الشريكة.', 'Once the land is verified you can open it to partner companies.'))
        else ...[
          _Muted(
            tr('مجموعة أرضك: ${c.partnerGroup}. '
            '${c.openToPartners! ? 'أرضك مفتوحة للشركات المطابقة. ترى الشركة الولاية والمحليّة والمساحة والمجموعة فقط، ولا ترى اسمك ولا موقع الأرض حتى تقبل طلبها.' : 'افتحها للشركات الشريكة لتعرض عليك الشركات المطابقة خدماتها. لا ترى الشركة اسمك ولا موقع الأرض حتى تقبل طلبها.'}', 'Your land\'s group: ${c.partnerGroup}. ${c.openToPartners! ? 'Your land is open to matching companies. A company sees only the state, locality, area and group, and sees neither your name nor the land\'s location until you accept its request.' : 'Open it to partner companies so that matching companies offer you their services. A company sees neither your name nor the land\'s location until you accept its request.'}'),
          ),
          if (!c.openToPartners!) ...[
            const SizedBox(height: 8),
            Text(tr('المحاصيل التي تريدها في أرضك (اختياري، حتى ٨) — ${_crops.length}', 'The crops you want on your land (optional, up to 8) — ${_crops.length}'),
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
                    child: Text(tr('أغلقها أمام الشركات', 'Close it to companies')),
                  )
                : FilledButton(
                    key: const Key('partners-open'),
                    onPressed: () => widget.run(() => widget.api.setPartners(id, open: true, crops: _crops.toList())),
                    child: Text(tr('افتح أرضي للشركات الشريكة', 'Open my land to partner companies')),
                  ),
          ),
        ],
        for (final p in c.partnerRequests) ...[
          const Divider(height: 20),
          Text(
            tr('طلب من ${p.company ?? 'شركة شريكة'}${p.kinds.isEmpty ? '' : ' — ${p.kinds.join(' · ')}'}', 'Request from ${p.company ?? 'a partner company'}${p.kinds.isEmpty ? '' : ' — ${p.kinds.join(' · ')}'}'),
            style: const TextStyle(fontWeight: FontWeight.w700),
          ),
          Text(p.message, style: const TextStyle(height: 1.7)),
          if (p.phone != null) _Muted(tr('هاتف الشركة: ${p.phone}', 'The company\'s phone: ${p.phone}')),
          const SizedBox(height: 6),
          Wrap(
            spacing: 8,
            children: [
              FilledButton(
                onPressed: () => widget.run(() => widget.api.decidePartner(id, p.id, accept: true)),
                child: Text(tr('أقبل وأكشف بياناتي لهم', 'Accept and share my details')),
              ),
              OutlinedButton(
                onPressed: () => widget.run(() => widget.api.decidePartner(id, p.id, accept: false)),
                child: Text(tr('أعتذر', 'Decline')),
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

  static num? _n(TextEditingController c) => num.tryParse(c.text.trim().replaceAll('٫', '.')); // ar-only

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
      title: tr('فحوص الماء والتربة', 'Water and soil tests'),
      icon: Icons.science_outlined,
      children: [
        if (c.tests.isEmpty)
          _Muted(tr('لم يُسجَّل فحصٌ بعد. الفحص يكشف ملوحة الماء والتربة قبل أن يُزرع ما لا يحتملها.', 'No test has been recorded yet. A test shows the salinity of the water and soil before something that cannot bear it is sown.')),
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
                child: Text(tr('احذفه (كُتب خطأً)', 'Delete it (entered by mistake)')),
              ),
            ),
          const Divider(height: 16),
        ],
        if (c.soilCrops != null) ...[
          Text(tr('ملوحة تربتك في آخر فحص (${c.soilCrops!.testedOn}): ${c.soilCrops!.ec} dS/m', 'Your soil\'s salinity in the last test (${c.soilCrops!.testedOn}): ${c.soilCrops!.ec} dS/m'),
              style: const TextStyle(fontWeight: FontWeight.w700)),
          _Muted(c.soilCrops!.full.isEmpty
              ? tr('لا محصول في قائمتنا يعطي حاصله كاملاً عند هذه الملوحة بحسب الفاو ٢٩.', 'No crop in our list gives its full yield at this salinity, by FAO-29.')
              : tr('محاصيل تعطي حاصلها كاملاً عند هذه الملوحة، بحسب الفاو ٢٩: ${c.soilCrops!.full.join('، ')}.', 'Crops that give their full yield at this salinity, by FAO-29: ${c.soilCrops!.full.join(', ')}.')),
          const Divider(height: 16),
        ],
        ExpansionTile(
          key: const Key('add-test'),
          tilePadding: EdgeInsets.zero,
          initiallyExpanded: c.tests.isEmpty,
          title: Text(tr('أضف فحصاً', 'Add a test'), style: TextStyle(fontWeight: FontWeight.w800)),
          children: [
            DropdownButtonFormField<String>(
              initialValue: _kind,
              decoration: InputDecoration(labelText: tr('النوع', 'Kind')),
              items: [
                DropdownMenuItem(value: 'water', child: Text(tr('ماء', 'Water'))),
                DropdownMenuItem(value: 'soil', child: Text(tr('تربة', 'Soil'))),
              ],
              onChanged: (v) => setState(() => _kind = v ?? _kind),
            ),
            TextField(
              controller: _date,
              textDirection: TextDirection.ltr,
              decoration: InputDecoration(labelText: tr('تاريخ الفحص (سنة-شهر-يوم)', 'Test date (year-month-day)')),
            ),
            Row(children: [_numField(_ec, tr('الملوحة EC', 'Salinity EC')), const SizedBox(width: 8), _numField(_ph, tr('الحموضة pH', 'Acidity pH'))]),
            Row(children: [
              _numField(_sar, tr('الصوديوم SAR', 'Sodium SAR')),
              if (_kind == 'soil') ...[const SizedBox(width: 8), _numField(_om, tr('المادّة العضويّة ٪', 'Organic matter %'))],
            ]),
            TextField(controller: _lab, maxLength: 120, decoration: InputDecoration(labelText: tr('المختبر (اختياري)', 'Laboratory (optional)'))),
            TextField(controller: _note, maxLength: 500, decoration: InputDecoration(labelText: tr('ملاحظة (اختياري)', 'Note (optional)'))),
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
                child: Text(tr('احفظ الفحص', 'Save the test')),
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
      title: tr('مواسم هذه الأرض', 'This land\'s seasons'),
      icon: Icons.event_note_outlined,
      children: [
        if (c.seasons.isEmpty) _Muted(tr('لا موسم مسجَّلٌ على هذه الأرض بعد.', 'No season is recorded on this land yet.')),
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
