/// «الخرائط» (البند ٢٠٣): what the website's /map draws, as the app receives it from
/// /api/app/map, and the street ground's style, adjusted as the website adjusts it.
///
/// The layers are the website's own (mapThemes in src/lib/mapLayers.ts): each theme's chip, its
/// key, and what it draws as GeoJSON with the colour on each feature. The app parses them here,
/// apart from the screen, so the shape of the JSON can be tested without a widget tree.
///
/// The street ground is OpenFreeMap's «liberty», as on the website: a vector style. The website's
/// LiveMap changes three things in it, and so does [GroundStyle] — the names in Arabic where the
/// tiles have them, the dashed line that cuts Halaib from Sudan hidden (البند ١٧٤), and the
/// colour bands drawn under the water, roads, borders and names, so a band never hides the Nile or
/// a town's name. On the satellite only the labels, roads and borders are kept over the picture.
library;

import 'dart:convert';
import 'dart:math' as math;
import 'dart:ui' show Color;

import 'package:http/http.dart' as http;
import 'package:latlong2/latlong.dart';
import 'i18n.dart';

/// The website's heat ramp (HEAT in src/lib/mapLayers.ts), low to high: beige into green, with no
/// red and no orange — the owner made no exception for data maps. scripts/verify-app-maps.ts fails
/// if the two lists differ. The server sends each band's colour; this is what the app falls back on
/// for a heat band that arrives without one.
const heatRamp = <String>['#f6f1e2', '#dfeccf', '#b6d69a', '#7fb85a', '#579b2e', '#0f5a32'];

/// The canal's line on the website, and the colour a line falls back on.
const lineGreen = '#0f5a32';

/// Sudan as the map first shows it (SUDAN_BOUNDS in LiveMap.tsx): west, south, east, north.
const sudanBounds = (21.8, 8.6, 38.7, 22.3);

/// A colour as the website writes one: #rgb, #rrggbb, rgb(), rgba(), hsl() or hsla(). A CSS variable
/// (the "no rain" band is «the card colour») and anything else is null.
Color? parseColour(Object? value) {
  if (value is! String) return null;
  final v = value.trim().toLowerCase();
  final hex = RegExp(r'^#([0-9a-f]{3}|[0-9a-f]{6})$').firstMatch(v);
  if (hex != null) {
    var h = hex.group(1)!;
    if (h.length == 3) h = h.split('').map((c) => '$c$c').join();
    return Color(0xFF000000 | int.parse(h, radix: 16));
  }
  final fn = RegExp(r'^(rgba?|hsla?)\(([^)]*)\)$').firstMatch(v);
  if (fn == null) return null;
  final parts = fn.group(2)!.split(RegExp(r'[\s,/]+')).where((p) => p.isNotEmpty).toList();
  if (parts.length < 3) return null;
  double num(String p) => double.tryParse(p.replaceAll('%', '')) ?? 0;
  final alpha = parts.length > 3 ? (parts[3].endsWith('%') ? num(parts[3]) / 100 : num(parts[3])) : 1.0;
  if (fn.group(1)!.startsWith('rgb')) {
    int c(String p) => (p.endsWith('%') ? num(p) * 2.55 : num(p)).round().clamp(0, 255);
    return Color.fromARGB((alpha.clamp(0, 1) * 255).round(), c(parts[0]), c(parts[1]), c(parts[2]));
  }
  // hsl(h, s%, l%)
  final h = (num(parts[0]) % 360) / 360;
  final s = (num(parts[1]) / 100).clamp(0.0, 1.0);
  final l = (num(parts[2]) / 100).clamp(0.0, 1.0);
  double hue(double p, double q, double t) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  }

  final q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  final p = 2 * l - q;
  int ch(double x) => (x * 255).round().clamp(0, 255);
  return Color.fromARGB(
    (alpha.clamp(0, 1) * 255).round(),
    ch(s == 0 ? l : hue(p, q, h + 1 / 3)),
    ch(s == 0 ? l : hue(p, q, h)),
    ch(s == 0 ? l : hue(p, q, h - 1 / 3)),
  );
}

/// What a tapped colour or mark says: its card, as on the website.
class MapInfo {
  const MapInfo(this.title, [this.detail]);

  final String title;
  final String? detail;

  @override
  bool operator ==(Object other) => other is MapInfo && other.title == title && other.detail == detail;

  @override
  int get hashCode => Object.hash(title, detail);
}

/// One feature of a fill, line or points overlay, with its colour and width already read.
class MapFeature {
  const MapFeature({this.polygons = const [], this.lines = const [], this.point, this.colour, this.width, this.info});

  /// Each polygon: its outer ring, then any holes.
  final List<List<List<LatLng>>> polygons;
  final List<List<LatLng>> lines;
  final LatLng? point;
  final Color? colour;
  final double? width;

  /// Null for a feature with no title: tapping it opens nothing, as on the website.
  final MapInfo? info;
}

/// A tag on the map: its value, the place's name (shown when close), and its card.
class MapPin {
  const MapPin({required this.at, required this.text, this.name, this.info});

  final LatLng at;
  final String text;
  final String? name;
  final MapInfo? info;
}

enum OverlayKind { fill, line, points, pins }

/// What a theme draws (MapOverlay in LiveMap.tsx).
class MapOverlay {
  const MapOverlay({
    required this.kind,
    required this.id,
    this.features = const [],
    this.pins = const [],
    this.opacity = 0.55,
    this.under = false,
    this.outline,
    this.dash,
    this.radius = 6,
    this.stroke,
    this.green = false,
  });

  final OverlayKind kind;
  final String id;
  final List<MapFeature> features;
  final List<MapPin> pins;

  /// A fill's opacity (the website's default is 0.55; its grid layers send 0.62).
  final double opacity;

  /// A fill drawn under the street map's water, roads, borders and names.
  final bool under;
  final Color? outline;

  /// A line's dashes, in multiples of its width, as MapLibre reads them.
  final List<double>? dash;
  final double radius;
  final Color? stroke;

  /// Pins in the green circle the website uses for the verified-lands count.
  final bool green;

  static MapOverlay fromJson(Map<String, dynamic> m) {
    final kind = OverlayKind.values.firstWhere((k) => k.name == m['kind'], orElse: () => OverlayKind.pins);
    final id = m['id'] as String? ?? '';
    if (kind == OverlayKind.pins) {
      return MapOverlay(
        kind: kind,
        id: id,
        green: m['tone'] == 'green',
        pins: ((m['pins'] as List<dynamic>?) ?? const []).map((p) {
          final pm = p as Map<String, dynamic>;
          final title = pm['title'] as String?;
          return MapPin(
            at: LatLng(_n(pm['lat']), _n(pm['lon'])),
            text: '${pm['text'] ?? ''}',
            name: pm['name'] as String?,
            info: title == null ? null : MapInfo(title, pm['detail'] as String?),
          );
        }).toList(),
      );
    }
    final colourOf = _paint(m['color'], parseColour);
    final widthOf = _paint(m['width'], (v) => v is num ? v.toDouble() : null);
    final data = m['data'] as Map<String, dynamic>?;
    final features = <MapFeature>[];
    for (final f in (data?['features'] as List<dynamic>?) ?? const []) {
      final fm = f as Map<String, dynamic>;
      final props = (fm['properties'] as Map<String, dynamic>?) ?? const {};
      final g = fm['geometry'] as Map<String, dynamic>?;
      if (g == null) continue;
      final title = props['title'];
      final info = title == null ? null : MapInfo('$title', props['detail'] == null ? null : '${props['detail']}');
      final c = g['coordinates'];
      List<List<List<LatLng>>> polygons = const [];
      List<List<LatLng>> lines = const [];
      LatLng? point;
      switch (g['type']) {
        case 'Polygon':
          polygons = [_rings(c)];
        case 'MultiPolygon':
          polygons = (c as List<dynamic>).map(_rings).toList();
        case 'LineString':
          lines = [_line(c)];
        case 'MultiLineString':
          lines = _rings(c);
        case 'Point':
          point = _pt(c);
        default:
          continue;
      }
      features.add(
        MapFeature(
          polygons: polygons,
          lines: lines,
          point: point,
          colour: colourOf(props) ?? (kind == OverlayKind.line ? parseColour(lineGreen) : null),
          width: widthOf(props),
          info: info,
        ),
      );
    }
    return MapOverlay(
      kind: kind,
      id: id,
      features: features,
      opacity: (m['opacity'] as num?)?.toDouble() ?? 0.55,
      under: m['under'] == true,
      outline: parseColour(m['outline']),
      dash: (m['dash'] as List<dynamic>?)?.map(_n).toList(),
      radius: (m['radius'] as num?)?.toDouble() ?? 6,
      stroke: parseColour(m['stroke']),
    );
  }
}

/// A paint value as the website writes it: a constant, or ["get", "name"] read from each feature.
T? Function(Map<String, dynamic>) _paint<T>(Object? value, T? Function(Object?) read) {
  if (value is List && value.length == 2 && value[0] == 'get') {
    final key = '${value[1]}';
    return (props) => read(props[key]);
  }
  final constant = read(value);
  return (_) => constant;
}

double _n(Object? v) => (v as num).toDouble();
LatLng _pt(Object? p) => LatLng(_n((p as List<dynamic>)[1]), _n(p[0]));
List<LatLng> _line(Object? l) => (l as List<dynamic>).map(_pt).toList();
List<List<LatLng>> _rings(Object? r) => (r as List<dynamic>).map(_line).toList();

/// A swatch in a theme's key: a band of colour, or a line, dash or dot.
class KeyEntry {
  const KeyEntry({required this.colour, required this.label, this.shape = 'band'});

  /// Null for «the card colour» (no rain): drawn in the card's own colour.
  final Color? colour;
  final String label;

  /// band, line, dash or dot.
  final String shape;
}

class MapEmpty {
  const MapEmpty({required this.text, required this.href, required this.link});

  final String text;

  /// A path on the website («/lands/new»).
  final String href;
  final String link;
}

/// One theme the map screen offers: its chip, its key, and what it draws (MapTheme in mapLayers.ts).
class MapTheme {
  const MapTheme({
    required this.key,
    required this.emoji,
    required this.title,
    required this.note,
    required this.grid,
    this.sub,
    this.unit,
    this.legend = const [],
    this.key2 = const [],
    this.overlays = const [],
    this.empty,
  });

  final String key;
  final String emoji;
  final String title;
  final String note;
  final String? sub;
  final String? unit;

  /// Swatches, low to high.
  final List<KeyEntry> legend;

  /// Line and point keys.
  final List<KeyEntry> key2;

  /// A grid layer replaces the last; the others are laid over whatever is shown.
  final bool grid;
  final List<MapOverlay> overlays;
  final MapEmpty? empty;

  static MapTheme fromJson(Map<String, dynamic> m) {
    final key = m['key'] as String;
    final legend = ((m['legend'] as List<dynamic>?) ?? const []).indexed.map((e) {
      final (i, b) = e;
      final bm = b as Map<String, dynamic>;
      var colour = parseColour(bm['colour']);
      // «rgba(0,0,0,0)»: no paint on the map, the card colour in the key.
      if (colour != null && colour.a == 0) colour = null;
      if (colour == null && key == 'tmax' && i < heatRamp.length) colour = parseColour(heatRamp[i]);
      return KeyEntry(colour: colour, label: bm['label'] as String? ?? '');
    }).toList();
    final empty = m['empty'] as Map<String, dynamic>?;
    return MapTheme(
      key: key,
      emoji: m['emoji'] as String? ?? '',
      title: m['title'] as String? ?? key,
      note: m['note'] as String? ?? '',
      sub: m['sub'] as String?,
      unit: m['unit'] as String?,
      grid: m['group'] == 'grid',
      legend: legend,
      key2: ((m['key2'] as List<dynamic>?) ?? const []).map((k) {
        final km = k as Map<String, dynamic>;
        return KeyEntry(
          colour: parseColour(km['colour']),
          label: km['label'] as String? ?? '',
          shape: km['shape'] as String? ?? 'line',
        );
      }).toList(),
      overlays: ((m['overlays'] as List<dynamic>?) ?? const [])
          .map((o) => MapOverlay.fromJson(o as Map<String, dynamic>))
          .toList(),
      empty: empty == null
          ? null
          : MapEmpty(
              text: empty['text'] as String? ?? '',
              href: empty['href'] as String? ?? '/',
              link: empty['link'] as String? ?? '',
            ),
    );
  }
}

class GroundCredit {
  const GroundCredit(this.text, this.url);

  final String text;
  final String url;
}

/// Everything /api/app/map sends.
class MapsData {
  const MapsData({
    required this.week,
    required this.styleUrl,
    required this.satTiles,
    required this.satMaxZoom,
    required this.mapCredits,
    required this.satCredits,
    required this.halaib,
    required this.sources,
    required this.themes,
  });

  /// False when the week's forecast could not be fetched: only the fixed layers came.
  final bool week;
  final String styleUrl;
  final String satTiles;
  final int satMaxZoom;
  final List<GroundCredit> mapCredits;
  final List<GroundCredit> satCredits;

  /// Sudan's border round the Halaib triangle, drawn over the street map's tiles as the website does.
  final List<LatLng> halaib;
  final String sources;
  final List<MapTheme> themes;

  List<MapTheme> get grids => themes.where((t) => t.grid).toList();
  List<MapTheme> get overs => themes.where((t) => !t.grid).toList();

  factory MapsData.fromJson(Map<String, dynamic> json) {
    final grounds = json['grounds'] as Map<String, dynamic>;
    final credits = (grounds['credits'] as Map<String, dynamic>?) ?? const {};
    List<GroundCredit> creditList(Object? l) => ((l as List<dynamic>?) ?? const []).map((c) {
      final cm = c as Map<String, dynamic>;
      return GroundCredit(cm['text'] as String, cm['url'] as String);
    }).toList();
    return MapsData(
      week: json['week'] as bool? ?? true,
      styleUrl: grounds['style'] as String,
      satTiles: grounds['sat'] as String,
      satMaxZoom: (grounds['satMaxZoom'] as num?)?.toInt() ?? 13,
      mapCredits: creditList(credits['map']),
      satCredits: creditList(credits['sat']),
      halaib: _line(json['halaib'] ?? const []),
      sources: json['sources'] as String? ?? '',
      themes: (json['themes'] as List<dynamic>).map((t) => MapTheme.fromJson(t as Map<String, dynamic>)).toList(),
    );
  }
}

class MapsException implements Exception {
  MapsException(this.message);

  final String message;

  @override
  String toString() => message;
}

/// The map's layers from the website. Public, as /map is: no session is sent.
Future<MapsData> fetchMaps(http.Client client, String siteUrl) async {
  if (siteUrl.isEmpty) throw MapsException(tr('الخرائط غير مضبوطة في هذه النسخة من التطبيق.', 'Maps are not set up in this version of the app.'));
  late final http.Response res;
  try {
    res = await client.get(Uri.parse('$siteUrl/api/app/map')).timeout(const Duration(seconds: 30));
  } catch (_) {
    throw MapsException(tr('تعذّر الاتصال. تحقّق من الشبكة وأعد المحاولة.', 'Could not connect. Check the network and try again.'));
  }
  // A proxy or an error page can answer with HTML: that is a failed load, not a crash.
  try {
    final body = jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>;
    if (res.statusCode != 200) {
      throw MapsException(body['error'] as String? ?? tr('تعذّر تحميل الخرائط (${res.statusCode}).', 'Could not load the maps (${res.statusCode}).'));
    }
    return MapsData.fromJson(body);
  } on MapsException {
    rethrow;
  } catch (_) {
    throw MapsException(tr('تعذّر تحميل الخرائط (${res.statusCode}).', 'Could not load the maps (${res.statusCode}).'));
  }
}

/* ───────────────────────── the street ground ───────────────────────── */

typedef StyleLayer = Map<String, dynamic>;

/// The street map's source layers a colour band goes under (firstAbove in LiveMap.tsx).
const _aboveSourceLayers = {'water', 'waterway', 'transportation', 'boundary'};

/// Where an `under` fill goes: before the first layer of water, roads, borders or names.
int firstAboveIndex(List<StyleLayer> layers) {
  final i = layers.indexWhere((l) => l['type'] == 'symbol' || _aboveSourceLayers.contains(l['source-layer']));
  return i < 0 ? layers.length : i;
}

/// Labels in Arabic where the tiles have them, the local name otherwise (arabicLabels in LiveMap.tsx).
List<StyleLayer> withArabicLabels(List<StyleLayer> layers) => [
  for (final l in layers)
    if (l['type'] == 'symbol' && l['layout'] is Map && (l['layout'] as Map).containsKey('text-field'))
      {
        ...l,
        'layout': {
          ...(l['layout'] as Map<String, dynamic>),
          'text-field': [
            'coalesce',
            ['get', 'name:ar'],
            ['get', 'name'],
          ],
        },
      }
    else
      l,
];

/// The names OpenFreeMap's tiles give the dashed line that cuts the Halaib triangle from Sudan
/// (read from a tile on 24 October, src/lib/mapStyle.ts), in the spellings it has been seen in.
const halaibNames = <String>[
  'السودان-مثلثحلايب', // ar-only
  'السودان-مثلث حلايب', // ar-only
  'مثلثحلايب', // ar-only
  'مثلث حلايب', // ar-only
  'حلايب', // ar-only
  'السودان-مثلثحلائب', // ar-only
  'مثلث حلائب', // ar-only
  'حلائب', // ar-only
  'Halaib Triangle',
  "Hala'ib Triangle",
];

/// Halaib inside Sudan, with no line cutting it off (البند ١٧٤; withHalaibInSudan in mapStyle.ts).
///
/// The website hides every dashed line whose name contains «حلايب». The app's renderer cannot test
/// for part of a string, only for equality, so it hides the line by its known names and, as a
/// second hold, every disputed line Egypt claims across (`claimed_by` EG) — which is Halaib's.
/// Every other disputed line in the world is drawn as before. Sudan's own border round the
/// triangle is drawn by the screen from [MapsData.halaib].
List<StyleLayer> withHalaibInSudan(List<StyleLayer> layers) {
  final notHalaib = [
    'all',
    for (final n in halaibNames)
      [
        '!=',
        ['get', 'disputed_name'],
        n,
      ],
    [
      '!=',
      ['get', 'claimed_by'],
      'EG',
    ],
  ];
  return [
    for (final l in layers)
      if (l['type'] == 'line' && jsonEncode(l['filter'] ?? '').contains('["==",["get","disputed"],1]'))
        {
          ...l,
          'filter': l['filter'] == null ? notHalaib : ['all', l['filter'], notHalaib],
        }
      else
        l,
  ];
}

/// The satellite's layers: the map's labels, roads and borders over the picture, the lines a
/// little faded (hybrid in LiveMap.tsx).
List<StyleLayer> hybridLayers(List<StyleLayer> layers) {
  final kept = RegExp(r'boundary|road|highway|bridge|tunnel|rail');
  return [
    for (final l in layers)
      if (l['type'] == 'symbol')
        l
      else if (l['type'] == 'line' && kept.hasMatch('${l['id']}'))
        {
          ...l,
          'paint': {...((l['paint'] as Map<String, dynamic>?) ?? const {}), 'line-opacity': 0.55},
        },
  ];
}

/// A number or a zoom curve (["interpolate", ["linear"], ["zoom"], z0, v0, z1, v1, …]) at [zoom].
double? valueAtZoom(Object? v, double zoom) {
  if (v is num) return v.toDouble();
  if (v is List && v.length >= 5 && v[0] == 'interpolate' && v[2] is List && (v[2] as List).first == 'zoom') {
    final stops = <(double, double)>[];
    for (var i = 3; i + 1 < v.length; i += 2) {
      if (v[i] is num && v[i + 1] is num) stops.add(((v[i] as num).toDouble(), (v[i + 1] as num).toDouble()));
    }
    if (stops.isEmpty) return null;
    if (zoom <= stops.first.$1) return stops.first.$2;
    for (var i = 1; i < stops.length; i++) {
      final (z0, v0) = stops[i - 1];
      final (z1, v1) = stops[i];
      if (zoom <= z1) return v0 + (v1 - v0) * (zoom - z0) / math.max(z1 - z0, 1e-9);
    }
    return stops.last.$2;
  }
  return null;
}

/// A source of the style, its tile address and zooms resolved from its TileJSON.
class GroundSource {
  const GroundSource({required this.type, required this.url, required this.minZoom, required this.maxZoom});

  /// vector or raster.
  final String type;
  final String url;
  final int minZoom;
  final int maxZoom;
}

/// The street style, read and adjusted: [layers] with Arabic names and Halaib inside Sudan.
class GroundStyle {
  const GroundStyle({required this.layers, required this.sources, this.sprite, this.borderColour, this.borderWidth});

  final List<StyleLayer> layers;
  final Map<String, GroundSource> sources;

  /// The sprite sheet's address without its ending («…/ofm»).
  final String? sprite;

  /// The style's own country border (boundary_2), for Sudan's line round Halaib.
  final Color? borderColour;
  final Object? borderWidth;

  /// Under the colour bands: the land, the parks, the background.
  List<StyleLayer> get below => layers.sublist(0, firstAboveIndex(layers));

  /// Over the colour bands: water, roads, borders and names.
  List<StyleLayer> get above => layers.sublist(firstAboveIndex(layers));

  List<StyleLayer> get hybrid => hybridLayers(layers);

  /// The style as the renderer reads it, with only [some] of its layers.
  Map<String, dynamic> theme(String id, List<StyleLayer> some) => {'id': id, 'version': 8, 'layers': some};

  /// Reads a style JSON whose sources are already resolved (see [loadGroundStyle]).
  factory GroundStyle.read(Map<String, dynamic> style, Map<String, GroundSource> sources) {
    final all = ((style['layers'] as List<dynamic>?) ?? const []).cast<StyleLayer>();
    // A layer of a source that could not be read is left out, rather than failing the map.
    final usable = all.where((l) => l['source'] == null || sources.containsKey(l['source'])).toList();
    final border = all.where((l) => l['id'] == 'boundary_2').firstOrNull;
    final paint = (border?['paint'] as Map<String, dynamic>?) ?? const {};
    final sprite = style['sprite'];
    return GroundStyle(
      layers: withHalaibInSudan(withArabicLabels(usable)),
      sources: sources,
      sprite: sprite is String && sprite.trim().isNotEmpty ? sprite : null,
      borderColour: parseColour(paint['line-color']) ?? parseColour('hsl(248,1%,41%)'),
      borderWidth: paint['line-width'] ?? 1.2,
    );
  }
}

/// The street style from OpenFreeMap, with each source's TileJSON read for its tile address.
Future<GroundStyle> loadGroundStyle(http.Client client, String styleUrl) async {
  Future<Map<String, dynamic>> getJson(String url) async {
    final res = await client.get(Uri.parse(url)).timeout(const Duration(seconds: 20));
    if (res.statusCode != 200) throw MapsException(tr('تعذّر تحميل الخريطة (${res.statusCode}).', 'Could not load the map (${res.statusCode}).'));
    return jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>;
  }

  final style = await getJson(styleUrl);
  final sources = <String, GroundSource>{};
  for (final e in ((style['sources'] as Map<String, dynamic>?) ?? const {}).entries) {
    final s = e.value as Map<String, dynamic>;
    final type = s['type'];
    if (type != 'vector' && type != 'raster') continue;
    try {
      final tj = s['url'] is String ? await getJson(Uri.parse(styleUrl).resolve(s['url'] as String).toString()) : s;
      final tiles = tj['tiles'] as List<dynamic>?;
      if (tiles == null || tiles.isEmpty) continue;
      sources[e.key] = GroundSource(
        type: type as String,
        url: tiles.first as String,
        minZoom: (tj['minzoom'] as num?)?.toInt() ?? 0,
        maxZoom: (tj['maxzoom'] as num?)?.toInt() ?? 14,
      );
    } catch (_) {
      // One source that will not answer (the shaded relief, say) leaves the rest of the map.
    }
  }
  if (!sources.values.any((s) => s.type == 'vector')) throw MapsException(tr('تعذّر تحميل الخريطة الآن.', 'Could not load the map right now.'));
  return GroundStyle.read(style, sources);
}
