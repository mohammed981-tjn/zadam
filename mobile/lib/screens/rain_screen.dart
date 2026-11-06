/// توقّع الأمطار: الخريطة نفسها التي في صفحة /rain على الموقع.
///
/// North is up and east is right although the app is right-to-left — a map is
/// not text. The x axis is shrunk by cos 15° so the country keeps its shape.
library;

import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../api.dart';
import '../rain_map.dart';
import '../theme.dart';
import '../ui.dart';

class RainScreen extends StatefulWidget {
  const RainScreen({super.key});

  @override
  State<RainScreen> createState() => _RainScreenState();
}

class _RainScreenState extends State<RainScreen> {
  final _api = SudagriApi();
  late Future<RainGrid> _future;
  String _layer = 'rain';

  @override
  void initState() {
    super.initState();
    _future = _api.rain();
  }

  @override
  void dispose() {
    _api.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('توقّع الأمطار والخرائط')),
      body: RefreshIndicator(
        onRefresh: () async => setState(() => _future = _api.rain()),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
          children: [
            const IntroNote(
              'الأيام السبعة القادمة على خريطة السودان، ثمّ يوماً بيوم لكل '
              'مدينة. توقّعاتٌ من نماذج الأرصاد لا قياسات، وتُحدَّث كل ثلاث ساعات.',
              icon: Icons.umbrella_outlined,
            ),
            const SizedBox(height: 16),
            FutureBuilder<RainGrid>(
              future: _future,
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Padding(
                    padding: EdgeInsets.symmetric(vertical: 40),
                    child: LoadingView(),
                  );
                }
                if (snapshot.hasError) {
                  return Card(
                    child: StateView.error(
                      snapshot.error,
                      compact: true,
                      onRetry: () => setState(() => _future = _api.rain()),
                    ),
                  );
                }
                final grid = snapshot.data!;
                final layer = grid.layers.firstWhere((l) => l.key == _layer,
                    orElse: () => grid.rain);
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // The same order as the website: the map with its layers,
                    // then the day-by-day table.
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(14),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Wrap(
                              spacing: 8,
                              runSpacing: 8,
                              children: [
                                for (final l in grid.layers)
                                  ChoiceChip(
                                    label: Text(l.title),
                                    selected: l.key == layer.key,
                                    onSelected: (_) =>
                                        setState(() => _layer = l.key),
                                  ),
                              ],
                            ),
                            const SizedBox(height: 12),
                            Text(layer.note,
                                style: const TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w800)),
                            const SizedBox(height: 4),
                            Text(
                              switch (layer.key) {
                                'elev' =>
                                  'ثابتةٌ لا تتغيّر مع الطقس — بدقّة المربّع، للصورة العامة لا لمسح موقع.',
                                'soil' =>
                                  'الصنف الغالب في خمس نقاطٍ من كل مربّع — صورة البلد العامة، لا فحص تربة حقلك.',
                                'lands' =>
                                  'بعددها في كل مربّع — لا تضع الخريطة نقطةً على أرض أحد.',
                                _ => 'من ${grid.from} إلى ${grid.to}',
                              },
                              style: TextStyle(
                                  fontSize: 12, color: mutedOn(context)),
                            ),
                            const SizedBox(height: 12),
                            RainMapView(
                                grid: grid, layer: layer, showCanal: true),
                            if (layer.key == 'lands' &&
                                grid.cells.every(
                                    (c) => c.values['lands'] == null)) ...[
                              const SizedBox(height: 8),
                              const Text(
                                  'لا أرضَ موثّقة معروضة بعد. سجّل أرضك فتظهر هنا حين تُوثَّق ويعرضها صاحبها.',
                                  style: TextStyle(fontSize: 13)),
                            ],
                            const SizedBox(height: 12),
                            _Legend(
                                layer: layer,
                                canal: grid.canalRoute.isNotEmpty),
                          ],
                        ),
                      ),
                    ),
                    if (grid.daily != null) ...[
                      const SizedBox(height: 24),
                      const Text('المطر يوماً بيوم',
                          style: TextStyle(
                              fontSize: 18, fontWeight: FontWeight.w800)),
                      const SizedBox(height: 4),
                      Text(
                        'بالمليمتر لكل يوم، بألوان الخريطة نفسها. النقطة تعني أقلّ من ١ مم.',
                        style:
                            TextStyle(fontSize: 13, color: mutedOn(context)),
                      ),
                      const SizedBox(height: 12),
                      _DailyTable(table: grid.daily!, rain: grid.rain),
                    ],
                  ],
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

/// The map alone, sized to its width. Used here and on the home screen.
class RainMapView extends StatelessWidget {
  const RainMapView({
    super.key,
    required this.grid,
    required this.layer,
    this.showTowns = true,
    this.showCanal = false,
  });

  final RainGrid grid;
  final MapLayer layer;
  final bool showTowns;
  final bool showCanal;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final base = grid.base;
    if (base != null && (layer.shapes != null || layer.key == 'lands')) {
      final dark = theme.brightness == Brightness.dark;
      final kx = math.cos(16 * math.pi / 180);
      return ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: AspectRatio(
          aspectRatio:
              ((base.east - base.west) * kx) / (base.north - base.south),
          child: CustomPaint(
            painter: _MapPainter(
              grid: grid,
              base: base,
              layer: layer,
              card: theme.cardColor,
              foreground: theme.colorScheme.onSurface,
              sea: dark ? const Color(0xFF142A36) : const Color(0xFFDBE8F0),
              land: dark ? const Color(0xFF20281F) : const Color(0xFFEBE7DC),
              landEdge:
                  dark ? const Color(0xFF333D30) : const Color(0xFFD3CDBD),
              water: dark ? const Color(0xFF5B9FDB) : const Color(0xFF3F86C6),
              label: dark ? const Color(0xFF8D917F) : const Color(0xFF857F70),
              stateLine: dark
                  ? const Color(0x4DEEF1E8)
                  : const Color(0x4D1C2B1E),
              showTowns: showTowns,
              showCanal: showCanal,
            ),
          ),
        ),
      );
    }
    final p = _Projection.of(grid);
    return AspectRatio(
      aspectRatio: p.aspect,
      child: CustomPaint(
        painter: _RainPainter(
          grid: grid,
          layer: layer,
          projection: p,
          card: theme.cardColor,
          border: theme.dividerColor,
          foreground: theme.colorScheme.onSurface,
          muted: mutedOn(context),
          showTowns: showTowns,
          showCanal: showCanal,
        ),
      ),
    );
  }
}

class _Projection {
  _Projection(this.lonMin, this.lonMax, this.latMin, this.latMax);

  factory _Projection.of(RainGrid g) {
    final h = g.cellDeg / 2;
    final lons = g.cells.map((c) => c.lon);
    final lats = g.cells.map((c) => c.lat);
    return _Projection(
      lons.reduce(math.min) - h,
      lons.reduce(math.max) + h,
      lats.reduce(math.min) - h,
      lats.reduce(math.max) + h,
    );
  }

  final double lonMin, lonMax, latMin, latMax;

  static final _kx = math.cos(15 * math.pi / 180);

  double get aspect => ((lonMax - lonMin) * _kx) / (latMax - latMin);

  Offset at(double lon, double lat, Size s) => Offset(
        (lon - lonMin) / (lonMax - lonMin) * s.width,
        s.height - (lat - latMin) / (latMax - latMin) * s.height,
      );
}


class _RainPainter extends CustomPainter {
  _RainPainter({
    required this.grid,
    required this.layer,
    required this.projection,
    required this.card,
    required this.border,
    required this.foreground,
    required this.muted,
    required this.showTowns,
    required this.showCanal,
  });

  final RainGrid grid;
  final MapLayer layer;
  final _Projection projection;
  final Color card, border, foreground, muted;
  final bool showTowns;
  final bool showCanal;

  @override
  void paint(Canvas canvas, Size size) {
    Offset at(double lon, double lat) => projection.at(lon, lat, size);

    final outline = Path();
    for (var i = 0; i < grid.border.length; i++) {
      final o = at(grid.border[i].$1, grid.border[i].$2);
      if (i == 0) {
        outline.moveTo(o.dx, o.dy);
      } else {
        outline.lineTo(o.dx, o.dy);
      }
    }
    outline.close();

    final h = grid.cellDeg / 2;
    final cellH = at(0, 0).dy - at(0, grid.cellDeg).dy;

    canvas.save();
    canvas.clipPath(outline);
    canvas.drawPath(outline, Paint()..color = card);
    final lines = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 0.5
      ..color = border;
    for (final c in grid.cells) {
      final v = c.values[layer.key];
      if (v == null) continue;
      final r = Rect.fromPoints(at(c.lon - h, c.lat + h), at(c.lon + h, c.lat - h));
      canvas.drawRect(r, Paint()..color = layer.bandFor(v).fill ?? card);
      canvas.drawRect(r, lines);
    }
    canvas.restore();

    canvas.drawPath(
      outline,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.2
        ..color = foreground,
    );

    if (showCanal && grid.canalRoute.length > 1) {
      final route = Path();
      for (var i = 0; i < grid.canalRoute.length; i++) {
        final o = at(grid.canalRoute[i].$1, grid.canalRoute[i].$2);
        if (i == 0) {
          route.moveTo(o.dx, o.dy);
        } else {
          route.lineTo(o.dx, o.dy);
        }
      }
      for (final (w, c) in [(4.5, card), (2.5, canalInk)]) {
        canvas.drawPath(
            route,
            Paint()
              ..style = PaintingStyle.stroke
              ..strokeWidth = w
              ..strokeCap = StrokeCap.round
              ..color = c);
      }
    }

    final fontSize = (size.width / 36).clamp(8.0, 14.0);
    for (final c in grid.cells.where((c) => c.labelled && layer.numbers)) {
      final v = c.values[layer.key];
      if (v == null) continue;
      final band = layer.bandFor(v);
      final atCentre = c.pLon == c.lon && c.pLat == c.lat;
      final centre = at(c.pLon, c.pLat) +
          Offset(0, showTowns && atCentre ? cellH * 0.2 : 0);
      _text(canvas, '${v.round()}', centre,
          size: v.abs() >= 999.5 ? fontSize * 0.78 : fontSize,
          bold: true,
          colour: band.ink ?? muted,
          halo: band.fill ?? card);
    }

    if (!showTowns) return;
    for (final t in grid.towns) {
      final o = at(t.lon, t.lat);
      // A town is a dot in the text's own ink: no red anywhere (the owner's rule).
      canvas.drawCircle(o, 2.5, Paint()..color = foreground);
      _text(
        canvas,
        t.name,
        o + Offset(0, t.above ? -fontSize * 0.8 : fontSize * 0.8),
        size: fontSize * 0.8,
        colour: foreground,
        halo: card,
      );
    }
  }

  void _text(Canvas canvas, String s, Offset centre,
      {required double size,
      required Color colour,
      required Color halo,
      bool bold = false}) {
    TextPainter make(Paint? stroke) => TextPainter(
          text: TextSpan(
            text: s,
            style: TextStyle(
              fontSize: size,
              fontWeight: bold ? FontWeight.w700 : FontWeight.w500,
              color: stroke == null ? colour : null,
              foreground: stroke,
            ),
          ),
          textDirection: TextDirection.rtl,
        )..layout();

    final haloPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3
      ..color = halo;
    for (final tp in [make(haloPaint), make(null)]) {
      tp.paint(canvas, centre - Offset(tp.width / 2, tp.height / 2));
    }
  }

  @override
  bool shouldRepaint(_RainPainter old) =>
      old.grid != grid ||
      old.layer != layer ||
      old.card != card ||
      old.showTowns != showTowns ||
      old.showCanal != showCanal;
}

/// The map as the website draws it (src/components/RainMap.tsx): the ground,
/// the layer's smooth bands clipped to Sudan, state lines, the Nile, the
/// border, and each town with the layer's value. Same order, same colours.
class _MapPainter extends CustomPainter {
  _MapPainter({
    required this.grid,
    required this.base,
    required this.layer,
    required this.card,
    required this.foreground,
    required this.sea,
    required this.land,
    required this.landEdge,
    required this.water,
    required this.label,
    required this.stateLine,
    required this.showTowns,
    required this.showCanal,
  });

  final RainGrid grid;
  final MapBase base;
  final MapLayer layer;
  final Color card, foreground, sea, land, landEdge, water, label, stateLine;
  final bool showTowns, showCanal;

  @override
  void paint(Canvas canvas, Size size) {
    Offset at(LonLat p) => Offset(
          (p.$1 - base.west) / (base.east - base.west) * size.width,
          size.height -
              (p.$2 - base.south) / (base.north - base.south) * size.height,
        );
    Path ring(List<LonLat> pts, {bool close = true}) {
      final path = Path();
      for (var i = 0; i < pts.length; i++) {
        final o = at(pts[i]);
        if (i == 0) {
          path.moveTo(o.dx, o.dy);
        } else {
          path.lineTo(o.dx, o.dy);
        }
      }
      if (close) path.close();
      return path;
    }

    Paint fill(Color c) => Paint()..color = c;
    Paint stroke(Color c, double w) => Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = w
      ..strokeJoin = StrokeJoin.round
      ..strokeCap = StrokeCap.round
      ..color = c;
    final fs = (size.width / 44).clamp(8.0, 13.0);

    // The ground.
    canvas.drawRect(Offset.zero & size, fill(sea));
    for (final n in base.neighbours) {
      final path = ring(n);
      canvas.drawPath(path, fill(land));
      canvas.drawPath(path, stroke(landEdge, 0.7));
    }
    for (final (name, p) in base.labels) {
      _text(canvas, name, at(p), 'c',
          size: fs * 0.85, colour: label, halo: null);
    }

    // The data, clipped to Sudan.
    final border = ring(grid.border);
    canvas.save();
    canvas.clipPath(border);
    final shapes = layer.shapes;
    canvas.drawPath(
        border,
        fill(shapes == null
            ? card
            : layer.bands[shapes.base].fill ?? card));
    if (shapes != null) {
      for (final (band, polys) in shapes.bands) {
        final c = layer.bands[band].fill ?? card;
        for (final poly in polys) {
          final path = Path()..fillType = PathFillType.evenOdd;
          for (final r in poly) {
            path.addPath(ring(r), Offset.zero);
          }
          canvas.drawPath(path, fill(c));
        }
      }
    }
    for (final st in base.states) {
      _dashed(canvas, ring(st), stroke(stateLine, 0.8));
    }
    canvas.restore();

    // Water over the data, so the Nile reads on every layer.
    for (final (line, main) in base.rivers) {
      final path = ring(line, close: false);
      canvas.drawPath(path, stroke(card.withValues(alpha: 0.8), main ? 3.6 : 2.4));
      canvas.drawPath(path, stroke(water, main ? 1.9 : 1.1));
    }
    for (final l in base.lakes) {
      canvas.drawPath(ring(l), fill(water));
    }
    canvas.drawPath(border, stroke(foreground, 1.2));

    if (showCanal && grid.canalRoute.length > 1) {
      canvas.drawPath(
          ring(grid.canalRoute, close: false), stroke(canalInk, 2.6));
    }

    if (layer.key == 'lands') {
      for (final c in grid.cells) {
        final n = c.values['lands'];
        if (n == null) continue;
        final o = at((c.lon, c.lat));
        final r = (5 + 3 * math.sqrt(n)) * size.width / 400;
        canvas.drawCircle(o, r, fill(const Color(0xD92A6424)));
        canvas.drawCircle(o, r, stroke(card, 1));
        _text(canvas, n.round().toString(), o, 'c',
            size: fs, colour: Colors.white, halo: null, bold: true);
      }
    }

    if (showTowns) {
      for (final t in layer.towns) {
        final o = at((t.lon, t.lat));
        canvas.drawCircle(o, 2.4, fill(foreground));
        canvas.drawCircle(o, 2.4, stroke(card, 1));
        final v = t.value;
        final text = v == null
            ? t.name
            : '${t.name} ${layer.key == 'rain' && v < 0.5 ? 0 : v.round()}';
        _text(canvas, text, o, t.side,
            size: fs, colour: foreground, halo: card);
      }
    }
  }

  /// Dashes along a path, since Flutter's canvas has no dash style.
  void _dashed(Canvas canvas, Path path, Paint paint) {
    for (final m in path.computeMetrics()) {
      for (var d = 0.0; d < m.length; d += 5) {
        canvas.drawPath(m.extractPath(d, math.min(d + 3, m.length)), paint);
      }
    }
  }

  /// A label beside a point: r, l, t, b, or c for centred on it.
  void _text(Canvas canvas, String s, Offset o, String side,
      {required double size,
      required Color colour,
      required Color? halo,
      bool bold = false}) {
    TextPainter make(Paint? strokePaint) => TextPainter(
          text: TextSpan(
            text: s,
            style: TextStyle(
              fontSize: size,
              fontWeight: bold ? FontWeight.w800 : FontWeight.w600,
              color: strokePaint == null ? colour : null,
              foreground: strokePaint,
            ),
          ),
          textDirection: TextDirection.rtl,
        )..layout();
    final plain = make(null);
    final w = plain.width;
    final h = plain.height;
    final topLeft = switch (side) {
      'r' => o + Offset(5, -h / 2),
      'l' => o + Offset(-5 - w, -h / 2),
      't' => o + Offset(-w / 2, -h - 3),
      'b' => o + Offset(-w / 2, 3),
      _ => o - Offset(w / 2, h / 2),
    };
    if (halo != null) {
      make(Paint()
            ..style = PaintingStyle.stroke
            ..strokeWidth = 3
            ..strokeJoin = StrokeJoin.round
            ..color = halo)
          .paint(canvas, topLeft);
    }
    plain.paint(canvas, topLeft);
  }

  @override
  bool shouldRepaint(_MapPainter old) =>
      old.grid != grid ||
      old.layer != layer ||
      old.card != card ||
      old.showTowns != showTowns ||
      old.showCanal != showCanal;
}

/// The Arc Canal's line colour, the same teal as on the website.
const canalInk = Color(0xFF0E7C86);

class _Legend extends StatelessWidget {
  const _Legend({required this.layer, this.canal = false});

  final MapLayer layer;
  final bool canal;

  @override
  Widget build(BuildContext context) {
    final card = Theme.of(context).cardColor;
    final border = Theme.of(context).dividerColor;
    return Wrap(
      spacing: 12,
      runSpacing: 6,
      children: [
        for (final b in layer.bands)
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 14,
                height: 14,
                decoration: BoxDecoration(
                  color: b.fill ?? card,
                  border: Border.all(color: border),
                  borderRadius: BorderRadius.circular(3),
                ),
              ),
              const SizedBox(width: 4),
              Text(b.label, style: const TextStyle(fontSize: 12)),
            ],
          ),
        Text(layer.unit,
            style: TextStyle(fontSize: 12, color: mutedOn(context))),
        if (canal)
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 16,
                height: 4,
                decoration: BoxDecoration(
                  color: canalInk,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(width: 4),
              const Text('مسار القناة القوسية',
                  style: TextStyle(fontSize: 12)),
            ],
          ),
      ],
    );
  }
}

/// Towns down the side, days across, each day shaded with the map's blues.
/// Scrolls sideways on a narrow phone; the town names scroll with it, which
/// is the price of using a plain Table rather than a pinned-column widget.
class _DailyTable extends StatelessWidget {
  const _DailyTable({required this.table, required this.rain});

  final DailyTable table;
  final MapLayer rain;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = mutedOn(context);
    const weekdays = [
      'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'
    ];

    Widget cell(Widget child, {Color? bg}) => Container(
          color: bg,
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
          alignment: Alignment.center,
          child: child,
        );

    return Card(
      clipBehavior: Clip.antiAlias,
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Table(
          defaultColumnWidth: const IntrinsicColumnWidth(),
          border: TableBorder(
              horizontalInside: BorderSide(color: theme.dividerColor)),
          children: [
            TableRow(children: [
              cell(Text('المدينة',
                  style: TextStyle(fontSize: 12, color: muted))),
              for (final d in table.dates)
                cell(Column(children: [
                  Text(weekdays[DateTime.parse(d).weekday - 1],
                      style: TextStyle(fontSize: 11, color: muted)),
                  Text('${DateTime.parse(d).day}',
                      style: TextStyle(fontSize: 11, color: muted)),
                ])),
              cell(Text('المجموع',
                  style: TextStyle(fontSize: 12, color: muted))),
              cell(Text('أعلى حرارة',
                  style: TextStyle(fontSize: 12, color: muted))),
            ]),
            for (final t in table.towns)
              TableRow(children: [
                cell(Text(t.name,
                    style: const TextStyle(fontWeight: FontWeight.w700))),
                for (final date in table.dates)
                  _dayCell(cell, t, date, muted),
                cell(Text(
                    '${t.days.fold<double>(0, (a, d) => a + d.rainMm).round()}',
                    style: const TextStyle(fontWeight: FontWeight.w800))),
                cell(Text(
                    '${t.days.map((d) => d.tmaxC).reduce((a, b) => a > b ? a : b).round()}°',
                    style: TextStyle(color: muted))),
              ]),
          ],
        ),
      ),
    );
  }

  Widget _dayCell(Widget Function(Widget, {Color? bg}) cell, TownForecast t,
      String date, Color muted) {
    final matches = t.days.where((d) => d.date == date);
    if (matches.isEmpty) return cell(Text('—', style: TextStyle(color: muted)));
    final mm = matches.first.rainMm;
    final band = rain.bandFor(mm);
    return cell(
      Text(mm < 1 ? '·' : '${mm.round()}',
          style: TextStyle(
              fontWeight: FontWeight.w700, color: band.ink ?? muted)),
      bg: band.fill,
    );
  }
}
