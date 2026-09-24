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
      appBar: AppBar(title: const Text('توقّع الأمطار')),
      body: RefreshIndicator(
        onRefresh: () async => setState(() => _future = _api.rain()),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
          children: [
            Text(
              'مجموع المطر المتوقّع في الأيام السبعة القادمة على كل مربّعٍ من '
              'السودان (نحو ١٦٠ كم للضلع). اللون يُريك أين المطر، والرقم كم '
              'مليمتراً. توقّعٌ من نماذج الأرصاد لا قياس، ويُحدَّث كل ثلاث ساعات.',
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
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text('من ${grid.from} إلى ${grid.to}',
                        style: const TextStyle(fontWeight: FontWeight.w700)),
                    const SizedBox(height: 12),
                    RainMapView(grid: grid),
                    const SizedBox(height: 12),
                    _Legend(grid: grid),
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
  const RainMapView({super.key, required this.grid, this.showTowns = true});

  final RainGrid grid;
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
    required this.projection,
    required this.card,
    required this.border,
    required this.foreground,
    required this.muted,
    required this.showTowns,
  });

  final RainGrid grid;
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
      final r = Rect.fromPoints(at(c.lon - h, c.lat + h), at(c.lon + h, c.lat - h));
      canvas.drawRect(r, Paint()..color = grid.bandFor(c.rainMm).fill ?? card);
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
      final band = grid.bandFor(c.rainMm);
      final centre = at(c.lon, c.lat) + Offset(0, showTowns ? cellH * 0.2 : 0);
      _text(canvas, '${c.rainMm.round()}', centre,
          size: fontSize,
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
      old.grid != grid || old.card != card || old.showTowns != showTowns;
}

class _Legend extends StatelessWidget {
  const _Legend({required this.grid});

  final RainGrid grid;

  @override
  Widget build(BuildContext context) {
    final card = Theme.of(context).cardColor;
    final border = Theme.of(context).dividerColor;
    return Wrap(
      spacing: 12,
      runSpacing: 6,
      children: [
        for (final b in grid.bands)
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
        Text('مليمتر في ٧ أيام',
            style: TextStyle(fontSize: 12, color: mutedOn(context))),
      ],
    );
  }
}
