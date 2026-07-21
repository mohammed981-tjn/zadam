// lib/providers/auth_provider.dart
import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../models/models.dart';
import 'firebase_service.dart';

class AuthProvider extends ChangeNotifier {
  final FirebaseService _service;

  AppUser? _user;
  bool _loading = false;
  String? _error;

  AppUser? get user => _user;
  bool get loading => _loading;
  String? get error => _error;
  bool get isLoggedIn => _user != null;
  bool get isAdmin => _user?.role == UserRole.admin;
  bool get isDriver => _user?.role == UserRole.driver;
  bool get isCustomer => _user?.role == UserRole.customer;

  AuthProvider(this._service) {
    _service.authStateChanges.listen(_onAuthChanged);
    Future.microtask(initialize);
  }

  Future<void> initialize() async {
    final firebaseUser = _service.currentUser;
    if (firebaseUser == null) {
      _user = null;
      _error = null;
      notifyListeners();
      return;
    }

    try {
      _user = await _service.getUser(firebaseUser.uid);
    } catch (_) {
      _user = null;
    }
    notifyListeners();
  }

  Future<void> _onAuthChanged(User? firebaseUser) async {
    if (firebaseUser == null) {
      _user = null;
    } else {
      try {
        _user = await _service.getUser(firebaseUser.uid);
      } catch (_) {
        _user = null;
      }
    }
    notifyListeners();
  }

  Future<bool> login(String email, String password) async {
    _setLoading(true);
    try {
      await _service.signIn(email.trim(), password.trim());
      _setLoading(false);
      return true;
    } on FirebaseAuthException catch (e) {
      _setError(_mapFirebaseError(e.code));
      return false;
    } catch (e) {
      _setError(_mapGeneralError(e.toString()));
      return false;
    }
  }

  Future<bool> register({
    required String name,
    required String email,
    required String password,
    required String phone,
    required UserRole role,
  }) async {
    _setLoading(true);
    try {
      final cred = await _service.register(email.trim(), password.trim());
      final uid = cred.user!.uid;

      final newUser = AppUser(
        uid: uid,
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        role: role,
        createdAt: DateTime.now(),
      );
      await _service.createUser(newUser);

      if (role == UserRole.driver) {
        await _service.addDriver(Driver(
          id: uid,
          name: name.trim(),
          phone: phone.trim(),
          vehicleType: 'دراجة نارية',
        ));
      }

      _user = newUser;
      _setLoading(false);
      return true;
    } on FirebaseAuthException catch (e) {
      _setError(_mapFirebaseError(e.code));
      return false;
    } catch (e) {
      _setError(_mapGeneralError(e.toString()));
      return false;
    }
  }

  Future<void> logout() async {
    try { await _service.signOut(); } catch (_) {}
    _user = null;
    _error = null;
    notifyListeners();
  }

  void clearError() {
    _error = null;
    notifyListeners();
  }

  void _setLoading(bool val) {
    _loading = val;
    if (val) _error = null;
    notifyListeners();
  }

  void _setError(String msg) {
    _error = msg;
    _loading = false;
    notifyListeners();
  }

  String _mapFirebaseError(String code) {
    switch (code) {
      case 'user-not-found': return 'البريد الإلكتروني غير مسجل';
      case 'wrong-password': return 'كلمة المرور غير صحيحة';
      case 'invalid-credential': return 'البريد أو كلمة المرور غير صحيحة';
      case 'invalid-email': return 'صيغة البريد الإلكتروني غير صالحة';
      case 'email-already-in-use': return 'البريد الإلكتروني مستخدم بالفعل';
      case 'weak-password': return 'كلمة المرور يجب أن تكون 6 أحرف على الأقل';
      case 'too-many-requests': return 'محاولات كثيرة — انتظر دقيقة ثم حاول مجدداً';
      case 'network-request-failed': return 'تحقق من اتصال الإنترنت';
      case 'operation-not-allowed': return 'هذه الطريقة غير مفعّلة — تحقق من Firebase';
      default: return 'خطأ ($code) — حاول مرة أخرى';
    }
  }

  String _mapGeneralError(String raw) {
    if (raw.contains('PERMISSION_DENIED') || raw.contains('permission-denied')) {
      return 'خطأ في الصلاحيات — تحقق من Firestore Rules';
    }
    if (raw.contains('network') || raw.contains('Network')) {
      return 'تحقق من اتصال الإنترنت';
    }
    return 'خطأ غير متوقع — حاول مرة أخرى';
  }
}
