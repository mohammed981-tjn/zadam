/// «الخرائط» بملء الشاشة (البند ٢٠٣): خريطة /map في الموقع، في التطبيق.
///
/// The same screen as the website's MapScreen and LiveMap: the whole world's map, moved round as
/// in the delivery apps, with a round button on the right that switches the ground between the
/// street map (OpenFreeMap) and the satellite (EOxCloudless 2016), «موقعي», and zoom. Along the
/// top, the website's layers as chips: the week's layers (rain, heat, the air's demand, terrain,
/// soil, verified lands) replace one another; the canal, the minerals, and the roads and power are
/// laid over whichever is shown. The key folds away in a card at the bottom, and a tap on any
/// colour or mark opens its card, with the website's words.
///
/// North is up and east is right although the app is right-to-left: a map is not text. The chips,
/// the key and the cards read right to left.
library;

import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/material.dart' hide Theme;
import 'package:flutter/material.dart' as material show Theme;
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'package:latlong2/latlong.dart' hide Path;
import 'package:url_launcher/url_launcher.dart';
import 'package:vector_map_tiles/vector_map_tiles.dart';
import 'package:vector_tile_renderer/vector_tile_renderer.dart' show Theme, ThemeReader, SpriteIndexReader;

import '../api.dart';
import '../i18n.dart';
import '../maps.dart';
import '../theme.dart';
import '../ui.dart';
import 'mining_screen.dart';
import 'rain_screen.dart';

enum _Ground { map, sat }

class MapsScreen extends StatefulWidget {
  const MapsScreen({super.key, this.client, this.siteUrl});

  /// For tests; the app makes its own.
  final http.Client? client;

  /// For tests; the app uses [ApiConfig.siteUrl].
  final String? siteUrl;

  @override
  State<MapsScreen> createState() => _MapsScreenState();
}

/// The ground's style, read once and made into what the renderer draws.
class _Vector {
  _Vector(this.style, this.providers, this.sprites)
    : below = _theme(style, 'liberty-below', style.below),
      above = _theme(style, 'liberty-above', style.above),
      hybrid = _theme(style, 'liberty-hybrid', style.hybrid);

  final GroundStyle style;
  final TileProviders providers;
  final SpriteStyle? sprites;
  final Theme? below, above, hybrid;

  static Theme? _theme(GroundStyle s, String id, List<StyleLayer> layers) {
    final t = ThemeReader().read(s.theme(id, layers));
    return t.tileSources.isEmpty ? null : t;
  }
}

class _MapsScreenState extends State<MapsScreen> {
  late final http.Client _client = widget.client ?? http.Client();
  String get _site => widget.siteUrl ?? ApiConfig.siteUrl;
  final _map = MapController();
  final _fillHit = LayerHitNotifier<MapInfo>(null);
  final _lineHit = LayerHitNotifier<MapInfo>(null);
  final _pointHit = LayerHitNotifier<MapInfo>(null);

  late Future<MapsData> _future;
  MapsData? _data;
  _Vector? _vector;
  bool _groundFailed = false;
  bool _groundLoading = false;

  _Ground _ground = _Ground.map;
  String? _gridKey;
  final List<String> _over = [];
  bool _keyOpen = true;
  MapInfo? _picked;
  LatLng? _me;
  bool _locating = false;
  double _zoom = 5;

  /// Drawn once per load: the overlays as the map's own shapes.
  final Map<String, List<Polygon<MapInfo>>> _polygons = {};
  final Map<String, List<Polyline<MapInfo>>> _polylines = {};
  final Map<String, List<CircleMarker<MapInfo>>> _circles = {};

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  @override
  void dispose() {
    if (widget.client == null) _client.close();
    _fillHit.dispose();
    _lineHit.dispose();
    _pointHit.dispose();
    super.dispose();
  }

  Future<MapsData> _load() async {
    final data = await fetchMaps(_client, _site);
    _polygons.clear();
    _polylines.clear();
    _circles.clear();
    for (final t in data.themes) {
      for (final o in t.overlays) {
        _draw(o);
      }
    }
    if (!mounted) return data;
    setState(() {
      _data = data;
      final grids = data.grids;
      // The website opens on the rain.
      _gridKey ??= (grids.where((g) => g.key == 'rain').firstOrNull ?? grids.firstOrNull)?.key;
      _over.removeWhere((k) => !data.overs.any((o) => o.key == k));
    });
    if (_vector == null) unawaited(_loadGround(data.styleUrl));
    return data;
  }

  Future<void> _loadGround(String url) async {
    if (_groundLoading) return;
    setState(() {
      _groundLoading = true;
      _groundFailed = false;
    });
    try {
      final style = await loadGroundStyle(_client, url);
      final providers = TileProviders({
        for (final e in style.sources.entries)
          e.key: NetworkVectorTileProvider(
            urlTemplate: e.value.url,
            type: e.value.type == 'raster' ? TileProviderType.raster : TileProviderType.vector,
            minimumZoom: e.value.minZoom,
            maximumZoom: e.value.maxZoom,
          ),
      });
      final vector = _Vector(style, providers, await _sprites(style.sprite));
      if (!mounted) return;
      setState(() {
        _vector = vector;
        _groundLoading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _groundFailed = true;
        _groundLoading = false;
      });
    }
  }

  /// The style's icons (road shields, places), sharp on a phone's screen; the map draws without them.
  Future<SpriteStyle?> _sprites(String? base) async {
    if (base == null) return null;
    for (final suffix in ['@2x', '']) {
      try {
        final res = await _client.get(Uri.parse('$base$suffix.json')).timeout(const Duration(seconds: 15));
        if (res.statusCode != 200) continue;
        final index = SpriteIndexReader().read(jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>);
        return SpriteStyle(
          index: index,
          atlasProvider: () async => (await _client.get(Uri.parse('$base$suffix.png'))).bodyBytes,
        );
      } catch (_) {
        continue;
      }
    }
    return null;
  }

  void _draw(MapOverlay o) {
    switch (o.kind) {
      case OverlayKind.fill:
        _polygons[o.id] = [
          for (final f in o.features)
            for (final p in f.polygons)
              if (p.isNotEmpty && p.first.length >= 3)
                Polygon<MapInfo>(
                  points: p.first,
                  holePointsList: p.length > 1 ? p.sublist(1) : null,
                  color: (f.colour ?? const Color(0x00000000)).withValues(alpha: (f.colour?.a ?? 0) * o.opacity),
                  borderStrokeWidth: o.outline == null ? 0 : 1,
                  borderColor: o.outline ?? const Color(0x00000000),
                  hitValue: f.info,
                ),
        ];
      case OverlayKind.line:
        final dash = o.dash;
        _polylines[o.id] = [
          for (final f in o.features)
            for (final l in f.lines)
              if (l.length >= 2)
                Polyline<MapInfo>(
                  points: l,
                  color: f.colour ?? parseColour(lineGreen)!,
                  strokeWidth: f.width ?? 3,
                  strokeCap: StrokeCap.round,
                  strokeJoin: StrokeJoin.round,
                  pattern: dash != null && dash.length >= 2 && dash.length.isEven
                      ? StrokePattern.dashed(segments: [for (final d in dash) d * (f.width ?? 3)])
                      : const StrokePattern.solid(),
                  hitValue: f.info,
                ),
        ];
      case OverlayKind.points:
        _circles[o.id] = [
          for (final f in o.features)
            if (f.point != null)
              CircleMarker<MapInfo>(
                point: f.point!,
                radius: o.radius,
                color: f.colour ?? parseColour(lineGreen)!,
                borderColor: o.stroke ?? Colors.white,
                borderStrokeWidth: 2,
                hitValue: f.info,
              ),
        ];
      case OverlayKind.pins:
        break;
    }
  }

  void _retry() => setState(() => _future = _load());

  MapTheme? get _grid => _data?.grids.where((g) => g.key == _gridKey).firstOrNull;
  List<MapTheme> get _shownOver => (_data?.overs ?? const []).where((o) => _over.contains(o.key)).toList();
  List<MapOverlay> get _overlays => [...?_grid?.overlays, for (final o in _shownOver) ...o.overlays];

  void _pickGrid(String k) => setState(() {
    _gridKey = k == _gridKey ? null : k;
    _picked = null;
  });

  void _toggleOver(String k) => setState(() {
    _over.contains(k) ? _over.remove(k) : _over.add(k);
    _picked = null;
  });

  /// A tap: the top-most thing under the finger opens its card; empty ground closes it.
  void _onTap() {
    final hit = _pointHit.value ?? _lineHit.value ?? _fillHit.value;
    setState(() => _picked = hit?.hitValues.firstOrNull);
  }

  Future<void> _locate() async {
    void say(String text) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
    }

    setState(() => _locating = true);
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        say(tr('شغّل الموقع (GPS) في الجوّال ثمّ أعد المحاولة.', 'Turn on location (GPS) on the phone, then try again.'));
        return;
      }
      var p = await Geolocator.checkPermission();
      if (p == LocationPermission.denied) p = await Geolocator.requestPermission();
      if (p == LocationPermission.denied || p == LocationPermission.deniedForever) {
        say(tr('لم يُؤذن للتطبيق بموقعك.', 'The app was not given permission for your location.'));
        return;
      }
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, timeLimit: Duration(seconds: 15)),
      );
      if (!mounted) return;
      final at = LatLng(pos.latitude, pos.longitude);
      setState(() => _me = at);
      _map.move(at, math.max(_map.camera.zoom, 13));
    } catch (_) {
      say(tr('تعذّر تحديد موقعك الآن.', 'Could not find your location right now.'));
    } finally {
      if (mounted) setState(() => _locating = false);
    }
  }

  Future<void> _openSite(String path) async {
    if (_site.isEmpty) return;
    await launchUrl(Uri.parse('$_site$path'), mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(tr('الخرائط', 'Maps')),
        actions: [
          IconButton(
            tooltip: tr('عن هذه الخريطة', 'About this map'),
            icon: const Icon(Icons.info_outline_rounded),
            onPressed: _data == null ? null : () => _about(_data!),
          ),
        ],
      ),
      body: FutureBuilder<MapsData>(
        future: _future,
        builder: (context, snapshot) {
          final data = _data;
          if (data == null) {
            if (snapshot.hasError) return StateView.error(snapshot.error, onRetry: _retry);
            return LoadingView(label: tr('تُحمَّل الخريطة…', 'Loading the map…'));
          }
          return _mapView(context, data);
        },
      ),
    );
  }

  Widget _mapView(BuildContext context, MapsData data) {
    final scheme = material.Theme.of(context).colorScheme;
    final card = material.Theme.of(context).cardColor;
    final overlays = _overlays;
    final grid = _grid;
    final v = _vector;
    final sat = _ground == _Ground.sat;

    final under = [
      for (final o in overlays)
        if (o.kind == OverlayKind.fill && o.under) ...?_polygons[o.id],
    ];
    final overFills = [
      for (final o in overlays)
        if (o.kind == OverlayKind.fill && !o.under) ...?_polygons[o.id],
    ];
    final lines = [
      for (final o in overlays)
        if (o.kind == OverlayKind.line) ...?_polylines[o.id],
    ];
    final points = [
      for (final o in overlays)
        if (o.kind == OverlayKind.points) ...?_circles[o.id],
    ];
    final pins = [
      for (final o in overlays)
        if (o.kind == OverlayKind.pins) o,
    ];

    Widget vectorLayer(Theme? theme) => VectorTileLayer(
      key: ValueKey(theme!.id),
      theme: theme,
      sprites: v!.sprites,
      tileProviders: v.providers,
      tileOffset: TileOffset.mapbox,
    );

    final halaibWidth = valueAtZoom(v?.style.borderWidth, _zoom) ?? 1.2;
    final (west, south, east, north) = sudanBounds;

    final map = FlutterMap(
      mapController: _map,
      options: MapOptions(
        initialCameraFit: CameraFit.bounds(
          bounds: LatLngBounds(LatLng(south, west), LatLng(north, east)),
          // The country first seen clear of the chips above, the key below and the buttons beside.
          padding: const EdgeInsets.fromLTRB(16, 64, 72, 190),
        ),
        minZoom: 2,
        maxZoom: 18,
        backgroundColor: sat ? const Color(0xFF1C2B1E) : const Color(0xFFF8F4F0),
        interactionOptions: const InteractionOptions(flags: InteractiveFlag.all & ~InteractiveFlag.rotate),
        onTap: (_, _) => _onTap(),
        onPositionChanged: (camera, _) {
          // Close enough to read a town's name beside its value; and the border's width follows the zoom.
          final z = camera.zoom;
          if ((z >= 6) == (_zoom >= 6) && (z - _zoom).abs() < 0.5) return;
          // The camera can move while the map is laid out (its first fit): redraw after that frame.
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted) setState(() => _zoom = z);
          });
        },
      ),
      children: [
        if (sat)
          TileLayer(urlTemplate: data.satTiles, maxNativeZoom: data.satMaxZoom, userAgentPackageName: 'com.sudagri.app')
        else if (v?.below != null)
          vectorLayer(v!.below),
        if (under.isNotEmpty) PolygonLayer<MapInfo>(polygons: under, hitNotifier: _fillHit, simplificationTolerance: 0),
        if (!sat && v?.above != null) vectorLayer(v!.above),
        if (sat && v?.hybrid != null) vectorLayer(v!.hybrid),
        if (v != null && data.halaib.length >= 2)
          PolylineLayer(
            polylines: [
              Polyline(
                points: data.halaib,
                color: (v.style.borderColour ?? Colors.grey).withValues(alpha: sat ? 0.55 : 1),
                strokeWidth: halaibWidth,
                strokeCap: StrokeCap.round,
                strokeJoin: StrokeJoin.round,
              ),
            ],
          ),
        if (overFills.isNotEmpty) PolygonLayer<MapInfo>(polygons: overFills, hitNotifier: _fillHit),
        if (lines.isNotEmpty) PolylineLayer<MapInfo>(polylines: lines, hitNotifier: _lineHit),
        if (points.isNotEmpty) CircleLayer<MapInfo>(circles: points, hitNotifier: _pointHit),
        if (pins.isNotEmpty)
          MarkerLayer(
            markers: [
              for (final o in pins)
                for (final p in o.pins) _pinMarker(context, o, p),
            ],
          ),
        if (_me != null)
          MarkerLayer(
            markers: [
              Marker(
                point: _me!,
                width: 22,
                height: 22,
                child: Container(
                  key: const Key('maps-me'),
                  decoration: BoxDecoration(
                    color: const Color(0xFF1A73E8),
                    shape: BoxShape.circle,
                    border: Border.all(color: Colors.white, width: 3),
                    boxShadow: const [BoxShadow(color: Color(0x33000000), blurRadius: 6)],
                  ),
                ),
              ),
            ],
          ),
        // The sources' names bottom left, folded into an «i»: the right edge holds the buttons and the key.
        RichAttributionWidget(
          alignment: AttributionAlignment.bottomLeft,
          attributions: [
            for (final c in sat ? [...data.satCredits, ...data.mapCredits] : data.mapCredits)
              TextSourceAttribution(c.text, prependCopyright: false, onTap: () => launchUrl(Uri.parse(c.url))),
          ],
        ),
      ],
    );

    return Directionality(
      textDirection: TextDirection.ltr,
      child: LayoutBuilder(
        builder: (context, box) => Stack(
          children: [
            Positioned.fill(child: map),
            Positioned(top: 0, left: 0, right: 0, child: _chips(context, data)),
            Positioned(right: 12, top: 68, child: _controls(context, sat)),
            Positioned(
              top: 62,
              left: 12,
              right: 80,
              child: Directionality(
                textDirection: isEn ? TextDirection.ltr : TextDirection.rtl,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (!data.week)
                      _notice(
                        context,
                        tr('تعذّر جلبُ توقّع الأسبوع الآن، فالطبقات الثابتة وحدها معروضة. أعد المحاولة بعد قليل.', 'The week\'s forecast could not be fetched just now, so only the fixed layers are shown. Try again shortly.'),
                        action: (tr('أعد المحاولة', 'Try again'), _retry),
                      ),
                    if (_groundFailed && !sat)
                      _notice(
                        context,
                        tr('تعذّر تحميل الخريطة الآن. تحقّق من الاتّصال وأعد المحاولة.', 'Could not load the map right now. Check the connection and try again.'),
                        action: (tr('أعد المحاولة', 'Try again'), () => _loadGround(data.styleUrl)),
                      ),
                  ],
                ),
              ),
            ),
            if (grid?.empty != null && grid!.overlays.isEmpty)
              Positioned(
                left: 24,
                right: 24,
                top: box.maxHeight / 3,
                child: Center(child: _emptyCard(context, grid.empty!)),
              ),
            if (grid != null || _shownOver.isNotEmpty)
              Positioned(
                right: 10,
                bottom: 10,
                width: math.min(352, box.maxWidth - 88),
                child: _keyCard(context, grid, card, scheme, box.maxHeight),
              ),
            if (_picked != null)
              Positioned(left: 12, right: 12, bottom: 12, child: _pickedCard(context, _picked!, card)),
          ],
        ),
      ),
    );
  }

  Marker _pinMarker(BuildContext context, MapOverlay o, MapPin p) {
    final ink = material.Theme.of(context).colorScheme.onSurface;
    final card = material.Theme.of(context).cardColor;
    void tap() {
      if (p.info != null) setState(() => _picked = p.info);
    }

    if (o.green) {
      // The verified-lands count: a green circle with the number, as on the website.
      return Marker(
        point: p.at,
        width: 40,
        height: 40,
        child: GestureDetector(
          onTap: tap,
          child: Container(
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: const Color(0xFF2A6424),
              shape: BoxShape.circle,
              border: Border.all(color: Colors.white, width: 2),
              boxShadow: const [BoxShadow(color: Color(0x33000000), blurRadius: 6)],
            ),
            child: Text(
              p.text,
              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 13),
            ),
          ),
        ),
      );
    }
    // A tag with a point under it. Far out it shows the value alone, so the towns fit a phone;
    // closer in, the town's name too.
    final near = _zoom >= 6 && p.name != null;
    return Marker(
      point: p.at,
      width: near ? 190 : 120,
      height: 34,
      alignment: Alignment.topCenter,
      child: Align(
        alignment: Alignment.bottomCenter,
        child: GestureDetector(
          onTap: tap,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: card,
                  borderRadius: BorderRadius.circular(99),
                  border: Border.all(color: material.Theme.of(context).dividerColor),
                  boxShadow: const [BoxShadow(color: Color(0x26000000), blurRadius: 6, offset: Offset(0, 2))],
                ),
                child: Text.rich(
                  TextSpan(
                    children: [
                      if (near)
                        TextSpan(
                          text: '${p.name} · ',
                          style: TextStyle(color: mutedOn(context), fontWeight: FontWeight.w700),
                        ),
                      TextSpan(text: p.text),
                    ],
                  ),
                  textDirection: isEn ? TextDirection.ltr : TextDirection.rtl,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: ink),
                ),
              ),
              CustomPaint(size: const Size(10, 5), painter: _Tail(card)),
            ],
          ),
        ),
      ),
    );
  }

  /// الطبقات: a row that scrolls sideways, as on the website's phone view.
  Widget _chips(BuildContext context, MapsData data) {
    final scheme = material.Theme.of(context).colorScheme;
    final card = material.Theme.of(context).cardColor;
    Widget chip({
      required Key key,
      required bool on,
      required String lead,
      required String title,
      required VoidCallback onTap,
      bool grid = true,
    }) {
      final bg = on && grid ? scheme.primary : card.withValues(alpha: 0.95);
      final fg = on && grid ? scheme.onPrimary : (on ? scheme.primary : scheme.onSurface);
      return Padding(
        padding: const EdgeInsetsDirectional.only(end: 8),
        child: Material(
          color: bg,
          elevation: 2,
          shadowColor: const Color(0x33000000),
          shape: StadiumBorder(
            side: BorderSide(
              color: on ? scheme.primary : material.Theme.of(context).dividerColor,
              width: on && !grid ? 2 : 1,
            ),
          ),
          child: InkWell(
            key: key,
            customBorder: const StadiumBorder(),
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(lead, style: const TextStyle(fontSize: 14)),
                  const SizedBox(width: 6),
                  Text(
                    title,
                    style: TextStyle(color: fg, fontWeight: FontWeight.w800, fontSize: 14),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    }

    final grids = data.grids;
    final overs = data.overs;
    return Directionality(
      textDirection: isEn ? TextDirection.ltr : TextDirection.rtl,
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.all(10),
        child: Row(
          children: [
            for (final g in grids)
              Semantics(
                selected: g.key == _gridKey,
                button: true,
                child: chip(
                  key: Key('maps-chip-${g.key}'),
                  on: g.key == _gridKey,
                  lead: g.emoji,
                  title: g.title,
                  onTap: () => _pickGrid(g.key),
                ),
              ),
            if (grids.isNotEmpty && overs.isNotEmpty)
              Padding(
                padding: const EdgeInsetsDirectional.only(end: 8),
                child: SizedBox(
                  width: 1,
                  height: 26,
                  child: ColoredBox(color: material.Theme.of(context).dividerColor),
                ),
              ),
            for (final o in overs)
              Semantics(
                selected: _over.contains(o.key),
                button: true,
                child: chip(
                  key: Key('maps-chip-${o.key}'),
                  on: _over.contains(o.key),
                  lead: _over.contains(o.key) ? '✓' : o.emoji,
                  title: o.title,
                  grid: false,
                  onTap: () => _toggleOver(o.key),
                ),
              ),
          ],
        ),
      ),
    );
  }

  /// The delivery-app controls, on the right edge whatever the language.
  Widget _controls(BuildContext context, bool sat) {
    final card = material.Theme.of(context).cardColor;
    final primary = material.Theme.of(context).colorScheme.primary;
    Widget round({required Key key, required String label, required Widget child, required VoidCallback? onTap}) =>
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Tooltip(
            message: label,
            child: Material(
              color: card.withValues(alpha: 0.95),
              shape: CircleBorder(side: BorderSide(color: material.Theme.of(context).dividerColor)),
              elevation: 3,
              shadowColor: const Color(0x33000000),
              child: InkWell(
                key: key,
                customBorder: const CircleBorder(),
                onTap: onTap,
                child: SizedBox(width: 48, height: 48, child: Center(child: child)),
              ),
            ),
          ),
        );

    return Column(
      children: [
        // The ground: a square that shows the other ground's colours and name.
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Semantics(
            button: true,
            toggled: sat,
            label: sat ? tr('خريطة', 'Map') : tr('قمر صناعي', 'Satellite'),
            child: GestureDetector(
              key: const Key('maps-ground'),
              onTap: () => setState(() {
                _ground = sat ? _Ground.map : _Ground.sat;
                _picked = null;
              }),
              child: Container(
                width: 56,
                height: 56,
                clipBehavior: Clip.antiAlias,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: Colors.white, width: 2),
                  boxShadow: const [BoxShadow(color: Color(0x33000000), blurRadius: 8, offset: Offset(0, 2))],
                  gradient: sat
                      ? const LinearGradient(
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                          colors: [Color(0xFFF3EAD7), Color(0xFFE8E1CF), Color(0xFFCFE3C6)],
                        )
                      : const LinearGradient(
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                          colors: [Color(0xFF2F4A2C), Color(0xFF6B7F3A), Color(0xFF3D5A33), Color(0xFF8A7A52)],
                          stops: [0, 0.45, 0.7, 1],
                        ),
                ),
                alignment: Alignment.bottomCenter,
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(vertical: 2),
                  color: sat ? primary.withValues(alpha: 0.85) : const Color(0x73000000),
                  child: Text(
                    sat ? tr('خريطة', 'Map') : tr('قمر صناعي', 'Satellite'),
                    textAlign: TextAlign.center,
                    textDirection: isEn ? TextDirection.ltr : TextDirection.rtl,
                    style: const TextStyle(color: Colors.white, fontSize: 10.5, fontWeight: FontWeight.w900),
                  ),
                ),
              ),
            ),
          ),
        ),
        round(
          key: const Key('maps-locate'),
          label: tr('موقعي', 'My location'),
          onTap: _locating ? null : _locate,
          child: _locating
              ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
              : Icon(Icons.my_location_rounded, color: primary),
        ),
        round(
          key: const Key('maps-zoom-in'),
          label: tr('تكبير', 'Zoom in'),
          onTap: () => _map.move(_map.camera.center, math.min(_map.camera.zoom + 1, 18)),
          child: const Icon(Icons.add_rounded, size: 26),
        ),
        round(
          key: const Key('maps-zoom-out'),
          label: tr('تصغير', 'Zoom out'),
          onTap: () => _map.move(_map.camera.center, math.max(_map.camera.zoom - 1, 2)),
          child: const Icon(Icons.remove_rounded, size: 26),
        ),
      ],
    );
  }

  Widget _notice(BuildContext context, String text, {(String, VoidCallback)? action}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: warnTintOn(context),
        borderRadius: BorderRadius.circular(14),
        elevation: 2,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 8, 8),
          child: Row(
            children: [
              Expanded(
                child: Text(text, style: TextStyle(fontSize: 12.5, height: 1.5, color: warnOn(context))),
              ),
              if (action != null) TextButton(onPressed: action.$2, child: Text(action.$1)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _emptyCard(BuildContext context, MapEmpty empty) {
    return Directionality(
      textDirection: isEn ? TextDirection.ltr : TextDirection.rtl,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 300),
        child: Material(
          key: const Key('maps-empty'),
          color: material.Theme.of(context).cardColor.withValues(alpha: 0.95),
          borderRadius: BorderRadius.circular(18),
          elevation: 3,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  empty.text,
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
                if (_site.isNotEmpty) TextButton(onPressed: () => _openSite(empty.href), child: Text(empty.link)),
              ],
            ),
          ),
        ),
      ),
    );
  }

  /// المفتاح: a card at the bottom that folds away.
  Widget _keyCard(BuildContext context, MapTheme? grid, Color card, ColorScheme scheme, double height) {
    final shown = _shownOver;
    final muted = mutedOn(context);
    final titles = [?grid?.title, ...shown.map((o) => o.title)].join(' · ');
    return Directionality(
      textDirection: isEn ? TextDirection.ltr : TextDirection.rtl,
      child: Material(
        key: const Key('maps-key'),
        color: card.withValues(alpha: 0.96),
        borderRadius: BorderRadius.circular(18),
        elevation: 3,
        shadowColor: const Color(0x33000000),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            InkWell(
              key: const Key('maps-key-toggle'),
              borderRadius: BorderRadius.circular(18),
              onTap: () => setState(() => _keyOpen = !_keyOpen),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(14, 8, 14, 8),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        titles,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 14),
                      ),
                    ),
                    AnimatedRotation(
                      turns: _keyOpen ? 0.5 : 0,
                      duration: const Duration(milliseconds: 150),
                      child: Icon(Icons.expand_more_rounded, color: muted),
                    ),
                  ],
                ),
              ),
            ),
            if (_keyOpen)
              ConstrainedBox(
                constraints: BoxConstraints(maxHeight: height * 0.38),
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(14, 0, 14, 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      if (grid != null) ..._gridKey2(context, grid, card),
                      for (final (i, o) in shown.indexed) ...[
                        if (grid != null || i > 0) const Divider(height: 18),
                        Text(o.note, style: const TextStyle(fontSize: 12, height: 1.6)),
                        if (o.key2.isNotEmpty) ...[
                          const SizedBox(height: 4),
                          _twoColumns([for (final k in o.key2) _keyRow(k, card)]),
                        ],
                      ],
                      const SizedBox(height: 8),
                      Text(tr('المس أيّ لونٍ أو علامةٍ لتعرف ما هي.', 'Tap any colour or mark to see what it is.'), style: TextStyle(fontSize: 11, color: muted)),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  List<Widget> _gridKey2(BuildContext context, MapTheme grid, Color card) {
    final muted = mutedOn(context);
    final border = material.Theme.of(context).dividerColor;
    return [
      Text(grid.note, style: const TextStyle(fontSize: 12, height: 1.6)),
      if (grid.sub != null) Text(grid.sub!, style: TextStyle(fontSize: 11, height: 1.6, color: muted)),
      if (grid.legend.isNotEmpty && grid.key != 'soil') ...[
        const SizedBox(height: 8),
        // Low to high from the left, as every such bar is read.
        Directionality(
          textDirection: TextDirection.ltr,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Container(
                key: const Key('maps-legend-bar'),
                height: 12,
                clipBehavior: Clip.antiAlias,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(99),
                  border: Border.all(color: border),
                ),
                child: Row(
                  children: [for (final b in grid.legend) Expanded(child: ColoredBox(color: b.colour ?? card))],
                ),
              ),
              const SizedBox(height: 3),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (final b in grid.legend)
                    Expanded(
                      child: Text(
                        b.label,
                        textAlign: TextAlign.center,
                        textDirection: isEn ? TextDirection.ltr : TextDirection.rtl,
                        style: TextStyle(fontSize: 10, height: 1.2, color: muted),
                      ),
                    ),
                ],
              ),
              if (grid.unit != null)
                Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: Text(
                    grid.unit!,
                    textAlign: TextAlign.center,
                    textDirection: isEn ? TextDirection.ltr : TextDirection.rtl,
                    style: TextStyle(fontSize: 11, color: muted),
                  ),
                ),
            ],
          ),
        ),
      ],
      if (grid.legend.isNotEmpty && grid.key == 'soil') ...[
        const SizedBox(height: 8),
        _twoColumns([
          for (final b in grid.legend) _keyRow(KeyEntry(colour: b.colour, label: b.label, shape: 'swatch'), card),
        ]),
      ],
      if (grid.key == 'lands' && grid.overlays.isNotEmpty) ...[
        const SizedBox(height: 8),
        Row(
          children: [
            Container(
              width: 16,
              height: 16,
              decoration: const BoxDecoration(color: Color(0xFF2A6424), shape: BoxShape.circle),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                tr('الرقم عدد الأراضي الموثّقة في المربّع (نحو ١٦٧ كم)', 'The number is the count of verified lands in the square (about 167 km)'),
                style: TextStyle(fontSize: 11, color: muted),
              ),
            ),
          ],
        ),
      ],
    ];
  }

  Widget _twoColumns(List<Widget> rows) => LayoutBuilder(
    builder: (context, c) => Wrap(
      runSpacing: 4,
      children: [for (final r in rows) SizedBox(width: (c.maxWidth - 1) / 2, child: r)],
    ),
  );

  Widget _keyRow(KeyEntry k, Color card) {
    final colour = k.colour ?? card;
    final Widget mark = switch (k.shape) {
      'dot' => Container(
        width: 10,
        height: 10,
        decoration: BoxDecoration(
          color: colour,
          shape: BoxShape.circle,
          border: Border.all(color: Colors.white),
        ),
      ),
      'dash' => SizedBox(
        width: 20,
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [for (var i = 0; i < 3; i++) Container(width: 4, height: 2, color: colour)],
        ),
      ),
      'swatch' => Container(
        width: 12,
        height: 12,
        decoration: BoxDecoration(
          color: colour,
          borderRadius: BorderRadius.circular(3),
          border: Border.all(color: const Color(0x22000000)),
        ),
      ),
      _ => Container(
        width: 20,
        height: 4,
        decoration: BoxDecoration(color: colour, borderRadius: BorderRadius.circular(99)),
      ),
    };
    return Row(
      children: [
        SizedBox(width: 22, child: Center(child: mark)),
        const SizedBox(width: 6),
        Expanded(child: Text(k.label, style: const TextStyle(fontSize: 11))),
      ],
    );
  }

  Widget _pickedCard(BuildContext context, MapInfo info, Color card) {
    return Directionality(
      textDirection: isEn ? TextDirection.ltr : TextDirection.rtl,
      child: Material(
        key: const Key('maps-picked'),
        color: card,
        borderRadius: BorderRadius.circular(18),
        elevation: 4,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 8, 14),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(info.title, style: const TextStyle(fontWeight: FontWeight.w900)),
                    if (info.detail != null && info.detail!.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(info.detail!, style: TextStyle(fontSize: 13, height: 1.6, color: mutedOn(context))),
                    ],
                  ],
                ),
              ),
              IconButton(
                tooltip: tr('أغلق', 'Close'),
                onPressed: () => setState(() => _picked = null),
                icon: const Icon(Icons.close_rounded),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// «عن هذه الخريطة»: the page's paragraph under the map, its links, and its sources.
  void _about(MapsData data) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.8),
          child: ListView(
            shrinkWrap: true,
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
            children: [
              SectionTitle(tr('عن هذه الخريطة', 'About this map')),
              const SizedBox(height: 8),
              Text(
                tr('خريطة العالم كلّه، تتنقّل فيها كما في خرائط قوقل وتطبيقات التوصيل، و«موقعي» يضعك عليها بنقطةٍ زرقاء. '
                'وزرّ الأرضيّة على اليمين يبدّل بين الخريطة وصورة القمر الصناعيّ. والطبقات في الأعلى للسودان، لأنّ '
                'بياناتها عنه: طبقات الأسبوع تحلّ واحدتُها محلّ الأخرى، والقناة والمعادن والطرق تُضاف فوقها. المس أيّ '
                'لونٍ أو علامة لتقرأ ما هي.', 'A map of the whole world that you move around in as in Google Maps and delivery apps, and «My location» puts you on it with a blue dot. The ground button on the right switches between the map and the satellite image. The layers at the top are for Sudan, because their data is about it: the week\'s layers replace one another, and the canal, minerals and roads are added on top. Tap any colour or mark to read what it is.'),
                style: TextStyle(height: 1.8, color: mutedOn(context)),
              ),
              const SizedBox(height: 12),
              Text(tr('ولكلّ طبقةٍ صفحتُها بالتفصيل:', 'Each layer has its own page with the detail:'), style: TextStyle(color: mutedOn(context))),
              Wrap(
                spacing: 4,
                children: [
                  TextButton(
                    onPressed: () => Navigator.of(context)
                      ..pop()
                      ..push(MaterialPageRoute<void>(builder: (_) => const RainScreen())),
                    child: Text(tr('الأمطار والتربة', 'Rain and soil')),
                  ),
                  if (_site.isNotEmpty)
                    TextButton(onPressed: () => _openSite('/arc-canal'), child: Text(tr('قناة الأرك', 'The arc canal'))),
                  TextButton(
                    onPressed: () => Navigator.of(context)
                      ..pop()
                      ..push(MaterialPageRoute<void>(builder: (_) => const MiningScreen())),
                    child: Text(tr('التعدين', 'Mining')),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                data.sources,
                key: const Key('maps-sources'),
                style: TextStyle(fontSize: 12, height: 1.8, color: mutedOn(context)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The point under a town's tag.
class _Tail extends CustomPainter {
  _Tail(this.colour);

  final Color colour;

  @override
  void paint(Canvas canvas, Size size) {
    final path = Path()
      ..moveTo(0, 0)
      ..lineTo(size.width, 0)
      ..lineTo(size.width / 2, size.height)
      ..close();
    canvas.drawPath(path, Paint()..color = colour);
  }

  @override
  bool shouldRepaint(_Tail old) => old.colour != colour;
}
