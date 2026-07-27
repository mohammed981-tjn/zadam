// lib/models/models.dart
import 'package:cloud_firestore/cloud_firestore.dart' hide Order;
import 'package:flutter/material.dart';

enum UserRole { admin, customer, driver }

enum OrderStatus {
  pending,
  confirmed,
  preparing,
  readyForPickup,
  outForDelivery,
  delivered,
  cancelled,
  rejected,
}

enum PaymentMethod { cash, card, wallet }

enum ComplaintStatus { open, inProgress, resolved, closed }

enum ComplaintType { lateDelivery, wrongOrder, badQuality, driverBehavior, other }

extension OrderStatusExt on OrderStatus {
  String get label {
    const map = {
      OrderStatus.pending: 'قيد الانتظار',
      OrderStatus.confirmed: 'تم التأكيد',
      OrderStatus.preparing: 'جاري التحضير',
      OrderStatus.readyForPickup: 'جاهز للاستلام',
      OrderStatus.outForDelivery: 'في الطريق إليك',
      OrderStatus.delivered: 'تم التوصيل',
      OrderStatus.cancelled: 'ملغى',
      OrderStatus.rejected: 'مرفوض',
    };
    return map[this] ?? '';
  }

  Color get color {
    const map = {
      OrderStatus.pending: Color(0xFFFF9800),
      OrderStatus.confirmed: Color(0xFF2196F3),
      OrderStatus.preparing: Color(0xFF9C27B0),
      OrderStatus.readyForPickup: Color(0xFF00BCD4),
      OrderStatus.outForDelivery: Color(0xFF3F51B5),
      OrderStatus.delivered: Color(0xFF4CAF50),
      OrderStatus.cancelled: Color(0xFFF44336),
      OrderStatus.rejected: Color(0xFF795548),
    };
    return map[this] ?? Colors.grey;
  }

  IconData get icon {
    const map = {
      OrderStatus.pending: Icons.hourglass_empty_rounded,
      OrderStatus.confirmed: Icons.check_circle_outline,
      OrderStatus.preparing: Icons.restaurant_rounded,
      OrderStatus.readyForPickup: Icons.shopping_bag_outlined,
      OrderStatus.outForDelivery: Icons.delivery_dining_rounded,
      OrderStatus.delivered: Icons.done_all_rounded,
      OrderStatus.cancelled: Icons.cancel_outlined,
      OrderStatus.rejected: Icons.block_rounded,
    };
    return map[this] ?? Icons.info_outline;
  }

  bool get isActive =>
      this != OrderStatus.delivered &&
      this != OrderStatus.cancelled &&
      this != OrderStatus.rejected;
}

extension PaymentMethodExt on PaymentMethod {
  String get label {
    const map = {
      PaymentMethod.cash: 'نقداً عند الاستلام',
      PaymentMethod.card: 'بطاقة ائتمان',
      PaymentMethod.wallet: 'المحفظة الإلكترونية',
    };
    return map[this] ?? '';
  }

  IconData get icon {
    const map = {
      PaymentMethod.cash: Icons.money_rounded,
      PaymentMethod.card: Icons.credit_card_rounded,
      PaymentMethod.wallet: Icons.account_balance_wallet_rounded,
    };
    return map[this] ?? Icons.payment;
  }
}

extension ComplaintTypeExt on ComplaintType {
  String get label {
    const map = {
      ComplaintType.lateDelivery: 'تأخر التوصيل',
      ComplaintType.wrongOrder: 'طلب خاطئ',
      ComplaintType.badQuality: 'جودة رديئة',
      ComplaintType.driverBehavior: 'سلوك السائق',
      ComplaintType.other: 'أخرى',
    };
    return map[this] ?? '';
  }
}

extension ComplaintStatusExt on ComplaintStatus {
  String get label {
    const map = {
      ComplaintStatus.open: 'مفتوحة',
      ComplaintStatus.inProgress: 'قيد المعالجة',
      ComplaintStatus.resolved: 'تم الحل',
      ComplaintStatus.closed: 'مغلقة',
    };
    return map[this] ?? '';
  }

  Color get color {
    const map = {
      ComplaintStatus.open: Color(0xFFF44336),
      ComplaintStatus.inProgress: Color(0xFFFF9800),
      ComplaintStatus.resolved: Color(0xFF4CAF50),
      ComplaintStatus.closed: Color(0xFF9E9E9E),
    };
    return map[this] ?? Colors.grey;
  }
}

class AppUser {
  final String uid;
  final String name;
  final String email;
  final String phone;
  final UserRole role;
  final DateTime createdAt;

  const AppUser({
    required this.uid,
    required this.name,
    required this.email,
    required this.phone,
    required this.role,
    required this.createdAt,
  });

  factory AppUser.fromMap(Map<String, dynamic> map, String uid) => AppUser(
        uid: uid,
        name: map['name'] as String? ?? '',
        email: map['email'] as String? ?? '',
        phone: map['phone'] as String? ?? '',
        role: UserRole.values.firstWhere(
          (r) => r.name == map['role'],
          orElse: () => UserRole.customer,
        ),
        createdAt: (map['createdAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      );

  Map<String, dynamic> toMap() => {
        'name': name,
        'email': email,
        'phone': phone,
        'role': role.name,
        'createdAt': Timestamp.fromDate(createdAt),
      };
}

class Restaurant {
  final String id;
  final String name;
  final String description;
  final String emoji;
  final String phone;
  final bool isOpen;
  final double deliveryFee;
  final double minOrder;
  final String address;
  final int estimatedTimeMin;
  final double rating;
  final double? lat;
  final double? lng;

  const Restaurant({
    required this.id,
    required this.name,
    required this.description,
    required this.emoji,
    required this.phone,
    this.isOpen = true,
    this.deliveryFee = 5.0,
    this.minOrder = 20.0,
    required this.address,
    this.estimatedTimeMin = 30,
    this.rating = 5.0,
    this.lat,
    this.lng,
  });

  factory Restaurant.fromMap(Map<String, dynamic> map, String id) =>
      Restaurant(
        id: id,
        name: map['name'] as String? ?? '',
        description: map['description'] as String? ?? '',
        emoji: map['emoji'] as String? ?? '🍽️',
        phone: map['phone'] as String? ?? '',
        isOpen: map['isOpen'] as bool? ?? true,
        deliveryFee: (map['deliveryFee'] as num?)?.toDouble() ?? 5.0,
        minOrder: (map['minOrder'] as num?)?.toDouble() ?? 20.0,
        address: map['address'] as String? ?? '',
        estimatedTimeMin: (map['estimatedTimeMin'] as num?)?.toInt() ?? 30,
        rating: (map['rating'] as num?)?.toDouble() ?? 5.0,
        lat: (map['lat'] as num?)?.toDouble(),
        lng: (map['lng'] as num?)?.toDouble(),
      );

  Map<String, dynamic> toMap() => {
        'name': name,
        'description': description,
        'emoji': emoji,
        'phone': phone,
        'isOpen': isOpen,
        'deliveryFee': deliveryFee,
        'minOrder': minOrder,
        'address': address,
        'estimatedTimeMin': estimatedTimeMin,
        'rating': rating,
        'lat': lat,
        'lng': lng,
      };
}

class MenuCategory {
  final String id;
  final String restaurantId;
  final String name;
  final int sortOrder;

  const MenuCategory({
    required this.id,
    required this.restaurantId,
    required this.name,
    this.sortOrder = 0,
  });

  factory MenuCategory.fromMap(Map<String, dynamic> map, String id) =>
      MenuCategory(
        id: id,
        restaurantId: map['restaurantId'] as String? ?? '',
        name: map['name'] as String? ?? '',
        sortOrder: (map['sortOrder'] as num?)?.toInt() ?? 0,
      );

  Map<String, dynamic> toMap() => {
        'restaurantId': restaurantId,
        'name': name,
        'sortOrder': sortOrder,
      };
}

class MenuItem {
  final String id;
  final String restaurantId;
  final String categoryId;
  final String name;
  final String description;
  final double price;
  final String emoji;
  final bool isAvailable;
  final int? stockQuantity;
  final bool trackStock;

  const MenuItem({
    required this.id,
    required this.restaurantId,
    required this.categoryId,
    required this.name,
    required this.description,
    required this.price,
    required this.emoji,
    this.isAvailable = true,
    this.stockQuantity,
    this.trackStock = false,
  });

  bool get canOrder =>
      isAvailable && (!trackStock || (stockQuantity != null && stockQuantity! > 0));

  factory MenuItem.fromMap(Map<String, dynamic> map, String id) => MenuItem(
        id: id,
        restaurantId: map['restaurantId'] as String? ?? '',
        categoryId: map['categoryId'] as String? ?? '',
        name: map['name'] as String? ?? '',
        description: map['description'] as String? ?? '',
        price: (map['price'] as num?)?.toDouble() ?? 0.0,
        emoji: map['emoji'] as String? ?? '🍽️',
        isAvailable: map['isAvailable'] as bool? ?? true,
        stockQuantity: (map['stockQuantity'] as num?)?.toInt(),
        trackStock: map['trackStock'] as bool? ?? false,
      );

  Map<String, dynamic> toMap() => {
        'restaurantId': restaurantId,
        'categoryId': categoryId,
        'name': name,
        'description': description,
        'price': price,
        'emoji': emoji,
        'isAvailable': isAvailable,
        'stockQuantity': stockQuantity,
        'trackStock': trackStock,
      };
}

class Driver {
  final String id;
  final String name;
  final String phone;
  final String vehicleType;
  final bool isAvailable;
  final bool isOnline;
  final double totalEarnings;
  final double pendingPayout;
  final int totalDeliveries;
  final double rating;
  final int ratingCount;
  final double? lat;
  final double? lng;

  const Driver({
    required this.id,
    required this.name,
    required this.phone,
    required this.vehicleType,
    this.isAvailable = true,
    this.isOnline = false,
    this.totalEarnings = 0,
    this.pendingPayout = 0,
    this.totalDeliveries = 0,
    this.rating = 5.0,
    this.ratingCount = 0,
    this.lat,
    this.lng,
  });

  factory Driver.fromMap(Map<String, dynamic> map, String id) => Driver(
        id: id,
        name: map['name'] as String? ?? '',
        phone: map['phone'] as String? ?? '',
        vehicleType: map['vehicleType'] as String? ?? 'دراجة نارية',
        isAvailable: map['isAvailable'] as bool? ?? true,
        isOnline: map['isOnline'] as bool? ?? false,
        totalEarnings: (map['totalEarnings'] as num?)?.toDouble() ?? 0,
        pendingPayout: (map['pendingPayout'] as num?)?.toDouble() ?? 0,
        totalDeliveries: (map['totalDeliveries'] as num?)?.toInt() ?? 0,
        rating: (map['rating'] as num?)?.toDouble() ?? 5.0,
        ratingCount: (map['ratingCount'] as num?)?.toInt() ?? 0,
        lat: (map['lat'] as num?)?.toDouble(),
        lng: (map['lng'] as num?)?.toDouble(),
      );

  Map<String, dynamic> toMap() => {
        'name': name,
        'phone': phone,
        'vehicleType': vehicleType,
        'isAvailable': isAvailable,
        'isOnline': isOnline,
        'totalEarnings': totalEarnings,
        'pendingPayout': pendingPayout,
        'totalDeliveries': totalDeliveries,
        'rating': rating,
        'ratingCount': ratingCount,
        'lat': lat,
        'lng': lng,
      };
}

class OrderItem {
  final String menuItemId;
  final String name;
  final double price;
  final String emoji;
  final int quantity;

  const OrderItem({
    required this.menuItemId,
    required this.name,
    required this.price,
    required this.emoji,
    this.quantity = 1,
  });

  double get subtotal => price * quantity;

  factory OrderItem.fromMap(Map<String, dynamic> map) => OrderItem(
        menuItemId: map['menuItemId'] as String? ?? '',
        name: map['name'] as String? ?? '',
        price: (map['price'] as num?)?.toDouble() ?? 0.0,
        emoji: map['emoji'] as String? ?? '🍽️',
        quantity: (map['quantity'] as num?)?.toInt() ?? 1,
      );

  Map<String, dynamic> toMap() => {
        'menuItemId': menuItemId,
        'name': name,
        'price': price,
        'emoji': emoji,
        'quantity': quantity,
      };
}

class Order {
  final String id;
  final String restaurantId;
  final String restaurantName;
  final String customerId;
  final String customerName;
  final String customerPhone;
  final String deliveryAddress;
  final List<OrderItem> items;
  final OrderStatus status;
  final PaymentMethod paymentMethod;
  final bool isPaid;
  final DateTime createdAt;
  final DateTime? updatedAt;
  final String? driverId;
  final String? driverName;
  final String? notes;
  final double deliveryFee;
  final String orderNumber;
  final double? customerRating;
  final double? driverRating;
  final bool isRated;
  final double platformCommission;
  final double? deliveryLat;
  final double? deliveryLng;
  final double? restaurantLat;
  final double? restaurantLng;

  const Order({
    required this.id,
    required this.restaurantId,
    required this.restaurantName,
    required this.customerId,
    required this.customerName,
    required this.customerPhone,
    required this.deliveryAddress,
    required this.items,
    this.status = OrderStatus.pending,
    required this.paymentMethod,
    this.isPaid = false,
    required this.createdAt,
    this.updatedAt,
    this.driverId,
    this.driverName,
    this.notes,
    this.deliveryFee = 5.0,
    required this.orderNumber,
    this.customerRating,
    this.driverRating,
    this.isRated = false,
    this.platformCommission = 0,
    this.deliveryLat,
    this.deliveryLng,
    this.restaurantLat,
    this.restaurantLng,
  });

  double get itemsTotal => items.fold(0.0, (s, i) => s + i.subtotal);
  double get grandTotal => itemsTotal + deliveryFee;
  double get calculatedCommission => itemsTotal * 0.01;

  factory Order.fromMap(Map<String, dynamic> map, String id) => Order(
        id: id,
        restaurantId: map['restaurantId'] as String? ?? '',
        restaurantName: map['restaurantName'] as String? ?? '',
        customerId: map['customerId'] as String? ?? '',
        customerName: map['customerName'] as String? ?? '',
        customerPhone: map['customerPhone'] as String? ?? '',
        deliveryAddress: map['deliveryAddress'] as String? ?? '',
        items: ((map['items'] as List?) ?? [])
            .map((i) => OrderItem.fromMap(i as Map<String, dynamic>))
            .toList(),
        status: OrderStatus.values.firstWhere(
          (s) => s.name == map['status'],
          orElse: () => OrderStatus.pending,
        ),
        paymentMethod: PaymentMethod.values.firstWhere(
          (p) => p.name == map['paymentMethod'],
          orElse: () => PaymentMethod.cash,
        ),
        isPaid: map['isPaid'] as bool? ?? false,
        createdAt: (map['createdAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
        updatedAt: (map['updatedAt'] as Timestamp?)?.toDate(),
        driverId: map['driverId'] as String?,
        driverName: map['driverName'] as String?,
        notes: map['notes'] as String?,
        deliveryFee: (map['deliveryFee'] as num?)?.toDouble() ?? 5.0,
        orderNumber: (map['orderNumber'] as String?) ?? id.substring(0, 6).toUpperCase(),
        customerRating: (map['customerRating'] as num?)?.toDouble(),
        driverRating: (map['driverRating'] as num?)?.toDouble(),
        isRated: map['isRated'] as bool? ?? false,
        platformCommission: (map['platformCommission'] as num?)?.toDouble() ?? 0,
        deliveryLat: (map['deliveryLat'] as num?)?.toDouble(),
        deliveryLng: (map['deliveryLng'] as num?)?.toDouble(),
        restaurantLat: (map['restaurantLat'] as num?)?.toDouble(),
        restaurantLng: (map['restaurantLng'] as num?)?.toDouble(),
      );

  Map<String, dynamic> toMap() => {
        'restaurantId': restaurantId,
        'restaurantName': restaurantName,
        'customerId': customerId,
        'customerName': customerName,
        'customerPhone': customerPhone,
        'deliveryAddress': deliveryAddress,
        'items': items.map((i) => i.toMap()).toList(),
        'status': status.name,
        'paymentMethod': paymentMethod.name,
        'isPaid': isPaid,
        'createdAt': Timestamp.fromDate(createdAt),
        'updatedAt': updatedAt != null ? Timestamp.fromDate(updatedAt!) : null,
        'driverId': driverId,
        'driverName': driverName,
        'notes': notes,
        'deliveryFee': deliveryFee,
        'orderNumber': orderNumber,
        'customerRating': customerRating,
        'driverRating': driverRating,
        'isRated': isRated,
        'platformCommission': platformCommission,
        'deliveryLat': deliveryLat,
        'deliveryLng': deliveryLng,
        'restaurantLat': restaurantLat,
        'restaurantLng': restaurantLng,
      };
}

class Complaint {
  final String id;
  final String orderId;
  final String orderNumber;
  final String customerId;
  final String customerName;
  final ComplaintType type;
  final String description;
  final ComplaintStatus status;
  final DateTime createdAt;

  const Complaint({
    required this.id,
    required this.orderId,
    required this.orderNumber,
    required this.customerId,
    required this.customerName,
    required this.type,
    required this.description,
    this.status = ComplaintStatus.open,
    required this.createdAt,
  });

  factory Complaint.fromMap(Map<String, dynamic> map, String id) => Complaint(
        id: id,
        orderId: map['orderId'] as String? ?? '',
        orderNumber: map['orderNumber'] as String? ?? '',
        customerId: map['customerId'] as String? ?? '',
        customerName: map['customerName'] as String? ?? '',
        type: ComplaintType.values.firstWhere(
          (t) => t.name == map['type'],
          orElse: () => ComplaintType.other,
        ),
        description: map['description'] as String? ?? '',
        status: ComplaintStatus.values.firstWhere(
          (s) => s.name == map['status'],
          orElse: () => ComplaintStatus.open,
        ),
        createdAt: (map['createdAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      );

  Map<String, dynamic> toMap() => {
        'orderId': orderId,
        'orderNumber': orderNumber,
        'customerId': customerId,
        'customerName': customerName,
        'type': type.name,
        'description': description,
        'status': status.name,
        'createdAt': Timestamp.fromDate(createdAt),
      };
}

class CartItem {
  final MenuItem item;
  int quantity;
  CartItem({required this.item, this.quantity = 1});
  double get subtotal => item.price * quantity;
}