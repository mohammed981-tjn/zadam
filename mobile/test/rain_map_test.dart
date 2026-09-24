/// The rain map JSON from /api/rain, parsed and banded as the website does.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:sudagri/rain_map.dart';

void main() {
  final json = <String, dynamic>{
    'from': '2026-09-25',
    'to': '2026-10-01',
    'cellDeg': 1.5,
    'border': [
      [22, 9],
      [38, 9],
      [38, 22],
      [22, 22],
    ],
    'bands': [
      {'min': 0, 'label': 'أقلّ من ١', 'fill': null, 'ink': null},
      {'min': 1, 'label': '١–٥', 'fill': '#d4e8f6', 'ink': '#12324f'},
      {'min': 15, 'label': '١٥–٣٠', 'fill': '#5a9fd4', 'ink': '#ffffff'},
    ],
    'cells': [
      {'lon': 32.25, 'lat': 15.25, 'labelled': true, 'rainMm': 12.4},
      {'lon': 37.5, 'lat': 21.25, 'labelled': false, 'rainMm': 0},
    ],
  };

  test('parses the grid', () {
    final g = RainGrid.fromJson(json);
    expect(g.cells, hasLength(2));
    expect(g.border.first, (22.0, 9.0));
    expect(g.cells.first.rainMm, 12.4);
    expect(g.cells.last.labelled, isFalse);
  });

  test('bands match the website', () {
    final g = RainGrid.fromJson(json);
    expect(g.bandFor(0).fill, isNull, reason: 'no rain is unpainted');
    expect(g.bandFor(0.9).min, 0);
    expect(g.bandFor(1).fill?.toARGB32(), 0xFFD4E8F6);
    expect(g.bandFor(14.9).min, 1);
    expect(g.bandFor(200).min, 15);
  });

  test('bad colours are null, not black', () {
    expect(parseHex('var(--card)'), isNull);
    expect(parseHex('#fff'), isNull);
    expect(parseHex('#12324f')?.toARGB32(), 0xFF12324F);
  });
}
