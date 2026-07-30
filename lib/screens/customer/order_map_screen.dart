import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';
import '../../models/models.dart';
import '../../providers/firebase_service.dart';
import '../../utils/theme.dart';

class OrderMapScreen extends StatefulWidget {
  final Order order;
  final bool isDriverView;
  const OrderMapScreen({super.key, required this.order, this.isDriverView = false});

  @override
  State<OrderMapScreen> createState() => _OrderMapScreenState();
}

class _OrderMapScreenState extends State<OrderMapScreen> {
  late MapController _mapController;

  @override
  void initState() {
    super.initState();
    _mapController = MapController();
  }

  @override
  Widget build(BuildContext context) {
    final service = context.read<FirebaseService>();
    final points = <Marker>[];
    final polyPoints = <LatLng>[];

    // المطعم
    if (widget.order.restaurantLat != null && widget.order.restaurantLng != null) {
      final p = LatLng(widget.order.restaurantLat!, widget.order.restaurantLng!);
      polyPoints.add(p);
      points.add(Marker(
        point: p,
        width: 70,
        height: 70,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              decoration: BoxDecoration(
                color: Colors.orange,
                borderRadius: BorderRadius.circular(50),
                border: Border.all(color: Colors.white, width: 3),
                boxShadow: [BoxShadow(color: Colors.black26, blurRadius: 4)],
              ),
              padding: const EdgeInsets.all(6),
              child: const Icon(Icons.restaurant, color: Colors.white, size: 28),
            ),
            const SizedBox(height: 4),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(color: Colors.orange, borderRadius: BorderRadius.circular(4)),
              child: const Text('المطعم', style: TextStyle(fontSize: 10, color: Colors.white, fontWeight: FontWeight.bold)),
            ),
          ],
        ),
      ));
    }

    // موقع التسليم
    if (widget.order.deliveryLat != null && widget.order.deliveryLng != null) {
      final p = LatLng(widget.order.deliveryLat!, widget.order.deliveryLng!);
      polyPoints.add(p);
      points.add(Marker(
        point: p,
        width: 70,
        height: 70,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              decoration: BoxDecoration(
                color: AppColors.primary,
                borderRadius: BorderRadius.circular(50),
                border: Border.all(color: Colors.white, width: 3),
                boxShadow: [BoxShadow(color: Colors.black26, blurRadius: 4)],
              ),
              padding: const EdgeInsets.all(6),
              child: const Icon(Icons.location_on, color: Colors.white, size: 28),
            ),
            const SizedBox(height: 4),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(color: AppColors.primary, borderRadius: BorderRadius.circular(4)),
              child: const Text('التسليم', style: TextStyle(fontSize: 10, color: Colors.white, fontWeight: FontWeight.bold)),
            ),
          ],
        ),
      ));
    }

    // موقع السائق (عند عرض خريطة السائق أو للعميل)
    if (widget.isDriverView || !widget.isDriverView) {
      if (widget.order.driverLat != null && widget.order.driverLng != null) {
        final p = LatLng(widget.order.driverLat!, widget.order.driverLng!);
        polyPoints.insert(0, p);
        points.add(Marker(
          point: p,
          width: 70,
          height: 70,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                decoration: BoxDecoration(
                  color: Colors.green,
                  borderRadius: BorderRadius.circular(50),
                  border: Border.all(color: Colors.white, width: 3),
                  boxShadow: [BoxShadow(color: Colors.black26, blurRadius: 8)],
                ),
                padding: const EdgeInsets.all(6),
                child: const Icon(Icons.directions_car, color: Colors.white, size: 28),
              ),
              const SizedBox(height: 4),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(color: Colors.green, borderRadius: BorderRadius.circular(4)),
                child: const Text('السائق', style: TextStyle(fontSize: 10, color: Colors.white, fontWeight: FontWeight.bold)),
              ),
            ],
          ),
        ));
      }
    }

    if (points.isEmpty) {
      return Scaffold(
        appBar: AppBar(title: const Text('خريطة الطلب')),
        body: const Center(child: Text('لا توجد إحداثيات محفوظة لهذا الطلب')),
      );
    }

    final center = points.length > 1
        ? LatLng(
            (points[0].point.latitude + points[points.length - 1].point.latitude) / 2,
            (points[0].point.longitude + points[points.length - 1].point.longitude) / 2,
          )
        : points[0].point;

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.isDriverView ? 'توجيه التسليم' : 'تتبع الطلب'),
      ),
      body: FlutterMap(
        mapController: _mapController,
        options: MapOptions(initialCenter: center, initialZoom: 13),
        children: [
          TileLayer(
            urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            userAgentPackageName: 'com.zadam.delivery',
          ),
          if (polyPoints.length > 1)
            PolylineLayer(polylines: [
              Polyline(points: polyPoints, strokeWidth: 4, color: AppColors.primary),
            ]),
          MarkerLayer(markers: points),
        ],
      ),
    );
  }
}