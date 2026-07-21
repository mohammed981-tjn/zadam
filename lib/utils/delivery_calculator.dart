// lib/utils/delivery_calculator.dart
import 'dart:math' as math;

class DeliveryCalculator {
  // نسبة المنصة من مبيعات الوجبات
  static const double defaultPlatformPercentage = 0.05; // 5%
  // نسبة ضريبة القيمة المضافة السعودية
  static const double vatPercentage = 0.15; // 15%

  /// حساب المسافة بين نقطتين جغرافيتين (Haversine Formula)
  static double calculateDistance(
    double lat1, double lon1,
    double lat2, double lon2,
  ) {
    const earthRadius = 6371.0;
    final dLat = _toRad(lat2 - lat1);
    final dLon = _toRad(lon2 - lon1);
    final a = math.sin(dLat / 2) * math.sin(dLat / 2) +
        math.cos(_toRad(lat1)) *
            math.cos(_toRad(lat2)) *
            math.sin(dLon / 2) *
            math.sin(dLon / 2);
    final c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a));
    return earthRadius * c;
  }

  static double _toRad(double deg) => deg * (math.pi / 180);

  /// التفصيل المالي الكامل لأي طلب
  static OrderBreakdown calculateOrderBreakdown({
    required double totalMealsPrice,
    required double deliveryFee,
    double platformPercentage = defaultPlatformPercentage,
    double driverPercentage = 1.0, // 100% من رسوم التوصيل
    bool includeVat = false,
  }) {
    // حصة المنصة 5% من مبيعات الوجبات
    final platformShare = totalMealsPrice * platformPercentage;
    // حصة المطعم الصافية
    final restaurantShare = totalMealsPrice - platformShare;
    // حصة السائق من رسوم التوصيل
    final driverShare = deliveryFee * driverPercentage;
    // الإجمالي قبل الضريبة
    final subtotal = totalMealsPrice + deliveryFee;
    // ضريبة القيمة المضافة
    final vat = includeVat ? subtotal * vatPercentage : 0.0;
    // الإجمالي الكلي
    final grandTotal = subtotal + vat;

    return OrderBreakdown(
      mealsTotal: totalMealsPrice,
      deliveryFee: deliveryFee,
      platformShare: platformShare,
      restaurantShare: restaurantShare,
      driverShare: driverShare,
      vat: vat,
      grandTotal: grandTotal,
    );
  }

  /// حساب رسوم التوصيل بناءً على المسافة
  static double calculateDeliveryFee({
    required double distanceKm,
    required double pricePerKm,
    required double minimumFee,
  }) {
    final calculated = distanceKm * pricePerKm;
    return calculated < minimumFee ? minimumFee : calculated;
  }
}

/// نموذج التفصيل المالي
class OrderBreakdown {
  final double mealsTotal;
  final double deliveryFee;
  final double platformShare;    // 5% حصة المنصة من مبيعات الوجبات
  final double restaurantShare;  // صافي المطعم بعد خصم حصة المنصة
  final double driverShare;      // مستحقات السائق من التوصيل
  final double vat;              // ضريبة القيمة المضافة
  final double grandTotal;       // الإجمالي الكلي للعميل

  const OrderBreakdown({
    required this.mealsTotal,
    required this.deliveryFee,
    required this.platformShare,
    required this.restaurantShare,
    required this.driverShare,
    required this.vat,
    required this.grandTotal,
  });

  /// عرض ملخص الحسبة للتشخيص
  @override
  String toString() => '''
--- تفصيل الطلب ---
إجمالي الوجبات:    ${mealsTotal.toStringAsFixed(2)} ر.س
رسوم التوصيل:      ${deliveryFee.toStringAsFixed(2)} ر.س
حصة المنصة (5%):   ${platformShare.toStringAsFixed(2)} ر.س
صافي المطعم:       ${restaurantShare.toStringAsFixed(2)} ر.س
مستحقات السائق:    ${driverShare.toStringAsFixed(2)} ر.س
ضريبة القيمة المضافة: ${vat.toStringAsFixed(2)} ر.س
الإجمالي الكلي:    ${grandTotal.toStringAsFixed(2)} ر.س
-------------------''';
}
