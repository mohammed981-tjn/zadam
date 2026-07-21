// lib/screens/customer/cart_screen.dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:uuid/uuid.dart';
import '../../models/models.dart';
import '../../providers/cart_provider.dart';
import '../../providers/auth_provider.dart' as app_auth;
import '../../providers/firebase_service.dart';
import '../../utils/theme.dart';
import '../../utils/helpers.dart';
import '../../widgets/common_widgets.dart';
import 'order_tracking_screen.dart';

class CartScreen extends StatelessWidget {
  const CartScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final cart = context.watch<CartProvider>();
    return Scaffold(
      appBar: AppBar(
        title: const Text('السلة'),
        actions: [
          if (!cart.isEmpty)
            TextButton(
              onPressed: () async {
                final ok = await showConfirmDialog(
                  context,
                  title: 'إفراغ السلة',
                  content: 'هل تريد إفراغ السلة؟',
                  confirmLabel: 'نعم',
                  confirmColor: Colors.red,
                );
                if (ok == true) cart.clear();
              },
              child: const Text('إفراغ',
                  style: TextStyle(color: Colors.white)),
            ),
        ],
      ),
      body: cart.isEmpty
          ? const AppEmpty(
              emoji: '🛒',
              title: 'السلة فارغة',
              subtitle: 'أضف بعض الأصناف من المطاعم')
          : Column(
              children: [
                Expanded(
                  child: ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      // Restaurant info
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: AppColors.primary.withValues(alpha: 0.08),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Row(
                          children: [
                            Text(cart.restaurantEmoji ?? '🍽️',
                                style: const TextStyle(fontSize: 28)),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text(cart.restaurantName ?? '',
                                  style: const TextStyle(
                                      fontWeight: FontWeight.bold,
                                      fontSize: 15)),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 16),
                      // Items
                      ...cart.items.map((ci) => _CartItemTile(cartItem: ci)),
                      const Divider(height: 32),
                      // Price breakdown
                      PriceRow(label: 'مجموع الأصناف',
                          value: formatCurrency(cart.itemsTotal)),
                      PriceRow(label: 'رسوم التوصيل',
                          value: formatCurrency(cart.deliveryFee)),
                      PriceRow(label: 'ضريبة القيمة المضافة 15%',
                          value: formatCurrency(cart.vat)),
                      const Divider(),
                      PriceRow(
                        label: 'الإجمالي شامل الضريبة',
                        value: formatCurrency(cart.grandTotalWithVat),
                        bold: true,
                        color: AppColors.primary,
                      ),
                      const SizedBox(height: 80),
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
                        onPressed: () => Navigator.push(context,
                            MaterialPageRoute(
                                builder: (_) => const CheckoutScreen())),
                        child: Text(
                            'المتابعة للدفع — ${formatCurrency(cart.grandTotalWithVat)}'),
                      ),
                    ),
                  ),
                ),
              ],
            ),
    );
  }
}

class _CartItemTile extends StatelessWidget {
  final CartItem cartItem;
  const _CartItemTile({required this.cartItem});

  @override
  Widget build(BuildContext context) {
    final cart = context.read<CartProvider>();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Text(cartItem.item.emoji,
              style: const TextStyle(fontSize: 30)),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(cartItem.item.name,
                    style: const TextStyle(
                        fontWeight: FontWeight.bold, fontSize: 14)),
                Text(formatCurrency(cartItem.item.price),
                    style: const TextStyle(
                        color: AppColors.textGray, fontSize: 12)),
              ],
            ),
          ),
          Row(
            children: [
              _iconBtn(Icons.remove, () => cart.remove(cartItem.item.id)),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: Text('${cartItem.quantity}',
                    style: const TextStyle(
                        fontWeight: FontWeight.bold, fontSize: 16)),
              ),
              _iconBtn(Icons.add, () => cart.add(
                    cartItem.item,
                    cart.restaurantId!,
                    cart.restaurantName!,
                    cart.restaurantEmoji ?? '🍽️',
                    cart.deliveryFee,
                  )),
            ],
          ),
          const SizedBox(width: 10),
          Text(formatCurrency(cartItem.subtotal),
              style: const TextStyle(
                  fontWeight: FontWeight.bold,
                  color: AppColors.primary)),
        ],
      ),
    );
  }

  Widget _iconBtn(IconData icon, VoidCallback onTap) => GestureDetector(
        onTap: onTap,
        child: Container(
          width: 30,
          height: 30,
          decoration: BoxDecoration(
            color: AppColors.primary.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Icon(icon, size: 16, color: AppColors.primary),
        ),
      );
}

// ══════════════════════════════════════════════════════════
//  CHECKOUT SCREEN
// ══════════════════════════════════════════════════════════
class CheckoutScreen extends StatefulWidget {
  const CheckoutScreen({super.key});
  @override
  State<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends State<CheckoutScreen> {
  final _form = GlobalKey<FormState>();
  final _addrCtrl = TextEditingController();
  final _notesCtrl = TextEditingController();
  PaymentMethod _payment = PaymentMethod.cash;
  bool _loading = false;

  @override
  void dispose() {
    _addrCtrl.dispose();
    _notesCtrl.dispose();
    super.dispose();
  }

  Future<void> _placeOrder() async {
    if (!_form.currentState!.validate()) return;
    setState(() => _loading = true);

    final cart = context.read<CartProvider>();
    final auth = context.read<app_auth.AuthProvider>();
    final service = context.read<FirebaseService>();
    final user = auth.user!;
    const uuid = Uuid();
    final orderId = uuid.v4();
    final orderNum = orderId.substring(0, 6).toUpperCase();

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
      notes: _notesCtrl.text.trim().isEmpty
          ? null
          : _notesCtrl.text.trim(),
      orderNumber: orderNum,
      platformCommission: cart.platformCommission,
    );

    try {
      await service.placeOrder(order);
      cart.clear();
      if (!mounted) return;
      Navigator.pushAndRemoveUntil(
        context,
        MaterialPageRoute(
            builder: (_) => OrderTrackingScreen(orderId: orderId)),
        (r) => r.isFirst,
      );
    } catch (e) {
      setState(() => _loading = false);
      if (mounted) showError(context, 'فشل إرسال الطلب، حاول مرة أخرى');
    }
  }

  @override
  Widget build(BuildContext context) {
    final cart = context.watch<CartProvider>();
    return Scaffold(
      appBar: AppBar(title: const Text('إتمام الطلب')),
      body: Form(
        key: _form,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            const SectionHeader(title: 'عنوان التوصيل'),
            const SizedBox(height: 10),
            TextFormField(
              controller: _addrCtrl,
              maxLines: 2,
              decoration: const InputDecoration(
                hintText: 'أدخل عنوانك بالتفصيل',
                prefixIcon: Icon(Icons.location_on_outlined),
              ),
              validator: (v) =>
                  v!.trim().isEmpty ? 'أدخل عنوان التوصيل' : null,
            ),
            const SizedBox(height: 20),
            const SectionHeader(title: 'طريقة الدفع'),
            const SizedBox(height: 8),
            ...PaymentMethod.values.map((p) => Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  elevation: _payment == p ? 2 : 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                    side: BorderSide(
                      color: _payment == p
                          ? AppColors.primary
                          : AppColors.divider,
                      width: _payment == p ? 2 : 1,
                    ),
                  ),
                  child: RadioListTile<PaymentMethod>(
                    value: p,
                    groupValue: _payment,
                    onChanged: (v) => setState(() => _payment = v!),
                    title: Text(p.label),
                    secondary: Icon(p.icon,
                        color: _payment == p
                            ? AppColors.primary
                            : AppColors.textGray),
                    activeColor: AppColors.primary,
                  ),
                )),
            const SizedBox(height: 16),
            TextFormField(
              controller: _notesCtrl,
              maxLines: 2,
              decoration: const InputDecoration(
                labelText: 'ملاحظات (اختياري)',
                hintText: 'أي طلبات خاصة؟',
                prefixIcon: Icon(Icons.note_outlined),
              ),
            ),
            const SizedBox(height: 20),
            // Order summary
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SectionHeader(title: 'ملخص الطلب'),
                    const SizedBox(height: 8),
                    ...cart.items.map((ci) => Padding(
                          padding: const EdgeInsets.symmetric(vertical: 3),
                          child: Row(
                            children: [
                              Text(ci.item.emoji),
                              const SizedBox(width: 8),
                              Expanded(child: Text(ci.item.name,
                                  style: const TextStyle(fontSize: 13))),
                              Text('×${ci.quantity}',
                                  style: const TextStyle(
                                      color: AppColors.textGray,
                                      fontSize: 13)),
                              const SizedBox(width: 8),
                              Text(formatCurrency(ci.subtotal),
                                  style: const TextStyle(
                                      fontWeight: FontWeight.bold,
                                      fontSize: 13)),
                            ],
                          ),
                        )),
                    const Divider(),
                    PriceRow(label: 'المجموع',
                        value: formatCurrency(cart.itemsTotal)),
                    PriceRow(label: 'التوصيل',
                        value: formatCurrency(cart.deliveryFee)),
                    PriceRow(label: 'الضريبة 15%',
                        value: formatCurrency(cart.vat)),
                    const Divider(),
                    PriceRow(
                      label: 'الإجمالي',
                      value: formatCurrency(cart.grandTotalWithVat),
                      bold: true,
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              height: 52,
              child: ElevatedButton(
                onPressed: _loading ? null : _placeOrder,
                child: _loading
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(
                            color: Colors.white, strokeWidth: 2))
                    : const Text('تأكيد الطلب 🎉'),
              ),
            ),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }
}
