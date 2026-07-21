// lib/screens/splash_screen.dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart' as app_auth;
import '../models/models.dart';
import '../utils/theme.dart';
import 'auth/login_screen.dart';
import 'admin/admin_home.dart';
import 'customer/customer_home.dart';
import 'driver/driver_home.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});
  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double> _fade;
  bool _navigated = false;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    );
    _fade = CurvedAnimation(parent: _ctrl, curve: Curves.easeIn);
    _ctrl.forward();
    Future.delayed(const Duration(seconds: 2), () async {
      final auth = context.read<app_auth.AuthProvider>();
      await auth.initialize();
      if (!mounted) return;
      _navigate();
    });
  }

  void _navigate() {
    if (_navigated || !mounted) return;
    _navigated = true;
    final auth = context.read<app_auth.AuthProvider>();
    Widget dest;
    if (!auth.isLoggedIn) {
      dest = const LoginScreen();
    } else {
      switch (auth.user!.role) {
        case UserRole.admin:
          dest = const AdminHome();
          break;
        case UserRole.customer:
          dest = const CustomerHome();
          break;
        case UserRole.driver:
          dest = const DriverHome();
          break;
      }
    }
    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(builder: (_) => dest),
      (_) => false,
    );
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: AppColors.primary,
        body: FadeTransition(
          opacity: _fade,
          child: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 110,
                  height: 110,
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(28),
                    boxShadow: const [
                      BoxShadow(
                        color: Colors.black26,
                        blurRadius: 24,
                        offset: Offset(0, 8),
                      )
                    ],
                  ),
                  child: const Center(
                    child: Text('🛵', style: TextStyle(fontSize: 56)),
                  ),
                ),
                const SizedBox(height: 24),
                const Text('زادم للتوصيل',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 30,
                      fontWeight: FontWeight.bold,
                      fontFamily: 'Cairo',
                    )),
                const SizedBox(height: 8),
                const Text('أفضل خدمة توصيل للمطاعم',
                    style: TextStyle(
                      color: Colors.white70,
                      fontSize: 15,
                      fontFamily: 'Cairo',
                    )),
                const SizedBox(height: 40),
                const SizedBox(
                  width: 30,
                  height: 30,
                  child: CircularProgressIndicator(
                    color: Colors.white,
                    strokeWidth: 2,
                  ),
                ),
              ],
            ),
          ),
        ),
      );
}
