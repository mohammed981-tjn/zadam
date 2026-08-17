/// Parity between the Dart service catalogue and the TypeScript one.
///
/// The app ships its own copy so the catalogue works with no signal, and the
/// risk that buys is drift: two descriptions of the same service that slowly
/// stop agreeing, so the website tells a farmer a drone survey is priced per
/// feddan and the app in their hand says something else. Nobody notices,
/// because each copy is self-consistent.
///
/// The fingerprints below were produced by running `src/lib/services.ts` — the
/// web catalogue — and printing `key|unit|production|basis|precondition` for
/// every entry. They are not independently derived truth; they are a pin. If a
/// change to either side moves a service's unit, its production side, how its
/// quantity is derived, or whether it blocks field work, this fails and
/// whoever moved it has to move the other side too.
///
/// Regenerate by running that dump again and pasting the output back in. Do
/// that only when the change is deliberate.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:sudagri/services_catalogue.dart';

/// Fingerprints from the web catalogue, sorted by key.
const List<String> webFingerprints = [
  "contract_notarization|lump|both|fixed|true",
  "crop_protection|feddan|plant|feddans|false",
  "customs_clearance|lump|both|fixed|true",
  "drone_survey|feddan|plant|feddans|false",
  "extension_visit|visit|both|months|false",
  "feasibility_study|lump|both|fixed|true",
  "feed_plan|head|livestock|head|false",
  "fertigation|feddan|plant|feddans|false",
  "harvest_service|feddan|plant|feddans|false",
  "herd_health|visit|livestock|months|false",
  "irrigation_design|lump|plant|fixed|false",
  "irrigation_install|m3|plant|water_m3|false",
  "land_clearing|feddan|plant|feddans|false",
  "land_leveling|feddan|plant|feddans|false",
  "land_permit|lump|both|fixed|true",
  "local_clearance|lump|both|fixed|true",
  "machinery_procurement|lump|both|fixed|true",
  "machinery_rental|feddan|plant|feddans|false",
  "mechanized_planting|feddan|plant|feddans|false",
  "soil_test|lump|both|fixed|false",
  "topo_survey|feddan|plant|feddans|false",
  "transport|lump|both|fixed|false",
  "vet_program|head|livestock|head|false",
  "water_permit|lump|both|fixed|true",
  "water_test|lump|both|fixed|false",
];

/// Arabic unit labels back to the keys the web uses, so the two vocabularies
/// can be compared without the Dart side carrying English it never displays.
const Map<String, String> unitKeyFromLabel = {
  'فدان': 'feddan',
  'ساعة': 'hour',
  'زيارة': 'visit',
  'رأس': 'head',
  'م³': 'm3',
  'شهر': 'month',
  'مقطوعية': 'lump',
};

String _fingerprint(ServiceDefinition s) {
  final unit = unitKeyFromLabel[s.unitLabel];
  final production = s.production.name;
  final basis = switch (s.basis) {
    QuantityBasis.feddans => 'feddans',
    QuantityBasis.waterM3 => 'water_m3',
    QuantityBasis.head => 'head',
    QuantityBasis.months => 'months',
    QuantityBasis.fixed => 'fixed',
  };
  return '${s.key}|$unit|$production|$basis|${s.isPrecondition}';
}

void main() {
  test('every unit label maps to a known web unit key', () {
    for (final s in serviceCatalogue) {
      expect(unitKeyFromLabel[s.unitLabel], isNotNull,
          reason: 'unmapped unit label "${s.unitLabel}" on ${s.key}');
    }
  });

  test('the catalogues describe the same services identically', () {
    final dart = serviceCatalogue.map(_fingerprint).toList()..sort();
    final web = [...webFingerprints]..sort();

    // Reported as sets first: a missing or extra service is a clearer failure
    // than a list-length mismatch buried in a diff of twenty-five strings.
    final dartKeys = serviceCatalogue.map((s) => s.key).toSet();
    final webKeys = webFingerprints.map((f) => f.split('|').first).toSet();

    expect(dartKeys.difference(webKeys), isEmpty,
        reason: 'in the app but not on the web');
    expect(webKeys.difference(dartKeys), isEmpty,
        reason: 'on the web but not in the app');

    expect(dart, equals(web));
  });

  test('no duplicate keys', () {
    final keys = serviceCatalogue.map((s) => s.key).toList();
    expect(keys.toSet().length, equals(keys.length));
  });

  test('every service explains its unit', () {
    for (final s in serviceCatalogue) {
      expect(s.note.trim().length, greaterThan(20), reason: s.key);
      expect(basisLabel[s.basis], isNotNull, reason: s.key);
    }
  });
}
