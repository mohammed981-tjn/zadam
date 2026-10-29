/// «حدّد أرضك» (البند ١٣٤): المساحة والمركز من أركان الحقل، والمسار الممشيّ مخفَّفاً.
///
/// The same arithmetic as `boundaryOf` in src/lib/landInput.ts: the corners are laid on a flat plane around their
/// mean and the shoelace formula gives the area. The phone shows this while the farmer walks or taps; the server
/// works it out again from the corners it is sent and saves its own figure, so the two must agree — the parity
/// test holds them to the same numbers.
library;

import 'dart:math' as math;

/// One feddan is 4,200.83 m².
const m2PerFeddan = 4200.83;

/// The most corners the server accepts (MAX_CORNERS in landInput.ts).
const maxCorners = 500;

class Corner {
  const Corner(this.lat, this.lng);
  final double lat;
  final double lng;

  Map<String, double> toJson() => {'lat': lat, 'lng': lng};
}

class Shape {
  const Shape({required this.m2, required this.centre});

  /// Area enclosed, m².
  final double m2;
  final Corner centre;

  double get feddans => m2 / m2PerFeddan;
}

const _earth = 6371008.8;
const _rad = math.pi / 180;

/// Area and centre of a field from its corners in order round the edge, or null when they enclose nothing.
Shape? shapeOf(List<Corner> corners) {
  if (corners.length < 3 || corners.length > maxCorners) return null;
  for (final c in corners) {
    if (!c.lat.isFinite || !c.lng.isFinite || c.lat.abs() > 90 || c.lng.abs() > 180) return null;
  }
  final lat0 = corners.fold<double>(0, (s, c) => s + c.lat) / corners.length;
  final lng0 = corners.fold<double>(0, (s, c) => s + c.lng) / corners.length;
  final k = math.cos(lat0 * _rad);
  final xs = [for (final c in corners) (c.lng - lng0) * _rad * _earth * k];
  final ys = [for (final c in corners) (c.lat - lat0) * _rad * _earth];

  var twice = 0.0, cx = 0.0, cy = 0.0;
  for (var i = 0; i < corners.length; i++) {
    final j = (i + 1) % corners.length;
    final cross = xs[i] * ys[j] - xs[j] * ys[i];
    twice += cross;
    cx += (xs[i] + xs[j]) * cross;
    cy += (ys[i] + ys[j]) * cross;
  }
  final m2 = twice.abs() / 2;
  if (m2 < 1) return null;
  cx /= 3 * twice;
  cy /= 3 * twice;
  return Shape(
    m2: m2,
    centre: Corner(lat0 + cy / _earth / _rad, lng0 + cx / (_earth * k) / _rad),
  );
}

/// Metres between two points (haversine).
double metresBetween(Corner a, Corner b) {
  final dLat = (b.lat - a.lat) * _rad;
  final dLng = (b.lng - a.lng) * _rad;
  final h = math.pow(math.sin(dLat / 2), 2) +
      math.cos(a.lat * _rad) * math.cos(b.lat * _rad) * math.pow(math.sin(dLng / 2), 2);
  return 2 * _earth * math.asin(math.min(1, math.sqrt(h)));
}

/// Whether a reading taken on the walk is kept: the first always, then only once the phone has moved [stepMetres]
/// from the last kept one. A phone standing still drifts by metres; without this a pause at a corner would add a
/// knot of points, and a long walk would pass the server's limit.
bool keepReading(List<Corner> walked, Corner next, {double stepMetres = 5}) =>
    walked.isEmpty || metresBetween(walked.last, next) >= stepMetres;

/// A walked track thinned to at most [max] corners, evenly along it, the first and last kept.
List<Corner> thin(List<Corner> track, {int max = maxCorners}) {
  if (track.length <= max) return List.of(track);
  final step = (track.length - 1) / (max - 1);
  return [for (var i = 0; i < max; i++) track[(i * step).round()]];
}
