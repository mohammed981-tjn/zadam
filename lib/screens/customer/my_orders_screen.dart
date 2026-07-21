// lib/screens/customer/my_orders_screen.dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../models/models.dart';
import '../../providers/firebase_service.dart';
import '../../providers/auth_provider.dart' as app_auth;
import '../../utils/theme.dart';
import '../../utils/helpers.dart';
import '../../widgets/common_widgets.dart';
import 'order_tracking_screen.dart';
import 'complaint_screen.dart';

class MyOrdersScreen extends StatelessWidget {
  const MyOrdersScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final service = context.read<FirebaseService>();
    final uid = context.read<app_auth.AuthProvider>().user?.uid ?? '';

    return StreamBuilder<List<Order>>(
      stream: service.streamCustomerOrders(uid),
      builder: (ctx, snap) {
        if (snap.connectionState == ConnectionState.waiting) {
          return const AppLoading(message: 'جاري تحميل طلباتك...');
        }
        final orders = snap.data ?? [];
        if (orders.isEmpty) {
          return const AppEmpty(
            emoji: '📋',
            title: 'لا يوجد طلبات',
            subtitle: 'ابدأ بطلب وجبتك المفضلة!',
          );
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
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => OrderTrackingScreen(orderId: order.id),
          ),
        ),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      'طلب #${order.orderNumber}',
                      style: const TextStyle(
                          fontWeight: FontWeight.bold, fontSize: 15),
                    ),
                  ),
                  StatusBadge(
                    label: order.status.label,
                    color: order.status.color,
                    icon: order.status.icon,
                  ),
                ],
              ),
              const SizedBox(height: 8),
              InfoRow(icon: Icons.restaurant_rounded, text: order.restaurantName),
              InfoRow(
                icon: Icons.access_time,
                text: formatDateTime(order.createdAt),
              ),
              const SizedBox(height: 8),
              Text(
                order.items.map((i) => '${i.emoji} ${i.name}').join('  •  '),
                style: const TextStyle(fontSize: 12, color: AppColors.textGray),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              const Divider(height: 16),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    formatCurrency(order.grandTotal),
                    style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      color: AppColors.primary,
                      fontSize: 15,
                    ),
                  ),
                  Row(
                    children: [
                      if (order.status == OrderStatus.delivered &&
                          !order.isRated)
                        _actionBtn(
                          context,
                          '⭐ قيّم',
                          AppColors.warning,
                          () => Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) =>
                                  OrderTrackingScreen(orderId: order.id),
                            ),
                          ),
                        ),
                      if (order.status == OrderStatus.delivered) ...[
                        const SizedBox(width: 8),
                        _actionBtn(
                          context,
                          '📝 شكوى',
                          AppColors.secondary,
                          () => Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => ComplaintScreen(order: order),
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _actionBtn(BuildContext ctx, String label, Color color,
      VoidCallback onTap) =>
      GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.15),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: color.withValues(alpha: 0.3)),
          ),
          child: Text(label,
              style: TextStyle(
                  color: color, fontSize: 12, fontWeight: FontWeight.w600)),
        ),
      );
}
