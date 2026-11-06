/// «إقفال الفترة» (البند ٢٠٥): the website's /books/close in the app, for the book's owner — close the period through a
/// day that has passed (nothing can be dated in it afterwards), close its income and expenses into retained earnings with
/// one entry the database builds from the balances (and the period with it), or close a finished season's income. Only
/// the administrators reopen a period, with a written reason, on the website.
library;

import 'package:flutter/material.dart';

import '../api.dart';
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
      appBar: AppBar(title: const Text('إقفال الفترة')),
      body: RequireSignIn(what: 'دفترك', builder: (_) => BooksCloseBody(api: api ?? JournalApi())),
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
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('تراجع')),
          FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('نعم')),
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
          return StateView.error(e is ApiException ? e.message : 'تعذّر تحميل الدفتر.', onRetry: _reload, scrollable: true);
        }
        final v = snap.data!;
        if (v.bookId == null || !v.owned) {
          return const StateView(icon: Icons.lock_outline, title: 'لا دفتر لك تقفله', message: 'يقفل الفترة صاحب الدفتر وحده.');
        }
        if (_through.text.isEmpty) _through.text = dayBefore(v.today);
        final open = v.seasons.where((s) => !s.closed).toList();
        return ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
          children: [
            const IntroNote(
                'حين تنتهي من مراجعة فترةٍ أقفلها: لا يُكتب بعد ذلك قيدٌ بتاريخٍ فيها. والخطأ بعد الإقفال يُصحَّح بقيدٍ بتاريخٍ بعده، ولا تُعاد الفترة مفتوحةً إلا بيد الإدارة وبسببٍ مكتوب.'),
            const SizedBox(height: 12),
            Text(
              [
                v.closedThrough == null ? 'لم يُقفل الدفتر بعد' : 'الدفتر مقفلٌ حتى ${v.closedThrough}',
                if (v.incomeClosedThrough != null) 'وأُقفل الدخل حتى ${v.incomeClosedThrough}',
              ].join(' · '),
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _through,
              keyboardType: TextInputType.datetime,
              decoration: const InputDecoration(labelText: 'آخر يومٍ في الفترة', hintText: 'YYYY-MM-DD'),
            ),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: _busy
                  ? null
                  : () => _do('close_income', {'book': v.bookId, 'through': _through.text.trim()},
                      'يُقيَّد قيد إقفال الإيراد والمصروف في الأرباح المحتجزة حتى ${_through.text.trim()}، ويُقفل الدفتر حتى ذلك اليوم. لا رجعة فيه إلا بيد الإدارة.'),
              child: const Text('أقفل دخل الفترة وأقفلها'),
            ),
            const SizedBox(height: 8),
            OutlinedButton(
              onPressed: _busy
                  ? null
                  : () => _do('lock', {'book': v.bookId, 'through': _through.text.trim()},
                      'يُقفل الدفتر حتى ${_through.text.trim()}، فلا يُكتب فيه قيدٌ بتاريخٍ حتى ذلك اليوم. لا رجعة فيه إلا بيد الإدارة.'),
              child: const Text('أقفل الفترة وحدها'),
            ),
            if (open.isNotEmpty) ...[
              const SizedBox(height: 20),
              const SectionTitle('أقفل دخل موسمٍ انتهى', subtitle: 'سطور الموسم إلى الأرباح المحتجزة، مرّةً واحدة.'),
              DropdownButtonFormField<String>(
                initialValue: _season,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'الموسم'),
                items: [for (final s in open) DropdownMenuItem(value: s.id, child: Text(s.name))],
                onChanged: (s) => setState(() => _season = s),
              ),
              const SizedBox(height: 8),
              OutlinedButton(
                onPressed: _busy || _season == null
                    ? null
                    : () => _do('close_season', {'book': v.bookId, 'season': _season, 'date': v.today},
                        'يُقيَّد قيد إقفال هذا الموسم في الأرباح المحتجزة بتاريخ اليوم.'),
                child: const Text('أقفل دخل الموسم'),
              ),
            ],
            if (v.history.isNotEmpty) ...[
              const SizedBox(height: 20),
              const SectionTitle('ما أُقفل وما أُعيد فتحه'),
              for (final h in v.history) Text('• $h', style: TextStyle(color: mutedOn(context))),
            ],
          ],
        );
      },
    );
  }
}
