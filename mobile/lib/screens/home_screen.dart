/// الرئيسيّة: واجهةٌ قصيرة، ثمّ لوحةُ بطاقاتٍ لكلّ قسم (طلب المالك، 25 سبتمبر).
///
/// The owner found the news unclear inside the home screen and asked for the
/// home to be a board, with the news on a screen of its own reached from the
/// menu. So the home is now: one line saying what the platform is, a grid of
/// tiles — each a section, one tap away — the platform's central notice that
/// nothing is on offer yet, and the projects when there are any. The side
/// menu lists the same sections, the news first.
///
/// Backlog 202 (6 November): a hero band in the light-olive gradient with the
/// platform's line, one tile per section in three columns so the whole board
/// reads at a glance, every icon on the same light-olive chip, and clear
/// section titles.
///
/// The tiles for the calculator, the assistant and the knowledge base switch
/// the bottom tab rather than opening a second copy of the screen, so a
/// half-finished calculation is still there when the farmer comes back.
///
/// Backlog 206 (6 November): for a signed-in person, a «ينتظرك» list under the
/// hero — what concerns them and what waits for them, as the website's home
/// shows it (GET /api/app/home), with the entries kept on this phone counted
/// in — and the three groups ordered by the side they are on: an investor's
/// first group is the market and investment.
library;

import 'package:flutter/material.dart';

import '../account.dart';
import '../api.dart';
import '../home.dart';
import '../i18n.dart';
import '../seasons.dart' show LedgerOutbox, userIdOf;
import '../theme.dart';
import '../ui.dart';
import 'account_screen.dart';
import 'agent_screen.dart';
import 'books_screen.dart';
import 'contract_detail_screen.dart' show AgreementScreen;
import 'contracts_screen.dart';
import 'export_screen.dart';
import 'feasibility_screen.dart';
import 'herds_screen.dart';
import 'invest_screen.dart';
import 'lands_screen.dart';
import 'library_screen.dart';
import 'maps_screen.dart';
import 'prices_screen.dart';
import 'season_screen.dart';
import 'seasons_screen.dart';
import 'suppliers_screen.dart';
import 'films_screen.dart';
import 'mining_screen.dart';
import 'nafir_screen.dart';
import 'news_screen.dart';
import 'rain_screen.dart';
import 'services_screen.dart';

/// A section of the app: where it opens, as a tab index or a pushed screen.
class _Section {
  const _Section(this.title, this.note, this.icon, {this.tab, this.screen});

  final String title;
  final String note;
  final IconData icon;
  final int? tab;
  final Widget Function()? screen;
}

/// The sections in three groups (item 203: the app now carries what the website does, each section on its own
/// screen): the farm, the market and investment, then the tools and knowledge the app always had.
class _Group {
  const _Group(this.title, this.subtitle, this.sections);

  final String title;
  final String subtitle;
  final List<_Section> sections;
}

List<_Group> get _groups => <_Group>[
  _Group(tr('مزرعتي', 'My farm'), tr('مواسمك وأرضك وحسابك', 'Your seasons, land and book'), [
    _Section(
      tr('المواسم', 'Seasons'),
      tr('المراحل والقيود', 'Stages and entries'),
      Icons.eco_outlined,
      screen: () => const SeasonsScreen(),
    ),
    _Section(
      tr('أراضيّ', 'My lands'),
      tr('الحدود والتربة والماء', 'Boundaries, soil and water'),
      Icons.landscape_outlined,
      screen: () => const LandsScreen(),
    ),
    _Section(
      tr('الدفتر', 'Book'),
      tr('الحسابات والأصول', 'Accounts and assets'),
      Icons.account_balance_wallet_outlined,
      screen: () => const BooksScreen(),
    ),
    _Section(
      tr('القطعان', 'Herds'),
      tr('الماشية وصحّتها', 'Livestock and their health'),
      Icons.pets_outlined,
      screen: () => const HerdsScreen(),
    ),
    _Section(
      tr('دراسة الجدوى', 'Feasibility study'),
      tr('التكلفة والعائد', 'Cost and return'),
      Icons.calculate_outlined,
      screen: () => const FeasibilityScreen(),
    ),
    _Section(
      tr('الخرائط', 'Maps'),
      tr('كلّ الطبقات', 'Every layer'),
      Icons.map_outlined,
      screen: () => const MapsScreen(),
    ),
  ]),
  _Group(tr('السوق والاستثمار', 'Market and investment'), tr('أسعارٌ وعقودٌ وشراكة', 'Prices, contracts and partnership'), [
    _Section(
      tr('الأسعار', 'Prices'),
      tr('المحاصيل والصرف', 'Crops and exchange'),
      Icons.trending_up_rounded,
      screen: () => const PricesScreen(),
    ),
    _Section(
      tr('التصدير', 'Export'),
      tr('الشروط والجاهزيّة', 'Terms and readiness'),
      Icons.local_shipping_outlined,
      screen: () => const ExportScreen(),
    ),
    _Section(
      tr('العقود', 'Agreements'),
      tr('اقرأ ووقّع', 'Read and sign'),
      Icons.description_outlined,
      screen: () => const ContractsScreen(),
    ),
    _Section(
      tr('الاستثمار', 'Investment'),
      tr('الفرص والشراكة', 'Opportunities and partnership'),
      Icons.handshake_outlined,
      screen: () => const InvestScreen(),
    ),
    _Section(
      tr('الموردون', 'Suppliers'),
      tr('البذور والأسمدة', 'Seed and fertiliser'),
      Icons.storefront_outlined,
      screen: () => const SuppliersScreen(),
    ),
    _Section(
      tr('الوكيل', 'Agent'),
      tr('تسجيلٌ بتفويض', 'Registration by mandate'),
      Icons.badge_outlined,
      screen: () => const AgentScreen(),
    ),
  ]),
  _Group(tr('الأدوات والمعرفة', 'Tools and knowledge'), tr('مجّاناً وبلا تسجيل', 'Free and with no sign-up'), [
    _Section(
      tr('الأخبار', 'News'),
      tr('جديد سوداقري', 'What\'s new on Sudagri'),
      Icons.newspaper_rounded,
      screen: () => const NewsScreen(),
    ),
    _Section(
      tr('الأفلام', 'Films'),
      tr('سوداقري بالصورة', 'Sudagri in pictures'),
      Icons.movie_outlined,
      screen: () => const FilmsScreen(),
    ),
    _Section(
      tr('توقّع الأمطار', 'Rain forecast'),
      tr('الخريطة والجدول', 'The map and the table'),
      Icons.umbrella_outlined,
      screen: () => const RainScreen(),
    ),
    _Section(
      tr('حاسبة الري', 'Irrigation calculator'),
      tr('كم يحتاج محصولك', 'How much your crop needs'),
      Icons.water_drop_outlined,
      tab: 1,
    ),
    _Section(tr('المساعد', 'Assistant'), tr('اسأل عن أي محصول', 'Ask about any crop'), Icons.chat_bubble_outline, tab: 2),
    _Section(tr('المعرفة', 'Knowledge'), tr('محاصيل وتربة وماء', 'Crops, soil and water'), Icons.menu_book_outlined, tab: 3),
    _Section(
      tr('النفير', 'Nafir'),
      tr('العمل المشترك', 'Working together'),
      Icons.groups_outlined,
      screen: () => const NafirScreen(),
    ),
    _Section(
      tr('الخدمات', 'Services'),
      tr('حراثة ومساحة وبيطرة', 'Ploughing, surveying and veterinary care'),
      Icons.agriculture_outlined,
      screen: () => const ServicesScreen(),
    ),
    _Section(
      tr('التعدين', 'Mining'),
      tr('قسم مستقلّ', 'A separate section'),
      Icons.construction_outlined,
      screen: () => const MiningScreen(),
    ),

    _Section(
      tr('المكتبة', 'Library'),
      tr('بحوثٌ ودراسات', 'Research and studies'),
      Icons.local_library_outlined,
      screen: () => const LibraryScreen(),
    ),
  ]),
];

/// Every section, for the drawer.
List<_Section> get _sections => [for (final g in _groups) ...g.sections];

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, this.onTab});

  /// Switches the bottom tab; given by the shell.
  final ValueChanged<int>? onTab;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final _api = SudagriApi();
  final _homeApi = HomeApi();
  late Future<List<Project>> _future;

  /// What waits for the signed-in person; null for a visitor.
  Future<RoleHomeData>? _home;

  /// The side the loaded home says the person is on, which orders the groups.
  String? _side;

  /// Entries kept on this phone with no network, not yet sent.
  int _offline = 0;

  /// The account the «ينتظرك» list was read for, so a new sign-in reads it again.
  String? _readFor;

  @override
  void initState() {
    super.initState();
    _future = _load();
    accountController.addListener(_sessionChanged);
    _sessionChanged();
  }

  /// The projects sit below the fold, and the list builds them only when they
  /// scroll into view; until then nothing listens to the future, so a failure
  /// would surface as an unhandled error. The FutureBuilder still gets it.
  Future<List<Project>> _load() => _api.projects()..ignore();

  void _sessionChanged() {
    final s = accountController.value;
    final user = s == null ? null : userIdOf(s.accessToken);
    if (user == _readFor) return;
    _readFor = user;
    if (user == null) {
      if (mounted) {
        setState(() {
          _home = null;
          _side = null;
          _offline = 0;
        });
      }
      return;
    }
    _loadHome();
  }

  void _loadHome() {
    final home = _homeApi.load();
    // The list is drawn by a FutureBuilder; the side is read here too, and a failure is the builder's to show.
    home.then((d) {
      if (mounted) setState(() => _side = d.side);
    }, onError: (_) {});
    _home = home;
    if (mounted) setState(() {});
    LedgerOutbox().pending(_readFor).then((items) {
      if (mounted) setState(() => _offline = items.length);
    });
  }

  @override
  void dispose() {
    accountController.removeListener(_sessionChanged);
    _api.dispose();
    super.dispose();
  }

  /// A «ينتظرك» card opens its page's own screen in the app.
  void _openCard(HomeCard c) {
    final d = destinationOf(c.href);
    final Widget screen = switch (d.screen) {
      HomeScreenKey.season => SeasonScreen(id: d.id!),
      HomeScreenKey.seasons => const SeasonsScreen(),
      HomeScreenKey.lands => const LandsScreen(),
      HomeScreenKey.herds => const HerdsScreen(),
      HomeScreenKey.books => const BooksScreen(),
      HomeScreenKey.agreement => AgreementScreen(id: d.id!),
      HomeScreenKey.invest => InvestScreen(initialTab: d.tab),
      HomeScreenKey.prices => PricesScreen(initialTab: d.tab),
      HomeScreenKey.suppliers => SuppliersScreen(initialTab: d.tab),
      HomeScreenKey.agent => AgentScreen(initialTab: d.tab),
      HomeScreenKey.account => const AccountScreen(),
    };
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => screen)).then((_) {
      // Back from a screen where something may have been answered: read it again.
      if (mounted && _readFor != null) _loadHome();
    });
  }

  void _open(_Section s) {
    if (s.tab != null) {
      widget.onTab?.call(s.tab!);
    } else if (s.screen != null) {
      Navigator.of(context)
          .push(MaterialPageRoute(builder: (_) => s.screen!()));
    }
  }

  @override
  Widget build(BuildContext context) {
    final home = _home;
    return Scaffold(
      appBar: const BrandAppBar(),
      drawer: _Menu(
        onOpen: (s) {
          Navigator.of(context).pop();
          _open(s);
        },
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          setState(() => _future = _load());
          if (_readFor != null) _loadHome();
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
          children: [
            FadeIn(
              child: _Hero(
                onWater: () => widget.onTab?.call(1),
                onAsk: () => widget.onTab?.call(2),
              ),
            ),
            if (home != null) ...[
              const SizedBox(height: 18),
              FutureBuilder<RoleHomeData>(
                future: home,
                builder: (context, snapshot) {
                  if (snapshot.connectionState == ConnectionState.waiting) {
                    return const LoadingView(compact: true);
                  }
                  if (snapshot.hasError) {
                    return Card(
                      child: StateView.error(snapshot.error, compact: true, onRetry: _loadHome),
                    );
                  }
                  return WaitingBoard(
                    data: snapshot.data!,
                    offline: _offline,
                    onOpen: _openCard,
                    onOffline: () =>
                        Navigator.of(context).push(MaterialPageRoute(builder: (_) => const SeasonsScreen())),
                  );
                },
              ),
            ],
            const SizedBox(height: 22),
            for (final g in [for (final i in sectionOrder(_side)) _groups[i]]) ...[
              SectionTitle(g.title, subtitle: g.subtitle),
              GridView.count(
                crossAxisCount: 3,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                mainAxisSpacing: 10,
                crossAxisSpacing: 10,
                childAspectRatio: 0.86,
                children: [
                  for (var i = 0; i < g.sections.length; i++)
                    FadeIn(
                      delay: i ~/ 3 + 1,
                      child: _Tile(
                        section: g.sections[i],
                        onTap: () => _open(g.sections[i]),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 18),
            ],
            const SizedBox(height: 20),
            const _Notice(),
            const SizedBox(height: 22),
            SectionTitle(tr('المشاريع المتاحة', 'Available projects')),
            FutureBuilder<List<Project>>(
              future: _future,
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const LoadingView(compact: true);
                }
                if (snapshot.hasError) {
                  return Card(
                    child: StateView.error(
                      snapshot.error,
                      compact: true,
                      onRetry: () => setState(() => _future = _load()),
                    ),
                  );
                }
                final projects = snapshot.data!;
                if (projects.isEmpty) return const _NoProjects();
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    for (var i = 0; i < projects.length; i++)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: FadeIn(
                          delay: i,
                          child: _ProjectCard(project: projects[i]),
                        ),
                      ),
                  ],
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

/* ------------------------------------------------------------------ */

/// «ينتظرك» (backlog 206): the count and the greeting, what is kept on this phone, the person's own groups card by
/// card, and one line each for what waits on their other sides. Colours from theme.dart only: the olive for what
/// waits, the light-olive chip for where things stand.
class WaitingBoard extends StatelessWidget {
  const WaitingBoard({
    super.key,
    required this.data,
    required this.onOpen,
    this.offline = 0,
    this.onOffline,
  });

  final RoleHomeData data;
  final int offline;
  final ValueChanged<HomeCard> onOpen;
  final VoidCallback? onOffline;

  @override
  Widget build(BuildContext context) {
    // The group titles are said when there is more than one to tell apart.
    final named = data.full.length > 1;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SectionTitle(data.headline(offline), subtitle: data.greeting),
        if (offline > 0)
          _WaitingTile(
            card: HomeCard(
              key: 'offline',
              kind: 'waiting',
              count: offline,
              title: tr('محفوظٌ على هاتفك لم يُرسل بعد', 'Kept on your phone, not yet sent'),
              detail: tr('يُرسل وحده حين تعود الشبكة، أو افتح «المواسم» لترسله الآن', 'It goes by itself when the network is back, or open «Seasons» to send it now'),
              href: '/seasons',
            ),
            onTap: onOffline ?? () {},
          ),
        for (final g in data.full) ...[
          if (named)
            Padding(
              padding: const EdgeInsets.only(top: 6, bottom: 6),
              child: Text(
                g.title,
                style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14, color: textGreenOn(context)),
              ),
            ),
          for (final c in g.items) _WaitingTile(card: c, onTap: () => onOpen(c)),
        ],
        if (data.compact.isNotEmpty)
          Card(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(tr('وينتظرك في جوانبك الأخرى', 'Also waiting on your other sides'), style: TextStyle(fontWeight: FontWeight.w800)),
                  for (final g in data.compact)
                    for (final c in g.items)
                      InkWell(
                        onTap: () => onOpen(c),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(vertical: 6),
                          child: Row(
                            children: [
                              Expanded(
                                child: Text(
                                  '${g.title}: ${c.title}',
                                  style: TextStyle(color: textGreenOn(context), fontSize: 13, height: 1.5),
                                ),
                              ),
                              if (c.count != null) TagPill('${c.count}'),
                            ],
                          ),
                        ),
                      ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

class _WaitingTile extends StatelessWidget {
  const _WaitingTile({required this.card, required this.onTap});

  final HomeCard card;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final waiting = card.waiting;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: waiting ? leafTintOn(context) : scheme.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(color: waiting ? scheme.primary.withValues(alpha: 0.45) : scheme.outline),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (card.count != null)
                  Container(
                    width: 36,
                    height: 36,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: waiting ? scheme.primary : leafTintOn(context),
                      shape: BoxShape.circle,
                    ),
                    child: Text(
                      '${card.count}',
                      style: TextStyle(
                        fontWeight: FontWeight.w900,
                        color: waiting ? scheme.onPrimary : textGreenOn(context),
                      ),
                    ),
                  )
                else
                  IconChip(waiting ? Icons.notifications_active_outlined : Icons.eco_outlined, size: 36),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(card.title, style: const TextStyle(fontWeight: FontWeight.w800, height: 1.4)),
                      if (card.detail != null) ...[
                        const SizedBox(height: 2),
                        Text(
                          card.detail!,
                          style: TextStyle(fontSize: 12.5, height: 1.6, color: mutedOn(context)),
                        ),
                      ],
                    ],
                  ),
                ),
                Icon(Icons.chevron_left, color: mutedOn(context)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/* ------------------------------------------------------------------ */

/// The hero: what the platform is, in the light-olive band, and the two tools
/// a farmer reaches for first.
class _Hero extends StatelessWidget {
  const _Hero({required this.onWater, required this.onAsk});

  final VoidCallback onWater;
  final VoidCallback onAsk;

  @override
  Widget build(BuildContext context) {
    final gold = SudagriColors.gold;
    return HeroVideo(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: const Color(0x66000000),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: gold.withValues(alpha: 0.8)),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.verified_outlined, size: 14, color: gold),
                const SizedBox(width: 5),
                Flexible(
                  child: Text(
                    tr('الأدوات تعمل الآن · مجاناً وبلا تسجيل', 'The tools work now · free and with no sign-up'),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
                  ),
                ),
              ],
            ),
          ),
          // The film shows above the words.
          const SizedBox(height: 72),
          // Broken after «هنا» so the two lines balance on a phone.
          Text(
            tr('كل رقمٍ هنا\nيمكنك أن تعيد حسابه بنفسك', 'Every number here\nis one you can recompute yourself'),
            style: TextStyle(
              fontSize: 23,
              fontWeight: FontWeight.w900,
              height: 1.4,
              shadows: [Shadow(color: Color(0x99000000), blurRadius: 8)],
            ),
          ),
          const SizedBox(height: 4),
          Text(
            tr('منصّة معرفة زراعية وبيانات للسودان — لكل رقمٍ مصدره ومنهجه.', 'An agricultural knowledge and data platform for Sudan — every number with its source and method.'),
            style: TextStyle(
              height: 1.6,
              color: Color(0xE6FFFFFF),
              fontSize: 13,
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: FilledButton.icon(
                  style: FilledButton.styleFrom(
                    padding: const EdgeInsets.symmetric(
                      vertical: 11,
                      horizontal: 8,
                    ),
                  ),
                  onPressed: onWater,
                  icon: const Icon(Icons.water_drop, size: 18),
                  label: Text(tr('احسب الري', 'Work out irrigation')),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.white,
                    backgroundColor: const Color(0x33000000),
                    side: BorderSide(color: gold, width: 1.5),
                    padding: const EdgeInsets.symmetric(
                      vertical: 11,
                      horizontal: 8,
                    ),
                    textStyle: const TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 15,
                    ),
                  ),
                  onPressed: onAsk,
                  icon: const Icon(Icons.chat_bubble_outline, size: 18),
                  label: Text(tr('اسأل المساعد', 'Ask the assistant')),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// One section as a tile: its icon on the light-olive chip, its name, one line.
class _Tile extends StatelessWidget {
  const _Tile({required this.section, required this.onTap});

  final _Section section;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: scheme.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: BorderSide(color: scheme.outline),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(6, 12, 6, 10),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              IconChip(section.icon, size: 46),
              const SizedBox(height: 10),
              Text(
                section.title,
                textAlign: TextAlign.center,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 14.5,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                section.note,
                textAlign: TextAlign.center,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 11,
                  height: 1.4,
                  color: mutedOn(context),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The side menu: the same sections, the news first.
class _Menu extends StatelessWidget {
  const _Menu({required this.onOpen});

  final ValueChanged<_Section> onOpen;

  @override
  Widget build(BuildContext context) {
    return Drawer(
      child: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 24),
          children: [
            // The drawer opens on the logo and the name, on the header's own band.
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(22),
                gradient: LinearGradient(
                  colors: [SudagriColors.headerTop, SudagriColors.headerBottom],
                ),
              ),
              child: Row(
                children: [
                  Container(
                    width: 64,
                    height: 64,
                    padding: const EdgeInsets.all(2),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      shape: BoxShape.circle,
                      border: Border.all(color: SudagriColors.gold, width: 2),
                    ),
                    child: ClipOval(
                      child: Image.asset(
                        'assets/brand/logo.png',
                        fit: BoxFit.cover,
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          tr('سوداقري', 'Sudagri'),
                          style: TextStyle(
                            fontSize: 22,
                            fontWeight: FontWeight.w900,
                            color: SudagriColors.headerInk,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          tr('منصّة سودانيّة للزراعة والتجارة', 'A Sudanese platform for farming and trade'),
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: SudagriColors.headerMuted,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),
            SectionTitle(tr('ألوان التطبيق', 'App colours')),
            const PalettePicker(),
            const SizedBox(height: 14),
            SectionTitle(tr('اللغة', 'Language')),
            const LanguagePicker(),
            const SizedBox(height: 12),
            for (final s in _sections)
              ListTile(
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
                leading: IconChip(s.icon, size: 38),
                title: Text(
                  s.title,
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                subtitle: Text(
                  s.note,
                  style: TextStyle(color: mutedOn(context), fontSize: 12),
                ),
                trailing: Icon(Icons.chevron_left, color: mutedOn(context)),
                onTap: () => onOpen(s),
              ),
          ],
        ),
      ),
    );
  }
}

/// The platform's central notice, as on the website: nothing is on offer yet.
class _Notice extends StatelessWidget {
  const _Notice();

  @override
  Widget build(BuildContext context) {
    final warn = warnOn(context);
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
      decoration: BoxDecoration(
        color: warnTintOn(context),
        border: BorderDirectional(
          start: BorderSide(color: accentOn(context), width: 4),
        ),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 3),
            child: Icon(Icons.gpp_maybe_outlined, color: warn, size: 22),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text.rich(
              TextSpan(
                style: TextStyle(color: warn, fontSize: 13, height: 1.9),
                children: [
                  TextSpan(
                    text: tr('لا توجد فرص استثمار مطروحة حالياً', 'No investment opportunities are open right now'),
                    style: TextStyle(fontWeight: FontWeight.w900),
                  ),
                  TextSpan(
                    text:
                        tr(' — ولن يُعرض مشروع قبل توثيقه قانونياً ومعاينته ميدانياً. '
                        'أمّا الأدوات وقاعدة المعرفة فتعمل الآن، مجاناً وبلا تسجيل.', ' — and no project will be offered before it is legally documented and inspected in the field. The tools and the knowledge base work now, free and with no sign-up.'),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _NoProjects extends StatelessWidget {
  const _NoProjects();

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 22, 20, 22),
        child: Column(
          children: [
            const IconChip(Icons.spa_outlined, size: 56),
            const SizedBox(height: 12),
            Text(
              tr('لا توجد مشاريع مطروحة بعد', 'No projects on offer yet'),
              style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
            ),
            const SizedBox(height: 8),
            Text(
              tr('نحن لا نعرض مشروعاً حتى يكتمل توثيقه: إثبات حيازة الأرض، ومعاينة '
              'ميدانية، وموافقة الجهة الزراعية. سجّل اهتمامك عبر مساعد سوداقري '
              'وسنبلغك أول ما يُطرح مشروع موثّق.', 'We do not offer a project until its documentation is complete: proof of land tenure, a field inspection, and the approval of the agricultural authority. Register your interest through the Sudagri assistant and we will tell you as soon as a documented project is offered.'),
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 13,
                color: mutedOn(context),
                height: 1.8,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ProjectCard extends StatelessWidget {
  const _ProjectCard({required this.project});

  final Project project;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const IconChip(Icons.grass_rounded),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    project.name,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Icon(
                        Icons.place_outlined,
                        size: 14,
                        color: mutedOn(context),
                      ),
                      const SizedBox(width: 3),
                      Flexible(
                        child: Text(
                          project.location,
                          style: TextStyle(
                            fontSize: 13,
                            color: mutedOn(context),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    project.description,
                    style: const TextStyle(fontSize: 13, height: 1.8),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
