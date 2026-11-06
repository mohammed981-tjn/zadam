/// جديد سوداقري: شاشة الأخبار وحدها، تُفتح من القائمة ومن لوحة الرئيسية.
///
/// The owner, 25 September: the news was unclear mixed into the home screen,
/// and should have a screen of its own. Each item shows its date, title and
/// summary; tapping opens the full text in place.
library;

import 'package:flutter/material.dart';

import '../api.dart';
import '../i18n.dart';
import '../theme.dart';
import '../ui.dart';

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
      appBar: AppBar(title: Text(tr('جديد سوداقري', 'What\'s new on Sudagri'))),
      body: RefreshIndicator(
        onRefresh: () async => setState(() => _future = _api.news()),
        child: FutureBuilder<List<NewsItem>>(
          future: _future,
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const LoadingView();
            }
            if (snapshot.hasError) {
              return StateView.error(
                snapshot.error,
                scrollable: true,
                onRetry: () => setState(() => _future = _api.news()),
              );
            }
            final items = snapshot.data!;
            if (items.isEmpty) {
              return StateView(
                icon: Icons.newspaper_rounded,
                title: tr('لا أخبار منشورة بعد.', 'No news published yet.'),
                scrollable: true,
              );
            }
            return ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
              itemCount: items.length,
              separatorBuilder: (_, _) => const SizedBox(height: 12),
              itemBuilder: (context, i) => FadeIn(
                delay: i,
                child: _NewsCard(item: items[i]),
              ),
            );
          },
        ),
      ),
    );
  }
}

/// The date the website prints, in Arabic: «٢٥ سبتمبر ٢٠٢٦».
String newsDate(DateTime d) {
  final months = [
    tr('يناير', 'January'), tr('فبراير', 'February'), tr('مارس', 'March'), tr('أبريل', 'April'), tr('مايو', 'May'), tr('يونيو', 'June'),
    tr('يوليو', 'July'), tr('أغسطس', 'August'), tr('سبتمبر', 'September'), tr('أكتوبر', 'October'), tr('نوفمبر', 'November'), tr('ديسمبر', 'December'),
  ];
  final local = d.toUtc().add(const Duration(hours: 2)); // Khartoum, UTC+2
  return '${local.day} ${months[local.month - 1]} ${local.year}';
}

class _NewsCard extends StatelessWidget {
  const _NewsCard({required this.item});

  final NewsItem item;

  @override
  Widget build(BuildContext context) {
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
            Text(
              newsDate(item.publishedAt),
              style: TextStyle(
                fontSize: 12,
                color: textGreenOn(context),
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 4),
            Text(item.title,
                style: const TextStyle(
                    fontSize: 16, fontWeight: FontWeight.w800, height: 1.5)),
          ],
        ),
        // A summary that only repeats the title says nothing.
        subtitle: item.summary == null ||
                item.summary!.trim() == item.title.trim()
            ? null
            : Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(item.summary!,
                    style: TextStyle(
                        fontSize: 13, color: mutedOn(context), height: 1.7)),
              ),
        children: [
          ...newsBody(item.body, context),
          if (item.linkPath != null) ...[
            const SizedBox(height: 10),
            Text(
              tr('التفاصيل على الموقع: ${item.linkLabel ?? item.linkPath}', 'Details on the website: ${item.linkLabel ?? item.linkPath}'),
              style: TextStyle(fontSize: 12, color: mutedOn(context)),
            ),
          ],
        ],
      ),
    );
  }
}

/// The body as the website draws it: `#` lines as headings, `-` and `1.`
/// lines as list items, `---` as a rule — not the marks themselves.
List<Widget> newsBody(String body, BuildContext context) {
  final out = <Widget>[];
  for (final raw in body.split('\n')) {
    final line = raw.trim();
    if (line.isEmpty) continue;
    final heading = RegExp(r'^(#{1,4})\s+(.*)$').firstMatch(line);
    if (heading != null) {
      final level = heading.group(1)!.length;
      out.add(Padding(
        padding: const EdgeInsets.only(top: 14, bottom: 4),
        child: Text(heading.group(2)!,
            style: TextStyle(
              fontSize: level <= 2 ? 17 : 15,
              fontWeight: FontWeight.w800,
              color: level <= 2 ? textGreenOn(context) : null,
            ),
          ),
        ),
      );
    } else if (RegExp(r'^-{3,}$').hasMatch(line)) {
      out.add(const Divider(height: 24));
    } else if (RegExp(r'^[-*]\s+').hasMatch(line)) {
      out.add(Padding(
        padding: const EdgeInsets.only(right: 8, bottom: 2),
        child: Text('• ${line.replaceFirst(RegExp(r'^[-*]\s+'), '')}',
            style: const TextStyle(fontSize: 14, height: 1.8)),
      ));
    } else {
      out.add(Padding(
        padding: const EdgeInsets.only(bottom: 4),
        child: Text(line, style: const TextStyle(fontSize: 14, height: 1.9)),
      ));
    }
  }
  return out;
}
