/// The landing page, as the website presents it.
///
/// The copy here is the website's, word for word, and deliberately so. A farmer
/// who reads the site on a borrowed laptop and the app on their own phone
/// should meet the same platform saying the same things — most of all the
/// notice that nothing is on offer yet, which is the platform's central claim
/// about itself and must not soften in translation to a second surface.
library;

import 'package:flutter/material.dart';

import '../api.dart';
import '../theme.dart';
import 'mining_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final _api = SudagriApi();
  late Future<({List<Project> projects, List<KnowledgeEntry> knowledge})> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  @override
  void dispose() {
    _api.dispose();
    super.dispose();
  }

  Future<({List<Project> projects, List<KnowledgeEntry> knowledge})>
      _load() async {
    // Both reads at once: they are independent, and doing them in sequence
    // would double the wait on a slow connection for no reason.
    final results = await Future.wait([
      _api.projects(),
      _api.knowledge(limit: 6),
    ]);
    return (
      projects: results[0] as List<Project>,
      knowledge: results[1] as List<KnowledgeEntry>,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('🌾 سودجري')),
      body: RefreshIndicator(
        onRefresh: () async => setState(() => _future = _load()),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
          children: [
            const _Hero(),
            const SizedBox(height: 20),
            const _SectionChoice(),
            const SizedBox(height: 20),
            const _Audiences(),
            const SizedBox(height: 24),
            FutureBuilder(
              future: _future,
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Padding(
                    padding: EdgeInsets.symmetric(vertical: 40),
                    child: Center(child: CircularProgressIndicator()),
                  );
                }

                if (snapshot.hasError) {
                  return _Card(
                    child: Column(
                      children: [
                        Icon(Icons.cloud_off, size: 40, color: mutedOn(context)),
                        const SizedBox(height: 12),
                        Text('${snapshot.error}',
                            textAlign: TextAlign.center,
                            style: TextStyle(color: mutedOn(context))),
                        const SizedBox(height: 16),
                        FilledButton(
                          onPressed: () =>
                              setState(() => _future = _load()),
                          child: const Text('إعادة المحاولة'),
                        ),
                      ],
                    ),
                  );
                }

                final data = snapshot.data!;
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const _Heading('المشاريع المتاحة'),
                    const SizedBox(height: 12),
                    if (data.projects.isEmpty)
                      const _NoProjects()
                    else
                      ...data.projects.map((p) => Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: _ProjectCard(project: p),
                          )),
                    const SizedBox(height: 28),
                    const _Heading('قاعدة المعرفة الزراعية'),
                    const SizedBox(height: 4),
                    Text(
                      'اسأل المساعد 💬 لمزيد من التفاصيل عن أي محصول',
                      style:
                          TextStyle(fontSize: 13, color: mutedOn(context)),
                    ),
                    const SizedBox(height: 12),
                    ...data.knowledge.map((e) => Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: _KnowledgePreview(entry: e),
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
    final accent = accentOn(context);

    return Column(
      children: [
        const SizedBox(height: 8),
        const Text(
          'منصة تخدم كل مزارع ومستثمر سوداني',
          textAlign: TextAlign.center,
          style: TextStyle(
              fontSize: 24, fontWeight: FontWeight.w900, height: 1.4),
        ),
        const SizedBox(height: 12),
        Text(
          'سودجري مصدر معرفة زراعية موثّقة لأي مزارع يريد تحسين إنتاجه، '
          'ومنصة استثمار زراعي شفافة قيد البناء للسودانيين في الداخل والمهجر.',
          textAlign: TextAlign.center,
          style: TextStyle(color: mutedOn(context), height: 1.8),
        ),
        const SizedBox(height: 16),
        // The platform's central honesty. It is not a disclaimer to be tucked
        // away — it is the reason to trust everything else on the screen.
        Container(
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
                TextSpan(text: 'المنصة في مرحلة التطوير. '),
                TextSpan(
                  text: 'لا توجد مشاريع مطروحة للاستثمار حالياً',
                  style: TextStyle(fontWeight: FontWeight.w900),
                ),
                TextSpan(
                  text: ' — ولن نعرض مشروعاً إلا بعد توثيقه قانونياً ومعاينته '
                      'ميدانياً. أما قاعدة المعرفة وحاسبة المياه فتعملان الآن '
                      'ومتاحتان للجميع مجاناً.',
                ),
              ],
            ),
            textAlign: TextAlign.center,
          ),
        ),
      ],
    );
  }
}

class _SectionChoice extends StatelessWidget {
  const _SectionChoice();

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    return Column(
      children: [
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            color: scheme.primary.withValues(alpha: 0.06),
            border: Border.all(color: scheme.primary, width: 2),
            borderRadius: BorderRadius.circular(16),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('🌾', style: TextStyle(fontSize: 26)),
              const SizedBox(height: 8),
              Text('الزراعة',
                  style: TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w800,
                      color: scheme.primary)),
              const SizedBox(height: 4),
              Text(
                'أنت هنا — معرفة المحاصيل والثروة الحيوانية، وحاسبة المياه، '
                'وتخطيط المواسم، والاستثمار الزراعي.',
                style: TextStyle(
                    fontSize: 13, color: mutedOn(context), height: 1.7),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        _Card(
          onTap: () => Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => const MiningScreen()),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('⛏️', style: TextStyle(fontSize: 26)),
                  Icon(Icons.chevron_left, color: mutedOn(context)),
                ],
              ),
              const SizedBox(height: 8),
              const Text('التعدين',
                  style:
                      TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
              const SizedBox(height: 4),
              Text(
                'قسم منفصل: السلامة في الحفر، والاستخلاص بلا زئبق، وجيولوجيا '
                'الذهب في السودان.',
                style: TextStyle(
                    fontSize: 13, color: mutedOn(context), height: 1.7),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _Audiences extends StatelessWidget {
  const _Audiences();

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        _Card(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('🌾', style: TextStyle(fontSize: 26)),
              const SizedBox(height: 8),
              const Text('للمزارعين',
                  style:
                      TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
              const SizedBox(height: 6),
              Text(
                'اسأل مساعد سودجري الذكي 💬 عن أي محصول أو ماشية — تربة، ري، '
                'آفات، أصناف. قاعدة معرفة موثّقة مبنية على تجارب دول رائدة '
                'زراعياً، مع تنبيه دائم متى تحتاج المعلومة تحققاً محلياً قبل '
                'تطبيقها.',
                style: TextStyle(
                    fontSize: 13, color: mutedOn(context), height: 1.8),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        _Card(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('💰', style: TextStyle(fontSize: 26)),
              const SizedBox(height: 8),
              const Text('للمستثمرين',
                  style:
                      TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
              const SizedBox(height: 6),
              Text(
                'هكذا ستعمل المنصة: مشاريع موثّقة قانونياً ومعاينة ميدانياً، '
                'متابعة دورية بالتقارير والصور، وحصص تبدأ من مبالغ صغيرة تناسب '
                'المموّل الصغير والمغترب. سجّل اهتمامك الآن لنبلغك عند فتح باب '
                'الاستثمار.',
                style: TextStyle(
                    fontSize: 13, color: mutedOn(context), height: 1.8),
              ),
            ],
          ),
        ),
      ],
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
            'ميدانية، وموافقة الجهة الزراعية. سجّل اهتمامك عبر مساعد سودجري '
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

class _KnowledgePreview extends StatelessWidget {
  const _KnowledgePreview({required this.entry});

  final KnowledgeEntry entry;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 8,
            runSpacing: 6,
            children: [
              _Pill(entry.crop, colour: scheme.primary),
              if (entry.sourceCountry != null)
                _Pill(entry.sourceCountry!, colour: accentOn(context)),
            ],
          ),
          const SizedBox(height: 10),
          Text(entry.title,
              style: const TextStyle(
                  fontSize: 15, fontWeight: FontWeight.w800, height: 1.4)),
          const SizedBox(height: 6),
          Text(
            entry.content,
            maxLines: 4,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 13, height: 1.8),
          ),
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
  const _Card({required this.child, this.onTap});

  final Widget child;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final card = Card(
      child: Padding(padding: const EdgeInsets.all(18), child: child),
    );

    if (onTap == null) return card;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: card,
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill(this.text, {required this.colour});

  final String text;
  final Color colour;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
          color: colour.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(text,
            style: TextStyle(
                color: colour, fontSize: 11, fontWeight: FontWeight.w700)),
      );
}
