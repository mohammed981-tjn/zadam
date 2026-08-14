/// Colours and typography, kept in step with the web app's globals.css.
///
/// The palette is copied rather than derived because the two codebases have no
/// shared build step. When globals.css changes, this changes with it — a farmer
/// who uses the site on a laptop and the app on a phone should not feel they
/// are looking at two different products.
library;

import 'package:flutter/material.dart';

class SudagriColors {
  const SudagriColors._();

  // Light — matches :root in globals.css.
  static const background = Color(0xFFF7F5EF);
  static const foreground = Color(0xFF1C2B1E);
  static const card = Color(0xFFFFFFFF);
  static const border = Color(0xFFE2DED0);
  static const primary = Color(0xFF1F7A3D);
  static const primaryForeground = Color(0xFFFFFFFF);
  static const muted = Color(0xFF6B6558);
  static const accent = Color(0xFFB8860B);

  // Dark — matches the prefers-color-scheme block.
  static const darkBackground = Color(0xFF10160F);
  static const darkForeground = Color(0xFFEEF1E8);
  static const darkCard = Color(0xFF172018);
  static const darkBorder = Color(0xFF2A3527);
  static const darkPrimary = Color(0xFF3FAE66);
  static const darkPrimaryForeground = Color(0xFF08130A);
  static const darkMuted = Color(0xFFA3A698);
  static const darkAccent = Color(0xFFD4A72C);
}

ThemeData _build({required bool dark}) {
  final bg = dark ? SudagriColors.darkBackground : SudagriColors.background;
  final fg = dark ? SudagriColors.darkForeground : SudagriColors.foreground;
  final card = dark ? SudagriColors.darkCard : SudagriColors.card;
  final border = dark ? SudagriColors.darkBorder : SudagriColors.border;
  final primary = dark ? SudagriColors.darkPrimary : SudagriColors.primary;
  final onPrimary =
      dark ? SudagriColors.darkPrimaryForeground : SudagriColors.primaryForeground;
  final muted = dark ? SudagriColors.darkMuted : SudagriColors.muted;

  final base = dark ? ThemeData.dark() : ThemeData.light();

  return base.copyWith(
    scaffoldBackgroundColor: bg,
    colorScheme: base.colorScheme.copyWith(
      surface: card,
      primary: primary,
      onPrimary: onPrimary,
      onSurface: fg,
      outline: border,
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: bg,
      foregroundColor: fg,
      elevation: 0,
      centerTitle: true,
      titleTextStyle: TextStyle(
        color: fg,
        fontSize: 18,
        fontWeight: FontWeight.w800,
      ),
    ),
    cardTheme: CardThemeData(
      color: card,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: border),
      ),
    ),
    dividerTheme: DividerThemeData(color: border, thickness: 1),
    textTheme: base.textTheme.apply(bodyColor: fg, displayColor: fg),
    listTileTheme: ListTileThemeData(textColor: fg, iconColor: muted),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: primary,
        foregroundColor: onPrimary,
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 20),
        shape:
            RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: card,
      indicatorColor: primary.withValues(alpha: 0.15),
      surfaceTintColor: Colors.transparent,
      labelTextStyle: WidgetStatePropertyAll(
        TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: fg),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: card,
      hintStyle: TextStyle(color: muted),
      contentPadding:
          const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: primary, width: 1.5),
      ),
    ),
  );
}

ThemeData get sudagriLight => _build(dark: false);
ThemeData get sudagriDark => _build(dark: true);

/// Muted body colour for the current brightness, for secondary text.
Color mutedOn(BuildContext context) =>
    Theme.of(context).brightness == Brightness.dark
        ? SudagriColors.darkMuted
        : SudagriColors.muted;

Color accentOn(BuildContext context) =>
    Theme.of(context).brightness == Brightness.dark
        ? SudagriColors.darkAccent
        : SudagriColors.accent;
