/// The rain map as the app receives it from the website's /api/rain: the
/// grid with a value per layer, the layers and their colour bands, and the
/// day-by-day table.
///
/// Parsing lives here, apart from the screen, so it can be tested without a
/// widget tree: the thing most likely to go wrong is the shape of the JSON,
/// not the painting.
library;

import 'dart:ui' show Color;

class RainBand {
  const RainBand({
    required this.min,
    required this.label,
    this.fill,
    this.ink,
  });

  final double min;
  final String label;

  /// Null means "the card colour" — no paint, so no rain reads as blank in
  /// both themes, exactly as on the website.
  final Color? fill;
  final Color? ink;
}

/// A point as the server sends it: (longitude, latitude).
typedef LonLat = (double, double);

/// A polygon: its outer ring, then any holes.
typedef Shape = List<List<LonLat>>;

/// The smooth bands the website draws a layer with: [base] is the band that
/// fills the whole country; each entry of [bands] is the area at or above a
/// higher band, painted over the one before.
class LayerShapes {
  const LayerShapes({required this.base, required this.bands});

  final int base;
  final List<(int, List<Shape>)> bands;
}

/// A town labelled on the map, with the layer's value there (null for soil).
class TownValue {
  const TownValue({
    required this.name,
    required this.lon,
    required this.lat,
    required this.side,
    this.value,
  });

  final String name;
  final double lon;
  final double lat;

  /// Which side of the dot the label sits: l, r, t or b.
  final String side;
  final double? value;
}

/// The ground under the data: neighbours, rivers, lakes and state lines.
class MapBase {
  const MapBase({
    required this.west,
    required this.south,
    required this.east,
    required this.north,
    required this.neighbours,
    required this.rivers,
    required this.lakes,
    required this.states,
    this.labels = const [],
  });

  final double west, south, east, north;
  final List<List<LonLat>> neighbours;

  /// Each river line, and whether it is the Nile or one of its two branches.
  final List<(List<LonLat>, bool)> rivers;
  final List<List<LonLat>> lakes;
  final List<List<LonLat>> states;

  /// The neighbours' names and where to write them.
  final List<(String, LonLat)> labels;
}

class MapLayer {
  const MapLayer({
    required this.key,
    required this.title,
    required this.note,
    required this.unit,
    required this.bands,
    this.numbers = true,
    this.shapes,
    this.towns = const [],
  });

  final String key;
  final String title;
  final String note;
  final String unit;
  final List<RainBand> bands;

  /// False for a layer whose value is a class (the soil group): coloured,
  /// with nothing written in the cell.
  final bool numbers;

  /// Null from a server older than the redrawn maps; the app then paints
  /// the cells as squares.
  final LayerShapes? shapes;
  final List<TownValue> towns;

  RainBand bandFor(double v) {
    var b = bands.first;
    for (final band in bands) {
      if (v >= band.min) b = band;
    }
    return b;
  }
}

class RainCell {
  const RainCell({
    required this.lon,
    required this.lat,
    required this.pLon,
    required this.pLat,
    required this.labelled,
    required this.values,
  });

  /// Centre of the cell, where it is drawn.
  final double lon;
  final double lat;

  /// Where the forecast was read and the number is written: the centre, or
  /// the middle of the inside part of an edge cell (Halaib's, for one).
  final double pLon;
  final double pLat;

  /// Enough of the cell inside the border to carry a number.
  final bool labelled;

  /// Layer key to value; a missing or null value is not drawn.
  final Map<String, double?> values;
}

class TownDay {
  const TownDay({required this.date, required this.rainMm, required this.tmaxC});

  final String date;
  final double rainMm;
  final double tmaxC;
}

class TownForecast {
  const TownForecast({required this.name, required this.days});

  final String name;
  final List<TownDay> days;
}

class DailyTable {
  const DailyTable({required this.dates, required this.towns});

  final List<String> dates;
  final List<TownForecast> towns;
}

class MapTown {
  const MapTown(this.name, this.lon, this.lat, {required this.above});

  final String name;
  final double lon;
  final double lat;

  /// Name above the dot, or below it — whichever is clear of the numbers.
  final bool above;
}

/// Used only if the server sends no towns (a response from before it did).
const fallbackTowns = <MapTown>[
  MapTown('الخرطوم', 32.53, 15.6, above: true),
  MapTown('بورتسودان', 37.22, 19.62, above: true),
  MapTown('القضارف', 35.39, 14.03, above: true),
  MapTown('الأبيض', 30.22, 13.18, above: false),
  MapTown('نيالا', 24.88, 12.05, above: true),
  MapTown('دنقلا', 30.48, 19.17, above: false),
  MapTown('حلايب', 36.64, 22.22, above: false),
];

class RainGrid {
  const RainGrid({
    required this.from,
    required this.to,
    required this.cellDeg,
    required this.border,
    required this.layers,
    required this.cells,
    this.towns = fallbackTowns,
    this.canalRoute = const [],
    this.base,
    this.daily,
  });

  final String from;
  final String to;
  final double cellDeg;

  /// [lon, lat] pairs.
  final List<(double, double)> border;
  final List<MapLayer> layers;
  final List<RainCell> cells;
  final List<MapTown> towns;

  /// The Arc Canal's line, [lon, lat] pairs; empty from an older server.
  final List<(double, double)> canalRoute;

  /// Null from a server older than the redrawn maps.
  final MapBase? base;
  final DailyTable? daily;

  /// The rain layer's bands, for shading the daily table like the map.
  MapLayer get rain => layers.firstWhere((l) => l.key == 'rain',
      orElse: () => layers.first);

  factory RainGrid.fromJson(Map<String, dynamic> json) {
    double n(Object? v) => (v as num).toDouble();
    double? nn(Object? v) => v == null ? null : (v as num).toDouble();

    final daily = json['daily'] as Map<String, dynamic>?;
    final towns = json['towns'] as List<dynamic>?;
    final route = json['canalRoute'] as List<dynamic>?;
    final baseJson = json['base'] as Map<String, dynamic>?;
    final frame = baseJson?['frame'] as Map<String, dynamic>?;

    LonLat pt(Object? p) => (n((p as List<dynamic>)[0]), n(p[1]));
    List<LonLat> ring(Object? r) => (r as List<dynamic>).map(pt).toList();

    return RainGrid(
      from: json['from'] as String,
      to: json['to'] as String,
      cellDeg: n(json['cellDeg']),
      border: (json['border'] as List<dynamic>)
          .map((p) => (n((p as List<dynamic>)[0]), n(p[1])))
          .toList(),
      layers: (json['layers'] as List<dynamic>).map((l) {
        final m = l as Map<String, dynamic>;
        final sh = m['shapes'] as Map<String, dynamic>?;
        return MapLayer(
          key: m['key'] as String,
          title: m['title'] as String,
          note: m['note'] as String,
          unit: m['unit'] as String,
          numbers: m['numbers'] as bool? ?? true,
          shapes: sh == null
              ? null
              : LayerShapes(
                  base: (sh['base'] as num).toInt(),
                  bands: (sh['bands'] as List<dynamic>).map((b) {
                    final bm = b as Map<String, dynamic>;
                    return (
                      (bm['band'] as num).toInt(),
                      (bm['shapes'] as List<dynamic>)
                          .map((s) => (s as List<dynamic>).map(ring).toList())
                          .toList(),
                    );
                  }).toList(),
                ),
          towns: ((m['towns'] as List<dynamic>?) ?? const []).map((t) {
            final tm = t as Map<String, dynamic>;
            return TownValue(
              name: tm['name'] as String,
              lon: n(tm['lon']),
              lat: n(tm['lat']),
              side: tm['side'] as String? ?? 't',
              value: nn(tm['value']),
            );
          }).toList(),
          bands: (m['bands'] as List<dynamic>).map((b) {
            final bm = b as Map<String, dynamic>;
            return RainBand(
              min: n(bm['min']),
              label: bm['label'] as String,
              fill: parseHex(bm['fill'] as String?),
              ink: parseHex(bm['ink'] as String?),
            );
          }).toList(),
        );
      }).toList(),
      cells: (json['cells'] as List<dynamic>).map((c) {
        final m = c as Map<String, dynamic>;
        final values = (m['values'] as Map<String, dynamic>)
            .map((k, v) => MapEntry(k, nn(v)));
        return RainCell(
          lon: n(m['lon']),
          lat: n(m['lat']),
          pLon: nn(m['pLon']) ?? n(m['lon']),
          pLat: nn(m['pLat']) ?? n(m['lat']),
          labelled: m['labelled'] as bool,
          values: values,
        );
      }).toList(),
      towns: towns == null
          ? fallbackTowns
          : towns.map((t) {
              final m = t as Map<String, dynamic>;
              return MapTown(m['name'] as String, n(m['lon']), n(m['lat']),
                  above: m['above'] as bool? ?? true);
            }).toList(),
      base: baseJson == null
          ? null
          : MapBase(
              west: n(frame!['west']),
              south: n(frame['south']),
              east: n(frame['east']),
              north: n(frame['north']),
              neighbours: (baseJson['neighbours'] as List<dynamic>)
                  .map((r) => ring((r as Map<String, dynamic>)['ring']))
                  .toList(),
              rivers: (baseJson['rivers'] as List<dynamic>).map((r) {
                final rm = r as Map<String, dynamic>;
                return (ring(rm['line']), rm['main'] as bool? ?? false);
              }).toList(),
              lakes: (baseJson['lakes'] as List<dynamic>)
                  .map((r) => ring((r as Map<String, dynamic>)['ring']))
                  .toList(),
              states: (baseJson['states'] as List<dynamic>)
                  .map((r) => ring((r as Map<String, dynamic>)['ring']))
                  .toList(),
              labels: ((json['neighbourLabels'] as List<dynamic>?) ?? const [])
                  .map((l) {
                final lm = l as Map<String, dynamic>;
                return (lm['name'] as String, (n(lm['lon']), n(lm['lat'])));
              }).toList(),
            ),
      canalRoute: route == null
          ? const []
          : route
              .map((p) => (n((p as List<dynamic>)[0]), n(p[1])))
              .toList(),
      daily: daily == null
          ? null
          : DailyTable(
              dates: (daily['dates'] as List<dynamic>).cast<String>(),
              towns: (daily['towns'] as List<dynamic>).map((t) {
                final m = t as Map<String, dynamic>;
                return TownForecast(
                  name: m['name'] as String,
                  days: (m['days'] as List<dynamic>).map((d) {
                    final dm = d as Map<String, dynamic>;
                    return TownDay(
                      date: dm['date'] as String,
                      rainMm: n(dm['rainMm']),
                      tmaxC: n(dm['tmaxC']),
                    );
                  }).toList(),
                );
              }).toList(),
            ),
    );
  }
}

/// "#rrggbb" to an opaque colour; anything else is null.
Color? parseHex(String? hex) {
  if (hex == null || !RegExp(r'^#[0-9a-fA-F]{6}$').hasMatch(hex)) return null;
  return Color(0xFF000000 | int.parse(hex.substring(1), radix: 16));
}
