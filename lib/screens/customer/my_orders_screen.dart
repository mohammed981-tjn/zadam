import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import '../../models/models.dart';
import '../../utils/theme.dart';

class OrderMapScreen extends StatelessWidget {
  final Order order;
  const OrderMapScreen({super.key, required this.order});

  @override
  Widget build(BuildContext context) {
    final points = <Marker>[];
    final polyPoints = <LatLng>[];

    if (order.restaurantLat != null && order.restaurantLng != null) {
      final p = LatLng(order.restaurantLat!, order.restaurantLng!);
      polyPoints.add(p);
      points.add(Marker(
        point: p,
        width: 60,
        height: 60,
        child: const Column(children: [
          Icon(Icons.restaurant, color: Colors.orange, size: 32),
        ]),
      ));
    }

    if (order.deliveryLat != null && order.deliveryLng != null) {
      final p = LatLng(order.deliveryLat!, order.deliveryLng!);
      polyPoints.add(p);
      points.add(Marker(
        point: p,
        width: 60,
        height: 60,
        child: const Column(children: [
          Icon(Icons.location_on, color: AppColors.primary, size: 32),
        ]),
      ));
    }

    if (points.isEmpty) {
      return Scaffold(
        appBar: AppBar(title: const Text('خريطة الطلب')),
        body: const Center(child: Text('لا توجد إحداثيات محفوظة لهذا الطلب')),
      );
    }

    final center = points.length > 1
        ? LatLng(
            (points[0].point.latitude + points[1].point.latitude) / 2,
            (points[0].point.longitude + points[1].point.longitude) / 2,
          )
        : points[0].point;

    return Scaffold(
      appBar: AppBar(title: const Text('خريطة الطلب')),
      body: FlutterMap(
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
