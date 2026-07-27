import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../models/models.dart';
import '../../providers/firebase_service.dart';
import '../../providers/auth_provider.dart' as app_auth;
import '../../utils/theme.dart';
import '../../utils/helpers.dart';
import '../../widgets/common_widgets.dart';
import '../auth/login_screen.dart';
import '../customer/order_map_screen.dart';

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
            title: Text('مرحباً ${auth.user?.name ?? ""}'),
            actions: [
              if (driver != null)
                Row(children: [
                  Text(driver.isOnline ? 'متصل' : 'غير متصل',
                      style: TextStyle(color: driver.isOnline ? Colors.greenAccent : Colors.white54, fontSize: 12)),
                  Switch(value: driver.isOnline, onChanged: (v) => service.setDriverOnline(driverId, v),
                      activeColor: Colors.greenAccent),
                ]),
              IconButton(icon: const Icon(Icons.logout), onPressed: () async {
                if (driver != null) await service.setDriverOnline(driverId, false);
                await auth.logout();
                if (mounted) {
                  Navigator.pushAndRemoveUntil(context, MaterialPageRoute(builder: (_) => const LoginScreen()), (_) => false);
                }
              }),
            ],
          ),
          body: IndexedStack(index: _tab, children: [
            _AvailableOrdersTab(driverId: driverId, driver: driver),
            _DriverEarningsTab(driver: driver),
          ]),
          bottomNavigationBar: NavigationBar(selectedIndex: _tab, onDestinationSelected: (i) => setState(() => _tab = i),
            destinations: const [
              NavigationDestination(icon: Icon(Icons.delivery_dining_outlined), selectedIcon: Icon(Icons.delivery_dining), label: 'الطلبات'),
              NavigationDestination(icon: Icon(Icons.account_balance_wallet_outlined), selectedIcon: Icon(Icons.account_balance_wallet), label: 'أرباحي'),
            ]),
        );
      },
    );
  }
}

class _AvailableOrdersTab extends StatelessWidget {
  final String driverId;
  final Driver? driver;
  const _AvailableOrdersTab({required this.driverId, this.driver});

  @override
  Widget build(BuildContext context) {
    final service = context.read<FirebaseService>();

    return StreamBuilder<List<Order>>(
      stream: service.streamAllOrders(),
      builder: (ctx, snap) {
        if (!snap.hasData) return const AppLoading();
        final all = snap.data!;

        final myOrders = all.where((o) => o.driverId == driverId && o.status.isActive).toList();

        final available = all.where((o) =>
            o.driverId == null &&
            (o.status == OrderStatus.pending ||
             o.status == OrderStatus.confirmed ||
             o.status == OrderStatus.preparing ||
             o.status == OrderStatus.readyForPickup)).toList();

        if (myOrders.isEmpty && available.isEmpty) {
          return const AppEmpty(emoji: '📦', title: 'لا توجد طلبات الآن', subtitle: 'تأكد أنك متصل لاستقبال الطلبات');
        }

        return ListView(padding: const EdgeInsets.all(12), children: [
          if (myOrders.isNotEmpty) ...[
            const SectionHeader(title: 'طلباتي النشطة'),
            ...myOrders.map((o) => _OrderCard(order: o, mode: _CardMode.mine)),
            const SizedBox(height: 16),
          ],
          if (available.isNotEmpty) ...[
            const SectionHeader(title: 'طلبات متاحة للقبول'),
            ...available.map((o) => _OrderCard(order: o, mode: _CardMode.available)),
          ],
        ]);
      },
    );
  }
}

enum _CardMode { mine, available }

class _OrderCard extends StatelessWidget {
  final Order order;
  final _CardMode mode;
  const _OrderCard({required this.order, required this.mode});

  @override
  Widget build(BuildContext context) {
    final service = context.read<FirebaseService>();
    final auth = context.read<app_auth.AuthProvider>();

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(color: AppColors.primary.withOpacity(0.1), borderRadius: BorderRadius.circular(8)),
              child: Text('#${order.orderNumber}', style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.primary)),
            ),
            const Spacer(),
            IconButton(
              icon: const Icon(Icons.map_outlined, color: AppColors.secondary),
              onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => OrderMapScreen(order: order))),
              tooltip: 'عرض الخريطة',
            ),
            StatusBadge(label: order.status.label, color: order.status.color, icon: order.status.icon),
          ]),
          const SizedBox(height: 10),
          InfoRow(icon: Icons.restaurant, text: order.restaurantName),
          InfoRow(icon: Icons.person_outline, text: '${order.customerName} — ${order.customerPhone}'),
          InfoRow(icon: Icons.location_on_outlined, text: order.deliveryAddress),
          const Divider(height: 16),
          Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            Text(formatCurrency(order.grandTotal), style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
            Text(order.paymentMethod.label, style: const TextStyle(color: AppColors.textGray, fontSize: 12)),
          ]),
          const SizedBox(height: 12),
          _buildAction(context, service, auth),
        ]),
      ),
    );
  }

  Widget _buildAction(BuildContext ctx, FirebaseService service, app_auth.AuthProvider auth) {
    if (mode == _CardMode.available) {
      return SizedBox(width: double.infinity, child: ElevatedButton.icon(
        onPressed: () async {
          final ok = await showConfirmDialog(ctx, title: 'قبول الطلب', content: 'هل تريد قبول هذا الطلب والتوجه للمطعم؟', confirmLabel: 'قبول');
          if (ok == true) {
            await service.assignDriver(order.id, auth.user!.uid, auth.user!.name);
            if (ctx.mounted) showSuccess(ctx, 'تم قبول الطلب! توجّه للمطعم');
          }
        },
        icon: const Icon(Icons.check_circle_outline),
        label: const Text('قبول الطلب'),
      ));
    }

    if (order.status == OrderStatus.pending || order.status == OrderStatus.confirmed || order.status == OrderStatus.preparing) {
      return const Text('بانتظار تجهيز الطلب من المطعم...', style: TextStyle(color: AppColors.textGray, fontStyle: FontStyle.italic));
    }
    if (order.status == OrderStatus.readyForPickup) {
      return SizedBox(width: double.infinity, child: ElevatedButton.icon(
        onPressed: () async {
          final ok = await showConfirmDialog(ctx, title: 'استلام الطلب', content: 'هل استلمت الطلب من المطعم؟', confirmLabel: 'نعم');
          if (ok == true) await service.updateOrderStatus(order.id, OrderStatus.outForDelivery);
        },
        icon: const Icon(Icons.delivery_dining),
        label: const Text('استلمت الطلب — في الطريق'),
      ));
    }
    if (order.status == OrderStatus.outForDelivery) {
      return SizedBox(width: double.infinity, child: ElevatedButton.icon(
        onPressed: () async {
          final ok = await showConfirmDialog(ctx, title: 'تأكيد التوصيل', content: 'هل تم توصيل الطلب للعميل؟', confirmLabel: 'نعم');
          if (ok == true) {
            await service.markOrderDelivered(order.id, order.driverId ?? '');
            if (ctx.mounted) showSuccess(ctx, 'تم التوصيل! +10 ر.س أرباح');
          }
        },
        style: ElevatedButton.styleFrom(backgroundColor: AppColors.success),
        icon: const Icon(Icons.done_all_rounded),
        label: const Text('تأكيد التوصيل'),
      ));
    }
    return const SizedBox.shrink();
  }
}

class _DriverEarningsTab extends StatelessWidget {
  final Driver? driver;
  const _DriverEarningsTab({this.driver});

  @override
  Widget build(BuildContext context) {
    if (driver == null) return const AppLoading();
    final d = driver!;
    return ListView(padding: const EdgeInsets.all(16), children: [
      Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          gradient: const LinearGradient(colors: [AppColors.primary, Color(0xFFc1121f)]),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('إجمالي أرباحك', style: TextStyle(color: Colors.white70, fontSize: 14)),
          const SizedBox(height: 6),
          Text(formatCurrency(d.totalEarnings), style: const TextStyle(color: Colors.white, fontSize: 30, fontWeight: FontWeight.bold)),
        ]),
      ),
      const SizedBox(height: 20),
      GridView.count(crossAxisCount: 2, shrinkWrap: true, physics: const NeverScrollableScrollPhysics(),
        crossAxisSpacing: 12, mainAxisSpacing: 12, childAspectRatio: 1.5, children: [
        _stat('التوصيلات', '${d.totalDeliveries}', Icons.local_shipping_outlined, AppColors.primary),
        _stat('المستحقات', formatCurrency(d.pendingPayout), Icons.account_balance_wallet_outlined, AppColors.warning),
        _stat('التقييم', d.rating.toStringAsFixed(1), Icons.star_rounded, Colors.amber),
        _stat('الحالة', d.isOnline ? 'متصل' : 'غير متصل', d.isOnline ? Icons.wifi : Icons.wifi_off,
            d.isOnline ? AppColors.success : AppColors.textGray),
      ]),
    ]);
  }

  Widget _stat(String label, String value, IconData icon, Color color) => Card(child: Padding(
    padding: const EdgeInsets.all(16),
    child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
      Icon(icon, color: color, size: 28),
      Text(value, style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: color)),
      Text(label, style: const TextStyle(fontSize: 12)),
    ])));
}