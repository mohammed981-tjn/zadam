import 'package:cloud_firestore/cloud_firestore.dart' hide Order;
import '../models/models.dart';

class FirebaseService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  // جلب الطلبات
  Stream<List<Order>> getOrders() {
    return _firestore.collection('orders').snapshots().map((snapshot) {
      return snapshot.docs.map((doc) {
        return Order.fromMap(doc.data(), doc.id);
      }).toList();
    });
  }

  // تحديث حالة الطلب
  Future<void> updateOrderStatus(String orderId, String status) async {
    await _firestore.collection('orders').doc(orderId).update({
      'status': status,
    });
  }

  // إضافة طلب جديد
  Future<void> createOrder(Order order) async {
    await _firestore.collection('orders').add(order.toMap());
  }

  // جلب تفاصيل طلب معين
  Future<Order?> getOrderById(String orderId) async {
    DocumentSnapshot doc = await _firestore.collection('orders').doc(orderId).get();
    if (doc.exists) {
      return Order.fromMap(doc.data() as Map<String, dynamic>, doc.id);
    }
    return null;
  }
}
