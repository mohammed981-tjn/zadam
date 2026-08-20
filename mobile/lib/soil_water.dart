import 'agronomy.dart';

/// كم يوماً تصبر أرضك بين ريّة وريّة.
///
/// A port of `src/lib/soilWater.ts`. It is here rather than only on the web for
/// the same reason the FAO-56 engine is: this app's whole premise is that the
/// irrigation tools work with no signal, because coverage in the schemes is
/// unreliable and a tool that only works where there is network is not a tool
/// for the people who need it.
///
/// And this particular answer needs offline more than any other. More than half
/// the questions the assistant has been asked are this one — "the ground is
/// thirsty", "the water dries fast in the sand" — and the assistant needs a
/// connection. The calculation does not.
///
/// PARITY IS PINNED, NOT HOPED FOR
///
/// Two implementations of the same standard drift, and each stays
/// self-consistent while they do — so nobody notices that the website tells a
/// farmer one number and the app in their hand tells them another.
/// `test/soil_water_test.dart` holds this file to values produced by the
/// TypeScript engine. Move a number on either side and the build fails.
library;

/// Total available water, mm per metre of root zone — FAO-56 Table 19
/// midpoints.
///
/// The spread across textures is a factor of three, and that factor is the
/// whole reason a sandy field feels thirsty while its neighbour on clay does
/// not, at identical rainfall and identical irrigation.
const Map<String, double> tawMmPerM = {
  'sand': 75,
  'loamy sand': 95,
  'sandy loam': 120,
  'loam': 180,
  'silt loam': 200,
  'sandy clay loam': 155,
  'clay loam': 210,
  'clay': 200,
};

const Map<String, String> soilLabel = {
  'sand': 'رملية',
  'loamy sand': 'رملية طميية',
  'sandy loam': 'طميية رملية',
  'loam': 'طميية',
  'silt loam': 'طميية غرينية',
  'sandy clay loam': 'طميية طينية رملية',
  'clay loam': 'طميية طينية',
  'clay': 'طينية',
};

/// The order a picker should show them in: lightest first, because that is the
/// end of the range the farmers asking this question are on.
const List<String> soilKeys = [
  'sand',
  'loamy sand',
  'sandy loam',
  'sandy clay loam',
  'loam',
  'silt loam',
  'clay loam',
  'clay',
];

/// Root depth in metres, FAO-56 Table 22, taken at the shallow end of each
/// range.
///
/// Deliberately the shallow end: this interval is advice a farmer will act on,
/// and an over-long interval stresses the crop while an over-short one only
/// wastes a little labour. When the table gives a range, take the error that
/// costs less.
const Map<String, double> rootDepthM = {
  'wheat': 1.0,
  'sorghum': 1.0,
  'maize': 0.8,
  'millet': 1.0,
  'cotton': 1.0,
  'groundnut': 0.5,
  'sesame': 1.0,
  'alfalfa': 1.0,
  'onion': 0.3,
  'tomato': 0.7,
  'sugarcane': 1.2,
  'dates': 1.5,
  'mango': 1.0,
};

/// Depletion fraction p — the share of the reservoir a crop may use before it
/// starts to suffer. 0.5 is the FAO-56 default and what most of these carry.
const double depletionFraction = 0.5;

/// Shallow-rooted vegetables run dry sooner and get a stricter fraction.
const Map<String, double> _shallowP = {'onion': 0.3, 'tomato': 0.4};

class IrrigationInterval {
  const IrrigationInterval({
    required this.soil,
    required this.rawMm,
    required this.peakMmPerDay,
    required this.days,
    required this.doseMm,
    required this.doseM3PerFeddan,
  });

  final String soil;

  /// Readily available water in the root zone, mm.
  final double rawMm;

  /// Peak daily crop water use, mm/day.
  final double peakMmPerDay;

  /// Days between irrigations at peak demand.
  final double days;

  /// Depth to apply each time, and the same as a volume per feddan.
  final double doseMm;
  final double doseM3PerFeddan;
}

/// How long this crop can wait on this soil, at the peak of its season.
///
/// Peak rather than average on purpose: an interval computed on the seasonal
/// mean is comfortably wrong in exactly the month the crop cannot afford it.
///
/// Returns null when the crop has no root depth on file or the soil key is not
/// one of the eight — a missing answer being better than a confident wrong one.
IrrigationInterval? irrigationInterval(
  CropCoefficients crop,
  StationClimate station,
  int plantingMonth,
  IrrigationMethod method,
  String soil,
) {
  final taw = tawMmPerM[soil];
  final rootDepth = rootDepthM[crop.key];
  if (taw == null || rootDepth == null) return null;

  final p = _shallowP[crop.key] ?? depletionFraction;
  final rawMm = taw * rootDepth * p;

  final req = waterRequirement(crop, station, plantingMonth, method);
  // peakM3PerFeddanPerDay is gross — what leaves the pump. Back out the depth
  // the plant actually sees, so the interval is not shortened by the delivery
  // system's own losses.
  final peakMmPerDay = req.peakM3PerFeddanPerDay / m3PerMmPerFeddan;
  if (peakMmPerDay <= 0) return null;

  return IrrigationInterval(
    soil: soil,
    rawMm: rawMm,
    peakMmPerDay: peakMmPerDay,
    days: rawMm / peakMmPerDay,
    doseMm: rawMm,
    doseM3PerFeddan: rawMm * m3PerMmPerFeddan,
  );
}
