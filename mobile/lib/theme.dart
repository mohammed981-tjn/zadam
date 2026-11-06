/// Colours and typography, kept in step with the web app's globals.css.
///
/// The palette is copied rather than derived because the two codebases have no
/// shared build step. When globals.css changes, this changes with it — a farmer
/// who uses the site on a laptop and the app on a phone should not feel they
/// are looking at two different products.
///
/// The brand (owner, 6 November 2026: «الوان الهوية بيج أخضر فاتح», then
/// chosen from swatches the same day): a beige ground and a calm OLIVE green
/// that sits with it. The olive leads — buttons, the selected tab, the hero and
/// the chips are filled with it, and what sits on it is the dark ink #1C2B1E,
/// not white (white on #8A9A5B is 3.1:1). Olive that is itself text or a line
/// icon on the beige is the deeper #5C6B30. A lighter olive (#B5C08A, #9AA86A)
/// carries the soft touches: tints and gradients. Gold is the accent. No red
/// and no orange anywhere (the owner's standing rule): errors and warnings are
/// a dark gold.
///
/// Contrast, measured (WCAG 2.1): ink #1C2B1E on #8A9A5B 4.9:1, on #B5C08A
/// 7.7:1; #5C6B30 on the beige 5.3:1, on white 5.8:1 and on the chip tint
/// 4.7:1; muted #6B6558 on the beige 5.3:1; warning #8A6508 on the beige
/// 4.9:1. Dark: #10160F on #A3B26B 8.0:1, olive text #B2BF80 on the card
/// 8.5:1, #E0B440 on the card 8.6:1.
library;

import 'package:flutter/material.dart';

class SudagriColors {
  const SudagriColors._();

  // Light — matches :root in globals.css.
  static const background = Color(0xFFF7F5EF);
  static const foreground = Color(0xFF1C2B1E);
  static const card = Color(0xFFFFFFFF);
  static const border = Color(0xFFE2DED0);

  /// The olive that leads: fills, never small text on the beige.
  static const primary = Color(0xFF8A9A5B);

  /// The dark ink for anything drawn on [primary] or the hero.
  static const primaryForeground = Color(0xFF1C2B1E);

  /// Olive that is text, a link or a line icon on the beige or a card.
  static const textGreen = Color(0xFF5C6B30);

  /// The lighter olive, for soft touches and gradients.
  static const lightOlive = Color(0xFFB5C08A);
  static const midOlive = Color(0xFF9AA86A);

  /// A soft tint of the light olive, for icon chips and selected fills.
  static const leafTint = Color(0xFFE5E9D6);
  static const muted = Color(0xFF6B6558);
  static const accent = Color(0xFFB8860B);

  /// Text-safe gold: errors, warnings and small gold text (no red, no orange).
  static const warn = Color(0xFF8A6508);
  static const warnTint = Color(0xFFF6EEDB);

  // Dark — matches the prefers-color-scheme block.
  static const darkBackground = Color(0xFF10160F);
  static const darkForeground = Color(0xFFEEF1E8);
  static const darkCard = Color(0xFF172018);
  static const darkBorder = Color(0xFF2A3527);
  static const darkPrimary = Color(0xFFA3B26B);
  static const darkPrimaryForeground = Color(0xFF10160F);
  static const darkTextGreen = Color(0xFFB2BF80);
  static const darkLeafTint = Color(0xFF303A27);
  static const darkMuted = Color(0xFFA3A698);
  static const darkAccent = Color(0xFFD4A72C);
  static const darkWarn = Color(0xFFE0B440);
  static const darkWarnTint = Color(0xFF2C2914);

  /// The hero band: the light olive, deepening to the far side, with the dark
  /// ink on it.
  static const heroGradient = LinearGradient(
    begin: AlignmentDirectional.topStart,
    end: AlignmentDirectional.bottomEnd,
    colors: [lightOlive, midOlive, primary],
    stops: [0, 0.55, 1],
  );

  /// The selected tab and other selected pills.
  static const selectedGradient = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [midOlive, primary],
  );
}

ThemeData _build({required bool dark}) {
  final bg = dark ? SudagriColors.darkBackground : SudagriColors.background;
  final fg = dark ? SudagriColors.darkForeground : SudagriColors.foreground;
  final card = dark ? SudagriColors.darkCard : SudagriColors.card;
  final border = dark ? SudagriColors.darkBorder : SudagriColors.border;
  final primary = dark ? SudagriColors.darkPrimary : SudagriColors.primary;
  final onPrimary = dark
      ? SudagriColors.darkPrimaryForeground
      : SudagriColors.primaryForeground;
  final textGreen = dark
      ? SudagriColors.darkTextGreen
      : SudagriColors.textGreen;
  final tint = dark ? SudagriColors.darkLeafTint : SudagriColors.leafTint;
  final muted = dark ? SudagriColors.darkMuted : SudagriColors.muted;
  final accent = dark ? SudagriColors.darkAccent : SudagriColors.accent;
  final warn = dark ? SudagriColors.darkWarn : SudagriColors.warn;
  final warnTint = dark ? SudagriColors.darkWarnTint : SudagriColors.warnTint;

  // A whole scheme, not a copy of Material's baseline: the baseline's surface
  // containers, menus and sliders are lavender, from no palette of ours.
  final scheme = ColorScheme(
    brightness: dark ? Brightness.dark : Brightness.light,
    primary: primary,
    onPrimary: onPrimary,
    primaryContainer: tint,
    onPrimaryContainer: dark
        ? SudagriColors.darkForeground
        : SudagriColors.primaryForeground,
    secondary: textGreen,
    onSecondary: dark ? SudagriColors.darkPrimaryForeground : Colors.white,
    secondaryContainer: tint,
    onSecondaryContainer: dark
        ? SudagriColors.darkForeground
        : SudagriColors.primaryForeground,
    tertiary: accent,
    onTertiary: dark ? SudagriColors.darkPrimaryForeground : Colors.white,
    error: warn,
    onError: dark ? SudagriColors.darkPrimaryForeground : Colors.white,
    errorContainer: warnTint,
    onErrorContainer: dark
        ? SudagriColors.darkForeground
        : const Color(0xFF3D2C03),
    surface: card,
    onSurface: fg,
    onSurfaceVariant: muted,
    surfaceContainerLowest: card,
    surfaceContainerLow: card,
    surfaceContainer: card,
    surfaceContainerHigh: card,
    surfaceContainerHighest: dark
        ? const Color(0xFF202B21)
        : const Color(0xFFF1EEE4),
    surfaceTint: Colors.transparent,
    outline: border,
    outlineVariant: border,
    shadow: Colors.black,
    inverseSurface: fg,
    onInverseSurface: bg,
    inversePrimary: textGreen,
  );

  final base = dark ? ThemeData.dark() : ThemeData.light();
  final rounded12 = RoundedRectangleBorder(
    borderRadius: BorderRadius.circular(12),
  );

  return base.copyWith(
    scaffoldBackgroundColor: bg,
    colorScheme: scheme,
    primaryColor: primary,
    appBarTheme: AppBarTheme(
      backgroundColor: bg,
      foregroundColor: fg,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
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
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: BorderSide(color: border),
      ),
    ),
    dividerTheme: DividerThemeData(color: border, thickness: 1),
    textTheme: base.textTheme.apply(bodyColor: fg, displayColor: fg),
    iconTheme: IconThemeData(color: fg),
    listTileTheme: ListTileThemeData(textColor: fg, iconColor: textGreen),
    drawerTheme: DrawerThemeData(
      backgroundColor: bg,
      surfaceTintColor: Colors.transparent,
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: card,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: fg,
      contentTextStyle: TextStyle(color: bg, fontWeight: FontWeight.w600),
      shape: rounded12,
    ),
    progressIndicatorTheme: ProgressIndicatorThemeData(
      color: primary,
      linearTrackColor: tint,
      circularTrackColor: Colors.transparent,
    ),
    sliderTheme: SliderThemeData(
      activeTrackColor: primary,
      inactiveTrackColor: tint,
      thumbColor: primary,
      overlayColor: primary.withValues(alpha: 0.16),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: card,
      selectedColor: tint,
      checkmarkColor: dark
          ? SudagriColors.darkForeground
          : SudagriColors.primaryForeground,
      side: BorderSide(color: border),
      labelStyle: TextStyle(color: fg, fontWeight: FontWeight.w600),
      shape: const StadiumBorder(),
    ),
    expansionTileTheme: ExpansionTileThemeData(
      iconColor: textGreen,
      collapsedIconColor: muted,
      textColor: fg,
      collapsedTextColor: fg,
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: primary,
        foregroundColor: onPrimary,
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 20),
        shape: rounded12,
        textStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: textGreen,
        side: BorderSide(color: primary.withValues(alpha: 0.6)),
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 18),
        shape: rounded12,
        textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: textGreen,
        textStyle: const TextStyle(fontWeight: FontWeight.w700),
      ),
    ),
    iconButtonTheme: IconButtonThemeData(
      style: IconButton.styleFrom(foregroundColor: fg),
    ),
    // The selected segment takes the light-olive tint, with the dark ink.
    segmentedButtonTheme: SegmentedButtonThemeData(
      style: SegmentedButton.styleFrom(
        backgroundColor: card,
        foregroundColor: fg,
        selectedBackgroundColor: tint,
        selectedForegroundColor: dark
            ? SudagriColors.darkForeground
            : SudagriColors.primaryForeground,
        side: BorderSide(color: border),
        textStyle: const TextStyle(fontWeight: FontWeight.w700),
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: card,
      indicatorColor: primary,
      surfaceTintColor: Colors.transparent,
      labelTextStyle: WidgetStatePropertyAll(
        TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: fg),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: card,
      hintStyle: TextStyle(color: muted),
      labelStyle: TextStyle(color: muted),
      // Green while the field is being typed in; muted otherwise, so five
      // filled dropdowns do not shout five green labels at once.
      floatingLabelStyle: WidgetStateTextStyle.resolveWith(
        (states) => states.contains(WidgetState.focused)
            ? TextStyle(color: textGreen, fontWeight: FontWeight.w700)
            : states.contains(WidgetState.error)
            ? TextStyle(color: warn, fontWeight: FontWeight.w700)
            : TextStyle(color: muted, fontWeight: FontWeight.w600),
      ),
      prefixIconColor: muted,
      suffixIconColor: muted,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: primary, width: 2),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: warn),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: warn, width: 2),
      ),
      errorStyle: TextStyle(color: warn),
    ),
  );
}

ThemeData get sudagriLight => _build(dark: false);
ThemeData get sudagriDark => _build(dark: true);

bool _isDark(BuildContext context) =>
    Theme.of(context).brightness == Brightness.dark;

/// Muted body colour for the current brightness, for secondary text.
Color mutedOn(BuildContext context) =>
    _isDark(context) ? SudagriColors.darkMuted : SudagriColors.muted;

/// The gold accent, for large figures, lines and icons — not small text on
/// the light ground (3.3:1 there); small gold text takes [warnOn].
Color accentOn(BuildContext context) =>
    _isDark(context) ? SudagriColors.darkAccent : SudagriColors.accent;

/// Green that is text, a link or a line icon on the ground or a card.
Color textGreenOn(BuildContext context) =>
    _isDark(context) ? SudagriColors.darkTextGreen : SudagriColors.textGreen;

/// The light-olive tint behind icon chips and selected fills.
Color leafTintOn(BuildContext context) =>
    _isDark(context) ? SudagriColors.darkLeafTint : SudagriColors.leafTint;

/// The ink for text on a tint or on the olive.
Color inkOn(BuildContext context) => _isDark(context)
    ? SudagriColors.darkForeground
    : SudagriColors.primaryForeground;

/// Dark gold for errors and warnings, and small gold text.
Color warnOn(BuildContext context) =>
    _isDark(context) ? SudagriColors.darkWarn : SudagriColors.warn;

Color warnTintOn(BuildContext context) =>
    _isDark(context) ? SudagriColors.darkWarnTint : SudagriColors.warnTint;
