/// سوداقري — the mobile app.
///
/// Four screens: the platform's own landing page, the FAO-56 water requirement,
/// the assistant, and the knowledge base. Registering land and documenting a
/// season stay on the web for now — they involve uploads and review queues that
/// deserve their own design rather than a cramped port.
///
/// The landing screen carries the website's copy verbatim, including the notice
/// that nothing is on offer yet. Someone who reads the site on a borrowed
/// laptop and the app on their own phone should meet the same platform saying
/// the same things.
///
/// The water calculator works with no connection at all. That is not a
/// convenience: signal in the schemes is unreliable, and a tool that only works
/// where there is coverage is not a tool for the people who need it.
library;

import 'package:app_links/app_links.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'account.dart';
import 'i18n.dart';
import 'ledger_autosend.dart';
import 'screens/account_screen.dart';
import 'screens/assistant_screen.dart';
import 'screens/home_screen.dart';
import 'screens/knowledge_screen.dart';
import 'screens/water_screen.dart';
import 'theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  // Read the saved session without holding up the first frame; «حسابي» shows
  // a spinner until it is in.
  accountController.load();
  // A cost kept on the phone goes by itself when the network may be back (the app resumes, a light retry).
  ledgerAutoSender.start();
  // The chosen palette (owner, 6 November 2026): «ألوان الشعار» unless «أخضر الأوراق» was picked in «حسابي».
  paletteController.load();
  // The language (owner, 6 November 2026, backlog 208): Arabic unless English was chosen in the menu or «حسابي».
  langController.load();
  // Back from Google's sign-in in the browser (backlog 173): `sudagri://auth?h=…`, while open or as the app starts.
  AppLinks().uriLinkStream.listen(
    accountController.handleLink,
    onError: (_) {},
  );
  runApp(const SudagriApp());
}

class SudagriApp extends StatefulWidget {
  const SudagriApp({super.key});

  @override
  State<SudagriApp> createState() => _SudagriAppState();
}

class _SudagriAppState extends State<SudagriApp> {
  @override
  void initState() {
    super.initState();
    langController.addListener(_languageChanged);
  }

  @override
  void dispose() {
    langController.removeListener(_languageChanged);
    super.dispose();
  }

  /// A new language reaches every string, the ones a model or a list hands a widget too ([tr] reads the language
  /// when the widget builds), so the whole tree is built again — once, on the switch.
  void _languageChanged() {
    setState(() {});
    rebuildAllElements();
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<Palette>(
      valueListenable: paletteController,
      builder: (context, palette, _) => MaterialApp(
        title: tr('سوداقري', 'Sudagri'),
        debugShowCheckedModeBanner: false,
        theme: sudagriLight,
        darkTheme: sudagriDark,
        // The chosen language for the whole tree: Arabic lays it out right-to-left and English left-to-right
        // (GlobalWidgetsLocalizations gives the Directionality), without every screen wrapping itself in one.
        locale: langController.locale,
        supportedLocales: const [Locale('ar'), Locale('en')],
        localizationsDelegates: const [
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        home: const HomeShell(),
      ),
    );
  }
}

class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;

  // IndexedStack rather than swapping the child, so a half-finished
  // calculation or a conversation survives a glance at another tab. The home
  // board's tiles switch tabs through the callback rather than pushing a
  // second copy of the same screen.
  late final List<Widget> _screens = [
    HomeScreen(onTab: (i) => setState(() => _index = i)),
    const WaterScreen(),
    const AssistantScreen(),
    const KnowledgeScreen(),
    // Backlog 138: the app opened as a visitor for everyone, the owner too.
    const AccountScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(index: _index, children: _screens),
      bottomNavigationBar: _NavBar(
        index: _index,
        onSelect: (i) => setState(() => _index = i),
      ),
    );
  }
}

class _Dest {
  const _Dest(this.icon, this.selectedIcon, this.label);
  final IconData icon;
  final IconData selectedIcon;
  final String label;
}

List<_Dest> get _destinations => [
  _Dest(Icons.home_outlined, Icons.home_rounded, tr('الرئيسية', 'Home')),
  _Dest(Icons.water_drop_outlined, Icons.water_drop, tr('الري', 'Irrigation')),
  _Dest(Icons.chat_bubble_outline, Icons.chat_bubble, tr('المساعد', 'Assistant')),
  _Dest(Icons.menu_book_outlined, Icons.menu_book, tr('المعرفة', 'Knowledge')),
  _Dest(Icons.person_outline, Icons.person, tr('حسابي', 'My account')),
];

/// The bottom bar: five equal slots; the selected one is a light-olive pill
/// (the website's selected tab) with the dark ink, and its name in bold green.
/// The pill slides in with one short implicit animation.
class _NavBar extends StatelessWidget {
  const _NavBar({required this.index, required this.onSelect});

  final int index;
  final ValueChanged<int> onSelect;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: scheme.surface,
        border: Border(top: BorderSide(color: scheme.outline)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 12,
            offset: const Offset(0, -2),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 72,
          child: Row(
            children: [
              for (var i = 0; i < _destinations.length; i++)
                Expanded(
                  child: _NavItem(
                    dest: _destinations[i],
                    selected: i == index,
                    onTap: () => onSelect(i),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  const _NavItem({
    required this.dest,
    required this.selected,
    required this.onTap,
  });

  final _Dest dest;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final muted = mutedOn(context);
    return Semantics(
      button: true,
      selected: selected,
      label: dest.label,
      excludeSemantics: true,
      child: InkResponse(
        onTap: onTap,
        radius: 36,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            AnimatedContainer(
              duration: const Duration(milliseconds: 220),
              curve: Curves.easeOutCubic,
              width: selected ? 60 : 44,
              height: 32,
              decoration: BoxDecoration(
                gradient: selected ? SudagriColors.selectedGradient : null,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Icon(
                selected ? dest.selectedIcon : dest.icon,
                size: 24,
                color: selected ? SudagriColors.primaryForeground : muted,
              ),
            ),
            const SizedBox(height: 4),
            AnimatedDefaultTextStyle(
              duration: const Duration(milliseconds: 220),
              style: DefaultTextStyle.of(context).style.merge(
                TextStyle(
                  fontSize: 12,
                  fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
                  color: selected ? textGreenOn(context) : muted,
                ),
              ),
              child: Text(dest.label, maxLines: 1),
            ),
          ],
        ),
      ),
    );
  }
}
