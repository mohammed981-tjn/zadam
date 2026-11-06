import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api.dart';
import '../i18n.dart';
import '../library.dart';
import '../theme.dart';
import '../ui.dart';

/// عملٌ منشور في المكتبة (البند ٢٠٣) — /library/[id]: ملخّصه ومن كتبه، والملفّ
/// أو رابطه، وطريقة الاستشهاد به.
///
/// The PDF opens on the website's page for the work: the bucket is private and
/// only the website signs its links (with a key no app route holds).
class ResearchItemScreen extends StatefulWidget {
  const ResearchItemScreen({super.key, required this.id, this.api});
  final String id;
  final LibraryApi? api;

  @override
  State<ResearchItemScreen> createState() => _ResearchItemScreenState();
}

class _ResearchItemScreenState extends State<ResearchItemScreen> {
  late final LibraryApi _api = widget.api ?? LibraryApi();
  late Future<ResearchItem> _item = _api.item(widget.id);

  void _reload() => setState(() => _item = _api.item(widget.id));

  Future<void> _open(String? url) async {
    final u = Uri.tryParse(url ?? '');
    if (u != null) await launchUrl(u, mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(tr('مكتبة الدراسات والبحوث', 'Studies and research library'))),
      body: FutureBuilder<ResearchItem>(
        future: _item,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) return const LoadingView();
          if (snap.hasError) {
            final e = snap.error;
            return StateView.error(e is ApiException ? e.message : tr('تعذّر فتح العمل.', 'Could not open the work.'), onRetry: _reload);
          }
          final r = snap.data!;
          final published = r.publishedAt;
          return ListView(
            padding: const EdgeInsets.fromLTRB(18, 12, 18, 40),
            children: [
              Wrap(spacing: 6, runSpacing: 6, children: [
                TagPill(r.kindLabel, icon: Icons.menu_book_outlined),
                if (r.crop != null) TagPill(r.crop!, gold: true),
                if (r.state != null) TagPill(r.state!, gold: true),
              ]),
              const SizedBox(height: 10),
              Text(r.title, style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w900, height: 1.5)),
              const SizedBox(height: 4),
              Text(r.byline, style: TextStyle(color: mutedOn(context))),
              const SizedBox(height: 14),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SectionTitle(tr('الملخّص', 'Abstract')),
                      Text(r.abstract, style: const TextStyle(height: 1.9, fontSize: 15)),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Wrap(spacing: 10, runSpacing: 10, children: [
                if (r.hasFile)
                  FilledButton.icon(
                    onPressed: () => _open(r.pageUrl),
                    icon: const Icon(Icons.picture_as_pdf_outlined),
                    label: Text(tr('افتح الملفّ (PDF)', 'Open the file (PDF)')),
                  ),
                if (r.linkUrl != null)
                  OutlinedButton.icon(
                    onPressed: () => _open(r.linkUrl),
                    icon: const Icon(Icons.open_in_new),
                    label: Text(tr('افتح العمل في موقعه', 'Open the work where it is published')),
                  ),
              ]),
              if (r.hasFile)
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text(tr('يُفتح الملفّ من صفحة العمل في الموقع.', 'The file opens from the work\'s page on the website.'), style: TextStyle(fontSize: 12, color: mutedOn(context))),
                ),
              const SizedBox(height: 20),
              if (published != null)
                Text(
                  tr('نُشر في المكتبة: ${published.year}-${published.month.toString().padLeft(2, '0')}-${published.day.toString().padLeft(2, '0')}', 'Published in the library: ${published.year}-${published.month.toString().padLeft(2, '0')}-${published.day.toString().padLeft(2, '0')}'),
                  style: TextStyle(color: mutedOn(context)),
                ),
              if (r.citation != null) ...[
                const SizedBox(height: 10),
                Text(tr('استشهد به هكذا:', 'Cite it as:'), style: TextStyle(color: mutedOn(context))),
                const SizedBox(height: 4),
                InkWell(
                  borderRadius: BorderRadius.circular(12),
                  onLongPress: () {
                    Clipboard.setData(ClipboardData(text: r.citation!));
                    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(tr('نُسخ الاستشهاد.', 'The citation was copied.'))));
                  },
                  child: Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(color: Theme.of(context).cardColor, borderRadius: BorderRadius.circular(12)),
                    child: SelectableText(r.citation!, style: const TextStyle(height: 1.7)),
                  ),
                ),
              ],
              const SizedBox(height: 16),
              Text(
                tr('ما يُنشر هنا كتبه أصحابه، وراجعت سوداقري أنّه عن الزراعة في السودان وأنّ مرسِله أقرّ بحقّه في '
                'مشاركته؛ والرأي فيه لأصحابه.', 'What is published here was written by its authors; Sudagri checked that it is about farming in Sudan and that the sender confirmed their right to share it. The views in it are its authors\'.'),
                style: TextStyle(fontSize: 12.5, color: mutedOn(context), height: 1.7),
              ),
            ],
          );
        },
      ),
    );
  }
}
