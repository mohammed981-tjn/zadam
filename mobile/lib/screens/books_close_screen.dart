/// «إقفال الفترة» (البند ٢٠٥): the website's /books/close in the app, for the book's owner — close the period through a
/// day that has passed (nothing can be dated in it afterwards), close its income and expenses into retained earnings with
/// one entry the database builds from the balances (and the period with it), or close a finished season's income. Only
/// the administrators reopen a period, with a written reason, on the website.
library;

import 'package:flutter/material.dart';

import '../api.dart';
import '../i18n.dart';
import '../journal.dart';
import '../theme.dart';
import '../ui.dart';
import 'seasons_screen.dart';

class BooksCloseScreen extends StatelessWidget {
  const BooksCloseScreen({super.key, this.api});
  final JournalApi? api;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(tr('إقفال الفترة', 'Close the period'))),
      body: RequireSignIn(what: tr('دفترك', 'your book'), builder: (_) => BooksCloseBody(api: api ?? JournalApi())),
    );
  }
}

class BooksCloseBody extends StatefulWidget {
  const BooksCloseBody({super.key, required this.api});
  final JournalApi api;

  @override
  State<BooksCloseBody> createState() => _BooksCloseBodyState();
}

class _BooksCloseBodyState extends State<BooksCloseBody> {
  late Future<CloseView> _future = widget.api.close();
  final _through = TextEditingController();
  String? _season;
  bool _busy = false;

  @override
  void dispose() {
    _through.dispose();
    super.dispose();
  }

  void _reload() => setState(() {
        _future = widget.api.close();
      });
  void _say(String m) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));

  Future<void> _do(String action, Map<String, dynamic> fields, String confirm) async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        content: Text(confirm),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: Text(tr('تراجع', 'Back'))),
          FilledButton(onPressed: () => Navigator.pop(c, true), child: Text(tr('نعم', 'Yes'))),
        ],
      ),
    );
    if (yes != true) return;
    setState(() => _busy = true);
    try {
      _say(await widget.api.closeAction(action, fields));
      _reload();
    } on ApiException catch (e) {
      _say(e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<CloseView>(
      future: _future,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) return const LoadingView();
        if (snap.hasError) {
          final e = snap.error;
          return StateView.error(e is ApiException ? e.message : tr('تعذّر تحميل الدفتر.', 'Could not load the book.'), onRetry: _reload, scrollable: true);
        }
        final v = snap.data!;
        if (v.bookId == null || !v.owned) {
          return StateView(icon: Icons.lock_outline, title: tr('لا دفتر لك تقفله', 'You have no book to close'), message: tr('يقفل الفترة صاحب الدفتر وحده.', 'Only the book\'s owner closes the period.'));
        }
        if (_through.text.isEmpty) _through.text = dayBefore(v.today);
        final open = v.seasons.where((s) => !s.closed).toList();
        return ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
          children: [
            IntroNote(
                tr('حين تنتهي من مراجعة فترةٍ أقفلها: لا يُكتب بعد ذلك قيدٌ بتاريخٍ فيها. والخطأ بعد الإقفال يُصحَّح بقيدٍ بتاريخٍ بعده، ولا تُعاد الفترة مفتوحةً إلا بيد الإدارة وبسببٍ مكتوب.', 'When you finish reviewing a period, close it: no entry dated in it can be written after that. A mistake after the close is corrected with an entry dated after it, and the period is reopened only by the administrators, with a written reason.')),
            const SizedBox(height: 12),
            Text(
              [
                v.closedThrough == null ? tr('لم يُقفل الدفتر بعد', 'The book is not closed yet') : tr('الدفتر مقفلٌ حتى ${v.closedThrough}', 'The book is closed through ${v.closedThrough}'),
                if (v.incomeClosedThrough != null) tr('وأُقفل الدخل حتى ${v.incomeClosedThrough}', 'and income is closed through ${v.incomeClosedThrough}'),
              ].join(' · '),
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _through,
              keyboardType: TextInputType.datetime,
              decoration: InputDecoration(labelText: tr('آخر يومٍ في الفترة', 'The period\'s last day'), hintText: 'YYYY-MM-DD'),
            ),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: _busy
                  ? null
                  : () => _do('close_income', {'book': v.bookId, 'through': _through.text.trim()},
                      tr('يُقيَّد قيد إقفال الإيراد والمصروف في الأرباح المحتجزة حتى ${_through.text.trim()}، ويُقفل الدفتر حتى ذلك اليوم. لا رجعة فيه إلا بيد الإدارة.', 'A closing entry moves revenue and expenses into retained earnings through ${_through.text.trim()}, and the book is closed through that day. Only the administrators can undo it.')),
              child: Text(tr('أقفل دخل الفترة وأقفلها', 'Close the period\'s income, and the period')),
            ),
            const SizedBox(height: 8),
            OutlinedButton(
              onPressed: _busy
                  ? null
                  : () => _do('lock', {'book': v.bookId, 'through': _through.text.trim()},
                      tr('يُقفل الدفتر حتى ${_through.text.trim()}، فلا يُكتب فيه قيدٌ بتاريخٍ حتى ذلك اليوم. لا رجعة فيه إلا بيد الإدارة.', 'The book is closed through ${_through.text.trim()}, so no entry dated up to that day can be written in it. Only the administrators can undo it.')),
              child: Text(tr('أقفل الفترة وحدها', 'Close the period only')),
            ),
            if (open.isNotEmpty) ...[
              const SizedBox(height: 20),
              SectionTitle(tr('أقفل دخل موسمٍ انتهى', 'Close the income of a finished season'), subtitle: tr('سطور الموسم إلى الأرباح المحتجزة، مرّةً واحدة.', 'The season\'s lines go to retained earnings, once.')),
              DropdownButtonFormField<String>(
                initialValue: _season,
                isExpanded: true,
                decoration: InputDecoration(labelText: tr('الموسم', 'Season')),
                items: [for (final s in open) DropdownMenuItem(value: s.id, child: Text(s.name))],
                onChanged: (s) => setState(() => _season = s),
              ),
              const SizedBox(height: 8),
              OutlinedButton(
                onPressed: _busy || _season == null
                    ? null
                    : () {
                        final day = seasonCloseDay(v.today, v.closedThrough, v.incomeClosedThrough);
                        _do('close_season', {'book': v.bookId, 'season': _season, 'date': day},
                            tr('يُقيَّد قيد إقفال هذا الموسم في الأرباح المحتجزة بتاريخ $day.', 'A closing entry for this season is posted to retained earnings dated $day.'));
                      },
                child: Text(tr('أقفل دخل الموسم', 'Close the season\'s income')),
              ),
            ],
            if (v.history.isNotEmpty) ...[
              const SizedBox(height: 20),
              SectionTitle(tr('ما أُقفل وما أُعيد فتحه', 'What was closed and reopened')),
              for (final h in v.history) Text('• $h', style: TextStyle(color: mutedOn(context))),
            ],
          ],
        );
      },
    );
  }
}
