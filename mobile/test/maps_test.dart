/// «الخرائط» (البند ٢٠٣): what /api/app/map sends parsed as the website builds it (mapThemes in
/// src/lib/mapLayers.ts), the heat ramp the same list as the website's, the street style adjusted as
/// LiveMap adjusts it, and the screen.
library;

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:latlong2/latlong.dart';
import 'package:sudagri/maps.dart';
import 'package:sudagri/screens/maps_screen.dart';
import 'package:vector_tile_renderer/vector_tile_renderer.dart' show ThemeReader;

/// The website's HEAT, as written in src/lib/mapLayers.ts (scripts/verify-app-maps.ts reads both).
const siteHeat = ['#f6f1e2', '#dfeccf', '#b6d69a', '#7fb85a', '#579b2e', '#0f5a32'];

Map<String, dynamic> feature(Map<String, dynamic> props, Map<String, dynamic> geometry) => {
  'type': 'Feature',
  'properties': props,
  'geometry': geometry,
};

Map<String, dynamic> fc(List<Map<String, dynamic>> f) => {'type': 'FeatureCollection', 'features': f};

/// A trimmed copy of a real answer (the shapes mapThemes builds, read from a run on 6 November).
Map<String, dynamic> payload({bool week = true, int lands = 0}) => {
  'week': week,
  'from': week ? '2026-11-06' : null,
  'to': week ? '2026-11-12' : null,
  'grounds': {
    'style': 'https://tiles.openfreemap.org/styles/liberty',
    'sat': 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg',
    'satMaxZoom': 13,
    'credits': {
      'map': [
        {'text': 'OpenFreeMap', 'url': 'https://openfreemap.org'},
        {'text': '© OpenMapTiles', 'url': 'https://www.openmaptiles.org/'},
        {'text': 'Data from OpenStreetMap', 'url': 'https://www.openstreetmap.org/copyright'},
      ],
      'sat': [
        {
          'text': 'EOxCloudless by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016 & 2017)',
          'url': 'https://cloudless.eox.at',
        },
      ],
    },
  },
  'halaib': [
    [34.08, 22],
    [35.0, 22.0],
    [36.0, 22.0],
    [36.89, 22.0],
  ],
  'sources': 'المصادر: التوقّع والارتفاع من Open-Meteo، والتربة من ISRIC SoilGrids …',
  'themes': [
    if (week) ...[
      {
        'key': 'rain',
        'emoji': '🌧️',
        'title': 'المطر',
        'note': 'مجموع المطر المتوقّع في الأيام السبعة القادمة',
        'sub': 'من 6 نوفمبر إلى 12 نوفمبر',
        'unit': 'مم في ٧ أيام',
        'legend': [
          {'colour': 'rgba(0,0,0,0)', 'label': 'أقلّ من ١'},
          {'colour': '#d4e8f6', 'label': '١–٥'},
          {'colour': '#9cc9ea', 'label': '٥–١٥'},
          {'colour': '#5a9fd4', 'label': '١٥–٣٠'},
          {'colour': '#2a6db0', 'label': '٣٠–٦٠'},
          {'colour': '#143f78', 'label': '٦٠ فأكثر'},
        ],
        'group': 'grid',
        'overlays': [
          {
            'kind': 'fill',
            'id': 'grid-rain',
            'under': true,
            'data': fc([
              feature(
                {'colour': 'rgba(0,0,0,0)', 'title': 'المطر: أقلّ من ١ مم في ٧ أيام', 'detail': 'مجموع المطر المتوقّع'},
                {
                  'type': 'Polygon',
                  'coordinates': [
                    [
                      [22, 9],
                      [38, 9],
                      [38, 22],
                      [22, 22],
                      [22, 9],
                    ],
                  ],
                },
              ),
              feature(
                {'colour': '#9cc9ea', 'title': 'المطر: ٥–١٥ مم في ٧ أيام', 'detail': 'مجموع المطر المتوقّع'},
                {
                  'type': 'MultiPolygon',
                  'coordinates': [
                    [
                      [
                        [30, 10],
                        [34, 10],
                        [34, 13],
                        [30, 13],
                        [30, 10],
                      ],
                      [
                        [31, 11],
                        [32, 11],
                        [32, 12],
                        [31, 11],
                      ],
                    ],
                    [
                      [
                        [24, 11],
                        [25, 11],
                        [25, 12],
                        [24, 11],
                      ],
                    ],
                  ],
                },
              ),
            ]),
            'color': ['get', 'colour'],
            'opacity': 0.62,
          },
          {
            'kind': 'pins',
            'id': 'towns-rain',
            'pins': [
              {
                'lon': 32.53,
                'lat': 15.6,
                'text': '٠',
                'name': 'الخرطوم',
                'title': 'الخرطوم: ٠ مم في ٧ أيام',
                'detail': 'مجموع المطر',
              },
            ],
          },
        ],
      },
      {
        'key': 'tmax',
        'emoji': '🌡️',
        'title': 'الحرارة',
        'note': 'أعلى حرارة نهاراً في الأيام السبعة',
        'sub': 'من 6 نوفمبر إلى 12 نوفمبر',
        'unit': '°م',
        'legend': [
          {'colour': '#f6f1e2', 'label': 'أقلّ من ٣٠'},
          {'colour': '#dfeccf', 'label': '٣٠–٣٥'},
          {'colour': '#b6d69a', 'label': '٣٥–٣٨'},
          {'colour': '#7fb85a', 'label': '٣٨–٤١'},
          {'colour': '#579b2e', 'label': '٤١–٤٤'},
          {'colour': '#0f5a32', 'label': '٤٤ فأكثر'},
        ],
        'group': 'grid',
        'overlays': [
          {
            'kind': 'fill',
            'id': 'grid-tmax',
            'under': true,
            'data': fc([
              feature(
                {'colour': '#b6d69a', 'title': 'الحرارة: ٣٥–٣٨ °م'},
                {
                  'type': 'Polygon',
                  'coordinates': [
                    [
                      [22, 9],
                      [38, 9],
                      [38, 22],
                      [22, 9],
                    ],
                  ],
                },
              ),
            ]),
            'color': ['get', 'colour'],
            'opacity': 0.62,
          },
        ],
      },
      {
        'key': 'soil',
        'emoji': '🟤',
        'title': 'التربة',
        'note': 'مجموعة التربة الغالبة',
        'sub': 'صورة البلد العامّة، لا فحصُ تربة حقلك.',
        'legend': [
          {'colour': '#e9d59a', 'label': 'رملية'},
          {'colour': '#5b4a3a', 'label': 'طينية متشقّقة'},
        ],
        'group': 'grid',
        'overlays': <Object>[],
      },
      {
        'key': 'lands',
        'emoji': '🌾',
        'title': 'الأراضي',
        'note': 'الأراضي الموثّقة المعروضة على المنصّة في كل مربّع',
        'sub': 'بعددها في كل مربّع — لا تضع الخريطة نقطةً على أرض أحد.',
        'group': 'grid',
        'overlays': lands == 0
            ? <Object>[]
            : [
                {
                  'kind': 'pins',
                  'id': 'lands',
                  'tone': 'green',
                  'pins': [
                    {
                      'lon': 33.0,
                      'lat': 14.25,
                      'text': '$lands',
                      'title': '$lands أرضٌ موثّقة في هذا المربّع',
                      'detail': 'مربّعٌ عرضه نحو ١٦٧ كم.',
                    },
                  ],
                },
              ],
        'empty': {'text': 'لا أرضَ موثّقة معروضة بعد.', 'href': '/lands/new', 'link': 'سجّل أرضك'},
      },
    ],
    {
      'key': 'canal',
      'emoji': '〰️',
      'title': 'قناة الأرك',
      'note': 'مسار القناة القوسيّة المقترحة من جبل أولياء',
      'key2': [
        {'colour': '#0f5a32', 'label': 'مسار القناة', 'shape': 'line'},
      ],
      'group': 'over',
      'overlays': [
        {
          'kind': 'line',
          'id': 'canal',
          'color': '#0f5a32',
          'width': 5,
          'data': fc([
            feature(
              {'title': 'قناة الأرك المقترحة', 'detail': 'من خزّان جبل أولياء'},
              {
                'type': 'LineString',
                'coordinates': [
                  [32.51, 15.24],
                  [32.23, 15.51],
                  [32.51, 15.78],
                ],
              },
            ),
          ]),
        },
        {
          'kind': 'pins',
          'id': 'canal-places',
          'pins': [
            {'lon': 32.51, 'lat': 15.24, 'text': 'جبل أولياء'},
          ],
        },
      ],
    },
    {
      'key': 'minerals',
      'emoji': '⛏️',
      'title': 'المعادن',
      'note': 'المناجم والحقول والرواسب المعروفة',
      'key2': [
        {'colour': '#8a4f7d', 'label': 'معادن فلزّيّة', 'shape': 'dot'},
        {'colour': '#6b7280', 'label': 'معادن صناعيّة', 'shape': 'dot'},
      ],
      'group': 'over',
      'overlays': [
        {
          'kind': 'points',
          'id': 'minerals',
          'radius': 6,
          'color': ['get', 'colour'],
          'data': fc([
            feature(
              {'colour': '#8a4f7d', 'title': 'كروم — إنقسنا', 'detail': 'منجم'},
              {
                'type': 'Point',
                'coordinates': [33.9, 11.4],
              },
            ),
          ]),
        },
      ],
    },
    {
      'key': 'infra',
      'emoji': '⚡',
      'title': 'الطرق والكهرباء',
      'note': 'الطرق الرئيسيّة والسكّة الحديد وخطوط الكهرباء',
      'key2': [
        {'colour': '#1f2937', 'label': 'سكّة حديد', 'shape': 'dash'},
        {'colour': '#4b2470', 'label': 'كهرباء ٤٠٠ فأكثر', 'shape': 'line'},
      ],
      'group': 'over',
      'overlays': [
        {
          'kind': 'line',
          'id': 'rail',
          'color': '#1f2937',
          'width': 1.8,
          'dash': [2, 1.5],
          'data': fc([
            feature(
              {'title': 'سكّة حديد'},
              {
                'type': 'MultiLineString',
                'coordinates': [
                  [
                    [25.03, 11.99],
                    [24.91, 12.05],
                  ],
                  [
                    [25.18, 11.92],
                    [25.39, 11.82],
                  ],
                ],
              },
            ),
          ]),
        },
        {
          'kind': 'line',
          'id': 'power',
          'color': ['get', 'colour'],
          'width': ['get', 'width'],
          'data': fc([
            feature(
              {'colour': '#4b2470', 'width': 3, 'title': 'خطّ كهرباء ٤٠٠ كيلوفولت فأكثر'},
              {
                'type': 'MultiLineString',
                'coordinates': [
                  [
                    [32.0, 18.6],
                    [32.5, 15.6],
                  ],
                ],
              },
            ),
          ]),
        },
      ],
    },
  ],
};

http.Response jsonResponse(Object body, [int status = 200]) => http.Response.bytes(
  utf8.encode(jsonEncode(body)),
  status,
  headers: {'content-type': 'application/json; charset=utf-8'},
);

/// The street style's shape (OpenFreeMap's «liberty», read on 24 October): a few layers of each kind.
Map<String, dynamic> liberty() => {
  'version': 8,
  'sprite': 'https://tiles.openfreemap.org/sprites/ofm_f384/ofm',
  'sources': {
    'openmaptiles': {'type': 'vector', 'url': 'https://tiles.openfreemap.org/planet'},
  },
  'layers': [
    {
      'id': 'background',
      'type': 'background',
      'paint': {'background-color': '#f8f4f0'},
    },
    {
      'id': 'park',
      'type': 'fill',
      'source': 'openmaptiles',
      'source-layer': 'park',
      'paint': {'fill-color': '#d8e8c8'},
    },
    {
      'id': 'water',
      'type': 'fill',
      'source': 'openmaptiles',
      'source-layer': 'water',
      'paint': {'fill-color': 'rgb(158,189,255)'},
    },
    {
      'id': 'highway_primary',
      'type': 'line',
      'source': 'openmaptiles',
      'source-layer': 'transportation',
      'paint': {'line-color': '#fea'},
    },
    {
      'id': 'boundary_2',
      'type': 'line',
      'source': 'openmaptiles',
      'source-layer': 'boundary',
      'filter': [
        'all',
        [
          '==',
          ['get', 'admin_level'],
          2,
        ],
        [
          '!=',
          ['get', 'disputed'],
          1,
        ],
      ],
      'paint': {
        'line-color': 'hsl(248,1%,41%)',
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          3,
          1,
          12,
          3,
        ],
      },
    },
    {
      'id': 'boundary_disputed',
      'type': 'line',
      'source': 'openmaptiles',
      'source-layer': 'boundary',
      'filter': [
        'all',
        [
          '!=',
          ['get', 'maritime'],
          1,
        ],
        [
          '==',
          ['get', 'disputed'],
          1,
        ],
      ],
      'paint': {
        'line-color': 'hsl(248,1%,41%)',
        'line-dasharray': [1, 2],
      },
    },
    {
      'id': 'label_city',
      'type': 'symbol',
      'source': 'openmaptiles',
      'source-layer': 'place',
      'layout': {'text-field': '{name:latin}'},
    },
    {'id': 'hillshade', 'type': 'raster', 'source': 'ne2_shaded'},
  ],
};

const planet = {
  'tiles': ['https://tiles.openfreemap.org/planet/20261101_001001_pt/{z}/{x}/{y}.pbf'],
  'minzoom': 0,
  'maxzoom': 14,
};

void main() {
  group('what /api/app/map sends', () {
    final data = MapsData.fromJson(payload());

    test('the themes in the website order: the week first, then what stays put', () {
      expect(data.themes.map((t) => t.key), ['rain', 'tmax', 'soil', 'lands', 'canal', 'minerals', 'infra']);
      expect(data.grids.map((t) => t.key), ['rain', 'tmax', 'soil', 'lands']);
      expect(data.overs.map((t) => t.key), ['canal', 'minerals', 'infra']);
      expect(data.week, isTrue);
      expect(data.satMaxZoom, 13);
      expect(data.halaib.first, const LatLng(22, 34.08));
    });

    test('the grounds and their credits are the website\'s', () {
      expect(data.styleUrl, 'https://tiles.openfreemap.org/styles/liberty');
      expect(data.satTiles, contains('s2cloudless_3857'));
      expect(data.mapCredits.map((c) => c.text), contains('Data from OpenStreetMap'));
      expect(data.satCredits.single.text, startsWith('EOxCloudless'));
    });

    test('a fill: Polygon and MultiPolygon, holes kept, colour read from each feature', () {
      final fill = data.themes.first.overlays.first;
      expect(fill.kind, OverlayKind.fill);
      expect(fill.under, isTrue);
      expect(fill.opacity, 0.62);
      expect(fill.features, hasLength(2));
      expect(fill.features[0].colour!.a, 0, reason: '«rgba(0,0,0,0)»: no paint, still tappable');
      expect(fill.features[0].info!.title, 'المطر: أقلّ من ١ مم في ٧ أيام');
      final multi = fill.features[1];
      expect(multi.colour, const Color(0xFF9CC9EA));
      expect(multi.polygons, hasLength(2));
      expect(multi.polygons[0], hasLength(2), reason: 'an outer ring and a hole');
      expect(multi.polygons[0][0].first, const LatLng(10, 30), reason: 'GeoJSON is [lon, lat]');
    });

    test('pins: the value, the town and its card', () {
      final pins = data.themes.first.overlays[1];
      expect(pins.kind, OverlayKind.pins);
      expect(pins.pins.single.name, 'الخرطوم');
      expect(pins.pins.single.text, '٠');
      expect(pins.pins.single.info!.title, startsWith('الخرطوم'));
    });

    test('lines: a constant colour, colour and width per feature, dashes', () {
      final canal = data.themes.firstWhere((t) => t.key == 'canal').overlays.first;
      expect(canal.features.single.colour, const Color(0xFF0F5A32));
      expect(canal.features.single.width, 5);
      expect(canal.features.single.lines.single, hasLength(3));
      final infra = data.themes.firstWhere((t) => t.key == 'infra').overlays;
      expect(infra[0].dash, [2, 1.5]);
      expect(infra[0].features.single.lines, hasLength(2));
      expect(infra[1].features.single.colour, const Color(0xFF4B2470));
      expect(infra[1].features.single.width, 3);
      expect(data.themes.firstWhere((t) => t.key == 'infra').key2.first.shape, 'dash');
    });

    test('points', () {
      final m = data.themes.firstWhere((t) => t.key == 'minerals').overlays.single;
      expect(m.kind, OverlayKind.points);
      expect(m.features.single.point, const LatLng(11.4, 33.9));
      expect(m.features.single.colour, const Color(0xFF8A4F7D));
    });

    test('the no-rain band is the card colour in the key, as on the website', () {
      expect(data.themes.first.legend.first.colour, isNull);
      expect(data.themes.first.legend[1].colour, const Color(0xFFD4E8F6));
    });

    test('an empty lands layer carries the way to change that', () {
      final lands = data.themes.firstWhere((t) => t.key == 'lands');
      expect(lands.overlays, isEmpty);
      expect(lands.empty!.href, '/lands/new');
      final some = MapsData.fromJson(payload(lands: 3)).themes.firstWhere((t) => t.key == 'lands');
      expect(some.overlays.single.green, isTrue);
      expect(some.overlays.single.pins.single.text, '3');
    });

    test('without the week, only the fixed layers', () {
      final fixed = MapsData.fromJson(payload(week: false));
      expect(fixed.week, isFalse);
      expect(fixed.grids, isEmpty);
      expect(fixed.overs.map((t) => t.key), ['canal', 'minerals', 'infra']);
    });
  });

  group('the colours', () {
    test('the app\'s heat ramp is the website\'s, band for band', () {
      expect(heatRamp, siteHeat);
      final tmax = MapsData.fromJson(payload()).themes.firstWhere((t) => t.key == 'tmax');
      expect(tmax.legend.map((b) => b.colour), heatRamp.map(parseColour));
    });

    test('a heat band without its colour falls back on the ramp', () {
      final t = MapTheme.fromJson({
        'key': 'tmax',
        'title': 'الحرارة',
        'note': '',
        'group': 'grid',
        'legend': [
          {'colour': null, 'label': 'أقلّ من ٣٠'},
          {'colour': 'var(--card)', 'label': '٣٠–٣٥'},
        ],
      });
      expect(t.legend.map((b) => b.colour), [parseColour(heatRamp[0]), parseColour(heatRamp[1])]);
    });

    test('no red and no orange in the ramp: beige into green', () {
      // The same rule as scripts/verify-app-maps.ts: a hue from red through orange (under 45° or
      // over 340°) at a saturation that reads as a colour, not as an earth brown or a beige.
      bool redOrOrange(Color c) {
        final mx = [c.r, c.g, c.b].reduce((a, b) => a > b ? a : b);
        final mn = [c.r, c.g, c.b].reduce((a, b) => a < b ? a : b);
        final l = (mx + mn) / 2;
        if (mx == mn) return false;
        final s = l > 0.5 ? (mx - mn) / (2 - mx - mn) : (mx - mn) / (mx + mn);
        double h;
        if (mx == c.r) {
          h = 60 * (((c.g - c.b) / (mx - mn)) % 6);
        } else if (mx == c.g) {
          h = 60 * ((c.b - c.r) / (mx - mn) + 2);
        } else {
          h = 60 * ((c.r - c.g) / (mx - mn) + 4);
        }
        return (h < 45 || h > 340) && s >= 0.55 && l > 0.2 && l < 0.85;
      }

      for (final hex in [...heatRamp, lineGreen]) {
        expect(redOrOrange(parseColour(hex)!), isFalse, reason: hex);
      }
      expect(redOrOrange(const Color(0xFFDC2626)), isTrue, reason: 'the rule catches a red');
      expect(redOrOrange(const Color(0xFFF97316)), isTrue, reason: 'and an orange');
    });

    test('colours as the website writes them', () {
      expect(parseColour('#1f7a3d'), const Color(0xFF1F7A3D));
      expect(parseColour('#fea'), const Color(0xFFFFEEAA));
      expect(parseColour('rgb(158,189,255)'), const Color(0xFF9EBDFF));
      expect(parseColour('rgba(0,0,0,0)')!.a, 0);
      expect(parseColour('hsl(0,0%,70%)'), const Color(0xFFB3B3B3));
      expect(parseColour('var(--card)'), isNull);
      expect(parseColour(null), isNull);
    });
  });

  group('the street ground, adjusted as the website adjusts it', () {
    final sources = {
      'openmaptiles': const GroundSource(type: 'vector', url: 'https://x/{z}/{x}/{y}.pbf', minZoom: 0, maxZoom: 14),
    };
    final style = GroundStyle.read(liberty(), sources);

    test('a layer of a source that could not be read is left out', () {
      expect(style.layers.map((l) => l['id']), isNot(contains('hillshade')));
    });

    test('names in Arabic where the tiles have them', () {
      final label = style.layers.firstWhere((l) => l['id'] == 'label_city');
      expect((label['layout'] as Map)['text-field'], [
        'coalesce',
        ['get', 'name:ar'],
        ['get', 'name'],
      ]);
    });

    test('the dashed line that cuts Halaib from Sudan is hidden; the rest of the borders stay', () {
      final dashed = style.layers.firstWhere((l) => l['id'] == 'boundary_disputed');
      final f = jsonEncode(dashed['filter']);
      expect(f, contains('["==",["get","disputed"],1]'), reason: 'its own condition kept');
      expect(f, contains('السودان-مثلثحلايب'));
      expect(f, contains('["!=",["get","claimed_by"],"EG"]'));
      final border = style.layers.firstWhere((l) => l['id'] == 'boundary_2');
      expect(jsonEncode(border['filter']), isNot(contains('حلايب')));
      expect(style.borderColour, parseColour('hsl(248,1%,41%)'));
      expect(valueAtZoom(style.borderWidth, 3), 1);
      expect(valueAtZoom(style.borderWidth, 12), 3);
      expect(valueAtZoom(style.borderWidth, 7.5), closeTo(2, 1e-9));
    });

    test('colour bands go under the water, roads, borders and names', () {
      expect(style.below.map((l) => l['id']), ['background', 'park']);
      expect(style.above.first['id'], 'water');
    });

    test('on the satellite: only labels, roads and borders, the lines faded', () {
      expect(style.hybrid.map((l) => l['id']), ['highway_primary', 'boundary_2', 'boundary_disputed', 'label_city']);
      expect((style.hybrid.first['paint'] as Map)['line-opacity'], 0.55);
    });

    test('the renderer reads each part', () {
      for (final (id, layers) in [('b', style.below), ('a', style.above), ('h', style.hybrid)]) {
        final theme = ThemeReader().read(style.theme(id, layers));
        expect(theme.id, id);
        expect(theme.layers, isNotEmpty);
      }
    });

    test('loading: each source\'s TileJSON gives its tile address', () async {
      final client = MockClient((req) async {
        if (req.url.toString().endsWith('/styles/liberty')) return jsonResponse(liberty());
        if (req.url.toString().endsWith('/planet')) return jsonResponse(planet);
        return http.Response('', 404);
      });
      final s = await loadGroundStyle(client, 'https://tiles.openfreemap.org/styles/liberty');
      expect(s.sources['openmaptiles']!.url, contains('/planet/20261101_001001_pt/{z}/{x}/{y}.pbf'));
      expect(s.sources['openmaptiles']!.maxZoom, 14);
      expect(s.sprite, 'https://tiles.openfreemap.org/sprites/ofm_f384/ofm');
    });
  });

  group('fetching', () {
    test('a server error says what the server said', () async {
      final client = MockClient((_) async => jsonResponse({'error': 'تعذّر'}, 503));
      expect(() => fetchMaps(client, 'https://example.test'), throwsA(isA<MapsException>()));
    });

    test('an HTML page is a failed load, not a crash', () async {
      final client = MockClient((_) async => http.Response('<html>', 502));
      await expectLater(
        fetchMaps(client, 'https://example.test'),
        throwsA(predicate((e) => e is MapsException && e.message.contains('502'))),
      );
    });

    test('no session is sent: the map is public', () async {
      late http.BaseRequest seen;
      final client = MockClient((req) async {
        seen = req;
        return jsonResponse(payload());
      });
      await fetchMaps(client, 'https://example.test');
      expect(seen.url.path, '/api/app/map');
      expect(seen.headers.keys.map((k) => k.toLowerCase()), isNot(contains('authorization')));
    });
  });

  group('the screen', () {
    MockClient server({Map<String, dynamic>? body, int status = 200}) => MockClient((req) async {
      if (req.url.path == '/api/app/map') return jsonResponse(body ?? payload(), status);
      // The street style and tiles are not reachable here: the screen says so and goes on.
      return http.Response('', 404);
    });

    Future<void> open(WidgetTester tester, MockClient client) async {
      await tester.binding.setSurfaceSize(const Size(420, 860));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      await tester.pumpWidget(
        MaterialApp(
          // The app is right to left; the map itself is not text.
          builder: (context, child) => Directionality(textDirection: TextDirection.rtl, child: child!),
          home: MapsScreen(client: client, siteUrl: 'https://example.test'),
        ),
      );
      for (var i = 0; i < 6; i++) {
        await tester.pump(const Duration(milliseconds: 50));
      }
    }

    testWidgets('the layers as chips, the rain first, and its key', (tester) async {
      await open(tester, server());
      expect(find.byType(FlutterMap), findsOneWidget);
      for (final k in ['rain', 'tmax', 'soil', 'lands', 'canal', 'minerals', 'infra']) {
        expect(find.byKey(Key('maps-chip-$k')), findsOneWidget);
      }
      expect(find.byKey(const Key('maps-key')), findsOneWidget);
      expect(find.text('مجموع المطر المتوقّع في الأيام السبعة القادمة'), findsOneWidget);
      expect(find.text('مم في ٧ أيام'), findsOneWidget);
      expect(find.byKey(const Key('maps-legend-bar')), findsOneWidget);
      expect(find.textContaining('تعذّر تحميل الخريطة الآن'), findsOneWidget, reason: 'the street style answered 404');
    });

    testWidgets('a grid chip replaces the last; an over chip is laid over it', (tester) async {
      await open(tester, server());
      await tester.tap(find.byKey(const Key('maps-chip-tmax')));
      await tester.pump();
      expect(find.text('أعلى حرارة نهاراً في الأيام السبعة'), findsOneWidget);
      expect(find.text('مجموع المطر المتوقّع في الأيام السبعة القادمة'), findsNothing);
      expect(find.text('٤٤ فأكثر'), findsOneWidget);

      await tester.ensureVisible(find.byKey(const Key('maps-chip-minerals')));
      await tester.tap(find.byKey(const Key('maps-chip-minerals')));
      await tester.pump();
      expect(find.text('معادن فلزّيّة'), findsOneWidget);
      expect(find.text('الحرارة · المعادن'), findsOneWidget);
      expect(find.byType(CircleLayer<MapInfo>), findsOneWidget);
    });

    testWidgets('the lands layer with none yet says so, with the way to register', (tester) async {
      await open(tester, server());
      await tester.ensureVisible(find.byKey(const Key('maps-chip-lands')));
      await tester.tap(find.byKey(const Key('maps-chip-lands')));
      await tester.pump();
      expect(find.byKey(const Key('maps-empty')), findsOneWidget);
      expect(find.text('سجّل أرضك'), findsOneWidget);
    });

    testWidgets('the ground button switches to the satellite and back', (tester) async {
      await open(tester, server());
      expect(find.byType(TileLayer), findsNothing);
      expect(find.text('قمر صناعي'), findsOneWidget);
      await tester.tap(find.byKey(const Key('maps-ground')));
      await tester.pump();
      expect(find.byType(TileLayer), findsOneWidget);
      final tiles = tester.widget<TileLayer>(find.byType(TileLayer));
      expect(tiles.urlTemplate, contains('s2cloudless_3857'));
      expect(find.text('خريطة'), findsOneWidget);
      await tester.tap(find.byKey(const Key('maps-ground')));
      await tester.pump();
      expect(find.byType(TileLayer), findsNothing);
    });

    testWidgets('the key folds away', (tester) async {
      await open(tester, server());
      expect(find.byKey(const Key('maps-legend-bar')), findsOneWidget);
      await tester.tap(find.byKey(const Key('maps-key-toggle')));
      await tester.pump();
      expect(find.byKey(const Key('maps-legend-bar')), findsNothing);
    });

    testWidgets('without the week, the fixed layers and a word on why', (tester) async {
      await open(tester, server(body: payload(week: false)));
      expect(find.byKey(const Key('maps-chip-rain')), findsNothing);
      expect(find.byKey(const Key('maps-chip-canal')), findsOneWidget);
      expect(find.textContaining('تعذّر جلبُ توقّع الأسبوع'), findsOneWidget);
    });

    testWidgets('a failed load says so, with a retry', (tester) async {
      await open(tester, server(body: {'error': 'تعذّر جلبُ الخرائط الآن.'}, status: 503));
      expect(find.text('تعذّر جلبُ الخرائط الآن.'), findsOneWidget);
      expect(find.text('إعادة المحاولة'), findsOneWidget);
    });
  });
}
