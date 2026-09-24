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

class MapLayer {
  const MapLayer({
    required this.key,
    required this.title,
    required this.note,
    required this.unit,
    required this.bands,
  });

  final String key;
  final String title;
  final String note;
  final String unit;
  final List<RainBand> bands;

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
    required this.labelled,
    required this.values,
  });

  final double lon;
  final double lat;

  /// Centre inside the border: only these carry a number.
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

class RainGrid {
  const RainGrid({
    required this.from,
    required this.to,
    required this.cellDeg,
    required this.border,
    required this.layers,
    required this.cells,
    this.daily,
  });

  final String from;
  final String to;
  final double cellDeg;

  /// [lon, lat] pairs.
  final List<(double, double)> border;
  final List<MapLayer> layers;
  final List<RainCell> cells;
  final DailyTable? daily;

  /// The rain layer's bands, for shading the daily table like the map.
  MapLayer get rain => layers.firstWhere((l) => l.key == 'rain',
      orElse: () => layers.first);

  factory RainGrid.fromJson(Map<String, dynamic> json) {
    double n(Object? v) => (v as num).toDouble();
    double? nn(Object? v) => v == null ? null : (v as num).toDouble();

    final daily = json['daily'] as Map<String, dynamic>?;

    return RainGrid(
      from: json['from'] as String,
      to: json['to'] as String,
      cellDeg: n(json['cellDeg']),
      border: (json['border'] as List<dynamic>)
          .map((p) => (n((p as List<dynamic>)[0]), n(p[1])))
          .toList(),
      layers: (json['layers'] as List<dynamic>).map((l) {
        final m = l as Map<String, dynamic>;
        return MapLayer(
          key: m['key'] as String,
          title: m['title'] as String,
          note: m['note'] as String,
          unit: m['unit'] as String,
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
          labelled: m['labelled'] as bool,
          values: values,
        );
      }).toList(),
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
