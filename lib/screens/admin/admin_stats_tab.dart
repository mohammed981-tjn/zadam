// lib/screens/admin/admin_stats_tab.dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../../providers/firebase_service.dart';
import '../../models/models.dart';
import '../../utils/theme.dart';
import '../../utils/helpers.dart';
import '../../widgets/common_widgets.dart';

class AdminStatsTab extends StatelessWidget {
  const AdminStatsTab({super.key});

  @override
  Widget build(BuildContext context) {
    final service = context.read<FirebaseService>();
    return StreamBuilder<List<Order>>(
      stream: service.streamAllOrders(),
      builder: (ctx, snap) {
        if (!snap.hasData) return const AppLoading();
        final orders = snap.data!;
        final delivered = orders.where((o) => o.status == OrderStatus.delivered).toList();
        final active = orders.where((o) => o.status.isActive).toList();
        final cancelled = orders.where((o) => o.status == OrderStatus.cancelled).toList();

        double totalRevenue = 0;
        double totalPlatformShare = 0;
        double totalDriverShare = 0;

        for (final o in delivered) {
          totalRevenue += o.grandTotal;
          totalPlatformShare += o.platformCommission;
          totalDriverShare += 10;
        }

        // أوقات الذروة
        final Map<int, int> byHour = {};
        for (final o in orders) {
          final h = o.createdAt.hour;
          byHour[h] = (byHour[h] ?? 0) + 1;
        }
        int peakHour = 0;
        int peakCount = 0;
        byHour.forEach((h, c) {
          if (c > peakCount) { peakCount = c; peakHour = h; }
        });

        // الأصناف الأكثر مبيعاً
        final Map<String, int> itemCount = {};
        for (final o in delivered) {
          for (final item in o.items) {
            itemCount[item.name] = (itemCount[item.name] ?? 0) + item.quantity;
          }
        }
        final topItems = itemCount.entries.toList()
          ..sort((a, b) => b.value.compareTo(a.value));

        return RefreshIndicator(
          onRefresh: () async {},
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              // بطاقة الإيرادات الرئيسية
              GradientBanner(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('إجمالي الإيرادات',
                        style: TextStyle(color: Colors.white70, fontSize: 14)),
                    const SizedBox(height: 6),
                    Text(formatCurrency(totalRevenue),
                        style: const TextStyle(
                            color: Colors.white,
                            fontSize: 30,
                            fontWeight: FontWeight.bold)),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        _miniStat('حصة المنصة (5%)',
                            formatCurrency(totalPlatformShare), Colors.white),
                        const SizedBox(width: 20),
                        _miniStat('مستحقات السائقين',
                            formatCurrency(totalDriverShare), Colors.white70),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),

              // إحصائيات الطلبات
              GridView.count(
                crossAxisCount: 2,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                crossAxisSpacing: 12,
                mainAxisSpacing: 12,
                childAspectRatio: 1.5,
                children: [
                  StatCard(
                    label: 'طلبات نشطة',
                    value: active.length.toString(),
                    icon: Icons.hourglass_empty_rounded,
                    color: const Color(0xFFFF9800),
                  ),
                  StatCard(
                    label: 'إجمالي الطلبات',
                    value: orders.length.toString(),
                    icon: Icons.receipt_long_rounded,
                    color: AppColors.secondary,
                  ),
                  StatCard(
                    label: 'تم التوصيل',
                    value: delivered.length.toString(),
                    icon: Icons.done_all_rounded,
                    color: AppColors.success,
                  ),
                  StatCard(
                    label: 'ملغاة',
                    value: cancelled.length.toString(),
                    icon: Icons.cancel_outlined,
                    color: const Color(0xFFF44336),
                  ),
                ],
              ),
              const SizedBox(height: 16),

              // وقت الذروة
              if (byHour.isNotEmpty)
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: AppColors.primary.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: const Icon(Icons.schedule_rounded,
                              color: AppColors.primary, size: 28),
                        ),
                        const SizedBox(width: 14),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('وقت الذروة',
                                style: TextStyle(
                                    color: AppColors.textGray, fontSize: 13)),
                            Text('${peakHour.toString().padLeft(2, '0')}:00',
                                style: const TextStyle(
                                    fontSize: 22,
                                    fontWeight: FontWeight.bold,
                                    color: AppColors.primary)),
                            Text('$peakCount طلب',
                                style: const TextStyle(
                                    color: AppColors.textGray, fontSize: 12)),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              const SizedBox(height: 16),

              // أكثر الأصناف مبيعاً
              if (topItems.isNotEmpty) ...[
                const SectionHeader(title: 'أكثر الأصناف مبيعاً 🔥'),
                const SizedBox(height: 8),
                ...topItems.take(5).map((e) => Card(
                      margin: const EdgeInsets.only(bottom: 8),
                      child: ListTile(
                        leading: Container(
                          width: 36,
                          height: 36,
                          decoration: BoxDecoration(
                            color: AppColors.primary.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Center(
                            child: Text(
                              '${topItems.indexOf(e) + 1}',
                              style: const TextStyle(
                                  fontWeight: FontWeight.bold,
                                  color: AppColors.primary),
                            ),
                          ),
                        ),
                        title: Text(e.key),
                        trailing: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 12, vertical: 4),
                          decoration: BoxDecoration(
                            color: AppColors.success.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Text('${e.value} وحدة',
                              style: const TextStyle(
                                  color: AppColors.success,
                                  fontWeight: FontWeight.bold,
                                  fontSize: 12)),
                        ),
                      ),
                    )),
              ],

              // الطلبات النشطة الآن
              if (active.isNotEmpty) ...[
                const SizedBox(height: 8),
                const SectionHeader(title: 'الطلبات النشطة الآن'),
                const SizedBox(height: 8),
                ...active.take(5).map((o) => Card(
                      margin: const EdgeInsets.only(bottom: 8),
                      child: ListTile(
                        leading: CircleAvatar(
                          backgroundColor: o.status.color.withValues(alpha: 0.15),
                          child: Icon(o.status.icon, color: o.status.color, size: 20),
                        ),
                        title: Text('#${o.orderNumber}  •  ${o.restaurantName}'),
                        subtitle: Text(o.customerName),
                        trailing: StatusBadge(
                          label: o.status.label,
                          color: o.status.color,
                          small: true,
                        ),
                      ),
                    )),
              ],
            ],
          ),
        );
      },
    );
  }

  Widget _miniStat(String label, String value, Color color) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: TextStyle(color: color.withValues(alpha: 0.8), fontSize: 11)),
          Text(value, style: TextStyle(color: color, fontWeight: FontWeight.bold, fontSize: 14)),
        ],
      );
}
