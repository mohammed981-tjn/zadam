import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';

import '../account.dart';
import '../api.dart';
import '../land_shape.dart';
import '../agronomy.dart';
import '../theme.dart';
import 'water_screen.dart';

/// «حدّد أرضك» (البند ١٣٤؛ اختار المالك المشي والنقر معاً، 28 أكتوبر 2026).
///
/// Two ways to draw the same boundary, used together or apart: walk round the field with the phone, which records a
/// corner every few metres, or tap the corners on the satellite map. The area in feddans shows as the boundary
/// grows. Then the name, the state, the water and the tenure, and «احفظ»: the site works out the area and centre
/// again from the corners, saves the land for review as the website does, and reads the soil at its centre.
///
/// The satellite picture is EOX's Sentinel-2 cloudless mosaic of 2016, the one the website's maps use: its
/// licence (CC BY 4.0) allows commercial use, which the later years' mosaics do not.
class LandMapScreen extends StatefulWidget {
  const LandMapScreen({super.key});

  @override
  State<LandMapScreen> createState() => _LandMapScreenState();
}

/// The states, as the website lists them (SUDAN_STATES in src/lib/nafir.ts); the stored value is the Arabic name.
const sudanStates = [
  'الخرطوم', 'الجزيرة', 'سنار', 'النيل الأزرق', 'النيل الأبيض', 'القضارف', 'كسلا',
  'البحر الأحمر', 'نهر النيل', 'الشمالية', 'شمال كردفان', 'جنوب كردفان', 'غرب كردفان',
  'شمال دارفور', 'جنوب دارفور', 'شرق دارفور', 'غرب دارفور', 'وسط دارفور',
];

/// The website's labels (WATER_SOURCE_LABEL in src/lib/risk.ts).
const waterSources = {
  'canal': 'قناة من خزان أو نهر',
  'river_pump': 'ضخ مباشر من النهر',
  'borehole': 'آبار جوفية',
  'rainfed': 'مطري بالكامل',
};

/// The website's labels (TENURES in src/components/LandForm.tsx).
const tenures = {
  'owned': 'ملك',
  'leased': 'إيجار أو حكر',
  'communal': 'أرض مشاع أو قبلية',
  'unspecified': 'غير محدّد',
};

const _satellite = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg';

class _LandMapScreenState extends State<LandMapScreen> {
  final _map = MapController();
  final _name = TextEditingController();
  final _locality = TextEditingController();
  final List<Corner> _corners = [];
  StreamSubscription<Position>? _walk;
  String? _state;
  String _water = 'canal';
  String _tenure = 'unspecified';
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _walk?.cancel();
    _name.dispose();
    _locality.dispose();
    super.dispose();
  }

  Shape? get _shape => shapeOf(_corners);

  /// Asks for the phone's location once, and says plainly what to do when it is off or refused.
  Future<bool> _located() async {
    if (!await Geolocator.isLocationServiceEnabled()) {
      _say('شغّل الموقع (GPS) في الجوّال ثمّ أعد المحاولة.');
      return false;
    }
    var p = await Geolocator.checkPermission();
    if (p == LocationPermission.denied) p = await Geolocator.requestPermission();
    if (p == LocationPermission.denied || p == LocationPermission.deniedForever) {
      _say('لم يُؤذن للتطبيق بموقعك. يمكنك أن تنقر أركان أرضك على الخريطة بدلاً من المشي.');
      return false;
    }
    return true;
  }

  void _say(String text) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }

  Future<void> _toggleWalk() async {
    if (_walk != null) {
      await _walk!.cancel();
      setState(() => _walk = null);
      return;
    }
    if (!await _located()) return;
    final sub = Geolocator.getPositionStream(
      locationSettings: const LocationSettings(accuracy: LocationAccuracy.best, distanceFilter: 3),
    ).listen((pos) {
      // A reading worse than 20 m would draw the edge in the wrong field.
      if (pos.accuracy > 20) return;
      final c = Corner(pos.latitude, pos.longitude);
      if (!keepReading(_corners, c)) return;
      setState(() => _corners.add(c));
      _map.move(LatLng(c.lat, c.lng), _map.camera.zoom < 16 ? 17 : _map.camera.zoom);
    }, onError: (_) => _say('تعذّرت قراءة الموقع. جرّب في مكانٍ مكشوف.'));
    setState(() => _walk = sub);
  }

  Future<void> _toMe() async {
    if (!await _located()) return;
    try {
      final pos = await Geolocator.getCurrentPosition();
      _map.move(LatLng(pos.latitude, pos.longitude), 17);
    } catch (_) {
      _say('تعذّرت قراءة الموقع. جرّب في مكانٍ مكشوف.');
    }
  }

  Future<void> _save() async {
    final shape = _shape;
    final name = _name.text.trim();
    if (shape == null) return setState(() => _error = 'حدّد ثلاثة أركانٍ على الأقلّ تحيط بالأرض.');
    if (name.isEmpty || _state == null) return setState(() => _error = 'اكتب اسم الأرض واختر الولاية.');
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final saved = await accountController.registerLand(
        name: name,
        state: _state!,
        locality: _locality.text.trim(),
        waterSource: _water,
        tenure: _tenure,
        corners: _corners,
      );
      await _walk?.cancel();
      _walk = null;
      if (!mounted) return;
      final station = stations.where((s) => s.key == saved.station).firstOrNull;
      final rain = station?.rainfall.fold<double>(0, (a, b) => a + b);
      final water = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('سُجّلت الأرض'),
          content: SingleChildScrollView(
            child: Text([
              'المساحة: ${saved.feddans} فدان.',
              if (station != null)
                'أقرب محطّة مناخ: ${station.name}، ومطرها المعتاد نحو ${rain!.round()} مم في السنة.',
              if (saved.soilName != null)
                'التربة في وسطها من الأقمار: ${saved.soilName} (احتمال ${saved.soilProbability}٪). هذا تقدير لا فحص.',
              saved.message,
            ].join('\n\n')),
          ),
          actions: [
            if (station != null)
              TextButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('احسب ماءها')),
            TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('حسناً')),
          ],
        ),
      );
      if (!mounted) return;
      if (water == true) {
        // The water calculator for this field: its station and its area, in place of this screen.
        // `result: true` still tells «أراضيّ» that a land was saved, so it reloads behind.
        await Navigator.of(context).pushReplacement(
          MaterialPageRoute(builder: (_) => WaterScreen(stationKey: saved.station, feddans: saved.feddans.toDouble())),
          result: true,
        );
        return;
      }
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final shape = _shape;
    final points = [for (final c in _corners) LatLng(c.lat, c.lng)];
    final primary = Theme.of(context).colorScheme.primary;
    return Scaffold(
      appBar: AppBar(title: const Text('حدّد أرضك')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            'امشِ حول أرضك والجوّال معك، أو انقر أركانها على الخريطة بالترتيب. '
            'وتظهر المساحة بالفدان كلّما أضفت ركناً.',
            style: TextStyle(color: mutedOn(context), height: 1.6),
          ),
          const SizedBox(height: 12),
          ClipRRect(
            borderRadius: BorderRadius.circular(16),
            child: SizedBox(
              height: 360,
              child: FlutterMap(
                mapController: _map,
                options: MapOptions(
                  initialCenter: const LatLng(15.0, 32.5),
                  initialZoom: 6,
                  maxZoom: 19,
                  onTap: (_, p) => setState(() {
                    if (_corners.length < maxCorners) _corners.add(Corner(p.latitude, p.longitude));
                  }),
                ),
                children: [
                  TileLayer(
                    urlTemplate: _satellite,
                    maxNativeZoom: 16,
                    userAgentPackageName: 'com.sudagri.app',
                  ),
                  if (points.length >= 3)
                    PolygonLayer(polygons: [
                      Polygon(
                        points: points,
                        color: primary.withValues(alpha: 0.25),
                        borderColor: Colors.white,
                        borderStrokeWidth: 2,
                      ),
                    ])
                  else if (points.length == 2)
                    PolylineLayer(polylines: [Polyline(points: points, color: Colors.white, strokeWidth: 2)]),
                  MarkerLayer(markers: [
                    for (final p in points)
                      Marker(
                        point: p,
                        width: 14,
                        height: 14,
                        child: DecoratedBox(
                          decoration: BoxDecoration(
                            color: primary,
                            shape: BoxShape.circle,
                            border: Border.all(color: Colors.white, width: 2),
                          ),
                        ),
                      ),
                  ]),
                  // A folded «i» that opens the credit: a line across a phone-wide map runs off its edge.
                  const RichAttributionWidget(
                    attributions: [TextSourceAttribution('EOxCloudless 2016 — EOX IT Services (Copernicus Sentinel)')],
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          Text(
            shape == null
                ? 'الأركان: ${_corners.length} — حدّد ثلاثة على الأقلّ'
                : 'المساحة: ${shape.feddans.toStringAsFixed(2)} فدان (${shape.m2.round()} م²) — ${_corners.length} ركناً',
            key: const Key('land-area'),
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              FilledButton.icon(
                onPressed: _toggleWalk,
                icon: Icon(_walk == null ? Icons.directions_walk : Icons.stop),
                label: Text(_walk == null ? 'ابدأ المشي حول الأرض' : 'أوقف المشي'),
              ),
              OutlinedButton.icon(
                onPressed: _toMe,
                icon: const Icon(Icons.my_location, size: 18),
                label: const Text('موقعي'),
              ),
              OutlinedButton.icon(
                onPressed: _corners.isEmpty ? null : () => setState(_corners.removeLast),
                icon: const Icon(Icons.undo, size: 18),
                label: const Text('تراجع'),
              ),
              OutlinedButton.icon(
                onPressed: _corners.isEmpty ? null : () => setState(_corners.clear),
                icon: const Icon(Icons.delete_outline, size: 18),
                label: const Text('امسح'),
              ),
            ],
          ),
          const SizedBox(height: 16),
          TextField(controller: _name, decoration: const InputDecoration(labelText: 'اسم الأرض')),
          const SizedBox(height: 8),
          DropdownButtonFormField<String>(
            isExpanded: true,
            initialValue: _state,
            decoration: const InputDecoration(labelText: 'الولاية'),
            items: [for (final s in sudanStates) DropdownMenuItem(value: s, child: Text(s))],
            onChanged: (v) => setState(() => _state = v),
          ),
          const SizedBox(height: 8),
          TextField(controller: _locality, decoration: const InputDecoration(labelText: 'المحليّة (اختياري)')),
          const SizedBox(height: 8),
          DropdownButtonFormField<String>(
            isExpanded: true,
            initialValue: _water,
            decoration: const InputDecoration(labelText: 'مصدر الماء'),
            items: [for (final e in waterSources.entries) DropdownMenuItem(value: e.key, child: Text(e.value))],
            onChanged: (v) => setState(() => _water = v ?? _water),
          ),
          const SizedBox(height: 8),
          DropdownButtonFormField<String>(
            isExpanded: true,
            initialValue: _tenure,
            decoration: const InputDecoration(labelText: 'الحيازة'),
            items: [for (final e in tenures.entries) DropdownMenuItem(value: e.key, child: Text(e.value))],
            onChanged: (v) => setState(() => _tenure = v ?? _tenure),
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
          ],
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _saving ? null : _save,
            child: Text(_saving ? 'يُحفظ…' : 'احفظ الأرض'),
          ),
          const SizedBox(height: 8),
          Text(
            'تُحفظ الأرض للمراجعة ولا يراها أحد حتى ترفع مستنداتها من الموقع وتعتمدها الإدارة.',
            style: TextStyle(color: mutedOn(context), fontSize: 12),
          ),
        ],
      ),
    );
  }
}
