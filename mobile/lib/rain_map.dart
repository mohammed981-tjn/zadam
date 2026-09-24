/// The rain map as the app receives it from the website's /api/rain.
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

class RainCell {
  const RainCell({
    required this.lon,
    required this.lat,
    required this.labelled,
    required this.rainMm,
  });

  final double lon;
  final double lat;

  /// Centre inside the border: only these carry a number.
  final bool labelled;
  final double rainMm;
}

class RainGrid {
  const RainGrid({
    required this.from,
    required this.to,
    required this.cellDeg,
    required this.border,
    required this.bands,
    required this.cells,
  });

  final String from;
  final String to;
  final double cellDeg;

  /// [lon, lat] pairs.
  final List<(double, double)> border;
  final List<RainBand> bands;
  final List<RainCell> cells;

  RainBand bandFor(double mm) {
    var b = bands.first;
    for (final band in bands) {
      if (mm >= band.min) b = band;
    }
    return b;
  }

  factory RainGrid.fromJson(Map<String, dynamic> json) {
    double n(Object? v) => (v as num).toDouble();

    return RainGrid(
      from: json['from'] as String,
      to: json['to'] as String,
      cellDeg: n(json['cellDeg']),
      border: (json['border'] as List<dynamic>)
          .map((p) => (n((p as List<dynamic>)[0]), n(p[1])))
          .toList(),
      bands: (json['bands'] as List<dynamic>).map((b) {
        final m = b as Map<String, dynamic>;
        return RainBand(
          min: n(m['min']),
          label: m['label'] as String,
          fill: parseHex(m['fill'] as String?),
          ink: parseHex(m['ink'] as String?),
        );
      }).toList(),
      cells: (json['cells'] as List<dynamic>).map((c) {
        final m = c as Map<String, dynamic>;
        return RainCell(
          lon: n(m['lon']),
          lat: n(m['lat']),
          labelled: m['labelled'] as bool,
          rainMm: n(m['rainMm']),
        );
      }).toList(),
    );
  }
}

/// "#rrggbb" to an opaque colour; anything else is null.
Color? parseHex(String? hex) {
  if (hex == null || !RegExp(r'^#[0-9a-fA-F]{6}$').hasMatch(hex)) return null;
  return Color(0xFF000000 | int.parse(hex.substring(1), radix: 16));
}
