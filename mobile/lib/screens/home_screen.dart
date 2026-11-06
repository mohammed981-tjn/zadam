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
library;

import 'package:flutter/material.dart';

import '../api.dart';
import '../theme.dart';
import '../ui.dart';
import 'agent_screen.dart';
import 'books_screen.dart';
import 'contracts_screen.dart';
import 'export_screen.dart';
import 'feasibility_screen.dart';
import 'herds_screen.dart';
import 'invest_screen.dart';
import 'lands_screen.dart';
import 'library_screen.dart';
import 'maps_screen.dart';
import 'prices_screen.dart';
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

final _groups = <_Group>[
  _Group('مزرعتي', 'مواسمك وأرضك وحسابك', [
    _Section(
      'المواسم',
      'المراحل والقيود',
      Icons.eco_outlined,
      screen: () => const SeasonsScreen(),
    ),
    _Section(
      'أراضيّ',
      'الحدود والتربة والماء',
      Icons.landscape_outlined,
      screen: () => const LandsScreen(),
    ),
    _Section(
      'الدفتر',
      'الحسابات والأصول',
      Icons.account_balance_wallet_outlined,
      screen: () => const BooksScreen(),
    ),
    _Section(
      'القطعان',
      'الماشية وصحّتها',
      Icons.pets_outlined,
      screen: () => const HerdsScreen(),
    ),
    _Section(
      'دراسة الجدوى',
      'التكلفة والعائد',
      Icons.calculate_outlined,
      screen: () => const FeasibilityScreen(),
    ),
    _Section(
      'الخرائط',
      'كلّ الطبقات',
      Icons.map_outlined,
      screen: () => const MapsScreen(),
    ),
  ]),
  _Group('السوق والاستثمار', 'أسعارٌ وعقودٌ وشراكة', [
    _Section(
      'الأسعار',
      'المحاصيل والصرف',
      Icons.trending_up_rounded,
      screen: () => const PricesScreen(),
    ),
    _Section(
      'التصدير',
      'الشروط والجاهزيّة',
      Icons.local_shipping_outlined,
      screen: () => const ExportScreen(),
    ),
    _Section(
      'العقود',
      'اقرأ ووقّع',
      Icons.description_outlined,
      screen: () => const ContractsScreen(),
    ),
    _Section(
      'الاستثمار',
      'الفرص والشراكة',
      Icons.handshake_outlined,
      screen: () => const InvestScreen(),
    ),
    _Section(
      'الموردون',
      'البذور والأسمدة',
      Icons.storefront_outlined,
      screen: () => const SuppliersScreen(),
    ),
    _Section(
      'الوكيل',
      'تسجيلٌ بتفويض',
      Icons.badge_outlined,
      screen: () => const AgentScreen(),
    ),
  ]),
  _Group('الأدوات والمعرفة', 'مجّاناً وبلا تسجيل', [
    _Section(
      'الأخبار',
      'جديد سوداقري',
      Icons.newspaper_rounded,
      screen: () => const NewsScreen(),
    ),
    _Section(
      'الأفلام',
      'سوداقري بالصورة',
      Icons.movie_outlined,
      screen: () => const FilmsScreen(),
    ),
    _Section(
      'توقّع الأمطار',
      'الخريطة والجدول',
      Icons.umbrella_outlined,
      screen: () => const RainScreen(),
    ),
    _Section(
      'حاسبة الري',
      'كم يحتاج محصولك',
      Icons.water_drop_outlined,
      tab: 1,
    ),
    _Section('المساعد', 'اسأل عن أي محصول', Icons.chat_bubble_outline, tab: 2),
    _Section('المعرفة', 'محاصيل وتربة وماء', Icons.menu_book_outlined, tab: 3),
    _Section(
      'النفير',
      'العمل المشترك',
      Icons.groups_outlined,
      screen: () => const NafirScreen(),
    ),
    _Section(
      'الخدمات',
      'حراثة ومساحة وبيطرة',
      Icons.agriculture_outlined,
      screen: () => const ServicesScreen(),
    ),
    _Section(
      'التعدين',
      'قسم مستقلّ',
      Icons.construction_outlined,
      screen: () => const MiningScreen(),
    ),

    _Section(
      'المكتبة',
      'بحوثٌ ودراسات',
      Icons.local_library_outlined,
      screen: () => const LibraryScreen(),
    ),
  ]),
];

/// Every section, for the drawer.
final _sections = [for (final g in _groups) ...g.sections];

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, this.onTab});

  /// Switches the bottom tab; given by the shell.
  final ValueChanged<int>? onTab;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final _api = SudagriApi();
  late Future<List<Project>> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  /// The projects sit below the fold, and the list builds them only when they
  /// scroll into view; until then nothing listens to the future, so a failure
  /// would surface as an unhandled error. The FutureBuilder still gets it.
  Future<List<Project>> _load() => _api.projects()..ignore();

  @override
  void dispose() {
    _api.dispose();
    super.dispose();
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
    return Scaffold(
      appBar: const BrandAppBar(),
      drawer: _Menu(
        onOpen: (s) {
          Navigator.of(context).pop();
          _open(s);
        },
      ),
      body: RefreshIndicator(
        onRefresh: () async => setState(() => _future = _load()),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
          children: [
            FadeIn(
              child: _Hero(
                onWater: () => widget.onTab?.call(1),
                onAsk: () => widget.onTab?.call(2),
              ),
            ),
            const SizedBox(height: 22),
            for (final g in _groups) ...[
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
            const SectionTitle('المشاريع المتاحة'),
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
                const Flexible(
                  child: Text(
                    'الأدوات تعمل الآن · مجاناً وبلا تسجيل',
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
          const Text(
            'كل رقمٍ هنا\nيمكنك أن تعيد حسابه بنفسك',
            style: TextStyle(
              fontSize: 23,
              fontWeight: FontWeight.w900,
              height: 1.4,
              shadows: [Shadow(color: Color(0x99000000), blurRadius: 8)],
            ),
          ),
          const SizedBox(height: 4),
          const Text(
            'منصّة معرفة زراعية وبيانات للسودان — لكل رقمٍ مصدره ومنهجه.',
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
                  label: const Text('احسب الري'),
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
                  label: const Text('اسأل المساعد'),
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
                          'سوداقري',
                          style: TextStyle(
                            fontSize: 22,
                            fontWeight: FontWeight.w900,
                            color: SudagriColors.headerInk,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          'منصّة سودانيّة للزراعة والتجارة',
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
            const SectionTitle('ألوان التطبيق'),
            const PalettePicker(),
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
                children: const [
                  TextSpan(
                    text: 'لا توجد فرص استثمار مطروحة حالياً',
                    style: TextStyle(fontWeight: FontWeight.w900),
                  ),
                  TextSpan(
                    text:
                        ' — ولن يُعرض مشروع قبل توثيقه قانونياً ومعاينته ميدانياً. '
                        'أمّا الأدوات وقاعدة المعرفة فتعمل الآن، مجاناً وبلا تسجيل.',
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
            const Text(
              'لا توجد مشاريع مطروحة بعد',
              style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
            ),
            const SizedBox(height: 8),
            Text(
              'نحن لا نعرض مشروعاً حتى يكتمل توثيقه: إثبات حيازة الأرض، ومعاينة '
              'ميدانية، وموافقة الجهة الزراعية. سجّل اهتمامك عبر مساعد سوداقري '
              'وسنبلغك أول ما يُطرح مشروع موثّق.',
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
