/// جديد سودجري: شاشة الأخبار وحدها، تُفتح من القائمة ومن لوحة الرئيسية.
///
/// The owner, 25 September: the news was unclear mixed into the home screen,
/// and should have a screen of its own. Each item shows its date, title and
/// summary; tapping opens the full text in place.
library;

import 'package:flutter/material.dart';

import '../api.dart';
import '../theme.dart';

class NewsScreen extends StatefulWidget {
  const NewsScreen({super.key});

  @override
  State<NewsScreen> createState() => _NewsScreenState();
}

class _NewsScreenState extends State<NewsScreen> {
  final _api = SudagriApi();
  late Future<List<NewsItem>> _future;

  @override
  void initState() {
    super.initState();
    _future = _api.news();
  }

  @override
  void dispose() {
    _api.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('جديد سودجري')),
      body: RefreshIndicator(
        onRefresh: () async => setState(() => _future = _api.news()),
        child: FutureBuilder<List<NewsItem>>(
          future: _future,
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snapshot.hasError) {
              return ListView(
                padding: const EdgeInsets.all(24),
                children: [
                  Icon(Icons.cloud_off, size: 40, color: mutedOn(context)),
                  const SizedBox(height: 12),
                  Text('${snapshot.error}',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: mutedOn(context))),
                  const SizedBox(height: 16),
                  Center(
                    child: FilledButton(
                      onPressed: () =>
                          setState(() => _future = _api.news()),
                      child: const Text('إعادة المحاولة'),
                    ),
                  ),
                ],
              );
            }
            final items = snapshot.data!;
            if (items.isEmpty) {
              return ListView(
                padding: const EdgeInsets.all(24),
                children: [
                  Icon(Icons.newspaper, size: 40, color: mutedOn(context)),
                  const SizedBox(height: 12),
                  Text('لا أخبار منشورة بعد.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: mutedOn(context))),
                ],
              );
            }
            return ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
              itemCount: items.length,
              separatorBuilder: (_, _) => const SizedBox(height: 12),
              itemBuilder: (context, i) => _NewsCard(item: items[i]),
            );
          },
        ),
      ),
    );
  }
}

/// The date the website prints, in Arabic: «٢٥ سبتمبر ٢٠٢٦».
String newsDate(DateTime d) {
  const months = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
  ];
  final local = d.toUtc().add(const Duration(hours: 2)); // Khartoum, UTC+2
  return '${local.day} ${months[local.month - 1]} ${local.year}';
}

class _NewsCard extends StatelessWidget {
  const _NewsCard({required this.item});

  final NewsItem item;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Card(
      clipBehavior: Clip.antiAlias,
      child: ExpansionTile(
        tilePadding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
        childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        expandedCrossAxisAlignment: CrossAxisAlignment.start,
        shape: const Border(),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(newsDate(item.publishedAt),
                style: TextStyle(fontSize: 12, color: scheme.primary)),
            const SizedBox(height: 4),
            Text(item.title,
                style: const TextStyle(
                    fontSize: 16, fontWeight: FontWeight.w800, height: 1.5)),
          ],
        ),
        subtitle: item.summary == null
            ? null
            : Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(item.summary!,
                    style: TextStyle(
                        fontSize: 13, color: mutedOn(context), height: 1.7)),
              ),
        children: [
          Text(item.body, style: const TextStyle(fontSize: 14, height: 1.9)),
          if (item.linkPath != null) ...[
            const SizedBox(height: 10),
            Text(
              'التفاصيل على الموقع: ${item.linkLabel ?? item.linkPath}',
              style: TextStyle(fontSize: 12, color: mutedOn(context)),
            ),
          ],
        ],
      ),
    );
  }
}
