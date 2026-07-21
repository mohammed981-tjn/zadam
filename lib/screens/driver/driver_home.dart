// lib/screens/driver/driver_home.dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../models/models.dart';
import '../../providers/firebase_service.dart';
import '../../providers/auth_provider.dart' as app_auth;
import '../../utils/theme.dart';
import '../../utils/helpers.dart';
import '../../widgets/common_widgets.dart';
import '../auth/login_screen.dart';

class DriverHome extends StatefulWidget {
  const DriverHome({super.key});
  @override
  State<DriverHome> createState() => _DriverHomeState();
}

class _DriverHomeState extends State<DriverHome> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<app_auth.AuthProvider>();
    final service = context.read<FirebaseService>();
    final driverId = auth.user?.uid ?? '';

    return StreamBuilder<Driver?>(
      stream: service.streamDriver(driverId),
      builder: (ctx, snap) {
        final driver = snap.data;
        return Scaffold(
          appBar: AppBar(
            title: Text('مرحباً ${auth.user?.name ?? ""} 🛵'),
            actions: [
              if (driver != null)
                Row(
                  children: [
                    Text(
                      driver.isOnline ? 'متصل' : 'غير متصل',
                      style: TextStyle(
                        color: driver.isOnline
                            ? Colors.greenAccent
                            : Colors.white54,
                        fontSize: 12,
                      ),
                    ),
                    Switch(
                      value: driver.isOnline,
                      onChanged: (v) => service.setDriverOnline(driverId, v),
                      activeThumbColor: Colors.greenAccent,
                    ),
                  ],
                ),
              IconButton(
                icon: const Icon(Icons.logout),
                onPressed: () async {
                  if (driver != null) {
                    await service.setDriverOnline(driverId, false);
                  }
                  await auth.logout();
                  if (mounted) {
                    Navigator.pushAndRemoveUntil(
                      context,
                      MaterialPageRoute(builder: (_) => const LoginScreen()),
                      (_) => false,
                    );
                  }
                },
              ),
            ],
          ),
          body: IndexedStack(
            index: _tab,
            children: [
              _DriverOrdersTab(driverId: driverId),
              _DriverEarningsTab(driverId: driverId, driver: driver),
              _DriverProfileTab(driver: driver, driverId: driverId),
            ],
          ),
          bottomNavigationBar: NavigationBar(
            selectedIndex: _tab,
            onDestinationSelected: (i) => setState(() => _tab = i),
            destinations: const [
              NavigationDestination(
                icon: Icon(Icons.delivery_dining_outlined),
                selectedIcon: Icon(Icons.delivery_dining),
                label: 'طلباتي',
              ),
              NavigationDestination(
                icon: Icon(Icons.account_balance_wallet_outlined),
                selectedIcon: Icon(Icons.account_balance_wallet),
                label: 'أرباحي',
              ),
              NavigationDestination(
                icon: Icon(Icons.person_outline),
                selectedIcon: Icon(Icons.person),
                label: 'حسابي',
              ),
            ],
          ),
        );
      },
    );
  }
}

// ── Driver Orders Tab ──────────────────────────────────────
class _DriverOrdersTab extends StatefulWidget {
  final String driverId;
  const _DriverOrdersTab({required this.driverId});
  @override
  State<_DriverOrdersTab> createState() => _DriverOrdersTabState();
}

class _DriverOrdersTabState extends State<_DriverOrdersTab>
    with SingleTickerProviderStateMixin {
  late TabController _tc;

  @override
  void initState() {
    super.initState();
    _tc = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tc.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final service = context.read<FirebaseService>();
    return Column(
      children: [
        TabBar(
          controller: _tc,
          labelColor: AppColors.primary,
          indicatorColor: AppColors.primary,
          tabs: const [Tab(text: 'النشطة'), Tab(text: 'السابقة')],
        ),
        Expanded(
          child: StreamBuilder<List<Order>>(
            stream: service.streamDriverOrders(widget.driverId),
            builder: (ctx, snap) {
              if (snap.connectionState == ConnectionState.waiting) {
                return const AppLoading();
              }
              final all = snap.data ?? [];
              final active = all.where((o) => o.status.isActive).toList();
              final past = all.where((o) => !o.status.isActive).toList();

              return TabBarView(
                controller: _tc,
                children: [
                  _buildList(context, active, true),
                  _buildList(context, past, false),
                ],
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildList(BuildContext ctx, List<Order> orders, bool isActive) {
    if (orders.isEmpty) {
      return AppEmpty(
        emoji: isActive ? '📦' : '📋',
        title: isActive ? 'لا توجد طلبات نشطة' : 'لا توجد طلبات سابقة',
        subtitle: isActive ? 'تأكد أنك متصل لاستقبال الطلبات' : null,
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.all(12),
      itemCount: orders.length,
      itemBuilder: (_, i) => _DriverOrderCard(order: orders[i], isActive: isActive),
    );
  }
}

class _DriverOrderCard extends StatelessWidget {
  final Order order;
  final bool isActive;
  const _DriverOrderCard({required this.order, required this.isActive});

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
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppColors.primary.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text('#${order.orderNumber}',
                      style: const TextStyle(
                          fontWeight: FontWeight.bold,
                          color: AppColors.primary)),
                ),
                const Spacer(),
                StatusBadge(
                    label: order.status.label,
                    color: order.status.color,
                    icon: order.status.icon),
              ],
            ),
            const SizedBox(height: 10),
            InfoRow(icon: Icons.restaurant_rounded,
                text: order.restaurantName, bold: true),
            InfoRow(icon: Icons.person_outline,
                text: '${order.customerName} — ${order.customerPhone}'),
            InfoRow(icon: Icons.location_on_outlined,
                text: order.deliveryAddress),
            InfoRow(icon: Icons.access_time,
                text: formatDateTime(order.createdAt)),
            const Divider(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(formatCurrency(order.grandTotal),
                    style: const TextStyle(
                        fontWeight: FontWeight.bold, fontSize: 15)),
                Text(order.paymentMethod.label,
                    style: const TextStyle(
                        color: AppColors.textGray, fontSize: 12)),
              ],
            ),
            if (isActive) ...[
              const SizedBox(height: 12),
              _buildActions(context, service),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildActions(BuildContext ctx, FirebaseService service) {
    if (order.status == OrderStatus.readyForPickup) {
      return SizedBox(
        width: double.infinity,
        child: ElevatedButton.icon(
          onPressed: () => _confirm(ctx, 'استلام الطلب',
              'هل استلمت الطلب من المطعم؟', () async {
            await service.updateOrderStatus(
                order.id, OrderStatus.outForDelivery);
          }),
          icon: const Icon(Icons.delivery_dining),
          label: const Text('استلمت الطلب — في الطريق'),
        ),
      );
    }
    if (order.status == OrderStatus.outForDelivery) {
      return Column(
        children: [
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: () => showInfo(ctx, 'رقم العميل: ${order.customerPhone}'),
              icon: const Icon(Icons.phone_outlined),
              label: const Text('الاتصال بالعميل'),
            ),
          ),
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: () => _confirm(ctx, 'تأكيد التوصيل',
                  'هل تم توصيل الطلب للعميل؟', () async {
                await service.markOrderDelivered(
                    order.id, order.driverId ?? '');
                if (ctx.mounted) {
                  showSuccess(ctx, 'تم التوصيل! +10 ر.س أرباح 🎉');
                }
              }),
              icon: const Icon(Icons.done_all_rounded),
              label: const Text('تأكيد التوصيل ✓'),
              style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.success),
            ),
          ),
        ],
      );
    }
    return const SizedBox.shrink();
  }

  void _confirm(BuildContext ctx, String title, String content,
      Future<void> Function() action) async {
    final ok = await showConfirmDialog(ctx,
        title: title, content: content, confirmLabel: 'نعم');
    if (ok == true) await action();
  }
}

// ── Driver Earnings Tab ────────────────────────────────────
class _DriverEarningsTab extends StatelessWidget {
  final String driverId;
  final Driver? driver;
  const _DriverEarningsTab({required this.driverId, this.driver});

  @override
  Widget build(BuildContext context) {
    if (driver == null) return const AppLoading();
    final d = driver!;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        GradientBanner(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('إجمالي أرباحك',
                  style: TextStyle(color: Colors.white70, fontSize: 14)),
              const SizedBox(height: 6),
              Text(formatCurrency(d.totalEarnings),
                  style: const TextStyle(
                      color: Colors.white,
                      fontSize: 32,
                      fontWeight: FontWeight.bold)),
              const SizedBox(height: 12),
              Row(
                children: [
                  _chip('المستحقات', formatCurrency(d.pendingPayout),
                      Colors.orangeAccent),
                  const SizedBox(width: 12),
                  _chip('التوصيلات',
                      '${d.totalDeliveries}', Colors.greenAccent),
                  const SizedBox(width: 12),
                  _chip('التقييم',
                      '${d.rating.toStringAsFixed(1)} ⭐', Colors.white),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          crossAxisSpacing: 12,
          mainAxisSpacing: 12,
          childAspectRatio: 1.6,
          children: [
            StatCard(
              label: 'التوصيلات الكلية',
              value: '${d.totalDeliveries}',
              icon: Icons.local_shipping_outlined,
              color: AppColors.primary,
            ),
            StatCard(
              label: 'المستحقات',
              value: formatCurrency(d.pendingPayout),
              icon: Icons.account_balance_wallet_outlined,
              color: AppColors.warning,
            ),
            StatCard(
              label: 'التقييم',
              value: d.rating.toStringAsFixed(1),
              icon: Icons.star_rounded,
              color: Colors.amber,
              subtitle: '${d.ratingCount} تقييم',
            ),
            StatCard(
              label: 'الحالة',
              value: d.isOnline ? 'متصل' : 'غير متصل',
              icon: d.isOnline ? Icons.wifi : Icons.wifi_off,
              color: d.isOnline ? AppColors.success : AppColors.textGray,
            ),
          ],
        ),
      ],
    );
  }

  Widget _chip(String label, String value, Color color) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.2),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label,
                style:
                    const TextStyle(color: Colors.white70, fontSize: 10)),
            Text(value,
                style: TextStyle(
                    color: color,
                    fontWeight: FontWeight.bold,
                    fontSize: 13)),
          ],
        ),
      );
}

// ── Driver Profile Tab ─────────────────────────────────────
class _DriverProfileTab extends StatelessWidget {
  final Driver? driver;
  final String driverId;
  const _DriverProfileTab({this.driver, required this.driverId});

  @override
  Widget build(BuildContext context) {
    if (driver == null) return const AppLoading();
    final d = driver!;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Center(
          child: Column(
            children: [
              CircleAvatar(
                radius: 50,
                backgroundColor: AppColors.primary.withValues(alpha: 0.1),
                child: Text(
                  d.name.isNotEmpty ? d.name[0] : '?',
                  style: const TextStyle(
                      fontSize: 40, color: AppColors.primary),
                ),
              ),
              const SizedBox(height: 12),
              Text(d.name,
                  style: const TextStyle(
                      fontSize: 22, fontWeight: FontWeight.bold)),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.star_rounded,
                      color: Colors.amber, size: 18),
                  Text(' ${d.rating.toStringAsFixed(1)}  (${d.ratingCount} تقييم)',
                      style:
                          const TextStyle(color: AppColors.textGray)),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 24),
        Card(
          child: Column(
            children: [
              _tile(Icons.phone_outlined, 'رقم الهاتف', d.phone),
              const Divider(height: 0),
              _tile(Icons.directions_car_outlined, 'نوع المركبة', d.vehicleType),
              if (d.vehiclePlate.isNotEmpty) ...[
                const Divider(height: 0),
                _tile(Icons.pin_outlined, 'رقم اللوحة', d.vehiclePlate),
              ],
              const Divider(height: 0),
              _tile(
                d.isOnline ? Icons.wifi : Icons.wifi_off,
                'الحالة',
                d.isOnline ? 'متصل' : 'غير متصل',
                color: d.isOnline ? AppColors.success : AppColors.textGray,
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        Card(
          child: Column(
            children: [
              _tile(Icons.local_shipping_outlined, 'إجمالي التوصيلات',
                  '${d.totalDeliveries} توصيلة'),
              const Divider(height: 0),
              _tile(Icons.account_balance_wallet_outlined, 'إجمالي الأرباح',
                  formatCurrency(d.totalEarnings)),
              const Divider(height: 0),
              _tile(Icons.pending_outlined, 'المستحقات',
                  formatCurrency(d.pendingPayout),
                  color: d.pendingPayout > 0 ? AppColors.warning : null),
            ],
          ),
        ),
      ],
    );
  }

  Widget _tile(IconData icon, String label, String value, {Color? color}) =>
      ListTile(
        leading: Icon(icon, color: color ?? AppColors.primary),
        title: Text(label,
            style: const TextStyle(color: AppColors.textGray, fontSize: 13)),
        trailing: Text(value,
            style: TextStyle(
                fontWeight: FontWeight.bold, color: color, fontSize: 14)),
      );
}
