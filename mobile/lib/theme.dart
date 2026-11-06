/// Colours and typography, kept in step with the web app's globals.css.
///
/// The palette is copied rather than derived because the two codebases have no
/// shared build step. When globals.css changes, this changes with it — a farmer
/// who uses the site on a laptop and the app on a phone should not feel they
/// are looking at two different products.
///
/// The brand comes from the logo (owner, 6 November 2026, after seeing mockups: «اريد الاثنين ١ و ٢ يمكن التغيير
/// بينهما»): two palettes the person can switch between in «حسابي», the same two as the website's switch.
///
/// - «ألوان الشعار» (`logo`, the default): the logo's deep green #0F5A32 for buttons and the selected tab, a header
///   that runs from the logo's forest green #023F24 to it, with white type; a gold touch from the logo's sun; cream
///   ground #FAF6EC.
/// - «أخضر الأوراق والذهبيّ» (`leaf`): a light cream header with the forest green as ink, leaf-green buttons #367A23,
///   a warmer gold.
///
/// No red and no orange anywhere (the owner's standing rule): errors and warnings are a dark gold.
///
/// Contrast, measured (WCAG 2.1): white on #0F5A32 8.3:1; #0F5A32 on the cream 7.7:1; muted #5D6B5F on the cream
/// 5.2:1; white on #023F24 12.1:1; white on #367A23 5.3:1; #2F6D1F on #F7F3E6 5.7:1; #666F5A on #F7F3E6 4.75:1;
/// warning #8A6508 on the cream 4.9:1. Dark: #06120A on #4FAE6A 6.9:1, #4FAE6A on the card 6.1:1.
library;

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'i18n.dart';

/// One light palette. Dark mode is shared by both.
class Palette {
  const Palette({
    required this.id,
    required this.nameAr,
    required this.nameEn,
    required this.background,
    required this.foreground,
    required this.card,
    required this.border,
    required this.primary,
    required this.textGreen,
    required this.lightGreen,
    required this.midGreen,
    required this.leafTint,
    required this.muted,
    required this.gold,
    required this.goldTint,
    required this.headerTop,
    required this.headerBottom,
    required this.headerInk,
    required this.headerMuted,
  });

  final String id;
  final String nameAr;
  final String nameEn;

  /// The palette's name in the app's language (the website's switch names them the same way).
  String get name => tr(nameAr, nameEn);
  final Color background;
  final Color foreground;
  final Color card;
  final Color border;
  final Color primary;
  final Color textGreen;
  final Color lightGreen;
  final Color midGreen;
  final Color leafTint;
  final Color muted;
  final Color gold;
  final Color goldTint;
  final Color headerTop;
  final Color headerBottom;
  final Color headerInk;
  final Color headerMuted;
}

const logoPalette = Palette(
  id: 'logo',
  nameAr: 'ألوان الشعار',
  nameEn: 'Logo colours',
  background: Color(0xFFFAF6EC),
  foreground: Color(0xFF14261A),
  card: Color(0xFFFFFFFF),
  border: Color(0xFFE7E0CC),
  primary: Color(0xFF0F5A32),
  textGreen: Color(0xFF0F5A32),
  lightGreen: Color(0xFF579B2E),
  midGreen: Color(0xFF1B6B3C),
  leafTint: Color(0xFFE3EFD9),
  muted: Color(0xFF5D6B5F),
  gold: Color(0xFFF2BD4B),
  goldTint: Color(0xFFFDF1D3),
  headerTop: Color(0xFF023F24),
  headerBottom: Color(0xFF0F5A32),
  headerInk: Color(0xFFFFFFFF),
  headerMuted: Color(0xCCFFFFFF),
);

const leafPalette = Palette(
  id: 'leaf',
  nameAr: 'أخضر الأوراق والذهبيّ',
  nameEn: 'Leaf green and gold',
  background: Color(0xFFF7F3E6),
  foreground: Color(0xFF1C2A14),
  card: Color(0xFFFFFDF8),
  border: Color(0xFFEBE2C8),
  primary: Color(0xFF367A23),
  textGreen: Color(0xFF2F6D1F),
  lightGreen: Color(0xFF579B2E),
  midGreen: Color(0xFF4A9233),
  leafTint: Color(0xFFE6F0D6),
  muted: Color(0xFF666F5A),
  gold: Color(0xFFE0A93A),
  goldTint: Color(0xFFFBECCB),
  headerTop: Color(0xFFFFFDF6),
  headerBottom: Color(0xFFF7F3E6),
  headerInk: Color(0xFF023F24),
  headerMuted: Color(0xFF5D6B5F),
);

const palettes = [logoPalette, leafPalette];

/// The palette in use, kept on the phone. [MaterialApp] listens to it, so a switch repaints the whole app at once.
class PaletteController extends ValueNotifier<Palette> {
  PaletteController() : super(logoPalette);

  static const _key = 'sudagri.palette';

  Future<void> load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final id = prefs.getString(_key);
      value = palettes.firstWhere((p) => p.id == id, orElse: () => logoPalette);
    } catch (_) {
      // No preferences (a test, or a first start that cannot read them): the default stays.
    }
  }

  Future<void> choose(Palette p) async {
    value = p;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_key, p.id);
    } catch (_) {}
  }
}

final paletteController = PaletteController();

class SudagriColors {
  const SudagriColors._();

  static Palette get _p => paletteController.value;

  // Light — follows the chosen palette (and :root / [data-palette] in globals.css).
  static Color get background => _p.background;
  static Color get foreground => _p.foreground;
  static Color get card => _p.card;
  static Color get border => _p.border;

  /// The palette's green: fills with white type on them, the selected tab, selected states.
  static Color get primary => _p.primary;

  /// White on [primary].
  static const primaryForeground = Color(0xFFFFFFFF);

  /// Green that is text, a link or a line icon on the ground or a card.
  static Color get textGreen => _p.textGreen;

  /// The lighter greens, for soft touches and gradients that carry no text.
  static Color get lightOlive => _p.lightGreen;
  static Color get midOlive => _p.midGreen;

  /// A soft green tint, for icon chips and selected fills.
  static Color get leafTint => _p.leafTint;
  static Color get muted => _p.muted;
  static const accent = Color(0xFFB8860B);

  /// The logo's sun: a ring, a dot, a chip's edge — never small text.
  static Color get gold => _p.gold;
  static Color get goldTint => _p.goldTint;

  /// The header band behind the logo.
  static Color get headerTop => _p.headerTop;
  static Color get headerBottom => _p.headerBottom;
  static Color get headerInk => _p.headerInk;
  static Color get headerMuted => _p.headerMuted;

  /// Text-safe gold: errors, warnings and small gold text (no red, no orange).
  static const warn = Color(0xFF8A6508);
  static const warnTint = Color(0xFFF6EEDB);

  // Dark — shared by both palettes, matches the prefers-color-scheme block.
  static const darkBackground = Color(0xFF0D1510);
  static const darkForeground = Color(0xFFEEF1E8);
  static const darkCard = Color(0xFF15201A);
  static const darkBorder = Color(0xFF26342B);
  static const darkPrimary = Color(0xFF4FAE6A);
  static const darkPrimaryForeground = Color(0xFF06120A);
  static const darkTextGreen = Color(0xFF4FAE6A);
  static const darkLeafTint = Color(0xFF1E3324);
  static const darkMuted = Color(0xFFA3A698);
  static const darkAccent = Color(0xFFD4A72C);
  static const darkGold = Color(0xFFE6B94F);
  static const darkWarn = Color(0xFFE0B440);
  static const darkWarnTint = Color(0xFF2C2914);
  static const darkHeaderTop = Color(0xFF06261A);
  static const darkHeaderBottom = Color(0xFF0D3D26);

  /// The selected tab and other selected pills.
  static LinearGradient get selectedGradient => LinearGradient(
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
    // Selected states take the olive fill, with the dark ink on it.
    chipTheme: ChipThemeData(
      backgroundColor: card,
      selectedColor: primary,
      checkmarkColor: onPrimary,
      side: BorderSide(color: border),
      labelStyle: TextStyle(color: fg, fontWeight: FontWeight.w600),
      secondaryLabelStyle: TextStyle(color: onPrimary, fontWeight: FontWeight.w700),
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
    // The selected segment takes the olive fill, with the dark ink.
    segmentedButtonTheme: SegmentedButtonThemeData(
      style: SegmentedButton.styleFrom(
        backgroundColor: card,
        foregroundColor: fg,
        selectedBackgroundColor: primary,
        selectedForegroundColor: onPrimary,
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

/// The ink for text on a soft tint (a chip, a pill, a note). Text on the green fill itself is white
/// ([SudagriColors.primaryForeground]).
Color inkOn(BuildContext context) => _isDark(context)
    ? SudagriColors.darkForeground
    : SudagriColors.foreground;

/// Dark gold for errors and warnings, and small gold text.
Color warnOn(BuildContext context) =>
    _isDark(context) ? SudagriColors.darkWarn : SudagriColors.warn;

Color warnTintOn(BuildContext context) =>
    _isDark(context) ? SudagriColors.darkWarnTint : SudagriColors.warnTint;
