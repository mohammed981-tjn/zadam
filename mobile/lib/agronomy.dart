/// Crop water requirement engine — FAO Irrigation & Drainage Paper 56.
///
/// A line-for-line port of `src/lib/agronomy.ts` in the web app. It is
/// duplicated rather than fetched because this is the one thing the app must be
/// able to do with no signal at all: a farmer standing in a field deciding how
/// to size a pump is exactly the person least likely to have a connection, and
/// an answer that requires the network is no answer for them.
///
/// Duplication has a cost, and the cost is that the two copies can drift. That
/// is what `test/agronomy_test.dart` is for — it pins this implementation
/// against values produced by the TypeScript one, so a change to either side
/// that moves a number fails the build rather than quietly telling two users
/// two different things.
///
/// Method: reference evapotranspiration ET0 by Hargreaves–Samani (FAO-56
/// eq. 52), which needs only min/max temperature and latitude. Crop demand is
/// ETc = Kc × ET0 using the dual-stage Kc curve of FAO-56 Table 12, netting off
/// effective rainfall (USDA-SCS) and dividing by the method's efficiency.
library;

import 'dart:math' as math;

enum IrrigationMethod { flood, sprinkler, pivot, drip }

/// Application efficiency — the share of delivered water the crop actually gets.
const Map<IrrigationMethod, double> irrigationEfficiency = {
  IrrigationMethod.flood: 0.55,
  IrrigationMethod.sprinkler: 0.75,
  IrrigationMethod.pivot: 0.8,
  IrrigationMethod.drip: 0.9,
};

const Map<IrrigationMethod, String> irrigationLabel = {
  IrrigationMethod.flood: 'ري بالغمر',
  IrrigationMethod.sprinkler: 'ري بالرش',
  IrrigationMethod.pivot: 'محاور ارتكازية',
  IrrigationMethod.drip: 'ري بالتنقيط',
};

class CropCoefficients {
  const CropCoefficients({
    required this.key,
    required this.name,
    required this.stages,
    required this.kcInitial,
    required this.kcMid,
    required this.kcEnd,
  });

  final String key;
  final String name;

  /// Stage lengths in days: initial, development, mid-season, late-season.
  final List<int> stages;

  /// Kc at the initial, mid-season and late-season stages (FAO-56 Table 12).
  final double kcInitial;
  final double kcMid;
  final double kcEnd;
}

/// FAO-56 Table 12 values, stage lengths adjusted to Sudanese growing seasons.
const List<CropCoefficients> crops = [
  CropCoefficients(
    key: 'wheat',
    name: 'قمح',
    stages: [20, 25, 40, 25],
    kcInitial: 0.3,
    kcMid: 1.15,
    kcEnd: 0.3,
  ),
  CropCoefficients(
    key: 'sorghum',
    name: 'ذرة رفيعة',
    stages: [20, 35, 40, 30],
    kcInitial: 0.3,
    kcMid: 1.05,
    kcEnd: 0.55,
  ),
  CropCoefficients(
    key: 'maize',
    name: 'ذرة شامية',
    stages: [20, 35, 40, 30],
    kcInitial: 0.3,
    kcMid: 1.2,
    kcEnd: 0.6,
  ),
  CropCoefficients(
    key: 'cotton',
    name: 'قطن',
    stages: [30, 50, 60, 55],
    kcInitial: 0.35,
    kcMid: 1.18,
    kcEnd: 0.6,
  ),
  CropCoefficients(
    key: 'groundnut',
    name: 'فول سوداني',
    stages: [25, 35, 45, 25],
    kcInitial: 0.4,
    kcMid: 1.15,
    kcEnd: 0.6,
  ),
  CropCoefficients(
    key: 'sesame',
    name: 'سمسم',
    stages: [20, 30, 40, 20],
    kcInitial: 0.35,
    kcMid: 1.1,
    kcEnd: 0.25,
  ),
  CropCoefficients(
    key: 'alfalfa',
    name: 'برسيم',
    stages: [10, 20, 20, 10],
    kcInitial: 0.4,
    kcMid: 1.2,
    kcEnd: 1.15,
  ),
  CropCoefficients(
    key: 'onion',
    name: 'بصل',
    stages: [20, 35, 110, 45],
    kcInitial: 0.7,
    kcMid: 1.05,
    kcEnd: 0.75,
  ),
  CropCoefficients(
    key: 'tomato',
    name: 'طماطم',
    stages: [30, 40, 45, 30],
    kcInitial: 0.6,
    kcMid: 1.15,
    kcEnd: 0.8,
  ),
  CropCoefficients(
    key: 'sugarcane',
    name: 'قصب سكر',
    stages: [50, 70, 220, 40],
    kcInitial: 0.4,
    kcMid: 1.25,
    kcEnd: 0.75,
  ),
];

class StationClimate {
  const StationClimate({
    required this.key,
    required this.name,
    required this.latitude,
    required this.tmax,
    required this.tmin,
    required this.rainfall,
  });

  final String key;
  final String name;
  final double latitude;

  /// Monthly means, January first.
  final List<double> tmax;
  final List<double> tmin;
  final List<double> rainfall;
}

/// Long-term monthly normals for the main agricultural zones. These are
/// indicative figures for planning, not measured station records — the screen
/// says so to the user, because the whole point is not to present estimates as
/// measurements.
const List<StationClimate> stations = [
  StationClimate(
    key: 'khartoum',
    name: 'الخرطوم',
    latitude: 15.6,
    tmax: [31, 33, 37, 40, 41, 41, 38, 37, 38, 39, 35, 32],
    tmin: [15, 16, 20, 23, 26, 27, 26, 25, 25, 25, 21, 17],
    rainfall: [0, 0, 0, 0, 4, 5, 35, 50, 25, 5, 0, 0],
  ),
  StationClimate(
    key: 'gezira',
    name: 'الجزيرة (ود مدني)',
    latitude: 14.4,
    tmax: [33, 35, 38, 41, 41, 39, 35, 33, 35, 38, 36, 34],
    tmin: [15, 16, 19, 23, 25, 25, 24, 23, 23, 23, 19, 16],
    rainfall: [0, 0, 0, 1, 10, 25, 90, 110, 50, 15, 0, 0],
  ),
  StationClimate(
    key: 'rivernile',
    name: 'نهر النيل (عطبرة)',
    latitude: 17.7,
    tmax: [30, 32, 36, 40, 43, 43, 41, 40, 41, 40, 35, 31],
    tmin: [13, 14, 18, 22, 26, 28, 27, 26, 26, 24, 18, 14],
    rainfall: [0, 0, 0, 0, 1, 3, 15, 25, 8, 1, 0, 0],
  ),
  StationClimate(
    key: 'northern',
    name: 'الشمالية (دنقلا)',
    latitude: 19.2,
    tmax: [26, 29, 33, 38, 42, 43, 42, 42, 41, 38, 32, 27],
    tmin: [8, 10, 14, 19, 23, 26, 26, 26, 24, 20, 14, 10],
    rainfall: [0, 0, 0, 0, 0, 0, 2, 3, 1, 0, 0, 0],
  ),
  StationClimate(
    key: 'kordofan',
    name: 'شمال كردفان (الأبيض)',
    latitude: 13.2,
    tmax: [33, 35, 38, 40, 39, 36, 32, 31, 33, 36, 35, 33],
    tmin: [14, 16, 19, 23, 24, 23, 22, 21, 21, 21, 18, 15],
    rainfall: [0, 0, 0, 1, 15, 50, 120, 150, 60, 15, 0, 0],
  ),
  StationClimate(
    key: 'kassala',
    name: 'كسلا',
    latitude: 15.5,
    tmax: [33, 35, 38, 41, 41, 40, 36, 34, 36, 38, 36, 34],
    tmin: [16, 17, 20, 24, 26, 27, 25, 24, 24, 23, 20, 17],
    rainfall: [0, 0, 0, 1, 8, 25, 90, 110, 35, 8, 0, 0],
  ),
];

const List<int> _daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/// Mid-month day-of-year, used as the representative day for each month.
const List<int> _midMonthDoy = [
  15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349,
];

/// One feddan is 4,200 m², so 1 mm of depth over a feddan is 4.2 m³.
const double m3PerMmPerFeddan = 4.2;

const List<String> monthNames = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
];

/// Extraterrestrial radiation Ra in mm/day equivalent (FAO-56 eq. 21, converted
/// from MJ/m²/day by the 0.408 factor). Pure astronomy — latitude and date only.
double extraterrestrialRadiation(double latitudeDeg, int dayOfYear) {
  final phi = (math.pi / 180) * latitudeDeg;
  final dr = 1 + 0.033 * math.cos((2 * math.pi * dayOfYear) / 365);
  final delta = 0.409 * math.sin((2 * math.pi * dayOfYear) / 365 - 1.39);

  // Clamp guards the poles, where the sun may never rise or never set.
  final cosOmega =
      math.max(-1.0, math.min(1.0, -math.tan(phi) * math.tan(delta)));
  final omega = math.acos(cosOmega);

  final raMj = ((24 * 60) / math.pi) *
      0.082 *
      dr *
      (omega * math.sin(phi) * math.sin(delta) +
          math.cos(phi) * math.cos(delta) * math.sin(omega));

  return raMj * 0.408;
}

/// Reference evapotranspiration, Hargreaves–Samani (FAO-56 eq. 52), mm/day.
double referenceEt0(
  double tmax,
  double tmin,
  double latitudeDeg,
  int dayOfYear,
) {
  final tmean = (tmax + tmin) / 2;
  final range = math.max(0.0, tmax - tmin);
  final ra = extraterrestrialRadiation(latitudeDeg, dayOfYear);
  return math.max(0.0, 0.0023 * (tmean + 17.8) * math.sqrt(range) * ra);
}

/// Effective rainfall from monthly total, USDA-SCS method (mm).
double effectiveRainfall(double monthlyRain) {
  if (monthlyRain <= 0) return 0;
  if (monthlyRain < 250) {
    return math.max(0.0, (monthlyRain * (125 - 0.2 * monthlyRain)) / 125);
  }
  return 125 + 0.1 * monthlyRain;
}

/// Kc on a given day of the growing season, following the FAO-56 curve: flat at
/// Kc_ini, linear rise across development, flat at Kc_mid, linear fall to Kc_end.
double cropCoefficient(CropCoefficients crop, int dayInSeason) {
  final ini = crop.stages[0];
  final dev = crop.stages[1];
  final mid = crop.stages[2];
  final late = crop.stages[3];

  if (dayInSeason < ini) return crop.kcInitial;

  if (dayInSeason < ini + dev) {
    final progress = (dayInSeason - ini) / dev;
    return crop.kcInitial + progress * (crop.kcMid - crop.kcInitial);
  }

  if (dayInSeason < ini + dev + mid) return crop.kcMid;

  final progress = math.min(1.0, (dayInSeason - ini - dev - mid) / late);
  return crop.kcMid + progress * (crop.kcEnd - crop.kcMid);
}

class MonthlyWater {
  const MonthlyWater({
    required this.monthIndex,
    required this.days,
    required this.et0,
    required this.etc,
    required this.effectiveRain,
    required this.netIrrigation,
    required this.grossIrrigation,
  });

  final int monthIndex;
  final int days;
  final double et0;
  final double etc;
  final double effectiveRain;
  final double netIrrigation;
  final double grossIrrigation;
}

class WaterRequirement {
  const WaterRequirement({
    required this.crop,
    required this.station,
    required this.method,
    required this.plantingMonth,
    required this.seasonDays,
    required this.monthly,
    required this.totalEtc,
    required this.totalEffectiveRain,
    required this.totalNet,
    required this.totalGross,
    required this.m3PerFeddan,
    required this.peakMonthIndex,
    required this.peakM3PerFeddanPerDay,
  });

  final CropCoefficients crop;
  final StationClimate station;
  final IrrigationMethod method;
  final int plantingMonth;
  final int seasonDays;
  final List<MonthlyWater> monthly;

  /// Season totals, in mm of depth.
  final double totalEtc;
  final double totalEffectiveRain;
  final double totalNet;
  final double totalGross;

  /// Season total per feddan, in cubic metres.
  final double m3PerFeddan;

  /// Peak month gross demand — this is what sizes the pump, not the average.
  final int peakMonthIndex;
  final double peakM3PerFeddanPerDay;
}

/// Full seasonal water requirement for one crop at one location.
///
/// Walks the growing season day by day so the Kc curve is integrated properly
/// rather than approximated per month, then aggregates into calendar months for
/// display and for pump sizing.
WaterRequirement waterRequirement(
  CropCoefficients crop,
  StationClimate station,
  int plantingMonth,
  IrrigationMethod method,
) {
  final seasonDays = crop.stages.reduce((a, b) => a + b);
  final efficiency = irrigationEfficiency[method]!;

  final etcByMonth = List<double>.filled(12, 0);
  final et0ByMonth = List<double>.filled(12, 0);
  final daysByMonth = List<int>.filled(12, 0);

  var month = plantingMonth;
  var dayOfMonth = 0;

  for (var day = 0; day < seasonDays; day++) {
    if (dayOfMonth >= _daysInMonth[month]) {
      month = (month + 1) % 12;
      dayOfMonth = 0;
    }

    final et0 = referenceEt0(
      station.tmax[month],
      station.tmin[month],
      station.latitude,
      _midMonthDoy[month],
    );

    et0ByMonth[month] += et0;
    etcByMonth[month] += et0 * cropCoefficient(crop, day);
    daysByMonth[month] += 1;
    dayOfMonth += 1;
  }

  final monthly = <MonthlyWater>[];
  var totalEtc = 0.0;
  var totalEffectiveRain = 0.0;
  var totalNet = 0.0;
  var totalGross = 0.0;

  for (var m = 0; m < 12; m++) {
    if (daysByMonth[m] == 0) continue;

    // Only the share of the month the crop is actually in the ground counts.
    final monthShare = daysByMonth[m] / _daysInMonth[m];
    final rain = effectiveRainfall(station.rainfall[m]) * monthShare;
    final etc = etcByMonth[m];
    final net = math.max(0.0, etc - rain);
    final gross = net / efficiency;

    monthly.add(MonthlyWater(
      monthIndex: m,
      days: daysByMonth[m],
      et0: et0ByMonth[m],
      etc: etc,
      effectiveRain: rain,
      netIrrigation: net,
      grossIrrigation: gross,
    ));

    totalEtc += etc;
    totalEffectiveRain += rain;
    totalNet += net;
    totalGross += gross;
  }

  // Pumps and canals are sized by the worst month's daily rate, never the mean.
  var peakMonthIndex = monthly.isEmpty ? plantingMonth : monthly.first.monthIndex;
  var peakRate = 0.0;
  for (final m in monthly) {
    final rate = (m.grossIrrigation * m3PerMmPerFeddan) / m.days;
    if (rate > peakRate) {
      peakRate = rate;
      peakMonthIndex = m.monthIndex;
    }
  }

  return WaterRequirement(
    crop: crop,
    station: station,
    method: method,
    plantingMonth: plantingMonth,
    seasonDays: seasonDays,
    monthly: monthly,
    totalEtc: totalEtc,
    totalEffectiveRain: totalEffectiveRain,
    totalNet: totalNet,
    totalGross: totalGross,
    m3PerFeddan: totalGross * m3PerMmPerFeddan,
    peakMonthIndex: peakMonthIndex,
    peakM3PerFeddanPerDay: peakRate,
  );
}
