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
            Text(
              'الأيام السبعة القادمة على خريطة السودان، ثمّ يوماً بيوم لكل '
              'مدينة. توقّعاتٌ من نماذج الأرصاد لا قياسات، وتُحدَّث كل ثلاث ساعات.',
              style: TextStyle(
                  fontSize: 13, color: mutedOn(context), height: 1.7),
            ),
            const SizedBox(height: 16),
            FutureBuilder<RainGrid>(
              future: _future,
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Padding(
                    padding: EdgeInsets.symmetric(vertical: 60),
                    child: Center(child: CircularProgressIndicator()),
                  );
                }
                if (snapshot.hasError) {
                  return Column(
                    children: [
                      Icon(Icons.cloud_off, size: 40, color: mutedOn(context)),
                      const SizedBox(height: 12),
                      Text('${snapshot.error}',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: mutedOn(context))),
                      const SizedBox(height: 16),
                      FilledButton(
                        onPressed: () =>
                            setState(() => _future = _api.rain()),
                        child: const Text('إعادة المحاولة'),
                      ),
                    ],
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
                              layer.key == 'elev'
                                  ? 'ثابتةٌ لا تتغيّر مع الطقس — بدقّة المربّع، للصورة العامة لا لمسح موقع.'
                                  : 'من ${grid.from} إلى ${grid.to}',
                              style: TextStyle(
                                  fontSize: 12, color: mutedOn(context)),
                            ),
                            const SizedBox(height: 12),
                            RainMapView(grid: grid, layer: layer),
                            const SizedBox(height: 12),
                            _Legend(layer: layer),
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
  });

  final RainGrid grid;
  final MapLayer layer;
  final bool showTowns;

  @override
  Widget build(BuildContext context) {
    final p = _Projection.of(grid);
    final theme = Theme.of(context);
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

/// Same six towns as the website, with the label on the side clear of the
/// cell's number.
const _towns = <(String, double, double, bool)>[
  ('الخرطوم', 32.53, 15.6, true),
  ('بورتسودان', 37.22, 19.62, true),
  ('القضارف', 35.39, 14.03, true),
  ('الأبيض', 30.22, 13.18, false),
  ('نيالا', 24.88, 12.05, true),
  ('دنقلا', 30.48, 19.17, false),
];

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
  });

  final RainGrid grid;
  final MapLayer layer;
  final _Projection projection;
  final Color card, border, foreground, muted;
  final bool showTowns;

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

    final fontSize = (size.width / 36).clamp(8.0, 14.0);
    for (final c in grid.cells.where((c) => c.labelled)) {
      final v = c.values[layer.key];
      if (v == null) continue;
      final band = layer.bandFor(v);
      final centre = at(c.lon, c.lat) + Offset(0, showTowns ? cellH * 0.2 : 0);
      _text(canvas, '${v.round()}', centre,
          size: v.abs() >= 999.5 ? fontSize * 0.78 : fontSize,
          bold: true,
          colour: band.ink ?? muted,
          halo: band.fill ?? card);
    }

    if (!showTowns) return;
    for (final (name, lon, lat, above) in _towns) {
      final o = at(lon, lat);
      canvas.drawCircle(o, 2.5, Paint()..color = const Color(0xFFB3261E));
      _text(canvas, name, o + Offset(0, above ? -fontSize * 0.8 : fontSize * 0.8),
          size: fontSize * 0.8, colour: foreground, halo: card);
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
      old.showTowns != showTowns;
}

class _Legend extends StatelessWidget {
  const _Legend({required this.layer});

  final MapLayer layer;

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
