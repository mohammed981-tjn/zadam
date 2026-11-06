import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../account.dart';
import '../api.dart';
import '../i18n.dart';
import '../library.dart';
import '../theme.dart';
import '../ui.dart';
import 'page_reader_screen.dart';
import 'research_form_screen.dart';
import 'research_item_screen.dart';

/// المكتبة والدراسات (البند ٢٠٣): /library و/studies و/guide من الموقع، في
/// التطبيق.
///
/// Four tabs: the library (published works, by kind and by words, each opening
/// on its page; «شارك دراستك» to send one), the studies (the exchange-rate
/// study and the Arc Canal read in the app, the export corridor on the
/// website), the user guide, and «ما أرسلتُه» for the signed-in sender.
class LibraryScreen extends StatelessWidget {
  const LibraryScreen({super.key, this.api});

  /// A stand-in in tests; the site otherwise.
  final LibraryApi? api;

  @override
  Widget build(BuildContext context) {
    final a = api ?? LibraryApi();
    return DefaultTabController(
      length: 4,
      child: Scaffold(
        appBar: AppBar(
          title: Text(tr('المكتبة والدراسات', 'Library and studies')),
          bottom: TabBar(
            isScrollable: true,
            tabAlignment: TabAlignment.start,
            tabs: [
              Tab(text: tr('المكتبة', 'Library')),
              Tab(text: tr('الدراسات', 'Studies')),
              Tab(text: tr('دليل الاستخدام', 'User guide')),
              Tab(text: tr('ما أرسلتُه', 'What I sent')),
            ],
          ),
        ),
        body: TabBarView(
          children: [
            _LibraryTab(api: a),
            _StudiesTab(api: a),
            PageReader(slug: 'guide', api: a),
            _MineTab(api: a),
          ],
        ),
      ),
    );
  }
}

Future<void> _web(String url) async {
  final u = Uri.tryParse(url);
  if (u != null) await launchUrl(u, mode: LaunchMode.externalApplication);
}

// ── The library ──────────────────────────────────────────────────────────────

class _LibraryTab extends StatefulWidget {
  const _LibraryTab({required this.api});
  final LibraryApi api;

  @override
  State<_LibraryTab> createState() => _LibraryTabState();
}

class _LibraryTabState extends State<_LibraryTab> with AutomaticKeepAliveClientMixin {
  final _q = TextEditingController();
  String? _kind;
  late Future<LibraryList> _list = widget.api.list();
  LibraryList? _last;

  @override
  bool get wantKeepAlive => true;

  @override
  void dispose() {
    _q.dispose();
    super.dispose();
  }

  void _search() => setState(() => _list = widget.api.list(kind: _kind, q: _q.text));

  Future<void> _share() async {
    await Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => ResearchFormScreen(
        api: widget.api,
        states: _last?.states ?? const [],
        maxBytes: _last?.maxBytes ?? researchMaxBytes,
      ),
    ));
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    return RefreshIndicator(
      onRefresh: () async => _search(),
      child: FutureBuilder<LibraryList>(
        future: _list,
        builder: (context, snap) {
          final header = <Widget>[
            IntroNote(
              tr('دراسات جدوى وبحوثٌ ورسائل جامعيّة وتقارير عن الزراعة في السودان، يرسلها الباحثون والمزارعون والزوّار، '
              'وتراجعها سوداقري قبل نشرها. كلُّ عملٍ هنا يبني على ما قبله.', 'Feasibility studies, research, theses and reports on farming in Sudan, sent in by researchers, farmers and visitors and reviewed by Sudagri before publication. Every work here builds on what came before.'),
              icon: Icons.local_library_outlined,
            ),
            const SizedBox(height: 12),
            FilledButton.icon(
              onPressed: _share,
              icon: const Icon(Icons.upload_file),
              label: Text(tr('شارك دراستك أو بحثك', 'Share your study or research')),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _q,
              textInputAction: TextInputAction.search,
              onSubmitted: (_) => _search(),
              decoration: InputDecoration(
                hintText: tr('ابحث: السمسم، الريّ، القضارف…', 'Search: sesame, irrigation, Gedaref…'),
                prefixIcon: const Icon(Icons.search),
                suffixIcon: IconButton(icon: const Icon(Icons.arrow_back), tooltip: tr('ابحث', 'Search'), onPressed: _search),
              ),
            ),
            const SizedBox(height: 8),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(children: [
                Padding(
                  padding: const EdgeInsetsDirectional.only(end: 6),
                  child: ChoiceChip(
                    label: Text(tr('كلّ الأنواع', 'Every kind')),
                    selected: _kind == null,
                    onSelected: (_) {
                      _kind = null;
                      _search();
                    },
                  ),
                ),
                for (final e in researchKindLabels.entries)
                  Padding(
                    padding: const EdgeInsetsDirectional.only(end: 6),
                    child: ChoiceChip(
                      label: Text(e.value),
                      selected: _kind == e.key,
                      onSelected: (_) {
                        _kind = e.key;
                        _search();
                      },
                    ),
                  ),
              ]),
            ),
            const SizedBox(height: 10),
          ];
          List<Widget> body;
          if (snap.connectionState != ConnectionState.done) {
            body = [const LoadingView(compact: true)];
          } else if (snap.hasError) {
            final e = snap.error;
            body = [StateView.error(e is ApiException ? e.message : tr('تعذّر تحميل المكتبة.', 'Could not load the library.'), onRetry: _search, compact: true)];
          } else {
            final list = snap.data!;
            _last = list;
            body = list.items.isEmpty
                ? [
                    StateView(
                      icon: Icons.menu_book_outlined,
                      compact: true,
                      title: _q.text.trim().isNotEmpty || _kind != null ? tr('لا عمل يطابق بحثك بعد.', 'Nothing matches your search yet.') : tr('المكتبة تنتظر أوّل عمل.', 'The library is waiting for its first work.'),
                      message: tr('عندك دراسة جدوى أو بحثٌ أو رسالةٌ جامعيّة عن الزراعة في السودان؟ أرسلها، فتراجعها '
                          'الإدارة وتنشرها باسمك.', 'Do you have a feasibility study, research or a thesis on farming in Sudan? Send it, and the administrators review it and publish it under your name.'),
                    ),
                  ]
                : [
                    for (var i = 0; i < list.items.length; i++)
                      FadeIn(delay: i, child: _ItemCard(item: list.items[i], api: widget.api)),
                  ];
          }
          return ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 40),
            children: [...header, ...body],
          );
        },
      ),
    );
  }
}

class _ItemCard extends StatelessWidget {
  const _ItemCard({required this.item, required this.api});
  final ResearchItem item;
  final LibraryApi api;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => ResearchItemScreen(id: item.id, api: api)),
        ),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Wrap(spacing: 6, runSpacing: 6, children: [
                TagPill(item.kindLabel),
                if (item.crop != null) TagPill(item.crop!, gold: true),
                if (item.state != null) TagPill(item.state!, gold: true),
              ]),
              const SizedBox(height: 8),
              Text(item.title, style: const TextStyle(fontSize: 16.5, fontWeight: FontWeight.w900, height: 1.5)),
              Text(item.byline, style: TextStyle(fontSize: 12.5, color: mutedOn(context))),
              const SizedBox(height: 6),
              Text(item.abstract, maxLines: 3, overflow: TextOverflow.ellipsis, style: const TextStyle(height: 1.7)),
            ],
          ),
        ),
      ),
    );
  }
}

// ── The studies ──────────────────────────────────────────────────────────────

class _StudiesTab extends StatefulWidget {
  const _StudiesTab({required this.api});
  final LibraryApi api;

  @override
  State<_StudiesTab> createState() => _StudiesTabState();
}

class _StudiesTabState extends State<_StudiesTab> with AutomaticKeepAliveClientMixin {
  late Future<List<StudyCard>> _studies = widget.api.studies();

  @override
  bool get wantKeepAlive => true;

  void _reload() => setState(() => _studies = widget.api.studies());

  void _open(StudyCard s) {
    if (s.library) {
      DefaultTabController.of(context).animateTo(0);
    } else if (s.read != null) {
      Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => PageReaderScreen(slug: s.read!, title: s.title, api: widget.api),
      ));
    } else {
      _web(s.url);
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    return FutureBuilder<List<StudyCard>>(
      future: _studies,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) return const LoadingView();
        if (snap.hasError) {
          final e = snap.error;
          return StateView.error(e is ApiException ? e.message : tr('تعذّر تحميل الدراسات.', 'Could not load the studies.'), onRetry: _reload);
        }
        final studies = snap.data!;
        return ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 40),
          children: [
            IntroNote(
              tr('دراساتٌ في الزراعة والماء والصادر والاقتصاد السوداني — وعلى كلٍّ منها ما هي: قياسٌ على المنصّة، أو '
              'دراسةٌ مُرسَلة تُنشر كما كُتبت.', 'Studies of Sudan\'s farming, water, exports and economy — each marked for what it is: a measurement on the platform, or a submitted study published as written.'),
              icon: Icons.science_outlined,
            ),
            const SizedBox(height: 12),
            for (var i = 0; i < studies.length; i++)
              FadeIn(
                delay: i,
                child: Card(
                  margin: const EdgeInsets.only(bottom: 12),
                  clipBehavior: Clip.antiAlias,
                  child: InkWell(
                    onTap: () => _open(studies[i]),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        if (studies[i].photo != null)
                          AspectRatio(
                            aspectRatio: 2,
                            child: Image.network(
                              studies[i].photo!,
                              fit: BoxFit.cover,
                              semanticLabel: studies[i].alt,
                              errorBuilder: (_, _, _) => Container(color: leafTintOn(context)),
                            ),
                          ),
                        Padding(
                          padding: const EdgeInsets.all(14),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              TagPill(studies[i].kind),
                              const SizedBox(height: 8),
                              Text(studies[i].title,
                                  style: const TextStyle(fontSize: 16.5, fontWeight: FontWeight.w900, height: 1.5)),
                              const SizedBox(height: 4),
                              Text(studies[i].note, style: TextStyle(color: mutedOn(context), height: 1.7)),
                              if (studies[i].read == null && !studies[i].library)
                                Padding(
                                  padding: const EdgeInsets.only(top: 6),
                                  child: Text(tr('تُفتح في الموقع', 'Opens on the website'),
                                      style: TextStyle(fontSize: 12, color: textGreenOn(context))),
                                ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
}

// ── «ما أرسلتُه» ─────────────────────────────────────────────────────────────

class _MineTab extends StatefulWidget {
  const _MineTab({required this.api});
  final LibraryApi api;

  @override
  State<_MineTab> createState() => _MineTabState();
}

class _MineTabState extends State<_MineTab> {
  Future<List<MineItem>>? _mine;

  @override
  void initState() {
    super.initState();
    if (accountController.value != null) _mine = widget.api.mine();
  }

  void _reload() => setState(() => _mine = accountController.value == null ? null : widget.api.mine());

  @override
  Widget build(BuildContext context) {
    if (_mine == null) {
      return StateView(
        icon: Icons.person_outline,
        title: tr('ادخل إلى حسابك', 'Sign in to your account'),
        message: tr('ما يرسله الزائر بلا حساب لا يُتابَع من هنا؛ ادخل من «حسابي» لترى ما أرسلته بحسابك.', 'What a visitor sends without an account is not followed from here; sign in from «My account» to see what you sent with your account.'),
      );
    }
    return RefreshIndicator(
      onRefresh: () async => _reload(),
      child: FutureBuilder<List<MineItem>>(
        future: _mine,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) return const LoadingView();
          if (snap.hasError) {
            final e = snap.error;
            return StateView.error(e is ApiException ? e.message : tr('تعذّر التحميل.', 'Could not load.'), onRetry: _reload, scrollable: true);
          }
          final mine = snap.data!;
          if (mine.isEmpty) {
            return StateView(
              icon: Icons.inbox_outlined,
              title: tr('لم ترسل شيئاً بعد.', 'You have not sent anything yet.'),
              message: tr('شارك دراستك من تبويب «المكتبة».', 'Share your study from the «Library» tab.'),
              scrollable: true,
            );
          }
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 40),
            children: [
              for (final m in mine)
                Card(
                  margin: const EdgeInsets.only(bottom: 10),
                  child: ListTile(
                    title: Text(m.title, style: const TextStyle(fontWeight: FontWeight.w800)),
                    subtitle: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('${m.kindLabel} · ${m.statusLabel}'),
                        if (m.status == 'rejected' && m.reviewNote != null)
                          Text(tr('السبب: ${m.reviewNote}', 'Reason: ${m.reviewNote}'), style: TextStyle(color: warnOn(context))),
                      ],
                    ),
                    trailing: m.status == 'published' ? const Icon(Icons.chevron_left) : null,
                    onTap: m.status == 'published'
                        ? () => Navigator.of(context).push(
                              MaterialPageRoute(builder: (_) => ResearchItemScreen(id: m.id, api: widget.api)),
                            )
                        : null,
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}
