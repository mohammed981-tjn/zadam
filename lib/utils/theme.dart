// lib/utils/theme.dart
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class AppColors {
  static const primary   = Color(0xFFE63946);
  static const dark      = Color(0xFF1D3557);
  static const secondary = Color(0xFF457B9D);
  static const success   = Color(0xFF2DC653);
  static const warning   = Color(0xFFF4A261);
  static const surface   = Color(0xFFF8F9FA);
  static const card      = Color(0xFFFFFFFF);
  static const textDark  = Color(0xFF1D3557);
  static const textGray  = Color(0xFF6C757D);
  static const divider   = Color(0xFFDEE2E6);
}

class AppTheme {
  static ThemeData get light => ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(
      seedColor: AppColors.primary,
      primary: AppColors.primary,
      secondary: AppColors.secondary,
      surface: AppColors.surface,
      error: const Color(0xFFF44336),
    ),
    textTheme: GoogleFonts.cairoTextTheme().copyWith(
      displayLarge: GoogleFonts.cairo(
        fontSize: 28, fontWeight: FontWeight.bold, color: AppColors.textDark),
      titleLarge: GoogleFonts.cairo(
        fontSize: 20, fontWeight: FontWeight.w700, color: AppColors.textDark),
      titleMedium: GoogleFonts.cairo(
        fontSize: 16, fontWeight: FontWeight.w600, color: AppColors.textDark),
      bodyLarge: GoogleFonts.cairo(fontSize: 15, color: AppColors.textDark),
      bodyMedium: GoogleFonts.cairo(fontSize: 13, color: AppColors.textGray),
      labelLarge: GoogleFonts.cairo(
        fontSize: 15, fontWeight: FontWeight.bold, color: Colors.white),
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: AppColors.primary,
      foregroundColor: Colors.white,
      elevation: 0,
      centerTitle: true,
      titleTextStyle: GoogleFonts.cairo(
        fontSize: 18, fontWeight: FontWeight.bold, color: Colors.white),
      iconTheme: const IconThemeData(color: Colors.white),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 24),
        elevation: 0,
        textStyle: GoogleFonts.cairo(fontSize: 15, fontWeight: FontWeight.bold),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: AppColors.primary,
        side: const BorderSide(color: AppColors.primary),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 20),
        textStyle: GoogleFonts.cairo(fontSize: 14, fontWeight: FontWeight.w600),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: AppColors.divider),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: AppColors.divider),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: AppColors.primary, width: 2),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: Color(0xFFF44336)),
      ),
      labelStyle: GoogleFonts.cairo(color: AppColors.textGray),
      hintStyle: GoogleFonts.cairo(color: AppColors.textGray),
    ),
    
    // ✅ تم تعديل الكلاس هنا ليصبح CardThemeData بدلاً من CardTheme لمنع أي تعارض
    cardTheme: CardThemeData(
      elevation: 2,
      shadowColor: Colors.black12,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      color: AppColors.card,
    ),
    
    chipTheme: ChipThemeData(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: Colors.white,
      indicatorColor: AppColors.primary.withValues(alpha: 0.15),
      labelTextStyle: WidgetStateProperty.all(
        GoogleFonts.cairo(fontSize: 11, fontWeight: FontWeight.w600),
      ),
    ),
    scaffoldBackgroundColor: AppColors.surface,
    dividerTheme: const DividerThemeData(color: AppColors.divider, thickness: 1),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      contentTextStyle: GoogleFonts.cairo(fontSize: 14),
    ),
  );
}