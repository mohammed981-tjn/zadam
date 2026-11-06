/// واجهات التطبيق بالبيج والزيتونيّ (البند ٢٠٢): الشريط السفليّ يقول أيّ تبويبٍ مختار ويبدّل بينها، والرئيسيّة
/// تُبنى بلا خطأٍ ولو لم يبلغ التطبيقُ الخادم (حالة الخطأ تظهر ومعها «إعادة المحاولة»).
library;

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sudagri/main.dart';
import 'package:sudagri/theme.dart';

Widget _app() => MaterialApp(
      theme: sudagriLight,
      darkTheme: sudagriDark,
      locale: const Locale('ar'),
      supportedLocales: const [Locale('ar')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: const HomeShell(),
    );

bool _selected(WidgetTester tester, String label) => tester
    .getSemantics(find.bySemanticsLabel(label))
    .flagsCollection
    .isSelected
    .toBoolOrNull()!;

void main() {
  testWidgets('the bottom bar marks the selected tab and switches it', (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final semantics = tester.ensureSemantics();

    await tester.pumpWidget(_app());
    await tester.pump(const Duration(milliseconds: 400));

    expect(_selected(tester, 'الرئيسية'), isTrue);
    expect(_selected(tester, 'الري'), isFalse);

    await tester.tap(find.bySemanticsLabel('الري'));
    await tester.pump(const Duration(milliseconds: 400));
    expect(_selected(tester, 'الري'), isTrue);
    expect(_selected(tester, 'الرئيسية'), isFalse);

    expect(tester.takeException(), isNull);
    semantics.dispose();
  });

  testWidgets('the home board builds, and an unreachable server is a retry, not a crash', (tester) async {
    tester.view.physicalSize = const Size(390, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(_app());
    await tester.pump(const Duration(milliseconds: 600));

    expect(find.text('الأقسام'), findsOneWidget);
    for (final s in ['الأخبار', 'الأفلام', 'توقّع الأمطار', 'حاسبة الري', 'النفير', 'الخدمات', 'التعدين']) {
      expect(find.text(s), findsWidgets, reason: s);
    }
    expect(find.text('المشاريع المتاحة'), findsOneWidget);
    expect(find.text('إعادة المحاولة'), findsWidgets);
    expect(tester.takeException(), isNull);
  });
}
