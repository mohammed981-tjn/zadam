// lib/screens/admin/admin_restaurants_tab.dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:uuid/uuid.dart';
import '../../providers/firebase_service.dart';
import '../../models/models.dart';
import '../../utils/theme.dart';
import '../../utils/helpers.dart';
import '../../widgets/common_widgets.dart';

class AdminRestaurantsTab extends StatelessWidget {
  const AdminRestaurantsTab({super.key});

  @override
  Widget build(BuildContext context) {
    final service = context.read<FirebaseService>();
    return StreamBuilder<List<Restaurant>>(
      stream: service.streamRestaurants(),
      builder: (ctx, snap) {
        if (!snap.hasData) return const AppLoading();
        final list = snap.data!;
        return Scaffold(
          body: list.isEmpty
              ? AppEmpty(
                  emoji: '🍽️',
                  title: 'لا يوجد مطاعم',
                  action: ElevatedButton(
                    onPressed: () => _showRestaurantForm(ctx, null),
                    child: const Text('إضافة مطعم'),
                  ),
                )
              : ListView.builder(
                  padding: const EdgeInsets.all(12),
                  itemCount: list.length,
                  itemBuilder: (_, i) => _RestaurantCard(restaurant: list[i]),
                ),
          floatingActionButton: FloatingActionButton.extended(
            onPressed: () => _showRestaurantForm(ctx, null),
            icon: const Icon(Icons.add),
            label: const Text('مطعم جديد'),
          ),
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
    final service = context.read<FirebaseService>();
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: ExpansionTile(
        leading: Container(
          width: 48,
          height: 48,
          decoration: BoxDecoration(
            color: AppColors.primary.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Center(
            child: Text(restaurant.emoji, style: const TextStyle(fontSize: 24)),
          ),
        ),
        title: Text(restaurant.name,
            style: const TextStyle(fontWeight: FontWeight.bold)),
        subtitle: Text(restaurant.description,
            maxLines: 1, overflow: TextOverflow.ellipsis),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Switch(
              value: restaurant.isOpen,
              onChanged: (v) => service.toggleRestaurant(restaurant.id, v),
              activeThumbColor: AppColors.success,
            ),
          ],
        ),
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: Column(
              children: [
                InfoRow(icon: Icons.phone_outlined, text: restaurant.phone),
                InfoRow(icon: Icons.location_on_outlined, text: restaurant.address),
                InfoRow(
                  icon: Icons.delivery_dining,
                  text: 'رسوم التوصيل: ${formatCurrency(restaurant.deliveryFee)}',
                ),
                InfoRow(
                  icon: Icons.timer_outlined,
                  text: 'وقت التوصيل: ${restaurant.estimatedTimeMin} دقيقة',
                ),
                InfoRow(
                  icon: Icons.shopping_bag_outlined,
                  text: 'الحد الأدنى: ${formatCurrency(restaurant.minOrder)}',
                ),
                InfoRow(
                  icon: Icons.star_rounded,
                  text: 'التقييم: ${restaurant.rating.toStringAsFixed(1)} ⭐  •  ${restaurant.totalOrders} طلب',
                ),
                const SizedBox(height: 12),
                Row(children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => _showRestaurantForm(context, restaurant),
                      icon: const Icon(Icons.edit_outlined, size: 16),
                      label: const Text('تعديل'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: () => _showMenuManager(context, restaurant),
                      icon: const Icon(Icons.menu_book_outlined, size: 16),
                      label: const Text('القائمة'),
                    ),
                  ),
                ]),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ── Restaurant Form ────────────────────────────────────────
void _showRestaurantForm(BuildContext context, Restaurant? r) {
  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
    builder: (_) => _RestaurantForm(existing: r),
  );
}

class _RestaurantForm extends StatefulWidget {
  final Restaurant? existing;
  const _RestaurantForm({this.existing});
  @override
  State<_RestaurantForm> createState() => _RestaurantFormState();
}

class _RestaurantFormState extends State<_RestaurantForm> {
  final _form = GlobalKey<FormState>();
  late final TextEditingController _name, _desc, _phone, _addr,
      _fee, _min, _time, _emoji;
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    final r = widget.existing;
    _name  = TextEditingController(text: r?.name ?? '');
    _desc  = TextEditingController(text: r?.description ?? '');
    _phone = TextEditingController(text: r?.phone ?? '');
    _addr  = TextEditingController(text: r?.address ?? '');
    _fee   = TextEditingController(text: r?.deliveryFee.toString() ?? '5');
    _min   = TextEditingController(text: r?.minOrder.toString() ?? '20');
    _time  = TextEditingController(text: r?.estimatedTimeMin.toString() ?? '30');
    _emoji = TextEditingController(text: r?.emoji ?? '🍽️');
  }

  @override
  void dispose() {
    for (final c in [_name, _desc, _phone, _addr, _fee, _min, _time, _emoji]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    setState(() => _loading = true);
    final service = context.read<FirebaseService>();
    final r = Restaurant(
      id: widget.existing?.id ?? const Uuid().v4(),
      name: _name.text.trim(),
      description: _desc.text.trim(),
      emoji: _emoji.text.trim(),
      phone: _phone.text.trim(),
      address: _addr.text.trim(),
      deliveryFee: double.tryParse(_fee.text) ?? 5,
      minOrder: double.tryParse(_min.text) ?? 20,
      estimatedTimeMin: int.tryParse(_time.text) ?? 30,
      isOpen: widget.existing?.isOpen ?? true,
      rating: widget.existing?.rating ?? 5.0,
      totalOrders: widget.existing?.totalOrders ?? 0,
    );
    if (widget.existing == null) {
      await service.addRestaurant(r);
    } else {
      await service.updateRestaurant(r);
    }
    if (mounted) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.of(context).viewInsets.bottom,
          top: 16, left: 16, right: 16,
        ),
        child: Form(
          key: _form,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Center(
                  child: Container(
                    width: 40, height: 4,
                    decoration: BoxDecoration(
                      color: Colors.grey[300],
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                Text(
                  widget.existing == null ? 'إضافة مطعم' : 'تعديل المطعم',
                  style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 16),
                _f(_emoji, 'رمز المطعم (Emoji)', isReq: false),
                _f(_name, 'اسم المطعم'),
                _f(_desc, 'وصف المطعم'),
                _f(_phone, 'رقم الهاتف', type: TextInputType.phone),
                _f(_addr, 'العنوان'),
                Row(children: [
                  Expanded(child: _f(_fee, 'رسوم التوصيل', type: TextInputType.number, validator: validatePrice)),
                  const SizedBox(width: 10),
                  Expanded(child: _f(_min, 'الحد الأدنى', type: TextInputType.number, validator: validatePrice)),
                ]),
                _f(_time, 'وقت التوصيل (دقيقة)', type: TextInputType.number),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity, height: 50,
                  child: ElevatedButton(
                    onPressed: _loading ? null : _save,
                    child: _loading
                        ? const SizedBox(width: 20, height: 20,
                            child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                        : const Text('حفظ'),
                  ),
                ),
                const SizedBox(height: 16),
              ],
            ),
          ),
        ),
      );

  Widget _f(
    TextEditingController c, String label, {
    TextInputType type = TextInputType.text,
    bool isReq = true,
    String? Function(String?)? validator,
  }) =>
      Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: TextFormField(
          controller: c,
          keyboardType: type,
          decoration: InputDecoration(labelText: label),
          validator: validator ?? (isReq ? (v) => validateRequired(v, label) : null),
        ),
      );
}

// ── Menu Manager ───────────────────────────────────────────
void _showMenuManager(BuildContext context, Restaurant r) {
  Navigator.push(
    context,
    MaterialPageRoute(builder: (_) => MenuManagerScreen(restaurant: r)),
  );
}

class MenuManagerScreen extends StatelessWidget {
  final Restaurant restaurant;
  const MenuManagerScreen({super.key, required this.restaurant});

  @override
  Widget build(BuildContext context) {
    final service = context.read<FirebaseService>();
    return Scaffold(
      appBar: AppBar(title: Text('قائمة ${restaurant.name}')),
      body: StreamBuilder<List<MenuCategory>>(
        stream: service.streamCategories(restaurant.id),
        builder: (ctx, catSnap) {
          return StreamBuilder<List<MenuItem>>(
            stream: service.streamMenuItems(restaurant.id),
            builder: (ctx2, itemSnap) {
              if (!catSnap.hasData || !itemSnap.hasData) return const AppLoading();
              final cats = catSnap.data!;
              final allItems = itemSnap.data!;
              return ListView(
                padding: const EdgeInsets.all(12),
                children: [
                  ElevatedButton.icon(
                    onPressed: () => _addCategoryDialog(context, restaurant.id),
                    icon: const Icon(Icons.add),
                    label: const Text('إضافة فئة'),
                  ),
                  const SizedBox(height: 12),
                  ...cats.map((cat) {
                    final catItems = allItems.where((i) => i.categoryId == cat.id).toList();
                    return Card(
                      margin: const EdgeInsets.only(bottom: 10),
                      child: ExpansionTile(
                        title: Text(cat.name,
                            style: const TextStyle(fontWeight: FontWeight.bold)),
                        subtitle: Text('${catItems.length} صنف'),
                        trailing: IconButton(
                          icon: const Icon(Icons.add_circle_outline, color: AppColors.primary),
                          onPressed: () => _showItemForm(context, restaurant.id, cat.id, null),
                        ),
                        children: catItems
                            .map((item) => _ItemTile(
                                item: item, restaurantId: restaurant.id))
                            .toList(),
                      ),
                    );
                  }),
                ],
              );
            },
          );
        },
      ),
    );
  }

  void _addCategoryDialog(BuildContext context, String rId) {
    final ctrl = TextEditingController();
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('إضافة فئة'),
        content: TextField(
          controller: ctrl,
          decoration: const InputDecoration(labelText: 'اسم الفئة'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('إلغاء'),
          ),
          ElevatedButton(
            onPressed: () async {
              if (ctrl.text.trim().isNotEmpty) {
                await context.read<FirebaseService>().addCategory(
                      MenuCategory(
                        id: const Uuid().v4(),
                        restaurantId: rId,
                        name: ctrl.text.trim(),
                      ),
                    );
                if (context.mounted) Navigator.pop(context);
              }
            },
            child: const Text('حفظ'),
          ),
        ],
      ),
    );
  }
}

class _ItemTile extends StatelessWidget {
  final MenuItem item;
  final String restaurantId;
  const _ItemTile({required this.item, required this.restaurantId});

  @override
  Widget build(BuildContext context) {
    final service = context.read<FirebaseService>();
    return ListTile(
      leading: Text(item.emoji, style: const TextStyle(fontSize: 28)),
      title: Text(item.name),
      subtitle: Text(
        '${formatCurrency(item.price)}${item.trackStock ? "  •  مخزون: ${item.stockQuantity ?? "∞"}" : ""}',
        style: const TextStyle(fontSize: 12),
      ),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Switch(
            value: item.isAvailable,
            onChanged: (v) =>
                service.toggleItemAvailability(restaurantId, item.id, v),
            activeThumbColor: AppColors.success,
          ),
          IconButton(
            icon: const Icon(Icons.edit_outlined, size: 18),
            onPressed: () =>
                _showItemForm(context, restaurantId, item.categoryId, item),
          ),
          IconButton(
            icon: const Icon(Icons.delete_outline, size: 18, color: Colors.red),
            onPressed: () async {
              final ok = await showConfirmDialog(
                context,
                title: 'حذف الصنف',
                content: 'هل تريد حذف "${item.name}"؟',
                confirmLabel: 'حذف',
                confirmColor: Colors.red,
              );
              if (ok == true && context.mounted) {
                await service.deleteMenuItem(restaurantId, item.id);
              }
            },
          ),
        ],
      ),
    );
  }
}

void _showItemForm(
    BuildContext context, String rId, String catId, MenuItem? existing) {
  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
    builder: (_) =>
        _ItemForm(restaurantId: rId, categoryId: catId, existing: existing),
  );
}

class _ItemForm extends StatefulWidget {
  final String restaurantId, categoryId;
  final MenuItem? existing;
  const _ItemForm(
      {required this.restaurantId, required this.categoryId, this.existing});
  @override
  State<_ItemForm> createState() => _ItemFormState();
}

class _ItemFormState extends State<_ItemForm> {
  final _form = GlobalKey<FormState>();
  late final TextEditingController _name, _desc, _price, _emoji, _stock;
  bool _loading = false;
  bool _trackStock = false;

  @override
  void initState() {
    super.initState();
    final i = widget.existing;
    _name  = TextEditingController(text: i?.name ?? '');
    _desc  = TextEditingController(text: i?.description ?? '');
    _price = TextEditingController(text: i?.price.toString() ?? '');
    _emoji = TextEditingController(text: i?.emoji ?? '🍽️');
    _stock = TextEditingController(text: i?.stockQuantity?.toString() ?? '');
    _trackStock = i?.trackStock ?? false;
  }

  @override
  void dispose() {
    for (final c in [_name, _desc, _price, _emoji, _stock]) c.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    setState(() => _loading = true);
    final service = context.read<FirebaseService>();
    final item = MenuItem(
      id: widget.existing?.id ?? const Uuid().v4(),
      restaurantId: widget.restaurantId,
      categoryId: widget.categoryId,
      name: _name.text.trim(),
      description: _desc.text.trim(),
      price: double.tryParse(_price.text) ?? 0,
      emoji: _emoji.text.trim(),
      isAvailable: widget.existing?.isAvailable ?? true,
      trackStock: _trackStock,
      stockQuantity:
          _trackStock && _stock.text.isNotEmpty ? int.tryParse(_stock.text) : null,
      totalSold: widget.existing?.totalSold ?? 0,
    );
    if (widget.existing == null) {
      await service.addMenuItem(item);
    } else {
      await service.updateMenuItem(item);
    }
    if (mounted) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.of(context).viewInsets.bottom,
          top: 16, left: 16, right: 16,
        ),
        child: Form(
          key: _form,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  widget.existing == null ? 'إضافة صنف' : 'تعديل الصنف',
                  style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 16),
                _f(_emoji, 'رمز الصنف', isReq: false),
                _f(_name, 'اسم الصنف'),
                _f(_desc, 'الوصف'),
                _f(_price, 'السعر', type: TextInputType.number, validator: validatePrice),
                // إدارة المخزون
                SwitchListTile(
                  value: _trackStock,
                  onChanged: (v) => setState(() => _trackStock = v),
                  title: const Text('تتبع المخزون'),
                  subtitle: const Text('إخفاء الصنف تلقائياً عند نفاده',
                      style: TextStyle(fontSize: 12)),
                  contentPadding: EdgeInsets.zero,
                  activeThumbColor: AppColors.primary,
                ),
                if (_trackStock)
                  _f(_stock, 'الكمية المتاحة', type: TextInputType.number),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity, height: 50,
                  child: ElevatedButton(
                    onPressed: _loading ? null : _save,
                    child: _loading
                        ? const SizedBox(width: 20, height: 20,
                            child: CircularProgressIndicator(
                                color: Colors.white, strokeWidth: 2))
                        : const Text('حفظ'),
                  ),
                ),
                const SizedBox(height: 16),
              ],
            ),
          ),
        ),
      );

  Widget _f(
    TextEditingController c, String label, {
    TextInputType type = TextInputType.text,
    bool isReq = true,
    String? Function(String?)? validator,
  }) =>
      Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: TextFormField(
          controller: c,
          keyboardType: type,
          decoration: InputDecoration(labelText: label),
          validator: validator ?? (isReq ? (v) => validateRequired(v, label) : null),
        ),
      );
}
