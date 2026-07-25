// lib/providers/cart_provider.dart
import 'package:flutter/material.dart';
import '../models/models.dart';

class CartProvider extends ChangeNotifier {
  final List<CartItem> _items = [];
  String? _restaurantId;
  String? _restaurantName;
  String? _restaurantEmoji;
  double _deliveryFee = 5.0;

  List<CartItem> get items => List.unmodifiable(_items);
  String? get restaurantId => _restaurantId;
  String? get restaurantName => _restaurantName;
  String? get restaurantEmoji => _restaurantEmoji;
  double get deliveryFee => _deliveryFee;
  bool get isEmpty => _items.isEmpty;

  double get itemsTotal => _items.fold(0.0, (s, i) => s + i.subtotal);
  double get grandTotal => itemsTotal + _deliveryFee;
  int get itemCount => _items.fold(0, (s, i) => s + i.quantity);

  // ضريبة القيمة المضافة 15%
  double get vat => itemsTotal * 0.15;
  double get grandTotalWithVat => grandTotal + vat;

  // عمولة المنصة 1%
  double get platformCommission => itemsTotal * 0.01;

  int quantityOf(String itemId) {
    try {
      return _items.firstWhere((i) => i.item.id == itemId).quantity;
    } catch (_) {
      return 0;
    }
  }

  bool canAddFromRestaurant(String restaurantId) =>
      _restaurantId == null || _restaurantId == restaurantId;

  void add(
    MenuItem item,
    String restaurantId,
    String restaurantName,
    String restaurantEmoji,
    double deliveryFee,
  ) {
    if (_restaurantId != null && _restaurantId != restaurantId) {
      _items.clear();
    }
    _restaurantId = restaurantId;
    _restaurantName = restaurantName;
    _restaurantEmoji = restaurantEmoji;
    _deliveryFee = deliveryFee;

    final idx = _items.indexWhere((i) => i.item.id == item.id);
    if (idx >= 0) {
      _items[idx].quantity++;
    } else {
      _items.add(CartItem(item: item));
    }
    notifyListeners();
  }

  void remove(String itemId) {
    final idx = _items.indexWhere((i) => i.item.id == itemId);
    if (idx < 0) return;
    if (_items[idx].quantity > 1) {
      _items[idx].quantity--;
    } else {
      _items.removeAt(idx);
      if (_items.isEmpty) _clearRestaurant();
    }
    notifyListeners();
  }

  void removeAll(String itemId) {
    _items.removeWhere((i) => i.item.id == itemId);
    if (_items.isEmpty) _clearRestaurant();
    notifyListeners();
  }

  void clear() {
    _items.clear();
    _clearRestaurant();
    notifyListeners();
  }

  void _clearRestaurant() {
    _restaurantId = null;
    _restaurantName = null;
    _restaurantEmoji = null;
  }

  List<OrderItem> toOrderItems() => _items
      .map((ci) => OrderItem(
            menuItemId: ci.item.id,
            name: ci.item.name,
            price: ci.item.price,
            emoji: ci.item.emoji,
            quantity: ci.quantity,
            extras: ci.extras,
          ))
      .toList();
}
