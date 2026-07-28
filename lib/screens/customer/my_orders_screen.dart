import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:flutter_rating_bar/flutter_rating_bar.dart';
import '../../models/models.dart';
import '../../providers/firebase_service.dart';
import '../../providers/auth_provider.dart' as app_auth;
import '../../utils/theme.dart';
import '../../utils/helpers.dart';
import '../../widgets/common_widgets.dart';
import 'order_map_screen.dart';

class MyOrdersScreen extends StatelessWidget {
  const MyOrdersScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final service = context.read<FirebaseService>();
    final uid = context.read<app_auth.AuthProvider>().user?.uid ?? '';

    return StreamBuilder<List<Order>>(
      stream: service.streamCustomerOrders(uid),
      builder: (ctx, snap) {
        if (!snap.hasData) return const AppLoading();
        final orders = snap.data!;
        if (orders.isEmpty) {
          return const AppEmpty(emoji: '📋', title: 'لا يوجد طلبات');
        }
        return ListView.builder(
          padding: const EdgeInsets.all(12),
          itemCount: orders.length,
          itemBuilder: (_, i) => _OrderCard(order: orders[i]),
        );
      },
    );
  }
}

class _OrderCard extends StatelessWidget {
  final Order order;
  const _OrderCard({required this.order});

  @override
  Widget build(BuildContext context) {
    final service = context.read<FirebaseService>();
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Text('#${order.orderNumber}',
                  style: const TextStyle(fontWeight: FontWeight.bold)),
              const Spacer(),
              if (order.restaurantLat != null || order.deliveryLat != null)
                IconButton(
                  icon: const Icon(Icons.map_outlined, color: AppColors.secondary),
                  onPressed: () => Navigator.push(context,
                      MaterialPageRoute(builder: (_) => OrderMapScreen(order: order))),
                  tooltip: 'عرض الخريطة',
                ),
              StatusBadge(
                  label: order.status.label,
                  color: order.status.color,
                  icon: order.status.icon),
            ]),
            InfoRow(icon: Icons.restaurant, text: order.restaurantName),
            InfoRow(
                icon: Icons.access_time,
                text:
                    '${order.createdAt.day}/${order.createdAt.month} ${order.createdAt.hour}:${order.createdAt.minute.toString().padLeft(2, '0')}'),
            const Divider(),
            Text(formatCurrency(order.grandTotal),
                style: const TextStyle(
                    fontWeight: FontWeight.bold, color: AppColors.primary)),
            if (order.status == OrderStatus.delivered && !order.isRated)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: () => _showRateDialog(context, service, order),
                    style: ElevatedButton.styleFrom(backgroundColor: AppColors.warning),
                    child: const Text('قيّم الطلب'),
                  ),
                ),
              ),
            if (order.isRated && order.customerRating != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Row(children: [
                  const Icon(Icons.star_rounded, color: Colors.amber, size: 18),
                  const SizedBox(width: 4),
                  Text('تقييمك: ${order.customerRating!.toStringAsFixed(1)}',
                      style: const TextStyle(fontSize: 12, color: AppColors.textGray)),
                ]),
              ),
          ],
        ),
      ),
    );
  }

  void _showRateDialog(BuildContext context, FirebaseService service, Order o) {
    double orderRating = 5, driverRating = 5;
    final reviewCtrl = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx2, setState) => AlertDialog(
          title: const Text('قيّم تجربتك'),
          content: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              const Text('جودة الطلب'),
              RatingBar.builder(
                initialRating: 5,
                itemCount: 5,
                itemBuilder: (_, __) => const Icon(Icons.star, color: Colors.amber),
                onRatingUpdate: (r) => orderRating = r,
              ),
              const SizedBox(height: 12),
              const Text('أداء السائق'),
              RatingBar.builder(
                initialRating: 5,
                itemCount: 5,
                itemBuilder: (_, __) => const Icon(Icons.star, color: Colors.amber),
                onRatingUpdate: (r) => driverRating = r,
              ),
              const SizedBox(height: 12),
              TextField(
                controller: reviewCtrl,
                decoration: const InputDecoration(labelText: 'تعليقك (اختياري)'),
                maxLines: 2,
              ),
            ]),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('إلغاء')),
            ElevatedButton(
              onPressed: () async {
                await service.rateOrder(
                  orderId: o.id,
                  driverId: o.driverId ?? '',
                  orderRating: orderRating,
                  driverRating: driverRating,
                  review: reviewCtrl.text.trim().isEmpty ? null : reviewCtrl.text.trim(),
                );
                if (context.mounted) Navigator.pop(ctx);
              },
              child: const Text('إرسال'),
            ),
          ],
        ),
      ),
    );
  }
}