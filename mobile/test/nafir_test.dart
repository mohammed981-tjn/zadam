/// The app's nafir labels and parsing, pinned against the website's closed
/// lists (src/lib/nafir.ts, which scripts/verify-nafir-lib.ts in turn pins
/// against the database). A kind the database allows but the app cannot name
/// would render as a raw key on a farmer's phone.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:sudagri/nafir.dart';

void main() {
  test('closed lists match the website', () {
    expect(nafirKinds.keys.toSet(),
        {'harvest', 'planting', 'canal', 'building', 'cleaning', 'other'});
    expect(fazaCauses.keys.toSet(),
        {'flood', 'pest', 'fire', 'drought', 'livestock', 'illness', 'other'});
    expect(fazaNeeds.keys.toSet(),
        {'labor', 'tools', 'seeds', 'transport', 'advice', 'other'});
    expect(fazaNeeds.containsKey('cash'), isFalse, reason: 'no money, ever');
  });

  test('a call parses, including the host and tools', () {
    final c = NafirCall.fromJson({
      'id': 'x',
      'display_name': 'أحمد',
      'kind': 'harvest',
      'title': 'حصاد السمسم',
      'description': 'نحتاج أيدياً',
      'state': 'القضارف',
      'locality': 'الحواتة',
      'starts_on': '2026-10-01',
      'needed': 20,
      'hosting': 'الفطور والغداء',
      'bring_tools': 'منجل',
    });
    expect(c.kindLabel, 'حصاد');
    expect(c.needed, 20);
    expect(c.hosting, 'الفطور والغداء');
    expect(c.outcome, isNull);
  });

  test('indicators withhold the pulse below the floor', () {
    final i = NafirIndicators.fromJson({
      'signers_leaders': 2,
      'signers_members': 30,
      'pledges_total': 4,
      'pledges_kept': 3,
      'pulse_count': 3,
      'pulse_floor': 10,
      'pulse_trust_people': null,
    });
    expect(i.signers, 32);
    expect(i.pulseTrustPeople, isNull);
  });

  test('a faza request keeps its needs', () {
    final r = FazaRequest.fromJson({
      'id': 'y',
      'cause': 'flood',
      'needs': ['seeds', 'labor'],
    });
    expect(r.causeLabel, 'سيلٌ أو فيضان');
    expect(r.needs, ['seeds', 'labor']);
  });
}
