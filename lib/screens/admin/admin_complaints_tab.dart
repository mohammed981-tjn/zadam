// lib/screens/admin/admin_complaints_tab.dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/firebase_service.dart';
import '../../models/models.dart';
import '../../utils/theme.dart';
import '../../utils/helpers.dart';
import '../../widgets/common_widgets.dart';

class AdminComplaintsTab extends StatefulWidget {
  const AdminComplaintsTab({super.key});
  @override
  State<AdminComplaintsTab> createState() => _AdminComplaintsTabState();
}

class _AdminComplaintsTabState extends State<AdminComplaintsTab> {
  ComplaintStatus? _filter;

  @override
  Widget build(BuildContext context) {
    final service = context.read<FirebaseService>();
    return Column(
      children: [
        SizedBox(
          height: 52,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            children: [
              _chip('الكل', null),
              ...ComplaintStatus.values.map((s) => _chip(s.label, s)),
            ],
          ),
        ),
        Expanded(
          child: StreamBuilder<List<Complaint>>(
            stream: service.streamComplaints(),
            builder: (ctx, snap) {
              if (!snap.hasData) return const AppLoading();
              final list = snap.data!
                  .where((c) => _filter == null || c.status == _filter)
                  .toList();
              if (list.isEmpty) {
                return const AppEmpty(emoji: '✅', title: 'لا يوجد شكاوى');
              }
              return ListView.builder(
                padding: const EdgeInsets.all(12),
                itemCount: list.length,
                itemBuilder: (_, i) => _ComplaintCard(complaint: list[i]),
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _chip(String label, ComplaintStatus? s) => Padding(
        padding: const EdgeInsets.only(left: 6),
        child: FilterChip(
          label: Text(label, style: const TextStyle(fontSize: 12)),
          selected: _filter == s,
          onSelected: (_) => setState(() => _filter = s),
          selectedColor: AppColors.primary.withValues(alpha: 0.2),
          checkmarkColor: AppColors.primary,
        ),
      );
}

class _ComplaintCard extends StatelessWidget {
  final Complaint complaint;
  const _ComplaintCard({required this.complaint});

  @override
  Widget build(BuildContext context) {
    final service = context.read<FirebaseService>();
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Expanded(
                child: Text(complaint.type.label,
                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
              ),
              StatusBadge(
                label: complaint.status.label,
                color: complaint.status.color,
                small: true,
              ),
            ]),
            const SizedBox(height: 8),
            InfoRow(icon: Icons.receipt_outlined, text: 'طلب #${complaint.orderNumber}'),
            InfoRow(icon: Icons.person_outline, text: complaint.customerName),
            InfoRow(icon: Icons.restaurant_outlined, text: complaint.restaurantName),
            InfoRow(icon: Icons.access_time_rounded, text: formatDateTime(complaint.createdAt)),
            const SizedBox(height: 8),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(complaint.description,
                  style: const TextStyle(fontSize: 13, color: AppColors.textDark)),
            ),
            if (complaint.adminNote != null) ...[
              const SizedBox(height: 8),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: AppColors.secondary.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text('ملاحظة المدير: ${complaint.adminNote}',
                    style: const TextStyle(fontSize: 12, color: AppColors.secondary)),
              ),
            ],
            if (complaint.status == ComplaintStatus.open ||
                complaint.status == ComplaintStatus.inProgress) ...[
              const SizedBox(height: 12),
              _buildActions(context, service),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildActions(BuildContext context, FirebaseService service) {
    return Row(children: [
      if (complaint.status == ComplaintStatus.open)
        Expanded(
          child: OutlinedButton(
            onPressed: () => service.updateComplaintStatus(
              complaint.id, ComplaintStatus.inProgress),
            child: const Text('بدء المعالجة'),
          ),
        ),
      if (complaint.status == ComplaintStatus.open) const SizedBox(width: 8),
      Expanded(
        child: ElevatedButton(
          onPressed: () => _showResolveDialog(context, service),
          style: ElevatedButton.styleFrom(backgroundColor: AppColors.success),
          child: const Text('إغلاق الشكوى'),
        ),
      ),
    ]);
  }

  void _showResolveDialog(BuildContext context, FirebaseService service) {
    final ctrl = TextEditingController();
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('إغلاق الشكوى'),
        content: TextField(
          controller: ctrl,
          maxLines: 3,
          decoration: const InputDecoration(
            labelText: 'ملاحظة الحل (اختياري)',
            hintText: 'اكتب ما تم فعله لحل المشكلة...',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('إلغاء'),
          ),
          ElevatedButton(
            onPressed: () async {
              Navigator.pop(context);
              await service.updateComplaintStatus(
                complaint.id,
                ComplaintStatus.resolved,
                adminNote: ctrl.text.trim().isEmpty ? null : ctrl.text.trim(),
                resolution: 'تم الحل من قبل المدير',
              );
              if (context.mounted) {
                showSuccess(context, 'تم إغلاق الشكوى بنجاح');
              }
            },
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.success),
            child: const Text('تأكيد'),
          ),
        ],
      ),
    );
  }
}
