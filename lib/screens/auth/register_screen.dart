// lib/screens/auth/register_screen.dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../models/models.dart';
import '../../providers/auth_provider.dart' as app_auth;
import '../../utils/theme.dart';
import '../../utils/helpers.dart';
import '../admin/admin_home.dart';
import '../customer/customer_home.dart';
import '../driver/driver_home.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});
  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _form = GlobalKey<FormState>();
  final _nameCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _passCtrl = TextEditingController();
  UserRole _role = UserRole.customer;
  bool _obscure = true;

  @override
  void dispose() {
    _nameCtrl.dispose(); _emailCtrl.dispose();
    _phoneCtrl.dispose(); _passCtrl.dispose();
    super.dispose();
  }

  Future<void> _register() async {
    if (!_form.currentState!.validate()) return;
    final auth = context.read<app_auth.AuthProvider>();
    final ok = await auth.register(
      name: _nameCtrl.text, email: _emailCtrl.text,
      password: _passCtrl.text, phone: _phoneCtrl.text, role: _role,
    );
    if (!mounted) return;
    if (ok) {
      Widget dest;
      switch (_role) {
        case UserRole.admin: dest = const AdminHome(); break;
        case UserRole.customer: dest = const CustomerHome(); break;
        case UserRole.driver: dest = const DriverHome(); break;
      }
      Navigator.pushAndRemoveUntil(context,
          MaterialPageRoute(builder: (_) => dest), (_) => false);
    } else {
      showError(context, auth.error ?? 'فشل التسجيل');
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<app_auth.AuthProvider>();
    return Scaffold(
      appBar: AppBar(title: const Text('حساب جديد')),
      body: Form(
        key: _form,
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            TextFormField(controller: _nameCtrl,
                decoration: const InputDecoration(labelText: 'الاسم الكامل', prefixIcon: Icon(Icons.person_outline)),
                validator: (v) => validateRequired(v, 'الاسم')),
            const SizedBox(height: 14),
            TextFormField(controller: _emailCtrl,
                keyboardType: TextInputType.emailAddress,
                textDirection: TextDirection.ltr,
                decoration: const InputDecoration(labelText: 'البريد الإلكتروني', prefixIcon: Icon(Icons.email_outlined)),
                validator: validateEmail),
            const SizedBox(height: 14),
            TextFormField(controller: _phoneCtrl,
                keyboardType: TextInputType.phone,
                decoration: const InputDecoration(labelText: 'رقم الهاتف', prefixIcon: Icon(Icons.phone_outlined)),
                validator: validatePhone),
            const SizedBox(height: 14),
            TextFormField(
              controller: _passCtrl, obscureText: _obscure,
              textDirection: TextDirection.ltr,
              decoration: InputDecoration(
                labelText: 'كلمة المرور', prefixIcon: const Icon(Icons.lock_outline),
                suffixIcon: IconButton(
                  icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                  onPressed: () => setState(() => _obscure = !_obscure),
                ),
              ),
              validator: validatePassword,
            ),
            const SizedBox(height: 20),
            const Text('نوع الحساب', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
            const SizedBox(height: 12),
            Row(children: [
              _chip(UserRole.customer, '👤 عميل'),
              const SizedBox(width: 10),
              _chip(UserRole.driver, '🛵 سائق'),
              const SizedBox(width: 10),
              _chip(UserRole.admin, '👨‍💼 مدير'),
            ]),
            const SizedBox(height: 28),
            SizedBox(width: double.infinity, height: 52,
              child: ElevatedButton(
                onPressed: auth.loading ? null : _register,
                child: auth.loading
                    ? const SizedBox(width: 22, height: 22,
                        child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                    : const Text('إنشاء الحساب'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _chip(UserRole role, String label) {
    final sel = _role == role;
    return GestureDetector(
      onTap: () => setState(() => _role = role),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        decoration: BoxDecoration(
          color: sel ? AppColors.primary : AppColors.surface,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: sel ? AppColors.primary : AppColors.divider),
        ),
        child: Text(label, style: TextStyle(
            color: sel ? Colors.white : AppColors.textDark, fontWeight: FontWeight.w600)),
      ),
    );
  }
}
