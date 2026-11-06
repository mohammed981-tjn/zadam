/// Where a tapped phone notification lands (backlog 207).
///
/// A notification carries the website path its in-app row already links to (`notifications.link`). Here that path
/// is turned into the app's own screen: the conversation for a new message, the review list for an entry waiting for
/// approval, the agreement or the contract waiting for a signature, the prices for a price alert, the season, the
/// land. The «ينتظرك» cards' rules (home.dart, destinationOf) cover the farm, market and investment pages; this adds
/// the pages a notification points at and a card does not. What the app has no screen for opens on the website, as
/// the inbox in «حسابي» does; and the inbox itself is the «حسابي» tab.
library;

import 'package:flutter/material.dart';

import 'home.dart';
import 'screens/agent_screen.dart';
import 'screens/books_review_screen.dart';
import 'screens/books_screen.dart';
import 'screens/contract_detail_screen.dart';
import 'screens/contracts_screen.dart';
import 'screens/invest_screen.dart';
import 'screens/lands_screen.dart';
import 'screens/herds_screen.dart';
import 'screens/messages_screen.dart';
import 'screens/prices_screen.dart';
import 'screens/season_screen.dart';
import 'screens/seasons_screen.dart';
import 'screens/suppliers_screen.dart';

/// The «حسابي» tab in the bottom bar (main.dart).
const accountTab = 4;

enum PushScreen {
  thread,
  messages,
  booksReview,
  forward,
  serviceContract,
  contracts,
  season,
  seasons,
  lands,
  herds,
  books,
  agreement,
  invest,
  prices,
  suppliers,
  agent,
}

/// Either a tab to switch to, a screen to open (with its record and tab), or a website page.
typedef PushTarget = ({int? tab, PushScreen? screen, String? id, int screenTab, String? site});

PushTarget _tab(int i) => (tab: i, screen: null, id: null, screenTab: 0, site: null);
PushTarget _screen(PushScreen s, {String? id, int tab = 0}) => (tab: null, screen: s, id: id, screenTab: tab, site: null);
PushTarget _site(String path) => (tab: null, screen: null, id: null, screenTab: 0, site: path);

final _id = RegExp(r'^[A-Za-z0-9-]{1,64}$');

PushTarget pushTarget(String? link) {
  final raw = (link ?? '').trim();
  // Only the platform's own paths; anything else is the inbox.
  if (!raw.startsWith('/') || raw.startsWith('//')) return _tab(accountTab);
  final path = raw.split(RegExp(r'[?#]')).first;
  final parts = path.split('/').where((p) => p.isNotEmpty).toList();
  final head = parts.isEmpty ? '' : parts.first;
  final second = parts.length > 1 ? parts[1] : null;
  final third = parts.length > 2 ? parts[2] : null;
  String? idOf(String? s) => s != null && _id.hasMatch(s) ? s : null;

  switch (head) {
    case '':
    case 'notifications':
      return _tab(accountTab);
    case 'messages':
      final id = idOf(second);
      return id == null ? _screen(PushScreen.messages) : _screen(PushScreen.thread, id: id);
    case 'books':
      if (second == 'review') return _screen(PushScreen.booksReview);
    case 'market':
      final id = idOf(third);
      if (second == 'forward' && id != null) return _screen(PushScreen.forward, id: id);
    case 'contracts':
      final id = idOf(second);
      return id != null && second != 'new' ? _screen(PushScreen.serviceContract, id: id) : _screen(PushScreen.contracts);
    case 'rates':
      return _screen(PushScreen.prices, tab: 0);
    case 'seasons' || 'lands' || 'herds' || 'invest' || 'dashboard' || 'suppliers' || 'agent' || 'partners' || 'account':
      break;
    default:
      // The administration, the community pages and the rest: the website, as the inbox opens them.
      return _site(raw);
  }
  final d = destinationOf(raw);
  return switch (d.screen) {
    HomeScreenKey.season => d.id != null && _id.hasMatch(d.id!) ? _screen(PushScreen.season, id: d.id) : _screen(PushScreen.seasons),
    HomeScreenKey.seasons => _screen(PushScreen.seasons),
    HomeScreenKey.lands => _screen(PushScreen.lands),
    HomeScreenKey.herds => _screen(PushScreen.herds),
    HomeScreenKey.books => _screen(PushScreen.books),
    HomeScreenKey.agreement => d.id != null && _id.hasMatch(d.id!) ? _screen(PushScreen.agreement, id: d.id) : _screen(PushScreen.invest),
    HomeScreenKey.invest => _screen(PushScreen.invest, tab: d.tab),
    HomeScreenKey.prices => _screen(PushScreen.prices, tab: d.tab),
    HomeScreenKey.suppliers => _screen(PushScreen.suppliers, tab: d.tab),
    HomeScreenKey.agent => _screen(PushScreen.agent, tab: d.tab),
    HomeScreenKey.account => _tab(accountTab),
  };
}

/// The screen a [PushTarget] with a `screen` opens.
Widget pushScreen(PushTarget t) => switch (t.screen!) {
      PushScreen.thread => ThreadScreen(id: t.id!),
      PushScreen.messages => const MessagesScreen(),
      PushScreen.booksReview => const BooksReviewScreen(),
      PushScreen.forward => ForwardContractScreen(id: t.id!),
      PushScreen.serviceContract => ServiceContractScreen(id: t.id!),
      PushScreen.contracts => const ContractsScreen(),
      PushScreen.season => SeasonScreen(id: t.id!),
      PushScreen.seasons => const SeasonsScreen(),
      PushScreen.lands => const LandsScreen(),
      PushScreen.herds => const HerdsScreen(),
      PushScreen.books => const BooksScreen(),
      PushScreen.agreement => AgreementScreen(id: t.id!),
      PushScreen.invest => InvestScreen(initialTab: t.screenTab),
      PushScreen.prices => PricesScreen(initialTab: t.screenTab),
      PushScreen.suppliers => SuppliersScreen(initialTab: t.screenTab),
      PushScreen.agent => AgentScreen(initialTab: t.screenTab),
    };
