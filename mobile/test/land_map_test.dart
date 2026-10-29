/// «حدّد أرضك» (البند ١٣٤): المساحة والمركز بالأرقام نفسها التي يحسبها الخادم (scripts/verify-land-input.ts)،
/// وتخفيف المسار الممشيّ، وما يُرسَل إلى /api/app/lands، والشاشة.
library;

import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sudagri/account.dart';
import 'package:sudagri/api.dart';
import 'package:sudagri/land_shape.dart';
import 'package:sudagri/screens/land_map_screen.dart';

// The fixtures of scripts/verify-land-input.ts: a 100 m square near Wad Madani, and an L of three of them.
const lat0 = 14.4;
const lng0 = 33.52;
const dLat = 100 / 111195;
final dLng = 100 / (111195 * math.cos(lat0 * math.pi / 180));
final square = [
  const Corner(lat0, lng0),
  Corner(lat0, lng0 + dLng),
  Corner(lat0 + dLat, lng0 + dLng),
  Corner(lat0 + dLat, lng0),
];

http.Response json(Object body, [int status = 200]) => http.Response.bytes(
    utf8.encode(jsonEncode(body)), status,
    headers: {'content-type': 'application/json; charset=utf-8'});

void main() {
  group('the shape, as the server works it out', () {
    test('a 100 m square: 10,000 m², 2.38 feddans, centred', () {
      final s = shapeOf(square)!;
      expect(s.m2, closeTo(10000, 20));
      expect(s.feddans, closeTo(10000 / m2PerFeddan, 0.01));
      expect(s.centre.lat, closeTo(lat0 + dLat / 2, 1e-7));
      expect(s.centre.lng, closeTo(lng0 + dLng / 2, 1e-7));
      expect(shapeOf(square.reversed.toList())!.m2, closeTo(s.m2, 1e-6), reason: 'either way round');
    });

    test('an L: 30,000 m², its centre the centre of the area, not the mean of the corners', () {
      final l = shapeOf([
        const Corner(lat0, lng0),
        Corner(lat0, lng0 + 2 * dLng),
        Corner(lat0 + dLat, lng0 + 2 * dLng),
        Corner(lat0 + dLat, lng0 + dLng),
        Corner(lat0 + 2 * dLat, lng0 + dLng),
        Corner(lat0 + 2 * dLat, lng0),
      ])!;
      expect(l.m2, closeTo(30000, 60));
      expect(l.centre.lat, closeTo(lat0 + dLat * 5 / 6, 1e-7));
      expect(l.centre.lng, closeTo(lng0 + dLng * 5 / 6, 1e-7));
    });

    test('nothing enclosed: two corners, a line, a corner off the world, too many', () {
      expect(shapeOf(square.sublist(0, 2)), isNull);
      expect(shapeOf([square[0], square[1], Corner(lat0, lng0 + 2 * dLng)]), isNull);
      expect(shapeOf([...square.sublist(0, 3), const Corner(95, lng0)]), isNull);
      expect(shapeOf([for (var i = 0; i <= maxCorners; i++) Corner(lat0 + dLat * math.sin(i), lng0 + dLng * math.cos(i))]),
          isNull);
    });
  });

  group('the walk', () {
    test('a reading is kept once the phone has moved five metres', () {
      final walked = [const Corner(lat0, lng0)];
      expect(keepReading([], const Corner(lat0, lng0)), isTrue);
      expect(keepReading(walked, Corner(lat0 + 3 / 111195, lng0)), isFalse, reason: 'three metres: drift');
      expect(keepReading(walked, Corner(lat0 + 6 / 111195, lng0)), isTrue);
    });

    test('a long walk is thinned to the server\'s limit, ends kept', () {
      final track = [for (var i = 0; i < 1200; i++) Corner(lat0 + i * 1e-5, lng0)];
      final t = thin(track);
      expect(t.length, maxCorners);
      expect(t.first.lat, track.first.lat);
      expect(t.last.lat, track.last.lat);
      expect(thin(square).length, 4, reason: 'a short boundary goes as it is');
    });
  });

  test('«احفظ» sends the corners with the token, and reads the area and the soil back', () async {
    final expires = DateTime.now().toUtc().add(const Duration(hours: 1)).millisecondsSinceEpoch ~/ 1000;
    SharedPreferences.setMockInitialValues({
      'sudagri.session': jsonEncode({'access_token': 'a1', 'refresh_token': 'r1', 'expires_at': expires}),
    });
    Map<String, dynamic>? sent;
    final c = AccountController(
      siteUrl: 'https://site.test',
      supabaseUrl: 'https://db.test',
      anonKey: 'anon',
      client: MockClient((req) async {
        expect(req.url.path, '/api/app/lands');
        expect(req.headers['authorization'], 'Bearer a1');
        sent = jsonDecode(req.body) as Map<String, dynamic>;
        return json({
          'id': 'land-1',
          'feddans': 2.38,
          'soil': {'name': 'تربة طينيّة متشقّقة', 'probability': 61},
          'message': 'سُجّلت الأرض.',
        });
      }),
    );
    await c.load();
    final saved = await c.registerLand(
      name: 'الحوّاشة', state: 'الجزيرة', waterSource: 'canal', tenure: 'owned', corners: square,
    );
    expect(sent!['boundary'], hasLength(4));
    expect((sent!['boundary'] as List).first, {'lat': lat0, 'lng': lng0});
    expect(sent!.containsKey('feddans'), isFalse, reason: 'the server works the area out itself');
    expect(sent!['state'], 'الجزيرة');
    expect(saved.feddans, 2.38);
    expect(saved.soilName, 'تربة طينيّة متشقّقة');
  });

  test('a refusal comes back in the server\'s words', () async {
    final expires = DateTime.now().toUtc().add(const Duration(hours: 1)).millisecondsSinceEpoch ~/ 1000;
    SharedPreferences.setMockInitialValues({
      'sudagri.session': jsonEncode({'access_token': 'a1', 'refresh_token': 'r1', 'expires_at': expires}),
    });
    final c = AccountController(
      siteUrl: 'https://site.test', supabaseUrl: 'https://db.test', anonKey: 'anon',
      client: MockClient((_) async => json({'error': 'الموقع خارج السودان.'}, 400)),
    );
    await c.load();
    expect(
      () => c.registerLand(name: 'x', state: 'الجزيرة', waterSource: 'canal', tenure: 'owned', corners: square),
      throwsA(isA<ApiException>().having((e) => e.message, 'message', 'الموقع خارج السودان.')),
    );
  });

  testWidgets('the screen opens on the map, with no corners yet, and «احفظ» asks for them', (tester) async {
    // A phone's width: nothing on the screen may run off its edge. Tall enough that the whole form is built.
    tester.view.physicalSize = const Size(360, 2000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(const MaterialApp(home: LandMapScreen()));
    expect(find.text('حدّد أرضك'), findsOneWidget);
    expect(find.textContaining('الأركان: 0'), findsOneWidget);
    await tester.ensureVisible(find.text('احفظ الأرض'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('احفظ الأرض'));
    await tester.pump();
    expect(find.text('حدّد ثلاثة أركانٍ على الأقلّ تحيط بالأرض.'), findsOneWidget);
  });

  testWidgets('three taps on the map make a field, and «تراجع» takes the last corner back', (tester) async {
    tester.view.physicalSize = const Size(360, 2000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(const MaterialApp(home: LandMapScreen()));
    final map = tester.getRect(find.byType(FlutterMap));
    for (final o in [const Offset(-60, -60), const Offset(60, -60), const Offset(60, 60)]) {
      await tester.tapAt(map.center + o);
      await tester.pump(const Duration(milliseconds: 400));
    }
    expect(find.textContaining('المساحة:'), findsOneWidget);
    expect(find.textContaining('3 ركناً'), findsOneWidget);
    await tester.tap(find.text('تراجع'));
    await tester.pump();
    expect(find.textContaining('الأركان: 2'), findsOneWidget);
  });

  test('the lists match the website\'s', () {
    expect(sudanStates, hasLength(18));
    expect(waterSources.keys, ['canal', 'river_pump', 'borehole', 'rainfed']);
    expect(tenures.keys, ['owned', 'leased', 'communal', 'unspecified']);
  });
}
