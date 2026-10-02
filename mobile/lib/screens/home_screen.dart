/// الرئيسيّة: واجهةٌ قصيرة، ثمّ لوحةُ بطاقاتٍ لكلّ قسم (طلب المالك، 25 سبتمبر).
///
/// The owner found the news unclear inside the home screen and asked for the
/// home to be a board, with the news on a screen of its own reached from the
/// menu. So the home is now: one line saying what the platform is, a grid of
/// tiles — each a section, one tap away — the platform's central notice that
/// nothing is on offer yet, and the projects when there are any. The side
/// menu lists the same sections, the news first.
///
/// The tiles for the calculator, the assistant and the knowledge base switch
/// the bottom tab rather than opening a second copy of the screen, so a
/// half-finished calculation is still there when the farmer comes back.
library;

import 'package:flutter/material.dart';

import '../api.dart';
import '../theme.dart';
import 'mining_screen.dart';
import 'nafir_screen.dart';
import 'news_screen.dart';
import 'rain_screen.dart';
import 'services_screen.dart';

/// A section of the app: where it opens, as a tab index or a pushed screen.
class _Section {
  const _Section(this.title, this.note, this.icon, this.colour,
      {this.tab, this.screen});

  final String title;
  final String note;
  final IconData icon;
  final Color colour;
  final int? tab;
  final Widget Function()? screen;
}

final _sections = <_Section>[
  _Section('الأخبار', 'جديد سودغري', Icons.newspaper, const Color(0xFF1F7A3D),
      screen: () => const NewsScreen()),
  _Section('توقّع الأمطار', 'الخريطة والجدول', Icons.umbrella,
      const Color(0xFF2A6DB0),
      screen: () => const RainScreen()),
  _Section('حاسبة الري', 'كم يحتاج محصولك', Icons.water_drop,
      const Color(0xFF0E7C86),
      tab: 1),
  _Section('المساعد', 'اسأل عن أي محصول', Icons.chat_bubble,
      const Color(0xFF6A4FB3),
      tab: 2),
  _Section('المعرفة', 'محاصيل وتربة وماء', Icons.menu_book,
      const Color(0xFF8A5A2B),
      tab: 3),
  _Section('النفير', 'العمل المشترك', Icons.groups, const Color(0xFFB8860B),
      screen: () => const NafirScreen()),
  _Section('الخدمات', 'حراثة ومساحة وبيطرة', Icons.agriculture,
      const Color(0xFF5B7F2B),
      screen: () => const ServicesScreen()),
  _Section('التعدين', 'قسم مستقلّ', Icons.construction, const Color(0xFF7A6A55),
      screen: () => const MiningScreen()),
];

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
    _future = _api.projects();
  }

  @override
  void dispose() {
    _api.dispose();
    super.dispose();
  }

  void _open(_Section s) {
    if (s.tab != null) {
      widget.onTab?.call(s.tab!);
    } else if (s.screen != null) {
      Navigator.of(context).push(MaterialPageRoute(builder: (_) => s.screen!()));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('🌾 سودغري')),
      drawer: _Menu(onOpen: (s) {
        Navigator.of(context).pop();
        _open(s);
      }),
      body: RefreshIndicator(
        onRefresh: () async => setState(() => _future = _api.projects()),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
          children: [
            const _Hero(),
            const SizedBox(height: 18),
            GridView.count(
              crossAxisCount: 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 12,
              crossAxisSpacing: 12,
              childAspectRatio: 1.35,
              children: [
                for (final s in _sections)
                  _Tile(section: s, onTap: () => _open(s)),
              ],
            ),
            const SizedBox(height: 20),
            const _Notice(),
            const SizedBox(height: 20),
            FutureBuilder<List<Project>>(
              future: _future,
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Padding(
                    padding: EdgeInsets.symmetric(vertical: 24),
                    child: Center(child: CircularProgressIndicator()),
                  );
                }
                if (snapshot.hasError) {
                  return _Card(
                    child: Column(
                      children: [
                        Icon(Icons.cloud_off, size: 36, color: mutedOn(context)),
                        const SizedBox(height: 10),
                        Text('${snapshot.error}',
                            textAlign: TextAlign.center,
                            style: TextStyle(color: mutedOn(context))),
                        const SizedBox(height: 12),
                        FilledButton(
                          onPressed: () =>
                              setState(() => _future = _api.projects()),
                          child: const Text('إعادة المحاولة'),
                        ),
                      ],
                    ),
                  );
                }
                final projects = snapshot.data!;
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const _Heading('المشاريع المتاحة'),
                    const SizedBox(height: 12),
                    if (projects.isEmpty)
                      const _NoProjects()
                    else
                      ...projects.map((p) => Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: _ProjectCard(project: p),
                          )),
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

class _Hero extends StatelessWidget {
  const _Hero();

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        const SizedBox(height: 8),
        const Text(
          'كل رقمٍ هنا يمكنك أن تعيد حسابه بنفسك',
          textAlign: TextAlign.center,
          style: TextStyle(
              fontSize: 22, fontWeight: FontWeight.w900, height: 1.4),
        ),
        const SizedBox(height: 8),
        Text(
          'منصّة معرفة زراعية وبيانات للسودان — لكل رقمٍ مصدره ومنهجه.',
          textAlign: TextAlign.center,
          style: TextStyle(color: mutedOn(context), height: 1.7),
        ),
      ],
    );
  }
}

/// One section as a tile: its icon on a tinted disc, its name, one line.
class _Tile extends StatelessWidget {
  const _Tile({required this.section, required this.onTap});

  final _Section section;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = section.colour;
    return Material(
      color: c.withValues(alpha: 0.08),
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(18),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              CircleAvatar(
                radius: 20,
                backgroundColor: c.withValues(alpha: 0.16),
                child: Icon(section.icon, color: c, size: 22),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(section.title,
                      style: const TextStyle(
                          fontSize: 16, fontWeight: FontWeight.w800)),
                  Text(section.note,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 12, color: mutedOn(context))),
                ],
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
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(20, 20, 20, 12),
              child: Text('🌾 سودغري',
                  style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
            ),
            const Divider(),
            for (final s in _sections)
              ListTile(
                leading: Icon(s.icon, color: s.colour),
                title: Text(s.title,
                    style: const TextStyle(fontWeight: FontWeight.w700)),
                subtitle: Text(s.note),
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
    final accent = accentOn(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: accent.withValues(alpha: 0.10),
        border: Border.all(color: accent.withValues(alpha: 0.40)),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Text.rich(
        TextSpan(
          style: TextStyle(color: accent, fontSize: 13, height: 1.9),
          children: const [
            TextSpan(
              text: 'لا توجد فرص استثمار مطروحة حالياً',
              style: TextStyle(fontWeight: FontWeight.w900),
            ),
            TextSpan(
              text: ' — ولن يُعرض مشروع قبل توثيقه قانونياً ومعاينته ميدانياً. '
                  'أمّا الأدوات وقاعدة المعرفة فتعمل الآن، مجاناً وبلا تسجيل.',
            ),
          ],
        ),
        textAlign: TextAlign.center,
      ),
    );
  }
}

class _NoProjects extends StatelessWidget {
  const _NoProjects();

  @override
  Widget build(BuildContext context) {
    return _Card(
      child: Column(
        children: [
          const Text('🌱', style: TextStyle(fontSize: 34)),
          const SizedBox(height: 10),
          const Text('لا توجد مشاريع مطروحة بعد',
              style: TextStyle(fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          Text(
            'نحن لا نعرض مشروعاً حتى يكتمل توثيقه: إثبات حيازة الأرض، ومعاينة '
            'ميدانية، وموافقة الجهة الزراعية. سجّل اهتمامك عبر مساعد سودغري '
            'وسنبلغك أول ما يُطرح مشروع موثّق.',
            textAlign: TextAlign.center,
            style: TextStyle(
                fontSize: 13, color: mutedOn(context), height: 1.8),
          ),
        ],
      ),
    );
  }
}

class _ProjectCard extends StatelessWidget {
  const _ProjectCard({required this.project});

  final Project project;

  @override
  Widget build(BuildContext context) {
    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(project.name,
              style:
                  const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
          const SizedBox(height: 4),
          Text(project.location,
              style: TextStyle(fontSize: 13, color: mutedOn(context))),
          const SizedBox(height: 8),
          Text(project.description,
              style: const TextStyle(fontSize: 13, height: 1.8)),
        ],
      ),
    );
  }
}

/* ------------------------------------------------------------------ *
 * Shared bits
 * ------------------------------------------------------------------ */

class _Heading extends StatelessWidget {
  const _Heading(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Text(
        text,
        style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
      );
}

class _Card extends StatelessWidget {
  const _Card({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) => Card(
        child: Padding(padding: const EdgeInsets.all(18), child: child),
      );
}

