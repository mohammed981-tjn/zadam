/// Parity between the Dart irrigation-interval engine and the TypeScript one.
///
/// Same discipline as `agronomy_test.dart`, and for the same reason: the app
/// carries its own copy so it works with no signal, and the price of that is
/// two implementations that can slowly stop agreeing while each stays
/// self-consistent. Nobody notices, because nobody holds both answers at once
/// — the farmer sees the app, the office sees the website.
///
/// The expected values below were produced by running `src/lib/soilWater.ts`
/// over the same inputs. They are not independently derived truth; they are a
/// pin. If a change to either side moves a number, this fails, and whoever
/// moved it has to move the other side too or explain why they should differ.
///
/// Regenerate by running the web engine over these six cases and pasting the
/// output back in — and only when the change is deliberate.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:sudagri/agronomy.dart';
import 'package:sudagri/soil_water.dart';

const double tolerance = 0.001;

class _SoilCase {
  const _SoilCase(
    this.crop,
    this.station,
    this.plantingMonth,
    this.method,
    this.soil,
    this.rawMm,
    this.peakMmPerDay,
    this.days,
    this.doseM3PerFeddan,
  );

  final String crop;
  final String station;
  final int plantingMonth;
  final IrrigationMethod method;
  final String soil;
  final double rawMm;
  final double peakMmPerDay;
  final double days;
  final double doseM3PerFeddan;
}

/// Six cases chosen to cross the whole range: the lightest soil and the
/// heaviest, the shallowest root and the deepest, and both depletion
/// fractions — so a change to any one of the tables this engine reads moves at
/// least one of these numbers.
const soilCases = <_SoilCase>[
  _SoilCase('wheat', 'gezira', 10, IrrigationMethod.flood, 'sand',
      37.5000, 10.1322, 3.7011, 157.5000),
  _SoilCase('sorghum', 'kordofan', 6, IrrigationMethod.flood, 'clay loam',
      105.0000, 7.9765, 13.1637, 441.0000),
  _SoilCase('onion', 'northern', 10, IrrigationMethod.drip, 'sandy loam',
      10.8000, 8.1779, 1.3206, 45.3600),
  _SoilCase('tomato', 'khartoum', 9, IrrigationMethod.drip, 'loam',
      50.4000, 5.6428, 8.9317, 211.6800),
  _SoilCase('sugarcane', 'khartoum', 2, IrrigationMethod.sprinkler, 'clay',
      120.0000, 9.9185, 12.0986, 504.0000),
  _SoilCase('groundnut', 'kordofan', 6, IrrigationMethod.flood, 'loamy sand',
      23.7500, 10.0074, 2.3732, 99.7500),
];

void main() {
  group('matches the web soil-water engine', () {
    for (final c in soilCases) {
      test('${c.crop} on ${c.soil} in ${c.station}', () {
        final crop = crops.firstWhere((x) => x.key == c.crop);
        final station = stations.firstWhere((x) => x.key == c.station);
        final r = irrigationInterval(
          crop,
          station,
          c.plantingMonth,
          c.method,
          c.soil,
        );

        expect(r, isNotNull);
        expect(r!.rawMm, closeTo(c.rawMm, tolerance));
        expect(r.peakMmPerDay, closeTo(c.peakMmPerDay, tolerance));
        expect(r.days, closeTo(c.days, tolerance));
        expect(r.doseM3PerFeddan, closeTo(c.doseM3PerFeddan, tolerance));
      });
    }
  });

  group('the finding the screen rests on', () {
    test('the interval tracks what the soil holds, exactly', () {
      final crop = crops.firstWhere((x) => x.key == 'sorghum');
      final station = stations.first;

      /*
       * Not "heavier soil waits longer" — that is false, and writing it as a
       * test is how the falsehood would have reached the screen. Clay holds
       * *less* available water than clay loam (200 mm/m against 210): much of
       * what heavy clay retains is bound too tightly for roots to take. Silt
       * loam ties clay outright.
       *
       * The invariant that does hold is stronger and simpler. Crop, climate,
       * root depth and depletion fraction are all fixed here, so the interval
       * is a straight multiple of the soil's capacity — and the ratio must be
       * identical for every soil in the table.
       */
      double ratioOn(String soil) {
        final r = irrigationInterval(
          crop,
          station,
          6,
          IrrigationMethod.flood,
          soil,
        );
        expect(r, isNotNull, reason: 'no interval for $soil');
        return r!.days / tawMmPerM[soil]!;
      }

      final expectedRatio = ratioOn(soilKeys.first);
      for (final soil in soilKeys.skip(1)) {
        expect(
          ratioOn(soil),
          closeTo(expectedRatio, 1e-9),
          reason: '$soil breaks proportionality with the capacity table',
        );
      }
    });

    test('every crop in the app has a root depth', () {
      // A crop the picker offers but this engine cannot answer for would show
      // the farmer an empty panel with no explanation.
      for (final crop in crops) {
        expect(
          rootDepthM[crop.key],
          isNotNull,
          reason: 'no root depth for ${crop.key}',
        );
      }
    });

    test('the picker order carries every soil, and each has a name', () {
      // The screen builds its dropdown from soilKeys and prints soilLabel for
      // each. A texture present in the capacity table but missing from the
      // order is simply unreachable; one missing a label renders as a blank
      // row. Both are silent.
      expect(soilKeys.toSet(), equals(tawMmPerM.keys.toSet()));
      for (final soil in soilKeys) {
        expect(soilLabel[soil], isNotNull, reason: 'no Arabic name for $soil');
      }
    });
  });
}
