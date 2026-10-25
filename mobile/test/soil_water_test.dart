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
/// Regenerate by running the web engine over these cases and pasting the
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

/// Cases chosen to cross the whole range: the lightest soil and the
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
  // محاصيل أكتوبر ٢٠٢٦ (البند ١٩٣): مقياسا الجذر والاستنزاف من الجدول ٢٢ — بين p الأضيق (٠٫٣٠ و٠٫٣٥) والمعتاد (٠٫٥٠).
  _SoilCase('potato', 'gezira', 10, IrrigationMethod.flood, 'sandy loam',
      16.8000, 11.2259, 1.4965, 70.5600),
  _SoilCase('sweet_pepper', 'khartoum', 7, IrrigationMethod.drip, 'loamy sand',
      14.2500, 6.5137, 2.1877, 59.8500),
  _SoilCase('carrot', 'gezira', 10, IrrigationMethod.flood, 'clay loam',
      36.7500, 10.3039, 3.5666, 154.3500),
  _SoilCase('watermelon', 'northern', 0, IrrigationMethod.flood, 'sandy loam',
      38.4000, 9.0156, 4.2593, 161.2800),
  _SoilCase('sunflower', 'gezira', 10, IrrigationMethod.sprinkler, 'loam',
      64.8000, 8.0029, 8.0970, 272.1600),
  _SoilCase('faba_bean', 'gezira', 10, IrrigationMethod.flood, 'clay',
      45.0000, 9.9942, 4.5026, 189.0000),
  _SoilCase('citrus', 'khartoum', 0, IrrigationMethod.drip, 'sandy loam',
      72.0000, 5.4483, 13.2152, 302.4000),
  _SoilCase('sweet_potato', 'gezira', 6, IrrigationMethod.flood, 'silt loam',
      100.0000, 9.3304, 10.7177, 420.0000),
  // المحاصيل الجديدة على السودان (البند ١٩٤): p الافتراضيّ (فول الصويا) وp الأضيق (العنب ٠٫٣٥) وp الجدول ٠٫٦٥ مقصوصاً إلى ٠٫٥٠ (الزيتون).
  _SoilCase('soybean', 'gezira', 6, IrrigationMethod.flood, 'clay loam',
      63.0000, 6.8510, 9.1957, 264.6000),
  _SoilCase('grapes', 'northern', 2, IrrigationMethod.drip, 'sandy loam',
      42.0000, 7.6164, 5.5144, 176.4000),
  _SoilCase('olive', 'khartoum', 0, IrrigationMethod.drip, 'loam',
      108.0000, 5.5782, 19.3609, 453.6000),
];

void main() {
  group('matches the web soil-water engine', () {
    for (final c in soilCases) {
      test('${c.crop} on ${c.soil} in ${c.station}', () {
        final crop = allCrops.firstWhere((x) => x.key == c.crop);
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

    test('a crop has an interval exactly when it has a published root depth', () {
      // The picker may offer a crop the root-depth table does not cover (rice
      // today: FAO-56 Table 22 gives its p as a share of saturation, which this
      // model does not use). For such a crop the engine answers null — never a
      // guessed depth — and the screen says why instead of showing an empty
      // panel (water_screen.dart).
      final station = stations.first;
      for (final crop in allCrops) {
        final r = irrigationInterval(
          crop,
          station,
          6,
          IrrigationMethod.flood,
          'sandy loam',
        );
        expect(
          r == null,
          rootDepthM[crop.key] == null,
          reason: '${crop.key}: interval and root depth disagree',
        );
      }
    });

    test('every root depth belongs to a crop the engine can cost', () {
      // The reverse direction: a depth entered for a key no crop carries is a
      // row nobody can reach. `mango` is the one deliberate exception — the
      // web keeps its depth for the knowledge base while the water engine
      // has no Kc for it (see the note beside CROPS in agronomy.ts).
      final keys = allCrops.map((c) => c.key).toSet();
      for (final k in rootDepthM.keys) {
        if (k == 'mango') continue;
        expect(keys, contains(k), reason: 'root depth for unknown crop $k');
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
