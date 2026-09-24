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
    'layers': [
      {
        'key': 'rain',
        'title': 'المطر',
        'note': 'مجموع المطر',
        'unit': 'مم في ٧ أيام',
        'bands': [
          {'min': 0, 'label': 'أقلّ من ١', 'fill': null, 'ink': null},
          {'min': 1, 'label': '١–٥', 'fill': '#d4e8f6', 'ink': '#12324f'},
          {'min': 15, 'label': '١٥–٣٠', 'fill': '#5a9fd4', 'ink': '#ffffff'},
        ],
      },
      {
        'key': 'elev',
        'title': 'التضاريس',
        'note': 'ارتفاع الأرض',
        'unit': 'متر',
        'bands': [
          {'min': -99, 'label': 'أقلّ من ٣٠٠', 'fill': '#d9ead3', 'ink': '#1f3318'},
          {'min': 300, 'label': '٣٠٠–٥٠٠', 'fill': '#b5d59b', 'ink': '#1f3318'},
        ],
      },
    ],
    'cells': [
      {
        'lon': 32.25,
        'lat': 15.25,
        'labelled': true,
        'values': {'rain': 12.4, 'elev': 380},
      },
      {
        'lon': 37.5,
        'lat': 21.25,
        'pLon': 37.2,
        'pLat': 21.1,
        'labelled': false,
        'values': {'rain': 0, 'elev': null},
      },
    ],
    'daily': {
      'dates': ['2026-09-25', '2026-09-26'],
      'towns': [
        {
          'name': 'الخرطوم',
          'days': [
            {'date': '2026-09-25', 'rainMm': 0.2, 'tmaxC': 39},
            {'date': '2026-09-26', 'rainMm': 6, 'tmaxC': 38},
          ],
        },
      ],
    },
  };

  test('parses the grid, layers and daily table', () {
    final g = RainGrid.fromJson(json);
    expect(g.cells, hasLength(2));
    expect(g.border.first, (22.0, 9.0));
    expect(g.cells.first.values['rain'], 12.4);
    expect(g.cells.first.values['elev'], 380);
    expect(g.cells.last.values['elev'], isNull);
    expect(g.cells.last.labelled, isFalse);
    expect(g.cells.first.pLon, 32.25, reason: 'older responses fall back to the centre');
    expect(g.cells.last.pLat, 21.1);
    expect(g.layers.map((l) => l.key), ['rain', 'elev']);
    expect(g.daily!.towns.single.days[1].rainMm, 6);
    expect(g.towns, same(fallbackTowns), reason: 'no towns sent: the built-in six');
  });

  test('bands match the website', () {
    final rain = RainGrid.fromJson(json).rain;
    expect(rain.bandFor(0).fill, isNull, reason: 'no rain is unpainted');
    expect(rain.bandFor(0.9).min, 0);
    expect(rain.bandFor(1).fill?.toARGB32(), 0xFFD4E8F6);
    expect(rain.bandFor(14.9).min, 1);
    expect(rain.bandFor(200).min, 15);
  });

  test('a response without the daily table still parses', () {
    final g = RainGrid.fromJson({...json, 'daily': null});
    expect(g.daily, isNull);
  });

  test('towns come from the server when it sends them', () {
    final g = RainGrid.fromJson({
      ...json,
      'towns': [
        {'name': 'حلايب', 'lon': 36.64, 'lat': 22.22, 'above': false},
      ],
    });
    expect(g.towns.single.name, 'حلايب');
    expect(g.towns.single.above, isFalse);
  });

  test('soil is coloured without numbers, and the canal route parses', () {
    final g = RainGrid.fromJson({
      ...json,
      'layers': [
        ...(json['layers'] as List<dynamic>),
        {
          'key': 'soil',
          'title': 'التربة',
          'note': 'صنف التربة',
          'unit': 'تصنيف WRB',
          'numbers': false,
          'bands': [
            {'min': 0, 'label': 'طينية متشقّقة', 'fill': '#5b4a3a', 'ink': '#ffffff'},
          ],
        },
      ],
      'canalRoute': [
        [32.51, 15.24],
        [32.23, 15.51],
        [32.51, 15.78],
      ],
    });
    expect(g.layers.last.numbers, isFalse);
    expect(g.layers.first.numbers, isTrue, reason: 'absent means a number layer');
    expect(g.canalRoute, hasLength(3));
    expect(g.canalRoute[1], (32.23, 15.51));
    expect(RainGrid.fromJson(json).canalRoute, isEmpty,
        reason: 'an older server sends no route');
  });

  test('bad colours are null, not black', () {
    expect(parseHex('var(--card)'), isNull);
    expect(parseHex('#fff'), isNull);
    expect(parseHex('#12324f')?.toARGB32(), 0xFF12324F);
  });
}
