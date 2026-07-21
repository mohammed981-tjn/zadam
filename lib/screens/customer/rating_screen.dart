// lib/screens/customer/rating_screen.dart
import 'package:flutter/material.dart';
import 'package:flutter_rating_bar/flutter_rating_bar.dart';
import 'package:provider/provider.dart';
import '../../models/models.dart';
import '../../providers/firebase_service.dart';
import '../../utils/theme.dart';
import '../../utils/helpers.dart';

class RatingScreen extends StatefulWidget {
  final Order order;
  const RatingScreen({super.key, required this.order});
  @override
  State<RatingScreen> createState() => _RatingScreenState();
}

class _RatingScreenState extends State<RatingScreen> {
  double _orderRating = 5;
  double _driverRating = 5;
  final _reviewCtrl = TextEditingController();
  bool _loading = false;

  @override
  void dispose() {
    _reviewCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _loading = true);
    try {
      await context.read<FirebaseService>().rateOrder(
            orderId: widget.order.id,
            driverId: widget.order.driverId ?? '',
            orderRating: _orderRating,
            driverRating: _driverRating,
            review: _reviewCtrl.text.trim().isEmpty
                ? null
                : _reviewCtrl.text.trim(),
          );
      if (mounted) {
        showSuccess(context, 'شكراً على تقييمك!');
        Navigator.pop(context);
      }
    } catch (e) {
      setState(() => _loading = false);
      if (mounted) showError(context, 'فشل التقييم، حاول مرة أخرى');
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('تقييم الطلب')),
        body: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            // Header
            const Center(
              child: Text('⭐', style: TextStyle(fontSize: 60)),
            ),
            const SizedBox(height: 12),
            Center(
              child: Text('طلب #${widget.order.orderNumber}',
                  style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: AppColors.textDark)),
            ),
            const SizedBox(height: 4),
            Center(
              child: Text(widget.order.restaurantName,
                  style: const TextStyle(color: AppColors.textGray)),
            ),
            const SizedBox(height: 32),

            // Order rating
            Card(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  children: [
                    const Text('كيف كانت جودة الطلب؟',
                        style: TextStyle(
                            fontSize: 16, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 16),
                    RatingBar.builder(
                      initialRating: _orderRating,
                      minRating: 1,
                      itemCount: 5,
                      itemSize: 44,
                      itemBuilder: (_, __) =>
                          const Icon(Icons.star_rounded,
                              color: Colors.amber),
                      onRatingUpdate: (r) =>
                          setState(() => _orderRating = r),
                    ),
                    const SizedBox(height: 8),
                    Text(_ratingLabel(_orderRating),
                        style: const TextStyle(color: AppColors.textGray)),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),

            // Driver rating
            if (widget.order.driverId != null)
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    children: [
                      const Text('كيف كان أداء السائق؟',
                          style: TextStyle(
                              fontSize: 16, fontWeight: FontWeight.bold)),
                      const SizedBox(height: 16),
                      RatingBar.builder(
                        initialRating: _driverRating,
                        minRating: 1,
                        itemCount: 5,
                        itemSize: 44,
                        itemBuilder: (_, __) =>
                            const Icon(Icons.star_rounded,
                                color: Colors.amber),
                        onRatingUpdate: (r) =>
                            setState(() => _driverRating = r),
                      ),
                      const SizedBox(height: 8),
                      Text(_ratingLabel(_driverRating),
                          style:
                              const TextStyle(color: AppColors.textGray)),
                    ],
                  ),
                ),
              ),
            const SizedBox(height: 12),

            // Review text
            TextFormField(
              controller: _reviewCtrl,
              maxLines: 3,
              decoration: const InputDecoration(
                labelText: 'تعليقك (اختياري)',
                hintText: 'أخبرنا عن تجربتك...',
                prefixIcon: Icon(Icons.comment_outlined),
              ),
            ),
            const SizedBox(height: 24),

            SizedBox(
              width: double.infinity,
              height: 52,
              child: ElevatedButton(
                onPressed: _loading ? null : _submit,
                style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.warning),
                child: _loading
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(
                            color: Colors.white, strokeWidth: 2))
                    : const Text('إرسال التقييم'),
              ),
            ),
          ],
        ),
      );

  String _ratingLabel(double r) {
    if (r >= 5) return 'ممتاز 🌟';
    if (r >= 4) return 'جيد جداً 👍';
    if (r >= 3) return 'جيد 😊';
    if (r >= 2) return 'مقبول 😐';
    return 'سيء 😞';
  }
}
