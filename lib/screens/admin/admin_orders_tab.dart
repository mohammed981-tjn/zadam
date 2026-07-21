// lib/screens/admin/admin_orders_tab.dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../../providers/firebase_service.dart';
import '../../models/models.dart';
import '../../utils/theme.dart';
import '../../utils/helpers.dart';
import '../../widgets/common_widgets.dart';

class AdminOrdersTab extends StatefulWidget {
  const AdminOrdersTab({super.key});
  @override
  State<AdminOrdersTab> createState() => _AdminOrdersTabState();
}

class _AdminOrdersTabState extends State<AdminOrdersTab> {
  OrderStatus? _filter;

  @override
  Widget build(BuildContext context) {
    final service = context.read<FirebaseService>();
    return Column(
      children: [
        // Filter chips
        SizedBox(
          height: 52,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            children: [
              _chip('الكل', null),
              ...OrderStatus.values.map((s) => _chip(s.label, s)),
            ],
          ),
        ),
        Expanded(
          child: StreamBuilder<List<Order>>(
            stream: service.streamAllOrders(),
            builder: (ctx, snap) {
              if (!snap.hasData) return const AppLoading();
              final orders = snap.data!
                  .where((o) => _filter == null || o.status == _filter)
                  .toList();
              if (orders.isEmpty) {
                return const AppEmpty(emoji: '📋', title: 'لا يوجد طلبات');
              }
              return ListView.builder(
                padding: const EdgeInsets.all(12),
                itemCount: orders.length,
                itemBuilder: (_, i) => _OrderCard(order: orders[i]),
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _chip(String label, OrderStatus? status) => Padding(
        padding: const EdgeInsets.only(left: 6),
        child: FilterChip(
          label: Text(label, style: const TextStyle(fontSize: 12)),
          selected: _filter == status,
          onSelected: (_) => setState(() => _filter = status),
          selectedColor: AppColors.primary.withValues(alpha: 0.2),
          checkmarkColor: AppColors.primary,
        ),
      );
}

class _OrderCard extends StatelessWidget {
  final Order order;
  const _OrderCard({required this.order});

  @override
  Widget build(BuildContext context) {
    final service = context.read<FirebaseService>();
    final fmt = DateFormat('dd/MM HH:mm');

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header
            Row(children: [
              Text('#${order.orderNumber}',
                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
              const Spacer(),
              StatusBadge(label: order.status.label, color: order.status.color),
            ]),
            const SizedBox(height: 10),
            InfoRow(icon: Icons.restaurant_rounded, text: order.restaurantName, bold: true),
            InfoRow(icon: Icons.person_outline, text: '${order.customerName}  •  ${order.customerPhone}'),
            InfoRow(icon: Icons.location_on_outlined, text: order.deliveryAddress),
            InfoRow(icon: Icons.access_time_rounded, text: fmt.format(order.createdAt)),
            if (order.driverName != null)
              InfoRow(icon: Icons.delivery_dining_rounded, text: 'السائق: ${order.driverName}'),
            const Divider(height: 16),
            // Items
            ...order.items.map((item) => Padding(
                  padding: const EdgeInsets.symmetric(vertical: 2),
                  child: Row(children: [
                    Text(item.emoji),
                    const SizedBox(width: 8),
                    Expanded(child: Text(item.name, style: const TextStyle(fontSize: 13))),
                    Text('x${item.quantity}', style: const TextStyle(fontSize: 13)),
                    const SizedBox(width: 8),
                    Text(formatCurrency(item.subtotal),
                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                  ]),
                )),
            const Divider(height: 16),
            // Financial breakdown
            PriceRow(label: 'إجمالي الوجبات', value: formatCurrency(order.itemsTotal)),
            PriceRow(label: 'رسوم التوصيل', value: formatCurrency(order.deliveryFee)),
            PriceRow(label: 'حصة المنصة (5%)', value: formatCurrency(order.platformCommission),
                color: AppColors.secondary),
            PriceRow(
              label: 'الإجمالي',
              value: formatCurrency(order.grandTotal),
              bold: true,
            ),
            const SizedBox(height: 4),
            Row(children: [
              Icon(order.paymentMethod.icon, size: 14, color: AppColors.textGray),
              const SizedBox(width: 4),
              Text(order.paymentMethod.label,
                  style: const TextStyle(color: AppColors.textGray, fontSize: 12)),
              const Spacer(),
              if (order.isPaid)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: AppColors.success.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Text('مدفوع ✓',
                      style: TextStyle(color: AppColors.success, fontSize: 11)),
                ),
            ]),
            // Rating info
            if (order.isRated) ...[
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: Colors.amber.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Row(children: [
                  const Icon(Icons.star_rounded, color: Colors.amber, size: 16),
                  const SizedBox(width: 6),
                  Text('تقييم العميل: ${order.customerRating?.toStringAsFixed(1)}',
                      style: const TextStyle(fontSize: 12)),
                  if (order.customerReview != null) ...[
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text('• ${order.customerReview}',
                          style: const TextStyle(
                              color: AppColors.textGray, fontSize: 12),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis),
                    ),
                  ],
                ]),
              ),
            ],
            // Actions
            if (order.status.isActive) ...[
              const SizedBox(height: 12),
              _buildActions(context, service),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildActions(BuildContext context, FirebaseService service) {
    switch (order.status) {
      case OrderStatus.pending:
        return Row(children: [
          Expanded(
            child: ElevatedButton.icon(
              onPressed: () => service.updateOrderStatus(order.id, OrderStatus.confirmed),
              icon: const Icon(Icons.check, size: 16),
              label: const Text('تأكيد'),
              style: ElevatedButton.styleFrom(backgroundColor: AppColors.secondary),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: OutlinedButton.icon(
              onPressed: () => service.cancelOrder(order.id),
              icon: const Icon(Icons.close, size: 16),
              label: const Text('رفض'),
              style: OutlinedButton.styleFrom(
                foregroundColor: const Color(0xFFF44336),
                side: const BorderSide(color: Color(0xFFF44336)),
              ),
            ),
          ),
        ]);
      case OrderStatus.confirmed:
        return _fullBtn('بدأ التحضير 🍽️', Colors.purple,
            () => service.updateOrderStatus(order.id, OrderStatus.preparing));
      case OrderStatus.preparing:
        return _fullBtn('جاهز للاستلام ✓', Colors.teal,
            () => service.updateOrderStatus(order.id, OrderStatus.readyForPickup));
      case OrderStatus.readyForPickup:
        return order.driverId == null
            ? _AssignDriverWidget(order: order)
            : _fullBtn('في الطريق 🛵', AppColors.secondary,
                () => service.updateOrderStatus(order.id, OrderStatus.outForDelivery));
      case OrderStatus.outForDelivery:
        return _fullBtn('تم التوصيل ✅', AppColors.success,
            () => service.markOrderDelivered(order.id, order.driverId ?? ''));
      default:
        return const SizedBox();
    }
  }

  Widget _fullBtn(String label, Color color, VoidCallback onTap) =>
      SizedBox(
        width: double.infinity,
        child: ElevatedButton(
          onPressed: onTap,
          style: ElevatedButton.styleFrom(backgroundColor: color),
          child: Text(label),
        ),
      );
}

class _AssignDriverWidget extends StatelessWidget {
  final Order order;
  const _AssignDriverWidget({required this.order});

  @override
  Widget build(BuildContext context) {
    final service = context.read<FirebaseService>();
    return StreamBuilder<List<Driver>>(
      stream: service.streamDrivers(),
      builder: (ctx, snap) {
        if (!snap.hasData) return const SizedBox();
        final available =
            snap.data!.where((d) => d.isAvailable && d.isOnline).toList();
        if (available.isEmpty) {
          return Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: Colors.orange.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Row(children: [
              Icon(Icons.warning_amber_rounded, color: Colors.orange, size: 16),
              SizedBox(width: 8),
              Text('لا يوجد سائقون متاحون الآن',
                  style: TextStyle(color: Colors.orange, fontSize: 13)),
            ]),
          );
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('تعيين سائق:',
                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 6,
              children: available
                  .map((d) => ActionChip(
                        avatar: const Icon(Icons.delivery_dining, size: 16),
                        label: Text('${d.name}  ⭐${d.rating.toStringAsFixed(1)}',
                            style: const TextStyle(fontSize: 12)),
                        onPressed: () =>
                            service.assignDriver(order.id, d.id, d.name),
                        backgroundColor: AppColors.primary.withValues(alpha: 0.1),
                      ))
                  .toList(),
            ),
          ],
        );
      },
    );
  }
}
