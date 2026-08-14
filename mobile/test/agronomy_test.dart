/// Parity between the Dart water engine and the TypeScript one.
///
/// The app ships its own copy of the FAO-56 engine so it works with no signal.
/// The risk that buys is drift: two implementations of the same standard that
/// slowly stop agreeing, so the web tells a farmer one number and the app in
/// their hand tells them another. Nobody notices, because each is
/// self-consistent.
///
/// The expected values below were produced by running `src/lib/agronomy.ts` —
/// the web engine — over the same inputs. They are not independently derived
/// truth; they are a pin. If a change to either implementation moves a number,
/// this fails, and whoever moved it has to move the other side too or explain
/// why they should differ.
///
/// Regenerate them by running the web engine over these six cases and pasting
/// the output back in. Do that only when the change is deliberate.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:sudagri/agronomy.dart';

/// Tight enough to catch a real formula change, loose enough to survive the
/// last bit of double formatting between two languages.
const double tolerance = 0.001;

class _Case {
  const _Case(
    this.crop,
    this.station,
    this.plantingMonth,
    this.method,
    this.seasonDays,
    this.totalEtc,
    this.totalEffectiveRain,
    this.totalNet,
    this.totalGross,
    this.m3PerFeddan,
    this.peakMonthIndex,
    this.peakRate,
  );

  final String crop;
  final String station;
  final int plantingMonth;
  final IrrigationMethod method;
  final int seasonDays;
  final double totalEtc;
  final double totalEffectiveRain;
  final double totalNet;
  final double totalGross;
  final double m3PerFeddan;
  final int peakMonthIndex;
  final double peakRate;
}

const cases = <_Case>[
  _Case('wheat', 'gezira', 10, IrrigationMethod.flood, 110, 448.5811, 0.0,
      448.5811, 815.6019, 3425.5282, 0, 42.5554),
  _Case('sorghum', 'kordofan', 6, IrrigationMethod.flood, 125, 506.6466,
      279.8400, 271.0024, 492.7316, 2069.4728, 9, 33.5013),
  _Case('cotton', 'gezira', 7, IrrigationMethod.pivot, 195, 896.8315, 151.2800,
      780.1707, 975.2133, 4095.8960, 10, 32.9871),
  _Case('sesame', 'kassala', 6, IrrigationMethod.flood, 110, 481.3633, 205.3057,
      282.5166, 513.6665, 2157.3993, 8, 39.1082),
  _Case('onion', 'northern', 10, IrrigationMethod.drip, 210, 1077.7916, 0.0,
      1077.7916, 1197.5462, 5029.6940, 3, 34.3470),
  _Case('sugarcane', 'khartoum', 2, IrrigationMethod.sprinkler, 380, 2255.4377,
      116.9344, 2138.5033, 2851.3377, 11975.6184, 5, 41.6578),
];

void main() {
  group('matches the web engine', () {
    for (final c in cases) {
      test('${c.crop} in ${c.station}, planted month ${c.plantingMonth}', () {
        final crop = crops.firstWhere((x) => x.key == c.crop);
        final station = stations.firstWhere((x) => x.key == c.station);
        final r = waterRequirement(crop, station, c.plantingMonth, c.method);

        expect(r.seasonDays, c.seasonDays);
        expect(r.totalEtc, closeTo(c.totalEtc, tolerance));
        expect(r.totalEffectiveRain, closeTo(c.totalEffectiveRain, tolerance));
        expect(r.totalNet, closeTo(c.totalNet, tolerance));
        expect(r.totalGross, closeTo(c.totalGross, tolerance));
        expect(r.m3PerFeddan, closeTo(c.m3PerFeddan, tolerance));
        expect(r.peakMonthIndex, c.peakMonthIndex);
        expect(r.peakM3PerFeddanPerDay, closeTo(c.peakRate, tolerance));
      });
    }
  });

  group('the underlying formulas', () {
    test('extraterrestrial radiation', () {
      expect(extraterrestrialRadiation(15.6, 196), closeTo(15.678865, 1e-5));
    });

    test('reference ET0', () {
      expect(referenceEt0(41, 26, 15.6, 196), closeTo(7.164823, 1e-5));
    });

    test('effective rainfall below and above the 250 mm break', () {
      expect(effectiveRainfall(110), closeTo(90.64, 1e-5));
      expect(effectiveRainfall(300), closeTo(155.0, 1e-5));
      expect(effectiveRainfall(0), 0);
      expect(effectiveRainfall(-5), 0);
    });
  });

  group('the Kc curve', () {
    final wheat = crops.firstWhere((c) => c.key == 'wheat');

    test('flat at Kc_ini through the initial stage', () {
      expect(cropCoefficient(wheat, 0), wheat.kcInitial);
      expect(cropCoefficient(wheat, 19), wheat.kcInitial);
    });

    test('reaches Kc_mid by the mid-season stage', () {
      expect(cropCoefficient(wheat, 45), wheat.kcMid);
    });

    test('descends towards Kc_end and never overshoots it', () {
      final last = cropCoefficient(wheat, 109);
      expect(last, greaterThanOrEqualTo(wheat.kcEnd));
      expect(last, lessThan(wheat.kcMid));
      // Past the end of the season the curve is clamped, not extrapolated.
      expect(cropCoefficient(wheat, 500), closeTo(wheat.kcEnd, 1e-9));
    });
  });

  group('sanity properties that must hold for every crop and station', () {
    test('gross always at least net, and rain never exceeds demand', () {
      for (final crop in crops) {
        for (final station in stations) {
          final r = waterRequirement(
              crop, station, 6, IrrigationMethod.flood);
          expect(r.totalGross, greaterThanOrEqualTo(r.totalNet),
              reason: '${crop.key}/${station.key}');
          expect(r.totalNet, greaterThanOrEqualTo(0),
              reason: '${crop.key}/${station.key}');
          expect(r.monthly, isNotEmpty, reason: '${crop.key}/${station.key}');
        }
      }
    });

    test('a more efficient method never needs more water', () {
      final crop = crops.firstWhere((c) => c.key == 'cotton');
      final station = stations.firstWhere((s) => s.key == 'gezira');
      final flood = waterRequirement(crop, station, 7, IrrigationMethod.flood);
      final drip = waterRequirement(crop, station, 7, IrrigationMethod.drip);
      expect(drip.totalGross, lessThan(flood.totalGross));
      // Net demand is a property of the crop and climate, not the pipe.
      expect(drip.totalNet, closeTo(flood.totalNet, 1e-9));
    });

    test('planting in any month completes a season', () {
      final crop = crops.firstWhere((c) => c.key == 'sorghum');
      final station = stations.firstWhere((s) => s.key == 'kordofan');
      for (var m = 0; m < 12; m++) {
        final r = waterRequirement(crop, station, m, IrrigationMethod.flood);
        final days = r.monthly.fold<int>(0, (sum, x) => sum + x.days);
        expect(days, r.seasonDays, reason: 'planted month $m');
      }
    });
  });
}
