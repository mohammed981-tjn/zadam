// lib/screens/customer/cart_screen.dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:uuid/uuid.dart';
import 'package:latlong2/latlong.dart';
import '../../models/models.dart';
import '../../providers/cart_provider.dart';
import '../../providers/auth_provider.dart' as app_auth;
import '../../providers/firebase_service.dart';
import '../../utils/theme.dart';
import '../../utils/helpers.dart';
import '../../widgets/common_widgets.dart';
import '../admin/pick_location_screen.dart';
import 'my_orders_screen.dart';

class CartScreen extends StatelessWidget {
  const CartScreen({super.key});
  @override
  Widget build(BuildContext context) {
    final cart = context.watch<CartProvider>();
    return Scaffold(
      appBar: AppBar(title: const Text('السلة')),
      body: cart.isEmpty
          ? const AppEmpty(emoji: '🛒', title: 'السلة فارغة')
          : Column(children: [
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    ...cart.items.map((ci) => Padding(
                          padding: const EdgeInsets.symmetric(vertical: 6),
                          child: Row(children: [
                            Text(ci.item.emoji, style: const TextStyle(fontSize: 26)),
                            const SizedBox(width: 10),
                            Expanded(child: Text(ci.item.name)),
                            IconButton(
                                icon: const Icon(Icons.remove),
                                onPressed: () => context.read<CartProvider>().remove(ci.item.id)),
                            Text('${ci.quantity}'),
                            IconButton(
                                icon: const Icon(Icons.add),
                                onPressed: () => context.read<CartProvider>().add(
                                    ci.item,
                                    cart.restaurantId!,
                                    cart.restaurantName!,
                                    cart.restaurantEmoji ?? '🍽️',
                                    cart.deliveryFee)),
                            Text(formatCurrency(ci.subtotal),
                                style: const TextStyle(fontWeight: FontWeight.bold)),
                          ]),
                        )),
                    const Divider(),
                    PriceRow(label: 'المجموع', value: formatCurrency(cart.itemsTotal)),
                    PriceRow(label: 'التوصيل', value: formatCurrency(cart.deliveryFee)),
                    PriceRow(label: 'الضريبة 15%', value: formatCurrency(cart.vat)),
                    const Divider(),
                    PriceRow(
                        label: 'الإجمالي',
                        value: formatCurrency(cart.grandTotalWithVat),
                        bold: true),
                  ],
                ),
              ),
              SafeArea(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: SizedBox(
                    width: double.infinity,
                    height: 52,
                    child: ElevatedButton(
                      onPressed: () => Navigator.push(
                          context, MaterialPageRoute(builder: (_) => const CheckoutScreen())),
                      child: Text(
                          'المتابعة للدفع — ${formatCurrency(cart.grandTotalWithVat)}'),
                    ),
                  ),
                ),
              ),
            ]),
    );
  }
}

class CheckoutScreen extends StatefulWidget {
  const CheckoutScreen({super.key});
  @override
  State<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends State<CheckoutScreen> {
  final _addrCtrl = TextEditingController();
  PaymentMethod _payment = PaymentMethod.cash;
  bool _loading = false;
  double? _lat, _lng;

  Future<void> _pickLocation() async {
    final result = await Navigator.push<LatLng>(
      context,
      MaterialPageRoute(
        builder: (_) => PickLocationScreen(
          initialLocation: _lat != null && _lng != null ? LatLng(_lat!, _lng!) : null,
        ),
      ),
    );
    if (result != null) {
      setState(() {
        _lat = result.latitude;
        _lng = result.longitude;
      });
    }
  }

  Future<void> _placeOrder() async {
    if (_addrCtrl.text.trim().isEmpty) {
      showError(context, 'أدخل عنوان التوصيل');
      return;
    }
    if (_lat == null || _lng == null) {
      showError(context, 'حدد موقعك على الخريطة');
      return;
    }

    setState(() => _loading = true);
    final cart = context.read<CartProvider>();
    final auth = context.read<app_auth.AuthProvider>();
    final service = context.read<FirebaseService>();
    final user = auth.user!;
    const uuid = Uuid();
    final orderId = uuid.v4();

    final restaurant = await service.getRestaurantOnce(cart.restaurantId!);

    final order = Order(
      id: orderId,
      restaurantId: cart.restaurantId!,
      restaurantName: cart.restaurantName!,
      customerId: user.uid,
      customerName: user.name,
      customerPhone: user.phone,
      deliveryAddress: _addrCtrl.text.trim(),
      items: cart.toOrderItems(),
      paymentMethod: _payment,
      isPaid: _payment != PaymentMethod.cash,
      createdAt: DateTime.now(),
      deliveryFee: cart.deliveryFee,
      orderNumber: orderId.substring(0, 6).toUpperCase(),
      platformCommission: cart.platformCommission,
      deliveryLat: _lat,
      deliveryLng: _lng,
      restaurantLat: restaurant?.lat,
      restaurantLng: restaurant?.lng,
    );
    try {
      await service.placeOrder(order);
      cart.clear();
      if (!mounted) return;
      Navigator.pushAndRemoveUntil(
          context, MaterialPageRoute(builder: (_) => const MyOrdersScreen()), (r) => r.isFirst);
      showSuccess(context, 'تم إرسال طلبك بنجاح!');
    } catch (e) {
      setState(() => _loading = false);
      if (mounted) showError(context, 'فشل إرسال الطلب');
    }
  }

  @override
  Widget build(BuildContext context) {
    final cart = context.watch<CartProvider>();
    return Scaffold(
      appBar: AppBar(title: const Text('إتمام الطلب')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          TextField(
            controller: _addrCtrl,
            maxLines: 2,
            decoration: const InputDecoration(
                hintText: 'عنوان التوصيل بالتفصيل',
                prefixIcon: Icon(Icons.location_on_outlined)),
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: _pickLocation,
            icon: Icon(_lat != null ? Icons.check_circle : Icons.map_outlined,
                color: _lat != null ? AppColors.success : null),
            label: Text(_lat != null
                ? 'الموقع محدد ✓ (اضغط للتعديل)'
                : 'حدد موقعك على الخريطة'),
          ),
          const SizedBox(height: 20),
          const Text('طريقة الدفع', style: TextStyle(fontWeight: FontWeight.bold)),
          ...PaymentMethod.values.map((p) => RadioListTile<PaymentMethod>(
                value: p,
                groupValue: _payment,
                onChanged: (v) => setState(() => _payment = v!),
                title: Text(p.label),
              )),
          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            height: 52,
            child: ElevatedButton(
              onPressed: _loading ? null : _placeOrder,
              child: _loading
                  ? const CircularProgressIndicator(color: Colors.white)
                  : const Text('تأكيد الطلب'),
            ),
          ),
        ],
      ),
    );
  }
}
