/// «سجلّ التدقيق» و«الاستثناءات» (البند ٢٠٥): the website's /books/audit and /books/exceptions in the app.
///
/// The log is everything that happened in the book — an entry and its lines, a reversal, a draft prepared, approved,
/// turned back or withdrawn, the period closed or reopened — with who, when, from where and what; it is written by the
/// database itself and nobody, the administrators included, can change it. The exceptions are what deserves a second look
/// before the period is closed.
library;

import 'package:flutter/material.dart';

import '../api.dart';
import '../i18n.dart';
import '../journal.dart';
import '../theme.dart';
import '../ui.dart';
import 'seasons_screen.dart';

class BooksAuditScreen extends StatelessWidget {
  const BooksAuditScreen({super.key, this.api, this.exceptions = false});
  final JournalApi? api;

  /// Opens on the exceptions report rather than the log.
  final bool exceptions;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(exceptions ? tr('تقرير الاستثناءات', 'Exceptions report') : tr('سجلّ التدقيق', 'Audit log'))),
      body: RequireSignIn(
        what: tr('دفترك', 'your book'),
        builder: (_) => exceptions ? _ExceptionsBody(api: api ?? JournalApi()) : _AuditBody(api: api ?? JournalApi()),
      ),
    );
  }
}

class _AuditBody extends StatefulWidget {
  const _AuditBody({required this.api});
  final JournalApi api;

  @override
  State<_AuditBody> createState() => _AuditBodyState();
}

class _AuditBodyState extends State<_AuditBody> {
  final _rows = <AuditLine>[];
  bool _more = false;
  bool _loading = true;
  String? _error;
  String? _book;

  @override
  void initState() {
    super.initState();
    _page();
  }

  Future<void> _page({bool fresh = false}) async {
    setState(() {
      _loading = true;
      _error = null;
      if (fresh) _rows.clear();
    });
    try {
      final v = await widget.api.audit(book: _book, before: _rows.isEmpty ? null : _rows.last.id);
      if (!mounted) return;
      setState(() {
        _book = v.bookId;
        _rows.addAll(v.rows);
        _more = v.more;
        _loading = false;
      });
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _error = e.message;
          _loading = false;
        });
      }
    }
  }

  String _when(String iso) {
    final d = DateTime.tryParse(iso)?.toUtc().add(const Duration(hours: 2));
    if (d == null) return iso;
    String two(int n) => n.toString().padLeft(2, '0');
    return '${d.year}-${two(d.month)}-${two(d.day)} ${two(d.hour)}:${two(d.minute)}';
  }

  @override
  Widget build(BuildContext context) {
    if (_error != null && _rows.isEmpty) return StateView.error(_error, onRetry: () => _page(fresh: true), scrollable: true);
    if (_loading && _rows.isEmpty) return const LoadingView();
    return RefreshIndicator(
      onRefresh: () => _page(fresh: true),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        children: [
          IntroNote(tr('يُكتب وحده مع كلّ قيدٍ واعتمادٍ وردٍّ وإقفال، ولا يُعدَّل ولا يُحذف — ولا تملك الإدارة ذلك أيضاً.', 'It writes itself with every entry, approval, reversal and close, and it is never edited or deleted — the administrators cannot do that either.')),
          if (_rows.isEmpty)
            Padding(
              padding: EdgeInsets.only(top: 16),
              child: StateView(icon: Icons.history_outlined, title: tr('لا شيء في السجلّ بعد', 'Nothing in the log yet')),
            ),
          for (final r in _rows)
            Card(
              margin: const EdgeInsets.only(top: 8),
              child: ListTile(
                title: Text(r.action, style: const TextStyle(fontWeight: FontWeight.w700)),
                subtitle: Text('${_when(r.at)} · ${r.who} · ${r.via}\n${r.detail}'),
                isThreeLine: true,
              ),
            ),
          if (_more)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: OutlinedButton(onPressed: _loading ? null : () => _page(), child: Text(tr('ما قبلها', 'Earlier'))),
            ),
        ],
      ),
    );
  }
}

class _ExceptionsBody extends StatefulWidget {
  const _ExceptionsBody({required this.api});
  final JournalApi api;

  @override
  State<_ExceptionsBody> createState() => _ExceptionsBodyState();
}

class _ExceptionsBodyState extends State<_ExceptionsBody> {
  late Future<List<ExceptionLine>> _future = widget.api.exceptions();

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<ExceptionLine>>(
      future: _future,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) return const LoadingView();
        if (snap.hasError) {
          final e = snap.error;
          return StateView.error(e is ApiException ? e.message : tr('تعذّر تحميل التقرير.', 'Could not load the report.'),
              onRetry: () => setState(() {
        _future = widget.api.exceptions();
      }), scrollable: true);
        }
        final rows = snap.data!;
        final kinds = <String>[for (final r in rows) if (!rows.takeWhile((x) => x != r).any((x) => x.kind == r.kind)) r.kind];
        return RefreshIndicator(
          onRefresh: () async => setState(() {
        _future = widget.api.exceptions();
      }),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
            children: [
              IntroNote(tr('ليس كلّ ما هنا خطأً: هو ما لا يشبه عادة دفترك، فانظر فيه قبل أن تقفل الفترة.', 'Not everything here is a mistake: it is what does not look like your book\'s habit, so look at it before you close the period.')),
              if (rows.isEmpty)
                Padding(
                  padding: EdgeInsets.only(top: 16),
                  child: StateView(icon: Icons.verified_outlined, title: tr('لا استثناء في دفترك', 'No exceptions in your book')),
                ),
              for (final k in kinds) ...[
                const SizedBox(height: 14),
                SectionTitle('${rows.firstWhere((r) => r.kind == k).title} (${rows.where((r) => r.kind == k).length})',
                    subtitle: rows.firstWhere((r) => r.kind == k).hint),
                for (final r in rows.where((r) => r.kind == k))
                  Padding(
                    padding: const EdgeInsets.only(bottom: 6),
                    child: Text(r.facts, style: TextStyle(color: inkOn(context))),
                  ),
              ],
            ],
          ),
        );
      },
    );
  }
}
