// lib/screens/admin/admin_drivers_tab.dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:uuid/uuid.dart';
import '../../providers/firebase_service.dart';
import '../../models/models.dart';
import '../../utils/theme.dart';
import '../../utils/helpers.dart';
import '../../widgets/common_widgets.dart';

class AdminDriversTab extends StatelessWidget {
  const AdminDriversTab({super.key});

  @override
  Widget build(BuildContext context) {
    final service = context.read<FirebaseService>();
    return StreamBuilder<List<Driver>>(
      stream: service.streamDrivers(),
      builder: (ctx, snap) {
        if (!snap.hasData) return const AppLoading();
        final drivers = snap.data!;
        final online = drivers.where((d) => d.isOnline && d.isAvailable).length;
        final totalPending = drivers.fold(0.0, (s, d) => s + d.pendingPayout);

        return Scaffold(
          body: Column(
            children: [
              // Summary banner
              Container(
                padding: const EdgeInsets.all(16),
                color: AppColors.primary.withValues(alpha: 0.06),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceAround,
                  children: [
                    _sum('السائقون', drivers.length.toString(), Icons.group),
                    _sum('متاحون', online.toString(), Icons.check_circle_outline,
                        color: AppColors.success),
                    _sum('مستحقات', formatCurrency(totalPending),
                        Icons.account_balance_wallet_outlined,
                        color: Colors.orange),
                  ],
                ),
              ),
              Expanded(
                child: drivers.isEmpty
                    ? const AppEmpty(emoji: '🛵', title: 'لا يوجد سائقون')
                    : ListView.builder(
                        padding: const EdgeInsets.all(12),
                        itemCount: drivers.length,
                        itemBuilder: (_, i) => _DriverCard(driver: drivers[i]),
                      ),
              ),
            ],
          ),
          floatingActionButton: FloatingActionButton.extended(
            onPressed: () => _showDriverForm(ctx, null),
            icon: const Icon(Icons.person_add_rounded),
            label: const Text('إضافة سائق'),
          ),
        );
      },
    );
  }

  Widget _sum(String label, String value, IconData icon, {Color? color}) =>
      Column(children: [
        Icon(icon, color: color ?? AppColors.primary),
        const SizedBox(height: 4),
        Text(value,
            style: TextStyle(
                fontWeight: FontWeight.bold,
                fontSize: 16,
                color: color ?? AppColors.textDark)),
        Text(label, style: const TextStyle(fontSize: 11, color: AppColors.textGray)),
      ]);
}

class _DriverCard extends StatelessWidget {
  final Driver driver;
  const _DriverCard({required this.driver});

  @override
  Widget build(BuildContext context) {
    final service = context.read<FirebaseService>();
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(children: [
          Row(children: [
            CircleAvatar(
              radius: 24,
              backgroundColor: AppColors.primary.withValues(alpha: 0.1),
              child: Text(
                driver.name.isNotEmpty ? driver.name[0] : '?',
                style: const TextStyle(fontSize: 20, color: AppColors.primary),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(driver.name,
                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                Text(driver.phone,
                    style: const TextStyle(color: AppColors.textGray, fontSize: 13)),
                Text('${driver.vehicleType}  •  ${driver.vehiclePlate}',
                    style: const TextStyle(color: AppColors.textGray, fontSize: 12)),
              ]),
            ),
            Column(children: [
              StatusBadge(
                label: driver.isOnline ? 'متصل' : 'غير متصل',
                color: driver.isOnline ? AppColors.success : Colors.grey,
                small: true,
              ),
              const SizedBox(height: 4),
              StatusBadge(
                label: driver.isAvailable ? 'متاح' : 'مشغول',
                color: driver.isAvailable ? AppColors.secondary : Colors.orange,
                small: true,
              ),
            ]),
          ]),
          const SizedBox(height: 12),
          Row(mainAxisAlignment: MainAxisAlignment.spaceAround, children: [
            _stat('التوصيلات', '${driver.totalDeliveries}'),
            _stat('الأرباح', formatCurrency(driver.totalEarnings)),
            _stat('المستحقات', formatCurrency(driver.pendingPayout),
                highlight: driver.pendingPayout > 0),
            _stat('التقييم', '${driver.rating.toStringAsFixed(1)} ⭐'),
          ]),
          if (driver.pendingPayout > 0) ...[
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: () async {
                  final ok = await showConfirmDialog(
                    context,
                    title: 'صرف المستحقات',
                    content:
                        'صرف ${formatCurrency(driver.pendingPayout)} للسائق ${driver.name}؟',
                    confirmLabel: 'صرف',
                    confirmColor: AppColors.success,
                  );
                  if (ok == true && context.mounted) {
                    await service.markPayoutDone(driver.id, driver.pendingPayout);
                    showSuccess(context,
                        'تم صرف ${formatCurrency(driver.pendingPayout)} للسائق ${driver.name}');
                  }
                },
                icon: const Icon(Icons.payments_outlined, size: 18),
                label: Text('صرف ${formatCurrency(driver.pendingPayout)}'),
                style: ElevatedButton.styleFrom(backgroundColor: AppColors.success),
              ),
            ),
          ],
          const SizedBox(height: 6),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: () => _showDriverForm(context, driver),
              icon: const Icon(Icons.edit_outlined, size: 16),
              label: const Text('تعديل البيانات'),
            ),
          ),
        ]),
      ),
    );
  }

  Widget _stat(String label, String value, {bool highlight = false}) => Column(children: [
        Text(value,
            style: TextStyle(
                fontWeight: FontWeight.bold,
                fontSize: 14,
                color: highlight ? Colors.orange : AppColors.textDark)),
        Text(label, style: const TextStyle(fontSize: 10, color: AppColors.textGray)),
      ]);
}

void _showDriverForm(BuildContext context, Driver? existing) {
  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
    builder: (_) => _DriverForm(existing: existing),
  );
}

class _DriverForm extends StatefulWidget {
  final Driver? existing;
  const _DriverForm({this.existing});
  @override
  State<_DriverForm> createState() => _DriverFormState();
}

class _DriverFormState extends State<_DriverForm> {
  final _form = GlobalKey<FormState>();
  late final TextEditingController _name, _phone, _plate;
  String _vehicleType = 'دراجة نارية';
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    final d = widget.existing;
    _name  = TextEditingController(text: d?.name ?? '');
    _phone = TextEditingController(text: d?.phone ?? '');
    _plate = TextEditingController(text: d?.vehiclePlate ?? '');
    _vehicleType = d?.vehicleType ?? 'دراجة نارية';
  }

  @override
  void dispose() {
    _name.dispose(); _phone.dispose(); _plate.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    setState(() => _loading = true);
    final service = context.read<FirebaseService>();
    final d = Driver(
      id: widget.existing?.id ?? const Uuid().v4(),
      name: _name.text.trim(),
      phone: _phone.text.trim(),
      vehicleType: _vehicleType,
      vehiclePlate: _plate.text.trim(),
      totalEarnings: widget.existing?.totalEarnings ?? 0,
      pendingPayout: widget.existing?.pendingPayout ?? 0,
      totalDeliveries: widget.existing?.totalDeliveries ?? 0,
      rating: widget.existing?.rating ?? 5.0,
      ratingCount: widget.existing?.ratingCount ?? 0,
    );
    if (widget.existing == null) {
      await service.addDriver(d);
    } else {
      await service.updateDriver(d);
    }
    if (mounted) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.of(context).viewInsets.bottom,
          top: 16, left: 16, right: 16,
        ),
        child: Form(
          key: _form,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  widget.existing == null ? 'إضافة سائق' : 'تعديل السائق',
                  style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 16),
                _f(_name, 'الاسم الكامل'),
                _f(_phone, 'رقم الهاتف', type: TextInputType.phone),
                _f(_plate, 'رقم اللوحة', isReq: false),
                const Text('نوع المركبة',
                    style: TextStyle(fontWeight: FontWeight.w600)),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  children: ['دراجة نارية', 'سيارة', 'دراجة هوائية']
                      .map((v) => ChoiceChip(
                            label: Text(v),
                            selected: _vehicleType == v,
                            onSelected: (_) => setState(() => _vehicleType = v),
                            selectedColor: AppColors.primary.withValues(alpha: 0.2),
                          ))
                      .toList(),
                ),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity, height: 50,
                  child: ElevatedButton(
                    onPressed: _loading ? null : _save,
                    child: _loading
                        ? const SizedBox(width: 20, height: 20,
                            child: CircularProgressIndicator(
                                color: Colors.white, strokeWidth: 2))
                        : const Text('حفظ'),
                  ),
                ),
                const SizedBox(height: 16),
              ],
            ),
          ),
        ),
      );

  Widget _f(
    TextEditingController c, String label, {
    TextInputType type = TextInputType.text,
    bool isReq = true,
  }) =>
      Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: TextFormField(
          controller: c,
          keyboardType: type,
          decoration: InputDecoration(labelText: label),
          validator: isReq ? (v) => validateRequired(v, label) : null,
        ),
      );
}
