// lib/main.dart
import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:provider/provider.dart';
import 'providers/auth_provider.dart' as app_auth;
import 'providers/cart_provider.dart';
import 'providers/firebase_service.dart';
import 'screens/splash_screen.dart';
import 'utils/theme.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  try {
    await Firebase.initializeApp(
      options: const FirebaseOptions(
        apiKey: 'AIzaSyBoAvj7C2vJyzERVnK26Oa-dJZ1mV0vO6g',
        authDomain: 'restaurant-app-ed699.firebaseapp.com',
        projectId: 'restaurant-app-ed699',
        storageBucket: 'restaurant-app-ed699.firebasestorage.app',
        messagingSenderId: '653081498334',
        appId: '1:653081498334:web:68bbe28bb046d5fa20684f',
      ),
    );
  } catch (_) {
    // Continue even if Firebase init fails; the app can still show the UI.
  }

  runApp(const ZadamApp());
}

class ZadamApp extends StatelessWidget {
  const ZadamApp({super.key});

  @override
  Widget build(BuildContext context) {
    final service = FirebaseService();
    return MultiProvider(
      providers: [
        Provider<FirebaseService>(create: (_) => service),
        ChangeNotifierProvider<app_auth.AuthProvider>(
          create: (_) => app_auth.AuthProvider(service),
        ),
        ChangeNotifierProvider<CartProvider>(
          create: (_) => CartProvider(),
        ),
      ],
      child: MaterialApp(
        title: 'زادم للتوصيل',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.light,
        builder: (context, child) => Directionality(
          textDirection: TextDirection.rtl,
          child: child!,
        ),
        home: const SplashScreen(),
      ),
    );
  }
}
