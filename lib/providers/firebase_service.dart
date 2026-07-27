// lib/providers/firebase_service.dart
import 'package:cloud_firestore/cloud_firestore.dart' hide Order;
import 'package:firebase_auth/firebase_auth.dart';
import '../models/models.dart' as models;

class FirebaseService {
  final FirebaseFirestore _db = FirebaseFirestore.instance;
  final FirebaseAuth _auth = FirebaseAuth.instance;

  CollectionReference<Map<String, dynamic>> get _users => _db.collection('users');
  CollectionReference<Map<String, dynamic>> get _restaurants => _db.collection('restaurants');
  CollectionReference<Map<String, dynamic>> get _orders => _db.collection('orders');
  CollectionReference<Map<String, dynamic>> get _drivers => _db.collection('drivers');
  CollectionReference<Map<String, dynamic>> get _complaints => _db.collection('complaints');

  CollectionReference<Map<String, dynamic>> _categories(String rId) =>
      _restaurants.doc(rId).collection('categories');
  CollectionReference<Map<String, dynamic>> _items(String rId) =>
      _restaurants.doc(rId).collection('items');

  Stream<User?> get authStateChanges => _auth.authStateChanges();
  User? get currentUser => _auth.currentUser;

  Future<UserCredential> signIn(String email, String password) =>
      _auth.signInWithEmailAndPassword(email: email, password: password);

  Future<UserCredential> register(String email, String password) =>
      _auth.createUserWithEmailAndPassword(email: email, password: password);

  Future<void> signOut() => _auth.signOut();

  Future<void> createUser(models.AppUser user) => _users.doc(user.uid).set(user.toMap());

  Future<models.AppUser?> getUser(String uid) async {
    final doc = await _users.doc(uid).get();
    if (!doc.exists || doc.data() == null) return null;
    return models.AppUser.fromMap(doc.data()!, doc.id);
  }

  Stream<List<models.Restaurant>> streamRestaurants() =>
      _restaurants.orderBy('name').snapshots().map(
          (s) => s.docs.map((d) => models.Restaurant.fromMap(d.data(), d.id)).toList());

  Future<void> addRestaurant(models.Restaurant r) => _restaurants.doc(r.id).set(r.toMap());
  Future<void> updateRestaurant(models.Restaurant r) => _restaurants.doc(r.id).update(r.toMap());
  Future<void> toggleRestaurant(String id, bool isOpen) =>
      _restaurants.doc(id).update({'isOpen': isOpen});

  Stream<List<models.MenuCategory>> streamCategories(String rId) => _categories(rId)
      .orderBy('sortOrder')
      .snapshots()
      .map((s) => s.docs.map((d) => models.MenuCategory.fromMap(d.data(), d.id)).toList());

  Future<void> addCategory(models.MenuCategory cat) =>
      _categories(cat.restaurantId).doc(cat.id).set(cat.toMap());

  Stream<List<models.MenuItem>> streamMenuItems(String rId) => _items(rId)
      .snapshots()
      .map((s) => s.docs.map((d) => models.MenuItem.fromMap(d.data(), d.id)).toList());

  Future<void> addMenuItem(models.MenuItem item) =>
      _items(item.restaurantId).doc(item.id).set(item.toMap());
  Future<void> updateMenuItem(models.MenuItem item) =>
      _items(item.restaurantId).doc(item.id).update(item.toMap());
  Future<void> toggleItemAvailability(String rId, String itemId, bool isAvailable) =>
      _items(rId).doc(itemId).update({'isAvailable': isAvailable});
  Future<void> deleteMenuItem(String rId, String itemId) =>
      _items(rId).doc(itemId).delete();

  Stream<List<models.Driver>> streamDrivers() => _drivers
      .snapshots()
      .map((s) => s.docs.map((d) => models.Driver.fromMap(d.data(), d.id)).toList());

  Stream<models.Driver?> streamDriver(String driverId) => _drivers.doc(driverId).snapshots().map(
      (doc) => doc.exists && doc.data() != null ? models.Driver.fromMap(doc.data()!, doc.id) : null);

  Future<void> addDriver(models.Driver d) => _drivers.doc(d.id).set(d.toMap());
  Future<void> updateDriver(models.Driver d) => _drivers.doc(d.id).update(d.toMap());
  Future<void> setDriverOnline(String id, bool isOnline) =>
      _drivers.doc(id).update({'isOnline': isOnline});

  Future<void> markPayoutDone(String driverId, double amount) =>
      _drivers.doc(driverId).update({
        'totalEarnings': FieldValue.increment(amount),
        'pendingPayout': 0,
      });

  Future<void> updateDriverRating(String driverId, double newRating) async {
    final doc = await _drivers.doc(driverId).get();
    if (!doc.exists || doc.data() == null) return;
    final driver = models.Driver.fromMap(doc.data()!, doc.id);
    final newCount = driver.ratingCount + 1;
    final newAvg = ((driver.rating * driver.ratingCount) + newRating) / newCount;
    await _drivers.doc(driverId).update({
      'rating': double.parse(newAvg.toStringAsFixed(1)),
      'ratingCount': newCount,
    });
  }

  Future<String> placeOrder(models.Order order) async {
    await _orders.doc(order.id).set(order.toMap());
    return order.id;
  }

  Stream<List<models.Order>> streamAllOrders() => _orders
      .orderBy('createdAt', descending: true)
      .snapshots()
      .map((s) => s.docs.map((d) => models.Order.fromMap(d.data(), d.id)).toList());

  Stream<List<models.Order>> streamCustomerOrders(String customerId) => _orders
      .where('customerId', isEqualTo: customerId)
      .orderBy('createdAt', descending: true)
      .snapshots()
      .map((s) => s.docs.map((d) => models.Order.fromMap(d.data(), d.id)).toList());

  Stream<List<models.Order>> streamDriverOrders(String driverId) => _orders
      .where('driverId', isEqualTo: driverId)
      .orderBy('createdAt', descending: true)
      .snapshots()
      .map((s) => s.docs.map((d) => models.Order.fromMap(d.data(), d.id)).toList());

  Stream<models.Order?> streamOrder(String orderId) => _orders.doc(orderId).snapshots().map(
      (doc) => doc.exists && doc.data() != null ? models.Order.fromMap(doc.data()!, doc.id) : null);

  Future<void> updateOrderStatus(String orderId, models.OrderStatus status) =>
      _orders.doc(orderId).update({
        'status': status.name,
        'updatedAt': FieldValue.serverTimestamp(),
      });

  Future<void> assignDriver(String orderId, String driverId, String driverName) async {
    final batch = _db.batch();
    batch.update(_orders.doc(orderId), {
      'driverId': driverId,
      'driverName': driverName,
      'status': models.OrderStatus.outForDelivery.name,
      'updatedAt': FieldValue.serverTimestamp(),
    });
    batch.update(_drivers.doc(driverId), {'isAvailable': false});
    await batch.commit();
  }

  Future<void> markOrderDelivered(String orderId, String driverId) async {
    final orderDoc = await _orders.doc(orderId).get();
    double commission = 0;
    if (orderDoc.exists && orderDoc.data() != null) {
      final order = models.Order.fromMap(orderDoc.data()!, orderDoc.id);
      commission = order.calculatedCommission;
    }
    final batch = _db.batch();
    batch.update(_orders.doc(orderId), {
      'status': models.OrderStatus.delivered.name,
      'isPaid': true,
      'updatedAt': FieldValue.serverTimestamp(),
      'platformCommission': commission,
    });
    batch.update(_drivers.doc(driverId), {
      'totalDeliveries': FieldValue.increment(1),
      'pendingPayout': FieldValue.increment(10),
      'isAvailable': true,
    });
    await batch.commit();
  }

  Future<void> cancelOrder(String orderId) => _orders.doc(orderId).update({
        'status': models.OrderStatus.cancelled.name,
        'updatedAt': FieldValue.serverTimestamp(),
      });

  Future<void> rateOrder({
    required String orderId,
    required String driverId,
    required double orderRating,
    required double driverRating,
    String? review,
  }) async {
    await _orders.doc(orderId).update({
      'customerRating': orderRating,
      'driverRating': driverRating,
      'isRated': true,
      if (review != null) 'review': review,
    });
    await updateDriverRating(driverId, driverRating);
  }

  Stream<List<models.Complaint>> streamComplaints() => _complaints
      .orderBy('createdAt', descending: true)
      .snapshots()
      .map((s) => s.docs.map((d) => models.Complaint.fromMap(d.data(), d.id)).toList());

  Future<void> submitComplaint(models.Complaint complaint) =>
      _complaints.doc(complaint.id).set(complaint.toMap());

  Future<void> updateComplaintStatus(
    String complaintId,
    models.ComplaintStatus status, {
    String? adminNote,
    String? resolution,
  }) =>
      _complaints.doc(complaintId).update({
        'status': status.name,
        if (adminNote != null) 'adminNote': adminNote,
        if (resolution != null) 'resolution': resolution,
      });
}
