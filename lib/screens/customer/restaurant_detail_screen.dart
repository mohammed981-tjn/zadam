// lib/screens/customer/restaurant_detail_screen.dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:badges/badges.dart' as badges;
import '../../models/models.dart';
import '../../providers/firebase_service.dart';
import '../../providers/cart_provider.dart';
import '../../utils/theme.dart';
import '../../utils/helpers.dart';
import '../../widgets/common_widgets.dart';
import 'cart_screen.dart';

class RestaurantDetailScreen extends StatelessWidget {
  final Restaurant restaurant;
  const RestaurantDetailScreen({super.key, required this.restaurant});

  @override
  Widget build(BuildContext context) {
    final service = context.read<FirebaseService>();
    final cart = context.watch<CartProvider>();

    return Scaffold(
      appBar: AppBar(
        title: Text(restaurant.name),
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
        ],
      ),
      body: StreamBuilder<List<MenuCategory>>(
        stream: service.streamCategories(restaurant.id),
        builder: (ctx, catSnap) {
          return StreamBuilder<List<MenuItem>>(
            stream: service.streamMenuItems(restaurant.id),
            builder: (ctx2, itemSnap) {
              if (catSnap.connectionState == ConnectionState.waiting ||
                  itemSnap.connectionState == ConnectionState.waiting) {
                return const AppLoading(message: 'جاري تحميل القائمة...');
              }
              final cats = catSnap.data ?? [];
              final allItems = itemSnap.data ?? [];

              return ListView(
                children: [
                  // Info banner
                  Container(
                    padding: const EdgeInsets.all(14),
                    color: AppColors.primary.withValues(alpha: 0.05),
                    child: Row(
                      children: [
                        Text(restaurant.emoji,
                            style: const TextStyle(fontSize: 40)),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(restaurant.description,
                                  style: const TextStyle(fontSize: 13)),
                              const SizedBox(height: 4),
                              Row(
                                children: [
                                  const Icon(Icons.timer_outlined,
                                      size: 13, color: AppColors.textGray),
                                  const SizedBox(width: 3),
                                  Text('${restaurant.estimatedTimeMin} دقيقة',
                                      style: const TextStyle(
                                          fontSize: 11,
                                          color: AppColors.textGray)),
                                  const SizedBox(width: 10),
                                  const Icon(Icons.delivery_dining,
                                      size: 13, color: AppColors.textGray),
                                  const SizedBox(width: 3),
                                  Text(formatCurrency(restaurant.deliveryFee),
                                      style: const TextStyle(
                                          fontSize: 11,
                                          color: AppColors.textGray)),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                  // Categories + items
                  ...cats.map((cat) {
                    final catItems = allItems
                        .where((i) =>
                            i.categoryId == cat.id && i.canOrder)
                        .toList();
                    if (catItems.isEmpty) return const SizedBox.shrink();
                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Padding(
                          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                          child: Text(cat.name,
                              style: const TextStyle(
                                  fontSize: 17,
                                  fontWeight: FontWeight.bold)),
                        ),
                        ...catItems.map((item) =>
                            _MenuItemTile(item: item, restaurant: restaurant)),
                      ],
                    );
                  }),
                  const SizedBox(height: 80),
                ],
              );
            },
          );
        },
      ),
      bottomNavigationBar: cart.restaurantId == restaurant.id &&
              cart.itemCount > 0
          ? SafeArea(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: ElevatedButton(
                  onPressed: () => Navigator.push(context,
                      MaterialPageRoute(builder: (_) => const CartScreen())),
                  child: Text(
                      'عرض السلة  •  ${cart.itemCount} صنف  •  ${formatCurrency(cart.itemsTotal)}'),
                ),
              ),
            )
          : null,
    );
  }
}

class _MenuItemTile extends StatelessWidget {
  final MenuItem item;
  final Restaurant restaurant;
  const _MenuItemTile({required this.item, required this.restaurant});

  @override
  Widget build(BuildContext context) {
    final cart = context.watch<CartProvider>();
    final qty = cart.quantityOf(item.id);

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
              color: Colors.black.withValues(alpha: 0.04),
              blurRadius: 6,
              offset: const Offset(0, 2))
        ],
      ),
      child: Row(
        children: [
          Container(
            width: 60,
            height: 60,
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Center(
                child: Text(item.emoji,
                    style: const TextStyle(fontSize: 28))),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(item.name,
                    style: const TextStyle(
                        fontWeight: FontWeight.bold, fontSize: 14)),
                const SizedBox(height: 3),
                Text(item.description,
                    style: const TextStyle(
                        color: AppColors.textGray, fontSize: 12),
                    maxLines: 2),
                const SizedBox(height: 6),
                Row(
                  children: [
                    Text(formatCurrency(item.price),
                        style: const TextStyle(
                            color: AppColors.primary,
                            fontWeight: FontWeight.bold,
                            fontSize: 14)),
                    if (item.trackStock &&
                        item.stockQuantity != null) ...[
                      const SizedBox(width: 8),
                      Text('متبقي: ${item.stockQuantity}',
                          style: TextStyle(
                              fontSize: 11,
                              color: item.stockQuantity! <= 5
                                  ? Colors.red
                                  : AppColors.textGray)),
                    ],
                  ],
                ),
              ],
            ),
          ),
          if (qty == 0)
            ElevatedButton(
              onPressed: () => context.read<CartProvider>().add(
                    item,
                    restaurant.id,
                    restaurant.name,
                    restaurant.emoji,
                    restaurant.deliveryFee,
                  ),
              style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 14, vertical: 8),
                  minimumSize: Size.zero),
              child: const Text('أضف'),
            )
          else
            Row(
              children: [
                _circleBtn(Icons.remove,
                    () => context.read<CartProvider>().remove(item.id)),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  child: Text('$qty',
                      style: const TextStyle(
                          fontWeight: FontWeight.bold, fontSize: 16)),
                ),
                _circleBtn(
                    Icons.add,
                    () => context.read<CartProvider>().add(
                          item,
                          restaurant.id,
                          restaurant.name,
                          restaurant.emoji,
                          restaurant.deliveryFee,
                        )),
              ],
            ),
        ],
      ),
    );
  }

  Widget _circleBtn(IconData icon, VoidCallback onTap) => GestureDetector(
        onTap: onTap,
        child: Container(
          width: 30,
          height: 30,
          decoration: BoxDecoration(
              color: AppColors.primary,
              borderRadius: BorderRadius.circular(8)),
          child: Icon(icon, color: Colors.white, size: 18),
        ),
      );
}
