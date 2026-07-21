// lib/models/models.dart
import 'package:cloud_firestore/cloud_firestore.dart' hide Order;
import 'package:flutter/material.dart';

// ══════════════════════════════════════════════════════════
//  ENUMS
// ══════════════════════════════════════════════════════════
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

// ══════════════════════════════════════════════════════════
//  EXTENSIONS
// ══════════════════════════════════════════════════════════
extension OrderStatusExt on OrderStatus {
  String get label {
    const labels = {
      OrderStatus.pending: 'قيد الانتظار',
      OrderStatus.confirmed: 'تم التأكيد',
      OrderStatus.preparing: 'جاري التحضير',
      OrderStatus.readyForPickup: 'جاهز للاستلام',
      OrderStatus.outForDelivery: 'في الطريق إليك',
      OrderStatus.delivered: 'تم التوصيل',
      OrderStatus.cancelled: 'ملغى',
      OrderStatus.rejected: 'مرفوض',
    };
    return labels[this] ?? '';
  }

  Color get color {
    const colors = {
      OrderStatus.pending: Color(0xFFFF9800),
      OrderStatus.confirmed: Color(0xFF2196F3),
      OrderStatus.preparing: Color(0xFF9C27B0),
      OrderStatus.readyForPickup: Color(0xFF00BCD4),
      OrderStatus.outForDelivery: Color(0xFF3F51B5),
      OrderStatus.delivered: Color(0xFF4CAF50),
      OrderStatus.cancelled: Color(0xFFF44336),
      OrderStatus.rejected: Color(0xFF795548),
    };
    return colors[this] ?? Colors.grey;
  }

  IconData get icon {
    const icons = {
      OrderStatus.pending: Icons.hourglass_empty_rounded,
      OrderStatus.confirmed: Icons.check_circle_outline,
      OrderStatus.preparing: Icons.restaurant_rounded,
      OrderStatus.readyForPickup: Icons.shopping_bag_outlined,
      OrderStatus.outForDelivery: Icons.delivery_dining_rounded,
      OrderStatus.delivered: Icons.done_all_rounded,
      OrderStatus.cancelled: Icons.cancel_outlined,
      OrderStatus.rejected: Icons.block_rounded,
    };
    return icons[this] ?? Icons.info_outline;
  }

  bool get isActive =>
      this != OrderStatus.delivered &&
      this != OrderStatus.cancelled &&
      this != OrderStatus.rejected;

  bool get canBeCancelled =>
      this == OrderStatus.pending || this == OrderStatus.confirmed;
}

extension PaymentMethodExt on PaymentMethod {
  String get label {
    const labels = {
      PaymentMethod.cash: 'نقداً عند الاستلام',
      PaymentMethod.card: 'بطاقة ائتمان',
      PaymentMethod.wallet: 'المحفظة الإلكترونية',
    };
    return labels[this] ?? '';
  }

  IconData get icon {
    const icons = {
      PaymentMethod.cash: Icons.money_rounded,
      PaymentMethod.card: Icons.credit_card_rounded,
      PaymentMethod.wallet: Icons.account_balance_wallet_rounded,
    };
    return icons[this] ?? Icons.payment;
  }
}

extension ComplaintStatusExt on ComplaintStatus {
  String get label {
    const labels = {
      ComplaintStatus.open: 'مفتوحة',
      ComplaintStatus.inProgress: 'قيد المعالجة',
      ComplaintStatus.resolved: 'تم الحل',
      ComplaintStatus.closed: 'مغلقة',
    };
    return labels[this] ?? '';
  }

  Color get color {
    const colors = {
      ComplaintStatus.open: Color(0xFFF44336),
      ComplaintStatus.inProgress: Color(0xFFFF9800),
      ComplaintStatus.resolved: Color(0xFF4CAF50),
      ComplaintStatus.closed: Color(0xFF9E9E9E),
    };
    return colors[this] ?? Colors.grey;
  }
}

extension ComplaintTypeExt on ComplaintType {
  String get label {
    const labels = {
      ComplaintType.lateDelivery: 'تأخر التوصيل',
      ComplaintType.wrongOrder: 'طلب خاطئ',
      ComplaintType.badQuality: 'جودة رديئة',
      ComplaintType.driverBehavior: 'سلوك السائق',
      ComplaintType.other: 'أخرى',
    };
    return labels[this] ?? '';
  }
}

// ══════════════════════════════════════════════════════════
//  APP USER
// ══════════════════════════════════════════════════════════
class AppUser {
  final String uid;
  final String name;
  final String email;
  final String phone;
  final UserRole role;
  final String? fcmToken;
  final DateTime createdAt;
  final String? address;

  const AppUser({
    required this.uid,
    required this.name,
    required this.email,
    required this.phone,
    required this.role,
    this.fcmToken,
    required this.createdAt,
    this.address,
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
        fcmToken: map['fcmToken'] as String?,
        createdAt: (map['createdAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
        address: map['address'] as String?,
      );

  Map<String, dynamic> toMap() => {
        'name': name,
        'email': email,
        'phone': phone,
        'role': role.name,
        if (fcmToken != null) 'fcmToken': fcmToken,
        'createdAt': Timestamp.fromDate(createdAt),
        if (address != null) 'address': address,
      };

  AppUser copyWith({
    String? name,
    String? phone,
    String? fcmToken,
    String? address,
  }) =>
      AppUser(
        uid: uid,
        name: name ?? this.name,
        email: email,
        phone: phone ?? this.phone,
        role: role,
        fcmToken: fcmToken ?? this.fcmToken,
        createdAt: createdAt,
        address: address ?? this.address,
      );
}

// ══════════════════════════════════════════════════════════
//  RESTAURANT
// ══════════════════════════════════════════════════════════
class Restaurant {
  final String id;
  final String name;
  final String description;
  final String imageUrl;
  final String emoji;
  final String phone;
  final bool isOpen;
  final double deliveryFee;
  final double minOrder;
  final String address;
  final int estimatedTimeMin;
  final double rating;
  final int totalOrders;

  const Restaurant({
    required this.id,
    required this.name,
    required this.description,
    this.imageUrl = '',
    required this.emoji,
    required this.phone,
    this.isOpen = true,
    this.deliveryFee = 5.0,
    this.minOrder = 20.0,
    required this.address,
    this.estimatedTimeMin = 30,
    this.rating = 5.0,
    this.totalOrders = 0,
  });

  factory Restaurant.fromMap(Map<String, dynamic> map, String id) =>
      Restaurant(
        id: id,
        name: map['name'] as String? ?? '',
        description: map['description'] as String? ?? '',
        imageUrl: map['imageUrl'] as String? ?? '',
        emoji: map['emoji'] as String? ?? '🍽️',
        phone: map['phone'] as String? ?? '',
        isOpen: map['isOpen'] as bool? ?? true,
        deliveryFee: (map['deliveryFee'] as num?)?.toDouble() ?? 5.0,
        minOrder: (map['minOrder'] as num?)?.toDouble() ?? 20.0,
        address: map['address'] as String? ?? '',
        estimatedTimeMin: (map['estimatedTimeMin'] as num?)?.toInt() ?? 30,
        rating: (map['rating'] as num?)?.toDouble() ?? 5.0,
        totalOrders: (map['totalOrders'] as num?)?.toInt() ?? 0,
      );

  Map<String, dynamic> toMap() => {
        'name': name,
        'description': description,
        'imageUrl': imageUrl,
        'emoji': emoji,
        'phone': phone,
        'isOpen': isOpen,
        'deliveryFee': deliveryFee,
        'minOrder': minOrder,
        'address': address,
        'estimatedTimeMin': estimatedTimeMin,
        'rating': rating,
        'totalOrders': totalOrders,
      };

  Restaurant copyWith({
    String? name,
    String? description,
    String? imageUrl,
    String? emoji,
    String? phone,
    bool? isOpen,
    double? deliveryFee,
    double? minOrder,
    String? address,
    int? estimatedTimeMin,
    double? rating,
    int? totalOrders,
  }) =>
      Restaurant(
        id: id,
        name: name ?? this.name,
        description: description ?? this.description,
        imageUrl: imageUrl ?? this.imageUrl,
        emoji: emoji ?? this.emoji,
        phone: phone ?? this.phone,
        isOpen: isOpen ?? this.isOpen,
        deliveryFee: deliveryFee ?? this.deliveryFee,
        minOrder: minOrder ?? this.minOrder,
        address: address ?? this.address,
        estimatedTimeMin: estimatedTimeMin ?? this.estimatedTimeMin,
        rating: rating ?? this.rating,
        totalOrders: totalOrders ?? this.totalOrders,
      );
}

// ══════════════════════════════════════════════════════════
//  MENU CATEGORY
// ══════════════════════════════════════════════════════════
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

// ══════════════════════════════════════════════════════════
//  MENU ITEM — مع إضافة المخزون (Phase 1)
// ══════════════════════════════════════════════════════════
class MenuItem {
  final String id;
  final String restaurantId;
  final String categoryId;
  final String name;
  final String description;
  final double price;
  final String emoji;
  final String imageUrl;
  final bool isAvailable;
  final List<String> extras;
  // ✅ جديد: إدارة المخزون
  final int? stockQuantity;     // null = غير محدود
  final bool trackStock;        // هل نتتبع المخزون؟
  final int totalSold;          // إجمالي المبيعات للتحليلات

  const MenuItem({
    required this.id,
    required this.restaurantId,
    required this.categoryId,
    required this.name,
    required this.description,
    required this.price,
    required this.emoji,
    this.imageUrl = '',
    this.isAvailable = true,
    this.extras = const [],
    this.stockQuantity,
    this.trackStock = false,
    this.totalSold = 0,
  });

  // هل الصنف متاح فعلاً (متاح + مخزون كافٍ)
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
        imageUrl: map['imageUrl'] as String? ?? '',
        isAvailable: map['isAvailable'] as bool? ?? true,
        extras: List<String>.from(map['extras'] as List? ?? []),
        stockQuantity: (map['stockQuantity'] as num?)?.toInt(),
        trackStock: map['trackStock'] as bool? ?? false,
        totalSold: (map['totalSold'] as num?)?.toInt() ?? 0,
      );

  Map<String, dynamic> toMap() => {
        'restaurantId': restaurantId,
        'categoryId': categoryId,
        'name': name,
        'description': description,
        'price': price,
        'emoji': emoji,
        'imageUrl': imageUrl,
        'isAvailable': isAvailable,
        'extras': extras,
        'stockQuantity': stockQuantity,
        'trackStock': trackStock,
        'totalSold': totalSold,
      };

  MenuItem copyWith({
    String? name,
    String? description,
    double? price,
    String? emoji,
    String? imageUrl,
    bool? isAvailable,
    List<String>? extras,
    int? stockQuantity,
    bool? trackStock,
    int? totalSold,
  }) =>
      MenuItem(
        id: id,
        restaurantId: restaurantId,
        categoryId: categoryId,
        name: name ?? this.name,
        description: description ?? this.description,
        price: price ?? this.price,
        emoji: emoji ?? this.emoji,
        imageUrl: imageUrl ?? this.imageUrl,
        isAvailable: isAvailable ?? this.isAvailable,
        extras: extras ?? this.extras,
        stockQuantity: stockQuantity ?? this.stockQuantity,
        trackStock: trackStock ?? this.trackStock,
        totalSold: totalSold ?? this.totalSold,
      );
}

// ══════════════════════════════════════════════════════════
//  DRIVER
// ══════════════════════════════════════════════════════════
class Driver {
  final String id;
  final String name;
  final String phone;
  final String vehicleType;
  final String vehiclePlate;
  final bool isAvailable;
  final bool isOnline;
  final double totalEarnings;
  final double pendingPayout;
  final int totalDeliveries;
  final double rating;
  final int ratingCount;

  const Driver({
    required this.id,
    required this.name,
    required this.phone,
    required this.vehicleType,
    this.vehiclePlate = '',
    this.isAvailable = true,
    this.isOnline = false,
    this.totalEarnings = 0,
    this.pendingPayout = 0,
    this.totalDeliveries = 0,
    this.rating = 5.0,
    this.ratingCount = 0,
  });

  factory Driver.fromMap(Map<String, dynamic> map, String id) => Driver(
        id: id,
        name: map['name'] as String? ?? '',
        phone: map['phone'] as String? ?? '',
        vehicleType: map['vehicleType'] as String? ?? 'دراجة نارية',
        vehiclePlate: map['vehiclePlate'] as String? ?? '',
        isAvailable: map['isAvailable'] as bool? ?? true,
        isOnline: map['isOnline'] as bool? ?? false,
        totalEarnings: (map['totalEarnings'] as num?)?.toDouble() ?? 0,
        pendingPayout: (map['pendingPayout'] as num?)?.toDouble() ?? 0,
        totalDeliveries: (map['totalDeliveries'] as num?)?.toInt() ?? 0,
        rating: (map['rating'] as num?)?.toDouble() ?? 5.0,
        ratingCount: (map['ratingCount'] as num?)?.toInt() ?? 0,
      );

  Map<String, dynamic> toMap() => {
        'name': name,
        'phone': phone,
        'vehicleType': vehicleType,
        'vehiclePlate': vehiclePlate,
        'isAvailable': isAvailable,
        'isOnline': isOnline,
        'totalEarnings': totalEarnings,
        'pendingPayout': pendingPayout,
        'totalDeliveries': totalDeliveries,
        'rating': rating,
        'ratingCount': ratingCount,
      };

  Driver copyWith({
    String? name,
    String? phone,
    String? vehicleType,
    String? vehiclePlate,
    bool? isAvailable,
    bool? isOnline,
    double? totalEarnings,
    double? pendingPayout,
    int? totalDeliveries,
    double? rating,
    int? ratingCount,
  }) =>
      Driver(
        id: id,
        name: name ?? this.name,
        phone: phone ?? this.phone,
        vehicleType: vehicleType ?? this.vehicleType,
        vehiclePlate: vehiclePlate ?? this.vehiclePlate,
        isAvailable: isAvailable ?? this.isAvailable,
        isOnline: isOnline ?? this.isOnline,
        totalEarnings: totalEarnings ?? this.totalEarnings,
        pendingPayout: pendingPayout ?? this.pendingPayout,
        totalDeliveries: totalDeliveries ?? this.totalDeliveries,
        rating: rating ?? this.rating,
        ratingCount: ratingCount ?? this.ratingCount,
      );
}

// ══════════════════════════════════════════════════════════
//  ORDER ITEM
// ══════════════════════════════════════════════════════════
class OrderItem {
  final String menuItemId;
  final String name;
  final double price;
  final String emoji;
  final int quantity;
  final String? extras;

  const OrderItem({
    required this.menuItemId,
    required this.name,
    required this.price,
    required this.emoji,
    this.quantity = 1,
    this.extras,
  });

  double get subtotal => price * quantity;

  factory OrderItem.fromMap(Map<String, dynamic> map) => OrderItem(
        menuItemId: map['menuItemId'] as String? ?? '',
        name: map['name'] as String? ?? '',
        price: (map['price'] as num?)?.toDouble() ?? 0.0,
        emoji: map['emoji'] as String? ?? '🍽️',
        quantity: (map['quantity'] as num?)?.toInt() ?? 1,
        extras: map['extras'] as String?,
      );

  Map<String, dynamic> toMap() => {
        'menuItemId': menuItemId,
        'name': name,
        'price': price,
        'emoji': emoji,
        'quantity': quantity,
        if (extras != null) 'extras': extras,
      };

  OrderItem copyWith({int? quantity, String? extras}) => OrderItem(
        menuItemId: menuItemId,
        name: name,
        price: price,
        emoji: emoji,
        quantity: quantity ?? this.quantity,
        extras: extras ?? this.extras,
      );
}

// ══════════════════════════════════════════════════════════
//  ORDER — مع إضافات Phase 1
// ══════════════════════════════════════════════════════════
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
  // ✅ جديد Phase 1: التقييم
  final double? customerRating;       // تقييم العميل للطلب (1-5)
  final String? customerReview;       // تعليق العميل
  final double? driverRating;         // تقييم العميل للسائق (1-5)
  final bool isRated;                 // هل قيّم العميل؟
  final DateTime? ratedAt;            // وقت التقييم
  // ✅ جديد Phase 1: عمولة 1%
  final double platformCommission;    // عمولة المنصة (1% من الطلب)
  final DateTime? deliveredAt;        // وقت التوصيل الفعلي

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
    this.customerReview,
    this.driverRating,
    this.isRated = false,
    this.ratedAt,
    this.platformCommission = 0,
    this.deliveredAt,
  });

  double get itemsTotal => items.fold(0.0, (s, i) => s + i.subtotal);
  double get grandTotal => itemsTotal + deliveryFee;
  int get itemCount => items.fold(0, (s, i) => s + i.quantity);

  // حساب عمولة 1% تلقائياً
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
        // ✅ إصلاح: يقبل الاثنين (حرف صغير وكبير للتوافق مع البيانات القديمة)
        orderNumber: (map['orderNumber'] ?? map['OrderNumber'] ?? id.substring(0, 6).toUpperCase()) as String,
        customerRating: (map['customerRating'] as num?)?.toDouble(),
        customerReview: map['customerReview'] as String?,
        driverRating: (map['driverRating'] as num?)?.toDouble(),
        isRated: map['isRated'] as bool? ?? false,
        ratedAt: (map['ratedAt'] as Timestamp?)?.toDate(),
        platformCommission: (map['platformCommission'] as num?)?.toDouble() ?? 0,
        deliveredAt: (map['deliveredAt'] as Timestamp?)?.toDate(),
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
        'orderNumber': orderNumber,   // ✅ حرف صغير دائماً
        'customerRating': customerRating,
        'customerReview': customerReview,
        'driverRating': driverRating,
        'isRated': isRated,
        'ratedAt': ratedAt != null ? Timestamp.fromDate(ratedAt!) : null,
        'platformCommission': platformCommission,
        'deliveredAt': deliveredAt != null ? Timestamp.fromDate(deliveredAt!) : null,
      };

  Order copyWith({
    OrderStatus? status,
    bool? isPaid,
    String? driverId,
    String? driverName,
    DateTime? updatedAt,
    double? customerRating,
    String? customerReview,
    double? driverRating,
    bool? isRated,
    DateTime? ratedAt,
    double? platformCommission,
    DateTime? deliveredAt,
  }) =>
      Order(
        id: id,
        restaurantId: restaurantId,
        restaurantName: restaurantName,
        customerId: customerId,
        customerName: customerName,
        customerPhone: customerPhone,
        deliveryAddress: deliveryAddress,
        items: items,
        status: status ?? this.status,
        paymentMethod: paymentMethod,
        isPaid: isPaid ?? this.isPaid,
        createdAt: createdAt,
        updatedAt: updatedAt ?? this.updatedAt,
        driverId: driverId ?? this.driverId,
        driverName: driverName ?? this.driverName,
        notes: notes,
        deliveryFee: deliveryFee,
        orderNumber: orderNumber,
        customerRating: customerRating ?? this.customerRating,
        customerReview: customerReview ?? this.customerReview,
        driverRating: driverRating ?? this.driverRating,
        isRated: isRated ?? this.isRated,
        ratedAt: ratedAt ?? this.ratedAt,
        platformCommission: platformCommission ?? this.platformCommission,
        deliveredAt: deliveredAt ?? this.deliveredAt,
      );
}

// ══════════════════════════════════════════════════════════
//  COMPLAINT — جديد Phase 1
// ══════════════════════════════════════════════════════════
class Complaint {
  final String id;
  final String orderId;
  final String orderNumber;
  final String customerId;
  final String customerName;
  final String restaurantId;
  final String restaurantName;
  final ComplaintType type;
  final String description;
  final ComplaintStatus status;
  final DateTime createdAt;
  final DateTime? resolvedAt;
  final String? adminNote;
  final String? resolution;

  const Complaint({
    required this.id,
    required this.orderId,
    required this.orderNumber,
    required this.customerId,
    required this.customerName,
    required this.restaurantId,
    required this.restaurantName,
    required this.type,
    required this.description,
    this.status = ComplaintStatus.open,
    required this.createdAt,
    this.resolvedAt,
    this.adminNote,
    this.resolution,
  });

  factory Complaint.fromMap(Map<String, dynamic> map, String id) => Complaint(
        id: id,
        orderId: map['orderId'] as String? ?? '',
        orderNumber: map['orderNumber'] as String? ?? '',
        customerId: map['customerId'] as String? ?? '',
        customerName: map['customerName'] as String? ?? '',
        restaurantId: map['restaurantId'] as String? ?? '',
        restaurantName: map['restaurantName'] as String? ?? '',
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
        resolvedAt: (map['resolvedAt'] as Timestamp?)?.toDate(),
        adminNote: map['adminNote'] as String?,
        resolution: map['resolution'] as String?,
      );

  Map<String, dynamic> toMap() => {
        'orderId': orderId,
        'orderNumber': orderNumber,
        'customerId': customerId,
        'customerName': customerName,
        'restaurantId': restaurantId,
        'restaurantName': restaurantName,
        'type': type.name,
        'description': description,
        'status': status.name,
        'createdAt': Timestamp.fromDate(createdAt),
        'resolvedAt': resolvedAt != null ? Timestamp.fromDate(resolvedAt!) : null,
        'adminNote': adminNote,
        'resolution': resolution,
      };

  Complaint copyWith({
    ComplaintStatus? status,
    String? adminNote,
    String? resolution,
    DateTime? resolvedAt,
  }) =>
      Complaint(
        id: id,
        orderId: orderId,
        orderNumber: orderNumber,
        customerId: customerId,
        customerName: customerName,
        restaurantId: restaurantId,
        restaurantName: restaurantName,
        type: type,
        description: description,
        status: status ?? this.status,
        createdAt: createdAt,
        resolvedAt: resolvedAt ?? this.resolvedAt,
        adminNote: adminNote ?? this.adminNote,
        resolution: resolution ?? this.resolution,
      );
}

// ══════════════════════════════════════════════════════════
//  CART ITEM (local only — لا يُحفظ في Firestore)
// ══════════════════════════════════════════════════════════
class CartItem {
  final MenuItem item;
  int quantity;
  String? extras;

  CartItem({required this.item, this.quantity = 1, this.extras});

  double get subtotal => item.price * quantity;
}
