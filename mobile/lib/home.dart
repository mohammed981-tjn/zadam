/// «ينتظرك» في رئيسيّة التطبيق (البند ٢٠٦؛ المالك، 6 نوفمبر 2026: «الرئيسيّة بحسب الدور»).
///
/// A signed-in person first sees what concerns them and what waits for them, as the website's home shows it: the
/// cards come from `GET /api/app/home`, which reads them as the person through row-level security with the website's
/// own rules (src/lib/roleHome.ts), so the two homes never disagree. Here they are only parsed, opened on the app's
/// own screen for each page, and the three groups of sections ordered by the side the person is on.
library;

import 'account.dart';
import 'i18n.dart';

class HomeCard {
  const HomeCard({
    required this.key,
    required this.kind,
    required this.title,
    required this.href,
    this.count,
    this.detail,
  });

  final String key;

  /// 'waiting' (something to do or answer) or 'status' (where things stand).
  final String kind;
  final int? count;
  final String title;
  final String? detail;

  /// The website's page for the whole of it; [destinationOf] says which screen opens it here.
  final String href;

  bool get waiting => kind == 'waiting';

  factory HomeCard.fromJson(Map<String, dynamic> j) => HomeCard(
        key: j['key'] as String? ?? '',
        kind: j['kind'] as String? ?? 'status',
        count: (j['count'] as num?)?.toInt(),
        title: j['title'] as String? ?? '',
        detail: j['detail'] as String?,
        href: j['href'] as String? ?? '/',
      );
}

class HomeGroupView {
  const HomeGroupView({required this.group, required this.title, required this.items});

  final String group;
  final String title;
  final List<HomeCard> items;

  factory HomeGroupView.fromJson(Map<String, dynamic> j) => HomeGroupView(
        group: j['group'] as String? ?? '',
        title: j['title'] as String? ?? '',
        items: [
          for (final i in (j['items'] as List? ?? const []))
            if (i is Map<String, dynamic>) HomeCard.fromJson(i),
        ],
      );
}

class RoleHomeData {
  const RoleHomeData({
    required this.role,
    required this.name,
    required this.side,
    required this.waiting,
    required this.full,
    required this.compact,
  });

  final String? role;
  final String name;

  /// 'farmer' or 'investor': the side of the one account the person is on now.
  final String side;

  /// Everything that waits, on every side.
  final int waiting;

  /// The person's own groups, in full, in order.
  final List<HomeGroupView> full;

  /// The other groups: only what waits there.
  final List<HomeGroupView> compact;

  factory RoleHomeData.fromJson(Map<String, dynamic> j) {
    List<HomeGroupView> groups(Object? raw) => [
          for (final g in (raw as List? ?? const []))
            if (g is Map<String, dynamic>) HomeGroupView.fromJson(g),
        ];
    return RoleHomeData(
      role: j['role'] as String?,
      name: j['name'] as String? ?? '',
      side: j['side'] == 'investor' ? 'investor' : 'farmer',
      waiting: (j['waiting'] as num?)?.toInt() ?? 0,
      full: groups(j['full']),
      compact: groups(j['compact']),
    );
  }

  /// The headline under the hero, with the entries kept on this phone counted in.
  String headline(int offline) {
    final n = waiting + offline;
    if (n == 0) return tr('لا شيء ينتظرك الآن', 'Nothing is waiting for you now');
    return tr('ينتظرك $n', '$n waiting for you');
  }

  /// The greeting: the first name, as the website's home says it.
  String get greeting {
    final first = name.trim().split(RegExp(r'\s+')).first;
    return first.isEmpty ? tr('أهلاً بك', 'Welcome') : tr('أهلاً $first', 'Welcome, $first');
  }
}

class HomeApi {
  HomeApi({AccountController? account}) : _account = account ?? accountController;

  final AccountController _account;

  Future<RoleHomeData> load() async => RoleHomeData.fromJson(await _account.call('GET', '/api/app/home'));
}

/// The three groups of sections (مزرعتي، السوق والاستثمار، الأدوات والمعرفة), in the order the side reads them: an
/// investor's first group is the market and investment; everyone else's is the farm.
List<int> sectionOrder(String? side) => side == 'investor' ? const [1, 0, 2] : const [0, 1, 2];

/// The screens a card can open.
enum HomeScreenKey { season, seasons, lands, herds, books, agreement, invest, prices, suppliers, agent, account }

/// Which screen opens a card's page here, with the record or the tab it lands on.
typedef HomeDestination = ({HomeScreenKey screen, String? id, int tab});

HomeDestination destinationOf(String href) {
  final path = href.split(RegExp(r'[?#]')).first;
  final parts = path.split('/').where((p) => p.isNotEmpty).toList();
  HomeDestination to(HomeScreenKey s, {String? id, int tab = 0}) => (screen: s, id: id, tab: tab);
  final head = parts.isEmpty ? '' : parts.first;
  final second = parts.length > 1 ? parts[1] : null;
  final third = parts.length > 2 ? parts[2] : null;
  switch (head) {
    case 'seasons':
      return second != null && second != 'offline' && second != 'new' ? to(HomeScreenKey.season, id: second) : to(HomeScreenKey.seasons);
    case 'lands':
      return to(HomeScreenKey.lands);
    case 'herds':
      return to(HomeScreenKey.herds);
    case 'books':
      return to(HomeScreenKey.books);
    case 'invest':
      if (second == 'agreements' && third != null) return to(HomeScreenKey.agreement, id: third);
      if (second == 'mine' || second == 'inspections') return to(HomeScreenKey.invest, tab: 1);
      return to(HomeScreenKey.invest);
    case 'dashboard':
      return to(HomeScreenKey.invest, tab: 1);
    case 'market':
      return to(HomeScreenKey.prices, tab: second == 'alerts' ? 3 : 0);
    case 'suppliers':
      return to(HomeScreenKey.suppliers, tab: switch (second) { 'orders' => 1, 'deliveries' => 2, 'mine' => 3, _ => 0 });
    case 'agent':
    case 'partners':
      return to(HomeScreenKey.agent);
    case 'account':
      return second == 'agents' ? to(HomeScreenKey.agent, tab: 1) : to(HomeScreenKey.account);
    default:
      // The administration, the notifications and anything else: «حسابي», which holds the review list and the inbox.
      return to(HomeScreenKey.account);
  }
}
