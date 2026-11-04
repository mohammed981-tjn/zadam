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
/// Regenerate them by running the web engine over these cases and pasting
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
  // كلُّ محصولٍ في `crops` له حالةٌ هنا (البند ١٧٩)؛ تفحصه `scripts/verify-mobile-parity.ts`، فمحصولٌ يُضاف
  // إلى القائمة بلا حالةٍ مثبَّتة يفشل. القيم من محرّك الويب نفسه، تُولَّد ولا تُكتب بالتقدير.
  _Case('maize', 'rivernile', 6, IrrigationMethod.sprinkler, 125, 705.9464,
      47.5360, 658.4104, 877.8805, 3687.0981, 8, 43.7870),
  _Case('groundnut', 'kordofan', 5, IrrigationMethod.flood, 130, 579.5624,
      314.9781, 264.5843, 481.0623, 2020.4619, 8, 29.1048),
  _Case('alfalfa', 'northern', 10, IrrigationMethod.drip, 60, 220.2274,
      0.0000, 220.2274, 244.6971, 1027.7277, 11, 20.3804),
  _Case('tomato', 'khartoum', 9, IrrigationMethod.drip, 145, 642.9247,
      4.9600, 637.9647, 708.8497, 2977.1687, 0, 23.6997),
  _Case('millet', 'kordofan', 5, IrrigationMethod.flood, 105, 398.7414,
      280.4640, 118.2774, 215.0499, 903.2096, 6, 12.6576),
  _Case('dates', 'northern', 0, IrrigationMethod.drip, 365, 2102.3637,
      5.9776, 2096.3861, 2329.3179, 9783.1352, 5, 35.3112),
  _Case('faba_bean', 'gezira', 10, IrrigationMethod.flood, 100, 433.4474,
      0.0000, 433.4474, 788.0862, 3309.9619, 0, 41.9756),
  _Case('potato', 'gezira', 10, IrrigationMethod.flood, 130, 626.2709,
      0.0000, 626.2709, 1138.6744, 4782.4324, 1, 47.1488),
  _Case('sunflower', 'gezira', 10, IrrigationMethod.flood, 130, 559.7313,
      0.0000, 559.7313, 1017.6933, 4274.3117, 1, 45.8350),
  _Case('safflower', 'gezira', 10, IrrigationMethod.flood, 190, 913.2323,
      3.8552, 909.3771, 1653.4129, 6944.3343, 2, 59.8995),
  _Case('barley', 'gezira', 10, IrrigationMethod.flood, 120, 520.0559,
      0.0000, 520.0559, 945.5562, 3971.3361, 0, 43.3886),
  _Case('rice', 'gezira', 6, IrrigationMethod.flood, 180, 1091.1788,
      228.3200, 862.8588, 1568.8343, 6589.1039, 9, 50.6333),
  _Case('cowpea', 'gezira', 5, IrrigationMethod.flood, 100, 422.6971,
      203.9467, 218.7504, 397.7280, 1670.4576, 6, 19.7690),
  _Case('watermelon', 'gezira', 0, IrrigationMethod.flood, 80, 374.4465,
      0.0000, 374.4465, 680.8118, 2859.4094, 1, 44.0232),
  _Case('sweet_melon', 'gezira', 9, IrrigationMethod.flood, 160, 732.9221,
      14.6400, 718.2821, 1305.9674, 5485.0630, 1, 45.4138),
  _Case('cucumber', 'gezira', 9, IrrigationMethod.flood, 130, 577.1042,
      14.6400, 562.4642, 1022.6622, 4295.1811, 11, 37.3492),
  _Case('eggplant', 'gezira', 7, IrrigationMethod.flood, 130, 616.6779,
      151.2800, 465.3979, 846.1781, 3553.9478, 9, 43.1152),
  _Case('sweet_pepper', 'gezira', 7, IrrigationMethod.flood, 210, 1049.3749,
      151.2800, 898.0949, 1632.8998, 6858.1793, 9, 43.1152),
  _Case('cabbage', 'gezira', 8, IrrigationMethod.flood, 165, 785.7524,
      60.6400, 725.1124, 1318.3862, 5537.2222, 1, 44.2033),
  _Case('carrot', 'gezira', 10, IrrigationMethod.flood, 100, 466.4959,
      0.0000, 466.4959, 848.1744, 3562.3327, 1, 43.2762),
  _Case('zucchini', 'gezira', 9, IrrigationMethod.flood, 100, 389.5746,
      14.6400, 374.9346, 681.6993, 2863.1371, 11, 35.1444),
  _Case('sweet_potato', 'gezira', 6, IrrigationMethod.flood, 125, 646.9968,
      228.3200, 418.6768, 761.2305, 3197.1682, 9, 39.1876),
  _Case('citrus', 'khartoum', 0, IrrigationMethod.drip, 365, 1443.2993,
      116.9344, 1326.3649, 1473.7387, 6189.7027, 3, 22.8827),
  // محاصيل جديدة على السودان (البند ١٩٤).
  _Case('soybean', 'gezira', 6, IrrigationMethod.flood, 85, 409.3642,
      202.9467, 206.4176, 375.3047, 1576.2797, 8, 28.7743),
  _Case('grapes', 'northern', 2, IrrigationMethod.drip, 240, 1247.6079,
      5.9776, 1241.6303, 1379.5893, 5794.2750, 4, 31.9890),
  _Case('olive', 'khartoum', 0, IrrigationMethod.drip, 270, 1156.5782,
      109.5744, 1047.0038, 1163.3375, 4886.0177, 3, 23.4286),
];

void main() {
  group('matches the web engine', () {
    for (final c in cases) {
      test('${c.crop} in ${c.station}, planted month ${c.plantingMonth}', () {
        final crop = allCrops.firstWhere((x) => x.key == c.crop);
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
      for (final crop in allCrops) {
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
