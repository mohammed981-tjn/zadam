/// The knowledge base, read directly.
///
/// The assistant paraphrases; this does not. A farmer who wants to read the
/// entry itself — its source country, and the note saying what still needs
/// verifying locally — should be able to, without a model in between.
library;

import 'package:flutter/material.dart';

import '../api.dart';
import '../i18n.dart';
import '../theme.dart';
import '../ui.dart';

class KnowledgeScreen extends StatefulWidget {
  const KnowledgeScreen({super.key});

  @override
  State<KnowledgeScreen> createState() => _KnowledgeScreenState();
}

class _KnowledgeScreenState extends State<KnowledgeScreen> {
  final _api = SudagriApi();
  final _search = TextEditingController();

  late Future<List<KnowledgeEntry>> _future;
  String _query = '';

  @override
  void initState() {
    super.initState();
    _future = _api.knowledge();
  }

  @override
  void dispose() {
    _api.dispose();
    _search.dispose();
    super.dispose();
  }

  void _reload() {
    setState(() {
      _query = _search.text.trim();
      _future = _api.knowledge(search: _query.isEmpty ? null : _query);
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(tr('قاعدة المعرفة', 'Knowledge base'))),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
            child: TextField(
              controller: _search,
              textInputAction: TextInputAction.search,
              decoration: InputDecoration(
                hintText: tr('ابحث عن محصول أو موضوع…', 'Search for a crop or a topic…'),
                prefixIcon: const Icon(Icons.search),
                suffixIcon: _query.isEmpty
                    ? null
                    : IconButton(
                        icon: const Icon(Icons.close),
                        onPressed: () {
                          _search.clear();
                          _reload();
                        },
                      ),
              ),
              onSubmitted: (_) => _reload(),
            ),
          ),
          Expanded(
            child: FutureBuilder<List<KnowledgeEntry>>(
              future: _future,
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const LoadingView();
                }

                if (snapshot.hasError) {
                  return StateView.error(snapshot.error, onRetry: _reload);
                }

                final entries = snapshot.data ?? const [];
                if (entries.isEmpty) {
                  return StateView(
                    icon: _query.isEmpty
                        ? Icons.menu_book_outlined
                        : Icons.search_off_rounded,
                    title: _query.isEmpty
                        ? tr('لا توجد مواد بعد.', 'Nothing here yet.')
                        : tr('لا توجد نتائج لـ«$_query».', 'No results for “$_query”.'),
                  );
                }

                return RefreshIndicator(
                  onRefresh: () async => _reload(),
                  child: ListView.separated(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                    itemCount: entries.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 12),
                    itemBuilder: (_, i) => FadeIn(
                      delay: i,
                      child: _EntryCard(entry: entries[i]),
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _EntryCard extends StatelessWidget {
  const _EntryCard({required this.entry});

  final KnowledgeEntry entry;

  @override
  Widget build(BuildContext context) {
    final muted = mutedOn(context);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Wrap(
              spacing: 8,
              runSpacing: 6,
              children: [
                TagPill(entry.crop, icon: Icons.grass_rounded),
                if (entry.sourceCountry != null)
                  TagPill(
                    entry.sourceCountry!,
                    gold: true,
                    icon: Icons.public_rounded,
                  ),
              ],
            ),
            const SizedBox(height: 10),
            Text(
              entry.title,
              style: const TextStyle(
                  fontSize: 16, fontWeight: FontWeight.w800, height: 1.4),
            ),
            const SizedBox(height: 8),
            Text(entry.content,
                style: const TextStyle(height: 1.8, fontSize: 14)),
            if (entry.sourceNote != null) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
                decoration: BoxDecoration(
                  color: Theme.of(context).scaffoldBackgroundColor,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Icon(Icons.info_outline, size: 15, color: muted),
                    ),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        entry.sourceNote!,
                        style: TextStyle(
                          color: muted,
                          fontSize: 12,
                          height: 1.6,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
