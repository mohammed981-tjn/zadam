// lib/utils/helpers.dart
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../utils/theme.dart';

// ── Format helpers ─────────────────────────────────────────
String formatCurrency(double amount) =>
    '${amount.toStringAsFixed(2)} ر.س';

String formatDate(DateTime date) =>
    DateFormat('dd/MM/yyyy', 'ar').format(date);

String formatDateTime(DateTime date) =>
    DateFormat('dd/MM/yyyy HH:mm', 'ar').format(date);

String formatTime(DateTime date) =>
    DateFormat('HH:mm', 'ar').format(date);

String timeAgo(DateTime date) {
  final diff = DateTime.now().difference(date);
  if (diff.inMinutes < 1) return 'الآن';
  if (diff.inMinutes < 60) return 'منذ ${diff.inMinutes} دقيقة';
  if (diff.inHours < 24) return 'منذ ${diff.inHours} ساعة';
  return 'منذ ${diff.inDays} يوم';
}

// ── SnackBar helpers ──────────────────────────────────────
void showSuccess(BuildContext context, String msg) {
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(
    content: Row(children: [
      const Icon(Icons.check_circle_outline, color: Colors.white),
      const SizedBox(width: 10),
      Expanded(child: Text(msg)),
    ]),
    backgroundColor: AppColors.success,
    duration: const Duration(seconds: 3),
  ));
}

void showError(BuildContext context, String msg) {
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(
    content: Row(children: [
      const Icon(Icons.error_outline, color: Colors.white),
      const SizedBox(width: 10),
      Expanded(child: Text(msg)),
    ]),
    backgroundColor: const Color(0xFFF44336),
    duration: const Duration(seconds: 4),
  ));
}

void showInfo(BuildContext context, String msg) {
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(
    content: Text(msg),
    backgroundColor: AppColors.secondary,
    duration: const Duration(seconds: 3),
  ));
}

// ── Dialog helpers ────────────────────────────────────────
Future<bool?> showConfirmDialog(
  BuildContext context, {
  required String title,
  required String content,
  String confirmLabel = 'تأكيد',
  String cancelLabel = 'إلغاء',
  Color? confirmColor,
}) =>
    showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: Text(title),
        content: Text(content),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(cancelLabel),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: confirmColor ?? AppColors.primary,
            ),
            child: Text(confirmLabel),
          ),
        ],
      ),
    );

// ── Input validator ────────────────────────────────────────
String? validateRequired(String? value, [String label = 'هذا الحقل']) {
  if (value == null || value.trim().isEmpty) return '$label مطلوب';
  return null;
}

String? validateEmail(String? value) {
  if (value == null || value.trim().isEmpty) return 'البريد الإلكتروني مطلوب';
  if (!RegExp(r'^[\w-.]+@([\w-]+\.)+[\w-]{2,4}$').hasMatch(value.trim())) {
    return 'صيغة البريد الإلكتروني غير صالحة';
  }
  return null;
}

String? validatePhone(String? value) {
  if (value == null || value.trim().isEmpty) return 'رقم الهاتف مطلوب';
  if (value.trim().length < 9) return 'رقم الهاتف قصير جداً';
  return null;
}

String? validatePassword(String? value) {
  if (value == null || value.isEmpty) return 'كلمة المرور مطلوبة';
  if (value.length < 6) return 'كلمة المرور يجب أن تكون 6 أحرف على الأقل';
  return null;
}

String? validatePrice(String? value) {
  if (value == null || value.trim().isEmpty) return 'السعر مطلوب';
  if (double.tryParse(value) == null) return 'أدخل رقماً صحيحاً';
  if (double.parse(value) <= 0) return 'السعر يجب أن يكون أكبر من صفر';
  return null;
}
