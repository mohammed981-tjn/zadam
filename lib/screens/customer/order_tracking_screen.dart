// lib/screens/customer/order_tracking_screen.dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../models/models.dart';
import '../../providers/firebase_service.dart';
import '../../utils/theme.dart';
import '../../utils/helpers.dart';
import '../../widgets/common_widgets.dart';
import 'rating_screen.dart';

class OrderTrackingScreen extends StatelessWidget {
  final String orderId;
  const OrderTrackingScreen({super.key, required this.orderId});

  @override
  Widget build(BuildContext context) {
    final service = context.read<FirebaseService>();
    return Scaffold(
      appBar: AppBar(title: const Text('تتبع الطلب')),
      body: StreamBuilder<Order?>(
        stream: service.streamOrder(orderId),
        builder: (ctx, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const AppLoading(message: 'جاري تحميل الطلب...');
          }
          final order = snap.data;
          if (order == null) {
            return const AppEmpty(
                emoji: '❓', title: 'الطلب غير موجود');
          }
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              // Status card
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: order.status.color.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                      color: order.status.color.withValues(alpha: 0.3)),
                ),
                child: Column(
                  children: [
                    Icon(order.status.icon,
                        size: 52, color: order.status.color),
                    const SizedBox(height: 12),
                    Text(order.status.label,
                        style: TextStyle(
                            fontSize: 22,
                            fontWeight: FontWeight.bold,
                            color: order.status.color)),
                    const SizedBox(height: 6),
                    Text('طلب رقم #${order.orderNumber}',
                        style: const TextStyle(color: AppColors.textGray)),
                    if (order.status == OrderStatus.outForDelivery)
                      Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Text(
                          'السائق في الطريق إليك 🛵',
                          style: TextStyle(
                              color: order.status.color,
                              fontWeight: FontWeight.w600),
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 16),

              // Progress stepper
              _buildStepper(order.status),
              const SizedBox(height: 16),

              // Driver info
              if (order.driverName != null)
                Card(
                  child: ListTile(
                    leading: CircleAvatar(
                      backgroundColor: AppColors.primary.withValues(alpha: 0.1),
                      child: const Icon(Icons.delivery_dining,
                          color: AppColors.primary),
                    ),
                    title: const Text('السائق'),
                    subtitle: Text(order.driverName!,
                        style: const TextStyle(
                            fontWeight: FontWeight.bold)),
                    trailing: const Icon(Icons.phone_outlined,
                        color: AppColors.primary),
                  ),
                ),

              // Order details
              const SizedBox(height: 12),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const SectionHeader(title: 'تفاصيل الطلب'),
                      const SizedBox(height: 8),
                      ...order.items.map((item) => Padding(
                            padding: const EdgeInsets.symmetric(vertical: 3),
                            child: Row(
                              children: [
                                Text(item.emoji),
                                const SizedBox(width: 8),
                                Expanded(child: Text(item.name,
                                    style: const TextStyle(fontSize: 13))),
                                Text('×${item.quantity}',
                                    style: const TextStyle(
                                        color: AppColors.textGray,
                                        fontSize: 13)),
                                const SizedBox(width: 8),
                                Text(formatCurrency(item.subtotal),
                                    style: const TextStyle(
                                        fontWeight: FontWeight.bold,
                                        fontSize: 13)),
                              ],
                            ),
                          )),
                      const Divider(),
                      PriceRow(label: 'التوصيل',
                          value: formatCurrency(order.deliveryFee)),
                      PriceRow(
                          label: 'الإجمالي',
                          value: formatCurrency(order.grandTotal),
                          bold: true),
                      const Divider(),
                      InfoRow(
                          icon: Icons.location_on_outlined,
                          text: order.deliveryAddress),
                      InfoRow(
                          icon: Icons.access_time,
                          text: formatDateTime(order.createdAt)),
                      InfoRow(
                          icon: order.paymentMethod.icon,
                          text: order.paymentMethod.label),
                      InfoRow(
                        icon: order.isPaid
                            ? Icons.check_circle
                            : Icons.pending,
                        text: order.isPaid ? 'مدفوع' : 'غير مدفوع',
                        color: order.isPaid
                            ? AppColors.success
                            : AppColors.warning,
                      ),
                    ],
                  ),
                ),
              ),

              // Rating button
              if (order.status == OrderStatus.delivered &&
                  !order.isRated) ...[
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  height: 52,
                  child: ElevatedButton.icon(
                    onPressed: () => Navigator.push(
                      context,
                      MaterialPageRoute(
                          builder: (_) => RatingScreen(order: order)),
                    ),
                    icon: const Icon(Icons.star_outline),
                    label: const Text('قيّم تجربتك'),
                    style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.warning),
                  ),
                ),
              ],

              // Already rated
              if (order.isRated && order.customerRating != null) ...[
                const SizedBox(height: 16),
                Card(
                  color: AppColors.success.withValues(alpha: 0.08),
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Row(
                      children: [
                        const Icon(Icons.star_rounded,
                            color: AppColors.warning, size: 28),
                        const SizedBox(width: 10),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('شكراً على تقييمك!',
                                style: TextStyle(
                                    fontWeight: FontWeight.bold)),
                            Text(
                                'تقييمك: ${order.customerRating!.toStringAsFixed(1)} ⭐',
                                style: const TextStyle(
                                    color: AppColors.textGray,
                                    fontSize: 13)),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ],
          );
        },
      ),
    );
  }

  Widget _buildStepper(OrderStatus current) {
    if (current == OrderStatus.cancelled ||
        current == OrderStatus.rejected) {
      return Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Colors.red.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.cancel_outlined, color: Colors.red),
            const SizedBox(width: 8),
            Text(current.label,
                style: const TextStyle(
                    color: Colors.red, fontWeight: FontWeight.bold)),
          ],
        ),
      );
    }

    const steps = [
      OrderStatus.pending,
      OrderStatus.confirmed,
      OrderStatus.preparing,
      OrderStatus.readyForPickup,
      OrderStatus.outForDelivery,
      OrderStatus.delivered,
    ];

    final currentIdx = steps.indexOf(current);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: List.generate(steps.length, (i) {
            final step = steps[i];
            final isDone = i <= currentIdx;
            final isCurrent = i == currentIdx;
            return Column(
              children: [
                Row(
                  children: [
                    Container(
                      width: 34,
                      height: 34,
                      decoration: BoxDecoration(
                        color: isDone
                            ? AppColors.primary
                            : Colors.grey.shade200,
                        borderRadius: BorderRadius.circular(17),
                      ),
                      child: Icon(
                        isDone ? Icons.check_rounded : step.icon,
                        size: 17,
                        color: isDone ? Colors.white : Colors.grey,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Text(
                      step.label,
                      style: TextStyle(
                        fontWeight: isCurrent
                            ? FontWeight.bold
                            : FontWeight.normal,
                        color: isDone
                            ? AppColors.primary
                            : Colors.grey,
                        fontSize: isCurrent ? 15 : 13,
                      ),
                    ),
                  ],
                ),
                if (i < steps.length - 1)
                  Container(
                    margin: const EdgeInsets.only(right: 16),
                    width: 2,
                    height: 18,
                    color: i < currentIdx
                        ? AppColors.primary
                        : Colors.grey.shade200,
                  ),
              ],
            );
          }),
        ),
      ),
    );
  }
}
