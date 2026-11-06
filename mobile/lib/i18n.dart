/// The app in Arabic and English (owner, 6 November 2026, backlog 208: «كالموقع، للمستثمرين من الخارج»).
///
/// The website keeps an English twin beside every Arabic sentence, `tr(locale, "عربي", "English")`
/// (src/lib/i18n.ts). The app does the same, with the language held here rather than in a cookie:
///
/// - [tr] `tr('عربي', 'English')` reads the language chosen on this phone. It works anywhere — a model's label, an
///   error a controller throws — because the whole tree is rebuilt when the language changes (see [SudagriApp]).
/// - [t] `t(context, 'عربي', 'English')` reads it from the widget tree, so a widget that uses it also depends on the
///   locale the way it depends on the theme.
///
/// Arabic stays the default and stays exactly as it was; English is only ever the twin beside it. The wording is the
/// website's own English where the same sentence exists there, so the app and the site say the same thing.
///
/// The choice is kept in the phone's preferences like the palette (theme.dart), and [MaterialApp] takes its locale
/// from here, so English lays out left to right and Material's own strings (dates, «OK», «Cancel») follow.
///
/// Numbers are written with Western digits in both languages already (the app never converted them); dates take
/// English month names in English.
library;

import 'package:flutter/widgets.dart';
import 'package:shared_preferences/shared_preferences.dart';

enum AppLang {
  ar('العربيّة'), // ar-only
  en('English');

  const AppLang(this.label);

  /// The language's own name, written in that language (as the website's ع / EN switch).
  final String label;
}

/// The language in use, kept on the phone.
class LangController extends ValueNotifier<AppLang> {
  LangController() : super(AppLang.ar);

  static const _key = 'sudagri.lang';

  bool get isEn => value == AppLang.en;

  Locale get locale => Locale(value.name);

  /// The header the app's routes read (src/lib/appLocale.ts); none in Arabic, the server's default.
  Map<String, String> get header => isEn ? const {'x-sudagri-lang': 'en'} : const {};

  Future<void> load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final id = prefs.getString(_key);
      value = AppLang.values.firstWhere((l) => l.name == id, orElse: () => AppLang.ar);
    } catch (_) {
      // No preferences (a test, or a first start that cannot read them): Arabic stays.
    }
  }

  Future<void> choose(AppLang l) async {
    value = l;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_key, l.name);
    } catch (_) {}
  }
}

final langController = LangController();

/// True when the app is in English.
bool get isEn => langController.isEn;

/// The string for the chosen language: `tr('عربي', 'English')`.
String tr(String ar, String en) => langController.isEn ? en : ar;

/// The string for the language of [context]'s tree: `t(context, 'عربي', 'English')`.
String t(BuildContext context, String ar, String en) {
  final code = Localizations.maybeLocaleOf(context)?.languageCode ?? langController.value.name;
  return code == 'en' ? en : ar;
}

/// English names for the places the app keeps in Arabic as data — the states a land or a supplier is stored under,
/// the towns on the rain map — as the website names them (PLACE_EN in src/lib/enNames.ts). The stored value stays
/// Arabic, since the server reads it; only what is shown changes. A name not listed is shown as it is.
const Map<String, String> placeNamesEn = {
  // Towns
  'الخرطوم': 'Khartoum', 'بورتسودان': 'Port Sudan', 'القضارف': 'Gedaref', 'الأبيض': 'El Obeid', // ar-only
  'نيالا': 'Nyala', 'دنقلا': 'Dongola', 'حلايب': 'Halaib', 'كسلا': 'Kassala', 'الدمازين': 'Ed Damazin', // ar-only
  'سنّار': 'Sennar', 'سنار': 'Sennar', 'ود مدني': 'Wad Madani', 'عطبرة': 'Atbara', 'كوستي': 'Kosti', // ar-only
  'كادقلي': 'Kadugli', 'الفاشر': 'El Fasher', 'الجنينة': 'El Geneina', 'أم درمان': 'Omdurman', // ar-only
  'زالنجي': 'Zalingei', 'الضعين': 'Ed Daein', 'الكرمك': 'Kurmuk', // ar-only
  // Neighbours
  'مصر': 'Egypt', 'ليبيا': 'Libya', 'تشاد': 'Chad', 'أفريقيا الوسطى': 'Central African Rep.', // ar-only
  'جنوب السودان': 'South Sudan', 'إثيوبيا': 'Ethiopia', 'إريتريا': 'Eritrea', 'السودان': 'Sudan', // ar-only
  // States
  'نهر النيل': 'River Nile', 'غرب كردفان': 'West Kordofan', 'شمال كردفان': 'North Kordofan', // ar-only
  'جنوب كردفان': 'South Kordofan', 'البحر الأحمر': 'Red Sea', 'النيل الأبيض': 'White Nile', // ar-only
  'النيل الأزرق': 'Blue Nile', 'شمال دارفور': 'North Darfur', 'جنوب دارفور': 'South Darfur', // ar-only
  'غرب دارفور': 'West Darfur', 'شرق دارفور': 'East Darfur', 'وسط دارفور': 'Central Darfur', // ar-only
  'الشمالية': 'Northern', 'الجزيرة': 'Gezira', // ar-only
};

/// A place's name in the app's language; unknown names stay as written.
String placeName(String name) => isEn ? (placeNamesEn[name.trim()] ?? name) : name;

/// Marks every element dirty, so a string read with [tr] in a widget that depends on nothing else is read again.
/// Called once when the language changes — not a hot path.
void rebuildAllElements() {
  void mark(Element e) {
    e.markNeedsBuild();
    e.visitChildren(mark);
  }

  WidgetsBinding.instance.rootElement?.visitChildren(mark);
}
