// lib/providers/firebase_service.dart
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../models/models.dart' as my_models;

class FirebaseService {
  final FirebaseFirestore _db = FirebaseFirestore.instance;
  final FirebaseAuth _auth = FirebaseAuth.instance;

  // ── Collection References ──────────────────────────────
  CollectionReference<Map<String, dynamic>> get _users =>
      _db.collection('users');
  CollectionReference<Map<String, dynamic>> get _restaurants =>
      _db.collection('restaurants');
  CollectionReference<Map<String, dynamic>> get _orders =>
      _db.collection('orders');
  CollectionReference<Map<String, dynamic>> get _drivers =>
      _db.collection('drivers');
  CollectionReference<Map<String, dynamic>> get _complaints =>
      _db.collection('complaints');

  CollectionReference<Map<String, dynamic>> _categories(String rId) =>
      _restaurants.doc(rId).collection('categories');
  CollectionReference<Map<String, dynamic>> _items(String rId) =>
      _restaurants.doc(rId).collection('items');

  // ══════════════════════════════════════════════════════════
  //  AUTH
  // ══════════════════════════════════════════════════════════
  Stream<User?> get authStateChanges => _auth.authStateChanges();
  User? get currentUser => _auth.currentUser;

  Future<UserCredential> signIn(String email, String password) =>
      _auth.signInWithEmailAndPassword(email: email, password: password);

  Future<UserCredential> register(String email, String password) =>
      _auth.createUserWithEmailAndPassword(email: email, password: password);

  Future<void> signOut() => _auth.signOut();

  // ══════════════════════════════════════════════════════════
  //  USERS
  // ══════════════════════════════════════════════════════════
  Future<void> createUser(my_models.AppUser user) =>
      _users.doc(user.uid).set(user.toMap());

  Future<my_models.AppUser?> getUser(String uid) async {
    final doc = await _users.doc(uid).get();
    if (!doc.exists || doc.data() == null) return null;
    return my_models.AppUser.fromMap(doc.data()!, doc.id);
  }

  Future<void> updateUser(String uid, Map<String, dynamic> data) =>
      _users.doc(uid).update(data);

  // ══════════════════════════════════════════════════════════
  //  RESTAURANTS
  // ══════════════════════════════════════════════════════════
  Stream<List<my_models.Restaurant>> streamRestaurants() =>
      _restaurants.orderBy('name').snapshots().map((s) => s.docs
          .map((d) => my_models.Restaurant.fromMap(d.data(), d.id))
          .toList());

  Future<void> addRestaurant(my_models.Restaurant r) =>
      _restaurants.doc(r.id).set(r.toMap());

  Future<void> updateRestaurant(my_models.Restaurant r) =>
      _restaurants.doc(r.id).update(r.toMap());

  Future<void> toggleRestaurant(String id, bool isOpen) =>
      _restaurants.doc(id).update({'isOpen': isOpen});

  Future<my_models.Restaurant?> getRestaurant(String id) async {
    final doc = await _restaurants.doc(id).get();
    if (!doc.exists || doc.data() == null) return null;
    return my_models.Restaurant.fromMap(doc.data()!, doc.id);
  }

  // ══════════════════════════════════════════════════════════
  //  MENU CATEGORIES
  // ══════════════════════════════════════════════════════════
  Stream<List<my_models.MenuCategory>> streamCategories(String rId) =>
      _categories(rId)
          .orderBy('sortOrder')
          .snapshots()
          .map((s) => s.docs
              .map((d) => my_models.MenuCategory.fromMap(d.data(), d.id))
              .toList());

  Future<void> addCategory(my_models.MenuCategory cat) =>
      _categories(cat.restaurantId).doc(cat.id).set(cat.toMap());

  Future<void> updateCategory(my_models.MenuCategory cat) =>
      _categories(cat.restaurantId).doc(cat.id).update(cat.toMap());

  Future<void> deleteCategory(String rId, String catId) =>
      _categories(rId).doc(catId).delete();

  // ══════════════════════════════════════════════════════════
  //  MENU ITEMS
  // ══════════════════════════════════════════════════════════
  Stream<List<my_models.MenuItem>> streamMenuItems(String rId) =>
      _items(rId).snapshots().map((s) =>
          s.docs.map((d) => my_models.MenuItem.fromMap(d.data(), d.id)).toList());

  Future<void> addMenuItem(my_models.MenuItem item) =>
      _items(item.restaurantId).doc(item.id).set(item.toMap());

  Future<void> updateMenuItem(my_models.MenuItem item) =>
      _items(item.restaurantId).doc(item.id).update(item.toMap());

  Future<void> deleteMenuItem(String rId, String itemId) =>
      _items(rId).doc(itemId).delete();

  Future<void> toggleItemAvailability(
          String rId, String itemId, bool isAvailable) =>
      _items(rId).doc(itemId).update({'isAvailable': isAvailable});

  // ✅ Phase 1: تحديث المخزون عند الطلب
  Future<void> decrementStock(String rId, String itemId, int qty) =>
      _items(rId).doc(itemId).update({
        'stockQuantity': FieldValue.increment(-qty),
        'totalSold': FieldValue.increment(qty),
      });

  // ══════════════════════════════════════════════════════════
  //  DRIVERS
  // ══════════════════════════════════════════════════════════
  Stream<List<my_models.Driver>> streamDrivers() =>
      _drivers.snapshots().map((s) =>
          s.docs.map((d) => my_models.Driver.fromMap(d.data(), d.id)).toList());

  Stream<my_models.Driver?> streamDriver(String driverId) =>
      _drivers.doc(driverId).snapshots().map((doc) =>
          doc.exists && doc.data() != null
              ? my_models.Driver.fromMap(doc.data()!, doc.id)
              : null);

  Future<void> addDriver(my_models.Driver d) =>
      _drivers.doc(d.id).set(d.toMap());

  Future<void> updateDriver(my_models.Driver d) =>
      _drivers.doc(d.id).update(d.toMap());

  Future<void> toggleDriverAvailability(String id, bool isAvailable) =>
      _drivers.doc(id).update({'isAvailable': isAvailable});

  Future<void> setDriverOnline(String id, bool isOnline) =>
      _drivers.doc(id).update({'isOnline': isOnline});

  Future<void> markPayoutDone(String driverId, double amount) =>
      _drivers.doc(driverId).update({
        'totalEarnings': FieldValue.increment(amount),
        'pendingPayout': 0,
      });

  // ✅ Phase 1: تحديث تقييم السائق بناءً على المتوسط الحسابي
  Future<void> updateDriverRating(
      String driverId, double newRating) async {
    final doc = await _drivers.doc(driverId).get();
    if (!doc.exists || doc.data() == null) return;
    final driver = my_models.Driver.fromMap(doc.data()!, doc.id);
    final newCount = driver.ratingCount + 1;
    final newAvg =
        ((driver.rating * driver.ratingCount) + newRating) / newCount;
    await _drivers.doc(driverId).update({
      'rating': double.parse(newAvg.toStringAsFixed(1)),
      'ratingCount': newCount,
    });
  }

  // ══════════════════════════════════════════════════════════
  //  ORDERS
  // ══════════════════════════════════════════════════════════
  Future<String> placeOrder(my_models.Order order) async {
    final batch = _db.batch();
    batch.set(_orders.doc(order.id), order.toMap());

    // ✅ تحديث إجمالي طلبات المطعم
    batch.update(_restaurants.doc(order.restaurantId), {
      'totalOrders': FieldValue.increment(1),
    });

    await batch.commit();
    return order.id;
  }

  Stream<List<my_models.Order>> streamAllOrders() =>
      _orders
          .orderBy('createdAt', descending: true)
          .snapshots()
          .map((s) => s.docs
              .map((d) => my_models.Order.fromMap(d.data(), d.id))
              .toList());

  Stream<List<my_models.Order>> streamActiveOrders() =>
      _orders
          .where('status', whereIn: [
            'pending',
            'confirmed',
            'preparing',
            'readyForPickup',
            'outForDelivery',
          ])
          .orderBy('createdAt', descending: true)
          .snapshots()
          .map((s) => s.docs
              .map((d) => my_models.Order.fromMap(d.data(), d.id))
              .toList());

  Stream<List<my_models.Order>> streamCustomerOrders(String customerId) =>
      _orders
          .where('customerId', isEqualTo: customerId)
          .orderBy('createdAt', descending: true)
          .snapshots()
          .map((s) => s.docs
              .map((d) => my_models.Order.fromMap(d.data(), d.id))
              .toList());

  Stream<List<my_models.Order>> streamDriverOrders(String driverId) =>
      _orders
          .where('driverId', isEqualTo: driverId)
          .orderBy('createdAt', descending: true)
          .snapshots()
          .map((s) => s.docs
              .map((d) => my_models.Order.fromMap(d.data(), d.id))
              .toList());

  Stream<my_models.Order?> streamOrder(String orderId) =>
      _orders.doc(orderId).snapshots().map((doc) =>
          doc.exists && doc.data() != null
              ? my_models.Order.fromMap(doc.data()!, doc.id)
              : null);

  Future<void> updateOrderStatus(String orderId, my_models.OrderStatus status) =>
      _orders.doc(orderId).update({
        'status': status.name,
        'updatedAt': FieldValue.serverTimestamp(),
      });

  Future<void> confirmOrder(String orderId) async {
    await _orders.doc(orderId).update({
      'status': my_models.OrderStatus.confirmed.name,
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  Future<void> assignDriver(
      String orderId, String driverId, String driverName) async {
    final batch = _db.batch();
    batch.update(_orders.doc(orderId), {
      'driverId': driverId,
      'driverName': driverName,
      'status': my_models.OrderStatus.outForDelivery.name,
      'updatedAt': FieldValue.serverTimestamp(),
    });
    batch.update(_drivers.doc(driverId), {
      'isAvailable': false,
    });
    await batch.commit();
  }

  Future<void> markOrderDelivered(String orderId, String driverId) async {
    final batch = _db.batch();
    final now = DateTime.now();

    // ✅ حساب العمولة تلقائياً
    final orderDoc = await _orders.doc(orderId).get();
    double commission = 0;
    if (orderDoc.exists && orderDoc.data() != null) {
      final order = my_models.Order.fromMap(orderDoc.data()!, orderDoc.id);
      commission = order.calculatedCommission;
    }

    batch.update(_orders.doc(orderId), {
      'status': my_models.OrderStatus.delivered.name,
      'isPaid': true,
      'deliveredAt': Timestamp.fromDate(now),
      'updatedAt': Timestamp.fromDate(now),
      'platformCommission': commission,
    });

    batch.update(_drivers.doc(driverId), {
      'totalDeliveries': FieldValue.increment(1),
      'pendingPayout': FieldValue.increment(10),
      'isAvailable': true,
    });

    await batch.commit();
  }

  Future<void> cancelOrder(String orderId, {String? driverId}) async {
    final batch = _db.batch();
    batch.update(_orders.doc(orderId), {
      'status': my_models.OrderStatus.cancelled.name,
      'updatedAt': FieldValue.serverTimestamp(),
    });
    if (driverId != null) {
      batch.update(_drivers.doc(driverId), {'isAvailable': true});
    }
    await batch.commit();
  }

  // ✅ Phase 1: تقييم الطلب والسائق
  Future<void> rateOrder({
    required String orderId,
    required String driverId,
    required double orderRating,
    required double driverRating,
    String? review,
  }) async {
    final batch = _db.batch();
    final now = DateTime.now();

    batch.update(_orders.doc(orderId), {
      'customerRating': orderRating,
      'driverRating': driverRating,
      'customerReview': review,
      'isRated': true,
      'ratedAt': Timestamp.fromDate(now),
    });

    await batch.commit();

    // تحديث متوسط تقييم السائق
    await updateDriverRating(driverId, driverRating);
  }

  // ══════════════════════════════════════════════════════════
  //  COMPLAINTS — جديد Phase 1
  // ══════════════════════════════════════════════════════════
  Stream<List<my_models.Complaint>> streamComplaints() =>
      _complaints
          .orderBy('createdAt', descending: true)
          .snapshots()
          .map((s) => s.docs
              .map((d) => my_models.Complaint.fromMap(d.data(), d.id))
              .toList());

  Stream<List<my_models.Complaint>> streamCustomerComplaints(String customerId) =>
      _complaints
          .where('customerId', isEqualTo: customerId)
          .orderBy('createdAt', descending: true)
          .snapshots()
          .map((s) => s.docs
              .map((d) => my_models.Complaint.fromMap(d.data(), d.id))
              .toList());

  Future<void> submitComplaint(my_models.Complaint complaint) =>
      _complaints.doc(complaint.id).set(complaint.toMap());

  Future<void> updateComplaintStatus(
    String complaintId,
    my_models.ComplaintStatus status, {
    String? adminNote,
    String? resolution,
  }) =>
      _complaints.doc(complaintId).update({
        'status': status.name,
        if (adminNote != null) 'adminNote': adminNote,
        if (resolution != null) 'resolution': resolution,
        if (status == my_models.ComplaintStatus.resolved ||
            status == my_models.ComplaintStatus.closed)
          'resolvedAt': FieldValue.serverTimestamp(),
      });

  // ══════════════════════════════════════════════════════════
  //  ANALYTICS — جديد Phase 1
  // ══════════════════════════════════════════════════════════
  Future<Map<String, dynamic>> getAdminStats() async {
    final ordersSnap = await _orders.get();
    final orders = ordersSnap.docs
        .map((d) => my_models.Order.fromMap(d.data(), d.id))
        .toList();

    final delivered = orders.where((o) => o.status == my_models.OrderStatus.delivered);
    
    // إضافة الكنية هنا ليتعرف الكود على خصائص الـ Enum المخصصة لك
    final active = orders.where((o) => (o.status as my_models.OrderStatus).isActive);
    final cancelled = orders.where((o) => o.status == my_models.OrderStatus.cancelled);

    double totalRevenue = 0;
    double totalCommission = 0;
    final Map<String, int> itemsSold = {};
    final Map<int, int> ordersByHour = {};

    for (final o in delivered) {
      totalRevenue += o.grandTotal;
      totalCommission += o.platformCommission;
      final hour = o.createdAt.hour;
      ordersByHour[hour] = (ordersByHour[hour] ?? 0) + 1;
      for (final item in o.items) {
        itemsSold[item.name] = (itemsSold[item.name] ?? 0) + item.quantity;
      }
    }

    // أوقات الذروة
    int peakHour = 0;
    int peakCount = 0;
    ordersByHour.forEach((hour, count) {
      if (count > peakCount) {
        peakCount = count;
        peakHour = hour;
      }
    });

    // الأصناف الأكثر مبيعاً
    final sortedItems = itemsSold.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));

    // الشكاوى المفتوحة
    final complaintsSnap =
        await _complaints.where('status', isEqualTo: 'open').get();

    return {
      'totalOrders': orders.length,
      'activeOrders': active.length,
      'deliveredOrders': delivered.length,
      'cancelledOrders': cancelled.length,
      'totalRevenue': totalRevenue,
      'totalCommission': totalCommission,
      'openComplaints': complaintsSnap.size,
      'peakHour': peakHour,
      'ordersByHour': ordersByHour,
      'topItems': sortedItems.take(5).toList(),
    };
  }
}