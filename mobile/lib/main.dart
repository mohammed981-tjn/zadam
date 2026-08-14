/// سودجري — the mobile app.
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

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'screens/assistant_screen.dart';
import 'screens/home_screen.dart';
import 'screens/knowledge_screen.dart';
import 'screens/water_screen.dart';
import 'theme.dart';

void main() => runApp(const SudagriApp());

class SudagriApp extends StatelessWidget {
  const SudagriApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'سودجري',
      debugShowCheckedModeBanner: false,
      theme: sudagriLight,
      darkTheme: sudagriDark,
      // Arabic throughout, so the whole tree lays out right-to-left without
      // every screen having to wrap itself in a Directionality.
      locale: const Locale('ar'),
      supportedLocales: const [Locale('ar')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: const HomeShell(),
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
  // calculation or a conversation survives a glance at another tab.
  static const _screens = [
    HomeScreen(),
    WaterScreen(),
    AssistantScreen(),
    KnowledgeScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(index: _index, children: _screens),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.home_outlined),
            selectedIcon: Icon(Icons.home),
            label: 'الرئيسية',
          ),
          NavigationDestination(
            icon: Icon(Icons.water_drop_outlined),
            selectedIcon: Icon(Icons.water_drop),
            label: 'الري',
          ),
          NavigationDestination(
            icon: Icon(Icons.chat_bubble_outline),
            selectedIcon: Icon(Icons.chat_bubble),
            label: 'المساعد',
          ),
          NavigationDestination(
            icon: Icon(Icons.menu_book_outlined),
            selectedIcon: Icon(Icons.menu_book),
            label: 'المعرفة',
          ),
        ],
      ),
    );
  }
}
