import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api.dart';
import '../library.dart';
import '../theme.dart';
import '../ui.dart';

/// A study or the guide, read in the app (البند ٢٠٣): /studies/exchange-rate,
/// /arc-canal and /guide, from the website's own text as blocks.
class PageReaderScreen extends StatelessWidget {
  const PageReaderScreen({super.key, required this.slug, required this.title, this.api});

  /// exchange-rate, arc-canal or guide.
  final String slug;
  final String title;
  final LibraryApi? api;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: PageReader(slug: slug, api: api ?? LibraryApi()),
    );
  }
}

/// The reader itself, for a screen of its own or a tab.
class PageReader extends StatefulWidget {
  const PageReader({super.key, required this.slug, required this.api});
  final String slug;
  final LibraryApi api;

  @override
  State<PageReader> createState() => _PageReaderState();
}

class _PageReaderState extends State<PageReader> with AutomaticKeepAliveClientMixin {
  late Future<ReadPage> _page = widget.api.read(widget.slug);
  final Map<int, GlobalKey> _anchors = {};

  @override
  bool get wantKeepAlive => true;

  void _reload() => setState(() => _page = widget.api.read(widget.slug));

  Future<void> _web(String? url) async {
    final u = Uri.tryParse(url ?? '');
    if (u != null) await launchUrl(u, mode: LaunchMode.externalApplication);
  }

  void _contents(ReadPage page) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (sheet) => SafeArea(
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.of(sheet).size.height * 0.75),
          child: ListView(
            shrinkWrap: true,
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            children: [
              Text('الفهرس (${page.sections.length} قسماً)', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
              for (final (i, text) in page.sections)
                ListTile(
                  dense: true,
                  title: Text(text),
                  onTap: () {
                    Navigator.of(sheet).pop();
                    final ctx = _anchors[i]?.currentContext;
                    if (ctx != null) {
                      Scrollable.ensureVisible(ctx, duration: const Duration(milliseconds: 300));
                    }
                  },
                ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    return FutureBuilder<ReadPage>(
      future: _page,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) return const LoadingView();
        if (snap.hasError) {
          final e = snap.error;
          return StateView.error(e is ApiException ? e.message : 'تعذّر تحميل الصفحة.', onRetry: _reload);
        }
        final page = snap.data!;
        return RefreshIndicator(
          onRefresh: () async => _reload(),
          child: SingleChildScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(18, 12, 18, 40),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (page.title.isNotEmpty || page.note != null)
                  HeroBand(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        for (var i = 0; i < page.title.length; i++)
                          Text(
                            page.title[i],
                            style: TextStyle(
                              fontSize: i == 1 ? 20 : 14,
                              fontWeight: i == 1 ? FontWeight.w900 : FontWeight.w700,
                              height: 1.5,
                              color: i == 0 ? textGreenOn(context) : null,
                            ),
                          ),
                        if (page.note != null) ...[
                          const SizedBox(height: 8),
                          Text(page.note!, style: TextStyle(fontSize: 12, color: mutedOn(context))),
                        ],
                      ],
                    ),
                  ),
                if (page.caveat != null) ...[
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(color: warnTintOn(context), borderRadius: BorderRadius.circular(14)),
                    child: Text(page.caveat!, style: TextStyle(color: inkOn(context), height: 1.8, fontSize: 13)),
                  ),
                ],
                if (page.canal != null) ...[const SizedBox(height: 12), _CanalFigures(page.canal!)],
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  children: [
                    if (page.sections.length > 2)
                      OutlinedButton.icon(
                        onPressed: () => _contents(page),
                        icon: const Icon(Icons.list_alt, size: 18),
                        label: const Text('الفهرس'),
                      ),
                    if (page.pageUrl != null)
                      TextButton.icon(
                        onPressed: () => _web(page.pageUrl),
                        icon: const Icon(Icons.open_in_new, size: 18),
                        label: const Text('افتحها في الموقع (الخرائط والأفلام)'),
                      ),
                  ],
                ),
                for (var i = 0; i < page.blocks.length; i++)
                  KeyedSubtree(
                    key: page.blocks[i].kind == 'section' ? (_anchors[i] ??= GlobalKey()) : null,
                    child: BlockView(page.blocks[i]),
                  ),
              ],
            ),
          ),
        );
      },
    );
  }
}

/// One block, drawn.
class BlockView extends StatelessWidget {
  const BlockView(this.b, {super.key});
  final PageBlock b;

  @override
  Widget build(BuildContext context) {
    final body = TextStyle(fontSize: 15, height: 1.9, color: inkOn(context));
    switch (b.kind) {
      case 'h1':
        return Padding(
          padding: const EdgeInsets.only(top: 12, bottom: 4),
          child: Text(b.text, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900, height: 1.4)),
        );
      case 'section':
        return Padding(padding: const EdgeInsets.only(top: 26), child: SectionTitle(b.text));
      case 'h3':
        return Padding(
          padding: const EdgeInsets.only(top: 16, bottom: 2),
          child: Text(b.text, style: const TextStyle(fontSize: 16.5, fontWeight: FontWeight.w800, height: 1.5)),
        );
      case 'h4':
        return Padding(
          padding: const EdgeInsets.only(top: 12),
          child: Text(b.text, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, height: 1.6)),
        );
      case 'formula':
        return Container(
          margin: const EdgeInsets.symmetric(vertical: 10),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            color: Theme.of(context).cardColor,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Theme.of(context).colorScheme.outline),
          ),
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Text(b.text, textDirection: TextDirection.ltr, style: const TextStyle(fontFamily: 'monospace', fontSize: 14)),
          ),
        );
      case 'ol':
      case 'ul':
        return Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              for (var i = 0; i < b.items.length; i++)
                Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SizedBox(
                        width: 26,
                        child: Text(
                          b.kind == 'ol' ? '${i + 1}.' : '•',
                          style: TextStyle(color: textGreenOn(context), fontWeight: FontWeight.w800, height: 1.9),
                        ),
                      ),
                      Expanded(child: Text(b.items[i], style: body.copyWith(height: 1.8))),
                    ],
                  ),
                ),
            ],
          ),
        );
      case 'table':
        return Container(
          margin: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            border: Border.all(color: Theme.of(context).colorScheme.outline),
            borderRadius: BorderRadius.circular(12),
          ),
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: ConstrainedBox(
              constraints: BoxConstraints(minWidth: MediaQuery.of(context).size.width - 40),
              child: Table(
                defaultColumnWidth: const IntrinsicColumnWidth(),
                border: TableBorder(horizontalInside: BorderSide(color: Theme.of(context).colorScheme.outline)),
                children: [
                  for (var r = 0; r < b.rows.length; r++)
                    TableRow(
                      decoration: r == 0 ? BoxDecoration(color: leafTintOn(context)) : null,
                      children: [
                        for (var c = 0; c < _width; c++)
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                            child: ConstrainedBox(
                              constraints: const BoxConstraints(maxWidth: 260),
                              child: Text(
                                c < b.rows[r].length ? b.rows[r][c] : '',
                                style: TextStyle(fontSize: 13, height: 1.6, fontWeight: r == 0 ? FontWeight.w800 : null),
                              ),
                            ),
                          ),
                      ],
                    ),
                ],
              ),
            ),
          ),
        );
      case 'hr':
        return const Divider(height: 32);
      default:
        return Padding(padding: const EdgeInsets.only(top: 10), child: Text(b.text, style: body));
    }
  }

  int get _width => b.rows.fold(0, (w, r) => r.length > w ? r.length : w);
}

/// The canal's four numbers and its measured ground, as the page draws them.
class _CanalFigures extends StatelessWidget {
  const _CanalFigures(this.c);
  final CanalFigures c;

  @override
  Widget build(BuildContext context) {
    Widget fig(String big, String label, String note) => Container(
          width: 150,
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(color: Theme.of(context).cardColor, borderRadius: BorderRadius.circular(14)),
          child: Column(
            children: [
              Text(big, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
              Text(label, style: const TextStyle(fontWeight: FontWeight.w700)),
              Text(note, textAlign: TextAlign.center, style: TextStyle(fontSize: 11, color: mutedOn(context))),
            ],
          ),
        );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Wrap(
          spacing: 8,
          runSpacing: 8,
          alignment: WrapAlignment.center,
          children: [
            fig('${c.lengthKm} كم', 'طول المسار', 'بين طرفيه المسمّيين'),
            fig('${c.peakM} م', 'أعلى نقطة', 'على الساق الجنوبية'),
            fig('${c.liftM} م', 'الرفع الساكن', 'من منسوب الخزان ${c.sourceElevationM}'),
            fig('${c.terminusAboveSourceM} م', 'النهاية فوق المصدر', 'فلا جريان بالجاذبية'),
          ],
        ),
        if (c.profile.length > 1) ...[
          const SizedBox(height: 12),
          Text('مقطع الأرض على المسار (م فوق البحر)', style: TextStyle(fontSize: 12, color: mutedOn(context))),
          const SizedBox(height: 6),
          SizedBox(
            height: 140,
            child: CustomPaint(
              painter: _ProfilePainter(
                c.profile,
                c.sourceElevationM.toDouble(),
                line: textGreenOn(context),
                water: accentOn(context),
                grid: Theme.of(context).colorScheme.outline,
              ),
            ),
          ),
        ],
      ],
    );
  }
}

class _ProfilePainter extends CustomPainter {
  _ProfilePainter(this.points, this.source, {required this.line, required this.water, required this.grid});
  final List<(double, double)> points;
  final double source;
  final Color line;
  final Color water;
  final Color grid;

  @override
  void paint(Canvas canvas, Size size) {
    final xs = points.map((p) => p.$1);
    final ys = [...points.map((p) => p.$2), source];
    final x0 = xs.reduce((a, b) => a < b ? a : b), x1 = xs.reduce((a, b) => a > b ? a : b);
    final y0 = ys.reduce((a, b) => a < b ? a : b) - 5, y1 = ys.reduce((a, b) => a > b ? a : b) + 5;
    // Distance runs from the south (the reservoir) at the start of the reading direction.
    Offset at(double x, double y) => Offset(
          size.width - (x - x0) / (x1 - x0 == 0 ? 1 : x1 - x0) * size.width,
          size.height - (y - y0) / (y1 - y0) * size.height,
        );
    canvas.drawRect(Offset.zero & size, Paint()..color = grid.withValues(alpha: 0.15));
    final level = at(x0, source).dy;
    canvas.drawLine(Offset(0, level), Offset(size.width, level), Paint()
      ..color = water
      ..strokeWidth = 1.5);
    final path = Path()..moveTo(at(points.first.$1, points.first.$2).dx, at(points.first.$1, points.first.$2).dy);
    for (final p in points.skip(1)) {
      final o = at(p.$1, p.$2);
      path.lineTo(o.dx, o.dy);
    }
    canvas.drawPath(path, Paint()
      ..color = line
      ..strokeWidth = 2
      ..style = PaintingStyle.stroke);
  }

  @override
  bool shouldRepaint(covariant _ProfilePainter old) => old.points != points;
}
