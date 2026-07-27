import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import '../../utils/theme.dart';

class PickLocationScreen extends StatefulWidget {
  final LatLng? initialLocation;
  const PickLocationScreen({super.key, this.initialLocation});

  @override
  State<PickLocationScreen> createState() => _PickLocationScreenState();
}

class _PickLocationScreenState extends State<PickLocationScreen> {
  late LatLng _selected;
  final MapController _mapController = MapController();

  @override
  void initState() {
    super.initState();
    // الرياض كموقع افتراضي إذا لم يُحدَّد شيء
    _selected = widget.initialLocation ?? const LatLng(24.7136, 46.6753);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('اختر موقع المطعم'),
        actions: [
          IconButton(
            icon: const Icon(Icons.check),
            onPressed: () => Navigator.pop(context, _selected),
            tooltip: 'تأكيد الموقع',
          ),
        ],
      ),
      body: Stack(
        children: [
          FlutterMap(
            mapController: _mapController,
            options: MapOptions(
              initialCenter: _selected,
              initialZoom: 13,
              onTap: (tapPosition, point) {
                setState(() => _selected = point);
              },
            ),
            children: [
              TileLayer(
                urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                userAgentPackageName: 'com.zadam.delivery',
              ),
              MarkerLayer(markers: [
                Marker(
                  point: _selected,
                  width: 60,
                  height: 60,
                  child: const Icon(Icons.location_pin, color: AppColors.primary, size: 48),
                ),
              ]),
            ],
          ),
          Positioned(
            bottom: 20,
            left: 20,
            right: 20,
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text('خط العرض: ${_selected.latitude.toStringAsFixed(6)}'),
                    Text('خط الطول: ${_selected.longitude.toStringAsFixed(6)}'),
                    const SizedBox(height: 8),
                    const Text('اضغط على أي مكان في الخريطة لتحديد الموقع',
                        style: TextStyle(fontSize: 12, color: AppColors.textGray)),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}