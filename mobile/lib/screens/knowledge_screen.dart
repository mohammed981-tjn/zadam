/// The knowledge base, read directly.
///
/// The assistant paraphrases; this does not. A farmer who wants to read the
/// entry itself — its source country, and the note saying what still needs
/// verifying locally — should be able to, without a model in between.
library;

import 'package:flutter/material.dart';

import '../api.dart';
import '../theme.dart';

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
      appBar: AppBar(title: const Text('قاعدة المعرفة')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
            child: TextField(
              controller: _search,
              textInputAction: TextInputAction.search,
              decoration: InputDecoration(
                hintText: 'ابحث عن محصول أو موضوع…',
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
                  return const Center(child: CircularProgressIndicator());
                }

                if (snapshot.hasError) {
                  return _Message(
                    icon: Icons.cloud_off,
                    text: '${snapshot.error}',
                    onRetry: _reload,
                  );
                }

                final entries = snapshot.data ?? const [];
                if (entries.isEmpty) {
                  return _Message(
                    icon: Icons.search_off,
                    text: _query.isEmpty
                        ? 'لا توجد مواد بعد.'
                        : 'لا توجد نتائج لـ«$_query».',
                    onRetry: null,
                  );
                }

                return RefreshIndicator(
                  onRefresh: () async => _reload(),
                  child: ListView.separated(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                    itemCount: entries.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 12),
                    itemBuilder: (_, i) => _EntryCard(entry: entries[i]),
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
    final scheme = Theme.of(context).colorScheme;

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
                _Tag(entry.crop, colour: scheme.primary),
                if (entry.sourceCountry != null)
                  _Tag(entry.sourceCountry!, colour: accentOn(context)),
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
              const SizedBox(height: 10),
              Text(
                entry.sourceNote!,
                style: TextStyle(color: muted, fontSize: 12, height: 1.6),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _Tag extends StatelessWidget {
  const _Tag(this.text, {required this.colour});

  final String text;
  final Color colour;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: colour.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        text,
        style: TextStyle(
            color: colour, fontSize: 11, fontWeight: FontWeight.w700),
      ),
    );
  }
}

class _Message extends StatelessWidget {
  const _Message({required this.icon, required this.text, this.onRetry});

  final IconData icon;
  final String text;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final muted = mutedOn(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 48, color: muted),
            const SizedBox(height: 16),
            Text(text,
                textAlign: TextAlign.center,
                style: TextStyle(color: muted, height: 1.6)),
            if (onRetry != null) ...[
              const SizedBox(height: 20),
              FilledButton(
                  onPressed: onRetry, child: const Text('إعادة المحاولة')),
            ],
          ],
        ),
      ),
    );
  }
}
