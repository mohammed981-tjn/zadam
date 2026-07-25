// lib/screens/admin/admin_home.dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart' as app_auth;
import '../auth/login_screen.dart';
import 'admin_stats_tab.dart';
import 'admin_restaurants_tab.dart';
import 'admin_orders_tab.dart';
import 'admin_drivers_tab.dart';
import 'admin_complaints_tab.dart';

class AdminHome extends StatefulWidget {
  const AdminHome({super.key});
  @override
  State<AdminHome> createState() => _AdminHomeState();
}

class _AdminHomeState extends State<AdminHome> {
  int _tab = 0;
  @override
  Widget build(BuildContext context) {
    final auth = context.watch<app_auth.AuthProvider>();
    return Scaffold(
      appBar: AppBar(
        title: Text('لوحة التحكم — ${auth.user?.name ?? ""}'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () async {
              await auth.logout();
              if (mounted) {
                Navigator.pushAndRemoveUntil(context,
                    MaterialPageRoute(builder: (_) => const LoginScreen()),
                    (_) => false);
              }
            },
          ),
        ],
      ),
      body: IndexedStack(
        index: _tab,
        children: const [
          AdminStatsTab(),
          AdminRestaurantsTab(),
          AdminOrdersTab(),
          AdminDriversTab(),
          AdminComplaintsTab(),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.dashboard_outlined), selectedIcon: Icon(Icons.dashboard), label: 'الرئيسية'),
          NavigationDestination(icon: Icon(Icons.restaurant_outlined), selectedIcon: Icon(Icons.restaurant), label: 'المطاعم'),
          NavigationDestination(icon: Icon(Icons.receipt_long_outlined), selectedIcon: Icon(Icons.receipt_long), label: 'الطلبات'),
          NavigationDestination(icon: Icon(Icons.delivery_dining_outlined), selectedIcon: Icon(Icons.delivery_dining), label: 'السائقون'),
          NavigationDestination(icon: Icon(Icons.report_problem_outlined), selectedIcon: Icon(Icons.report_problem), label: 'الشكاوى'),
        ],
      ),
    );
  }
}
