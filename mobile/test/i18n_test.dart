/// The app in English (backlog 208, owner, 6 November 2026): the language chosen in the menu turns the whole app,
/// direction included, and every Arabic sentence in lib/ has its English twin beside it.
library;

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sudagri/i18n.dart';
import 'package:sudagri/main.dart';

TextDirection _direction(WidgetTester tester) => Directionality.of(tester.element(find.byType(HomeShell)));

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  tearDown(() => langController.value = AppLang.ar);

  testWidgets('English from the menu turns the app left to right, the home board and the bottom bar with it',
      (tester) async {
    tester.view.physicalSize = const Size(390, 4200);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(const SudagriApp());
    await tester.pump(const Duration(milliseconds: 600));

    // Arabic stays the default, right to left.
    expect(_direction(tester), TextDirection.rtl);
    expect(find.text('الرئيسية'), findsOneWidget);
    expect(find.text('مزرعتي'), findsOneWidget);

    // The choice beside the palette picker in the menu.
    final withDrawer = find.byWidgetPredicate((w) => w is Scaffold && w.drawer != null);
    tester.state<ScaffoldState>(withDrawer).openDrawer();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('اللغة'), findsOneWidget);
    await tester.tap(find.text('English'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));

    expect(langController.value, AppLang.en);
    expect((await SharedPreferences.getInstance()).getString('sudagri.lang'), 'en');
    expect(_direction(tester), TextDirection.ltr);

    // The bottom bar.
    for (final label in ['Home', 'Irrigation', 'Assistant', 'Knowledge', 'My account']) {
      expect(find.text(label), findsWidgets, reason: label);
    }
    for (final label in ['الرئيسية', 'الري', 'المساعد', 'المعرفة', 'حسابي']) {
      expect(find.text(label), findsNothing, reason: label);
    }

    // The home board, behind the menu.
    tester.state<ScaffoldState>(withDrawer).closeDrawer();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    for (final label in [
      'My farm', 'Market and investment', 'Tools and knowledge',
      'Seasons', 'My lands', 'Book', 'Herds', 'Feasibility study', 'Maps',
      'Prices', 'Export', 'Agreements', 'Investment', 'Suppliers', 'Agent', 'Library',
      'News', 'Films', 'Rain forecast', 'Irrigation calculator', 'Nafir', 'Services', 'Mining',
      'Available projects', 'Try again',
    ]) {
      expect(find.text(label), findsWidgets, reason: label);
    }
    expect(find.text('مزرعتي'), findsNothing);
    expect(find.text('المشاريع المتاحة'), findsNothing);

    // And back.
    langController.choose(AppLang.ar);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));
    expect(_direction(tester), TextDirection.rtl);
    expect(find.text('الرئيسية'), findsOneWidget);
    expect(find.text('Home'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  test('tr and the request header follow the language', () {
    expect(tr('نعم', 'Yes'), 'نعم');
    expect(langController.header, isEmpty);
    langController.value = AppLang.en;
    expect(tr('نعم', 'Yes'), 'Yes');
    expect(langController.header, {'x-sudagri-lang': 'en'});
    expect(placeName('القضارف'), 'Gedaref');
    expect(placeName('مكانٌ لا نعرفه'), 'مكانٌ لا نعرفه');
  });

  test('every Arabic string in lib/ has its English twin', () {
    final failures = <String>[];
    final files = Directory('lib').listSync(recursive: true).whereType<File>().where((f) => f.path.endsWith('.dart'));
    for (final f in files) {
      for (final u in arabicWithoutTwin(f.readAsStringSync())) {
        failures.add('${f.path}:${u.line} ${u.text}');
      }
    }
    expect(failures, isEmpty, reason: 'Wrap each in tr(\'…\', \'English\') or t(context, …), or mark a data value '
        'the server reads with `// ar-only`:\n${failures.join('\n')}');
  });

  test('the scan sees an Arabic string without a twin, and passes the ones with', () {
    expect(arabicWithoutTwin("final a = 'نعم';"), hasLength(1));
    expect(arabicWithoutTwin("final a = 'نعم' 'لا';"), hasLength(1));
    expect(arabicWithoutTwin("final a = '\${x ? 'نعم' : 'b'}';"), hasLength(1));
    expect(arabicWithoutTwin("final a = tr('نعم', 'Yes');"), isEmpty);
    expect(arabicWithoutTwin("final a = t(context, 'نعم', 'Yes');"), isEmpty);
    expect(arabicWithoutTwin("final a = tr('نعم', 'نعم');"), isNotEmpty, reason: 'an Arabic twin is no twin');
    expect(arabicWithoutTwin("final a = 'نعم'; // ar-only"), isEmpty);
    expect(arabicWithoutTwin("const x = X(nameAr: 'نعم', nameEn: 'Yes');"), isEmpty);
    expect(arabicWithoutTwin("const _monthsAr = ['يناير', 'فبراير'];"), isEmpty);
    expect(arabicWithoutTwin("// 'نعم'\n/* 'لا' */ final a = 1;"), isEmpty);
  });
}

class ArabicString {
  ArabicString(this.line, this.text);
  final int line;
  final String text;
}

final _arabic = RegExp(r'[؀-ۿ]');

/// The string literals in [src] that carry Arabic and have no English twin. A literal passes when it is:
/// the first argument of `tr(…)` or `t(context, …)` with a string beside it that has no Arabic; the value of a name
/// ending in `Ar` (`nameAr: '…'`, `_monthsAr = [...]`) — the Arabic half of a pair whose English half sits beside
/// it; or on a line marked `// ar-only` — a data value the server reads or a pattern that reads Arabic digits.
List<ArabicString> arabicWithoutTwin(String src) {
  final tokens = _tokens(src);
  final lines = src.split('\n');
  final out = <ArabicString>[];
  var twinUntil = -1; // inside `xxxAr = …;` up to this token index
  for (var i = 0; i < tokens.length; i++) {
    final tk = tokens[i];
    if (tk.kind == _K.ident && tk.text.endsWith('Ar') && i + 1 < tokens.length && tokens[i + 1].text == '=') {
      for (var j = i + 1, depth = 0; j < tokens.length; j++) {
        final s = tokens[j].text;
        if ('([{'.contains(s) && tokens[j].kind == _K.punct) depth++;
        if (')]}'.contains(s) && tokens[j].kind == _K.punct) depth--;
        if (s == ';' && depth <= 0) {
          twinUntil = j;
          break;
        }
      }
    }
    if (tk.kind != _K.str || !_arabic.hasMatch(tk.text)) continue;
    if (i <= twinUntil) continue;
    final line = src.substring(0, tk.start).split('\n').length;
    final lastLine = src.substring(0, tk.end).split('\n').length;
    if (lines[lastLine - 1].contains('// ar-only')) continue;
    String at(int k) => k >= 0 && k < tokens.length ? tokens[k].text : '';
    if (at(i - 1) == ':' && tokens[i - 2].kind == _K.ident && at(i - 2).endsWith('Ar')) continue;
    final isTr = at(i - 1) == '(' && at(i - 2) == 'tr';
    final isT = at(i - 1) == ',' && at(i - 3) == '(' && at(i - 4) == 't';
    if ((isTr || isT) && at(i + 1) == ',' && i + 2 < tokens.length) {
      final en = tokens[i + 2];
      if (en.kind == _K.str && !_arabic.hasMatch(en.text)) continue;
    }
    out.add(ArabicString(line, tk.text.length > 80 ? '${tk.text.substring(0, 80)}…' : tk.text));
  }
  return out;
}

enum _K { str, ident, punct }

class _Tok {
  _Tok(this.kind, this.start, this.end, this.text);
  final _K kind;
  final int start;
  final int end;
  final String text;
}

/// Identifiers, punctuation and string literals (adjacent literals as one, interpolations inside them), comments
/// skipped. Enough of Dart for the scan; not a parser.
List<_Tok> _tokens(String s) {
  final out = <_Tok>[];
  var i = 0;
  bool isIdent(int c) => (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c == 95 || c == 36;

  int skipSpace(int i) {
    while (i < s.length) {
      if (' \t\r\n'.contains(s[i])) {
        i++;
      } else if (s.startsWith('//', i)) {
        final j = s.indexOf('\n', i);
        i = j < 0 ? s.length : j + 1;
      } else if (s.startsWith('/*', i)) {
        var depth = 0;
        while (i < s.length) {
          if (s.startsWith('/*', i)) {
            depth++;
            i += 2;
          } else if (s.startsWith('*/', i)) {
            depth--;
            i += 2;
            if (depth == 0) break;
          } else {
            i++;
          }
        }
      } else {
        break;
      }
    }
    return i;
  }

  bool startsString(int i) =>
      i < s.length &&
      (s[i] == "'" || s[i] == '"' || (s[i] == 'r' && i + 1 < s.length && (s[i + 1] == "'" || s[i + 1] == '"') &&
          (i == 0 || !isIdent(s.codeUnitAt(i - 1)))));

  late int Function(int) stringEnd;
  int exprEnd(int i) {
    var depth = 1;
    while (i < s.length) {
      final j = skipSpace(i);
      if (j != i) {
        i = j;
        continue;
      }
      if (startsString(i)) {
        i = stringEnd(i);
        continue;
      }
      if (s[i] == '{') depth++;
      if (s[i] == '}') {
        depth--;
        if (depth == 0) return i + 1;
      }
      i++;
    }
    return i;
  }

  stringEnd = (int i) {
    var raw = false;
    if (s[i] == 'r') {
      raw = true;
      i++;
    }
    final q = s[i];
    final delim = s.startsWith(q * 3, i) ? q * 3 : q;
    i += delim.length;
    while (i < s.length) {
      if (!raw && s[i] == r'\') {
        i += 2;
        continue;
      }
      if (s.startsWith(delim, i)) return i + delim.length;
      if (!raw && s.startsWith(r'${', i)) {
        i = exprEnd(i + 2);
        continue;
      }
      i++;
    }
    return i;
  };

  while (i < s.length) {
    final j = skipSpace(i);
    if (j != i) {
      i = j;
      continue;
    }
    if (startsString(i)) {
      final start = i;
      var end = stringEnd(i);
      while (true) {
        final k = skipSpace(end);
        if (startsString(k)) {
          end = stringEnd(k);
        } else {
          break;
        }
      }
      out.add(_Tok(_K.str, start, end, s.substring(start, end)));
      i = end;
      continue;
    }
    if (isIdent(s.codeUnitAt(i))) {
      final start = i;
      while (i < s.length && isIdent(s.codeUnitAt(i))) {
        i++;
      }
      out.add(_Tok(_K.ident, start, i, s.substring(start, i)));
      continue;
    }
    out.add(_Tok(_K.punct, i, i + 1, s[i]));
    i++;
  }
  return out;
}
