// lib/screens/customer/customer_home.dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:badges/badges.dart' as badges;
import '../../models/models.dart';
import '../../providers/firebase_service.dart';
import '../../providers/auth_provider.dart' as app_auth;
import '../../providers/cart_provider.dart';
import '../../utils/theme.dart';
import '../../utils/helpers.dart';
import '../../widgets/common_widgets.dart';
import '../auth/login_screen.dart';
import 'restaurant_detail_screen.dart';
import 'cart_screen.dart';
import 'my_orders_screen.dart';

class CustomerHome extends StatefulWidget {
  const CustomerHome({super.key});
  @override
  State<CustomerHome> createState() => _CustomerHomeState();
}

class _CustomerHomeState extends State<CustomerHome> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<app_auth.AuthProvider>();
    final cart = context.watch<CartProvider>();
    return Scaffold(
      appBar: AppBar(
        title: Text('مرحباً ${auth.user?.name ?? ""} 👋'),
        actions: [
          badges.Badge(
            showBadge: cart.itemCount > 0,
            badgeContent: Text('${cart.itemCount}',
                style: const TextStyle(color: Colors.white, fontSize: 10)),
            child: IconButton(
              icon: const Icon(Icons.shopping_cart_outlined),
              onPressed: () => Navigator.push(context,
                  MaterialPageRoute(builder: (_) => const CartScreen())),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () async {
              final ok = await showConfirmDialog(context,
                  title: 'تسجيل الخروج',
                  content: 'هل تريد تسجيل الخروج؟',
                  confirmLabel: 'خروج',
                  confirmColor: Colors.red);
              if (ok == true && mounted) {
                await auth.logout();
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
        children: const [_RestaurantsPage(), MyOrdersScreen()],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: const [
          NavigationDestination(
              icon: Icon(Icons.restaurant_outlined),
              selectedIcon: Icon(Icons.restaurant),
              label: 'المطاعم'),
          NavigationDestination(
              icon: Icon(Icons.receipt_long_outlined),
              selectedIcon: Icon(Icons.receipt_long),
              label: 'طلباتي'),
        ],
      ),
    );
  }
}

class _RestaurantsPage extends StatelessWidget {
  const _RestaurantsPage();

  @override
  Widget build(BuildContext context) {
    final service = context.read<FirebaseService>();
    return StreamBuilder<List<Restaurant>>(
      stream: service.streamRestaurants(),
      builder: (ctx, snap) {
        if (snap.connectionState == ConnectionState.waiting) {
          return const AppLoading(message: 'جاري تحميل المطاعم...');
        }
        final restaurants = snap.data ?? [];
        if (restaurants.isEmpty) {
          return const AppEmpty(
              emoji: '🍽️', title: 'لا يوجد مطاعم', subtitle: 'تحقق لاحقاً');
        }
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            GradientBanner(
              child: Row(
                children: [
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('عندك جوع؟ 🍽️',
                            style: TextStyle(
                                color: Colors.white,
                                fontSize: 20,
                                fontWeight: FontWeight.bold)),
                        SizedBox(height: 4),
                        Text('اطلب من أفضل المطاعم',
                            style:
                                TextStyle(color: Colors.white70, fontSize: 13)),
                      ],
                    ),
                  ),
                  const Text('🛵', style: TextStyle(fontSize: 48)),
                ],
              ),
            ),
            const SizedBox(height: 20),
            const SectionHeader(title: 'المطاعم المتاحة'),
            const SizedBox(height: 12),
            ...restaurants.map((r) => _RestaurantCard(restaurant: r)),
          ],
        );
      },
    );
  }
}

class _RestaurantCard extends StatelessWidget {
  final Restaurant restaurant;
  const _RestaurantCard({required this.restaurant});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: restaurant.isOpen
            ? () => Navigator.push(
                context,
                MaterialPageRoute(
                    builder: (_) =>
                        RestaurantDetailScreen(restaurant: restaurant)))
            : null,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Container(
                width: 68,
                height: 68,
                decoration: BoxDecoration(
                  color: AppColors.primary.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Center(
                    child: Text(restaurant.emoji,
                        style: const TextStyle(fontSize: 34))),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                            child: Text(restaurant.name,
                                style: const TextStyle(
                                    fontWeight: FontWeight.bold, fontSize: 15))),
                        StatusBadge(
                            label: restaurant.isOpen ? 'مفتوح' : 'مغلق',
                            color: restaurant.isOpen
                                ? AppColors.success
                                : AppColors.textGray),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(restaurant.description,
                        style: const TextStyle(
                            color: AppColors.textGray, fontSize: 12),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        const Icon(Icons.timer_outlined,
                            size: 13, color: AppColors.textGray),
                        const SizedBox(width: 3),
                        Text('${restaurant.estimatedTimeMin} د',
                            style: const TextStyle(
                                fontSize: 11, color: AppColors.textGray)),
                        const SizedBox(width: 10),
                        const Icon(Icons.delivery_dining,
                            size: 13, color: AppColors.textGray),
                        const SizedBox(width: 3),
                        Text(formatCurrency(restaurant.deliveryFee),
                            style: const TextStyle(
                                fontSize: 11, color: AppColors.textGray)),
                        const SizedBox(width: 10),
                        const Icon(Icons.star_rounded,
                            size: 13, color: Colors.amber),
                        const SizedBox(width: 3),
                        Text(restaurant.rating.toStringAsFixed(1),
                            style: const TextStyle(
                                fontSize: 11, color: AppColors.textGray)),
                      ],
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right, color: AppColors.textGray),
            ],
          ),
        ),
      ),
    );
  }
}
