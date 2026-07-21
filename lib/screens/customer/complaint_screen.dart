// lib/screens/customer/complaint_screen.dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:uuid/uuid.dart';
import '../../models/models.dart';
import '../../providers/firebase_service.dart';
import '../../providers/auth_provider.dart' as app_auth;
import '../../utils/theme.dart';
import '../../utils/helpers.dart';

class ComplaintScreen extends StatefulWidget {
  final Order order;
  const ComplaintScreen({super.key, required this.order});
  @override
  State<ComplaintScreen> createState() => _ComplaintScreenState();
}

class _ComplaintScreenState extends State<ComplaintScreen> {
  ComplaintType _type = ComplaintType.other;
  final _descCtrl = TextEditingController();
  bool _loading = false;

  @override
  void dispose() {
    _descCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_descCtrl.text.trim().isEmpty) {
      showError(context, 'اكتب وصفاً للشكوى');
      return;
    }
    setState(() => _loading = true);
    final user = context.read<app_auth.AuthProvider>().user!;
    final service = context.read<FirebaseService>();
    const uuid = Uuid();

    final complaint = Complaint(
      id: uuid.v4(),
      orderId: widget.order.id,
      orderNumber: widget.order.orderNumber,
      customerId: user.uid,
      customerName: user.name,
      restaurantId: widget.order.restaurantId,
      restaurantName: widget.order.restaurantName,
      type: _type,
      description: _descCtrl.text.trim(),
      createdAt: DateTime.now(),
    );

    try {
      await service.submitComplaint(complaint);
      if (mounted) {
        showSuccess(context, 'تم إرسال شكواك بنجاح');
        Navigator.pop(context);
      }
    } catch (e) {
      setState(() => _loading = false);
      if (mounted) showError(context, 'فشل الإرسال، حاول مرة أخرى');
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('تقديم شكوى')),
        body: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppColors.primary.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  const Icon(Icons.receipt_long_outlined,
                      color: AppColors.primary),
                  const SizedBox(width: 10),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('طلب #${widget.order.orderNumber}',
                          style: const TextStyle(
                              fontWeight: FontWeight.bold)),
                      Text(widget.order.restaurantName,
                          style: const TextStyle(
                              color: AppColors.textGray, fontSize: 13)),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),
            const Text('نوع الشكوى',
                style: TextStyle(
                    fontWeight: FontWeight.bold, fontSize: 15)),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: ComplaintType.values
                  .map((t) => ChoiceChip(
                        label: Text(t.label),
                        selected: _type == t,
                        onSelected: (_) =>
                            setState(() => _type = t),
                        selectedColor:
                            AppColors.primary.withValues(alpha: 0.2),
                        checkmarkColor: AppColors.primary,
                      ))
                  .toList(),
            ),
            const SizedBox(height: 20),
            const Text('وصف الشكوى',
                style: TextStyle(
                    fontWeight: FontWeight.bold, fontSize: 15)),
            const SizedBox(height: 10),
            TextFormField(
              controller: _descCtrl,
              maxLines: 5,
              decoration: const InputDecoration(
                hintText: 'اشرح مشكلتك بالتفصيل...',
              ),
            ),
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              height: 52,
              child: ElevatedButton.icon(
                onPressed: _loading ? null : _submit,
                icon: const Icon(Icons.send_outlined),
                label: _loading
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(
                            color: Colors.white, strokeWidth: 2))
                    : const Text('إرسال الشكوى'),
              ),
            ),
          ],
        ),
      );
}
