/// «القيود والمراجعة» (البند ٢٠٥): the website's /books/review in the app, and the way into the entry form, the audit
/// log, the exceptions report and the period's closing.
///
/// The owner sees what was prepared in his books and approves it (it posts) or turns it back with a reason; he lets his
/// agent or an accountant prepare entries, ends that, and may ask that his own entries wait for review too. A preparer
/// sees his invitations, the books he prepares for, and what he prepared with its status, and withdraws what is still
/// waiting. Every answer is the website's own step, as the signed-in person.
library;

import 'package:flutter/material.dart';

import '../api.dart';
import '../journal.dart';
import '../theme.dart';
import '../ui.dart';
import 'books_audit_screen.dart';
import 'books_close_screen.dart';
import 'journal_entry_screen.dart';
import 'seasons_screen.dart';

/// The way in from «دفتر الحسابات»: the five steps of item 205 on one screen.
class JournalHubScreen extends StatelessWidget {
  const JournalHubScreen({super.key, this.api});
  final JournalApi? api;

  @override
  Widget build(BuildContext context) {
    void go(Widget w) => Navigator.of(context).push(MaterialPageRoute(builder: (_) => w));
    final tiles = <(IconData, String, String, Widget)>[
      (Icons.edit_note_outlined, 'قيدٌ جديد', 'يدويّاً أو من قيدٍ جاهز، بمستنده', JournalEntryScreen(api: api)),
      (Icons.fact_check_outlined, 'المراجعة', 'المُعِدّ والمعتمِد، وما ينتظر اعتمادك', BooksReviewScreen(api: api)),
      (Icons.report_gmailerrorred_outlined, 'الاستثناءات', 'ما يستحقّ نظرةً ثانية قبل الإقفال', BooksAuditScreen(api: api, exceptions: true)),
      (Icons.history_outlined, 'سجلّ التدقيق', 'كلّ ما جرى في الدفتر، لا يُمحى', BooksAuditScreen(api: api)),
      (Icons.lock_clock_outlined, 'إقفال الفترة', 'وقيد الإقفال في الأرباح المحتجزة', BooksCloseScreen(api: api)),
    ];
    return Scaffold(
      appBar: AppBar(title: const Text('القيود والمراجعة')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        children: [
          const IntroNote('كلّ قيدٍ مدينٌ ودائنٌ بالمبلغ نفسه. لا يُعدَّل القيد بعد ترحيله: يُعكس بقيدٍ جديد، وكلّ ذلك في سجلّ التدقيق.'),
          const SizedBox(height: 12),
          for (final (icon, title, subtitle, screen) in tiles)
            Card(
              child: ListTile(
                leading: Icon(icon, color: textGreenOn(context)),
                title: Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
                subtitle: Text(subtitle),
                trailing: const Icon(Icons.chevron_left),
                onTap: () => go(screen),
              ),
            ),
        ],
      ),
    );
  }
}

class BooksReviewScreen extends StatelessWidget {
  const BooksReviewScreen({super.key, this.api});
  final JournalApi? api;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('المراجعة')),
      body: RequireSignIn(what: 'دفترك', builder: (_) => BooksReviewBody(api: api ?? JournalApi())),
    );
  }
}

class BooksReviewBody extends StatefulWidget {
  const BooksReviewBody({super.key, required this.api});
  final JournalApi api;

  @override
  State<BooksReviewBody> createState() => _BooksReviewBodyState();
}

class _BooksReviewBodyState extends State<BooksReviewBody> {
  late Future<ReviewView> _future = widget.api.review();

  void _reload() => setState(() {
        _future = widget.api.review();
      });
  void _say(String m) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));

  Future<void> _do(String action, [Map<String, dynamic> fields = const {}]) async {
    try {
      _say(await widget.api.reviewAction(action, fields));
      _reload();
    } on ApiException catch (e) {
      _say(e.message);
    }
  }

  Future<String?> _ask(String title, String label, {int min = 3}) => showDialog<String>(
        context: context,
        builder: (c) => _TextDialog(title: title, label: label, min: min),
      );

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<ReviewView>(
      future: _future,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) return const LoadingView();
        if (snap.hasError) {
          final e = snap.error;
          return StateView.error(e is ApiException ? e.message : 'تعذّر تحميل المراجعة.', onRetry: _reload, scrollable: true);
        }
        final v = snap.data!;
        return RefreshIndicator(
          onRefresh: () async => _reload(),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
            children: [
              const IntroNote('من تأذن له يُعِدّ قيود دفترك، ولا يُرحَّل شيءٌ ممّا أعدّه حتى تعتمده أنت، أو تردّه بسبب.'),
              for (final i in v.invitations) ...[
                const SizedBox(height: 12),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('${i.ownerName} يدعوك لتُعِدّ قيود دفتره.'),
                      const SizedBox(height: 8),
                      Wrap(spacing: 8, children: [
                        FilledButton(onPressed: () => _do('answer', {'id': i.id, 'accept': true}), child: const Text('أقبل')),
                        OutlinedButton(onPressed: () => _do('answer', {'id': i.id, 'accept': false}), child: const Text('أعتذر')),
                      ]),
                    ]),
                  ),
                ),
              ],
              for (final b in v.books) ...[
                const SizedBox(height: 16),
                SectionTitle(b.label),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  value: b.alwaysReview,
                  onChanged: (on) => _do('review', {'book': b.id, 'always': on}),
                  title: const Text('راجع كلّ قيد، قيودي أنا أيضاً، قبل ترحيله'),
                ),
                Text('ينتظر اعتمادك (${b.pending.length})', style: const TextStyle(fontWeight: FontWeight.w700)),
                if (b.pending.isEmpty) Text('لا شيء ينتظر.', style: TextStyle(color: mutedOn(context))),
                for (final d in b.pending)
                  _DraftCard(d: d, actions: [
                    FilledButton(onPressed: () => _do('approve', {'id': d.id}), child: const Text('أعتمده فيُرحَّل')),
                    OutlinedButton(
                      onPressed: () async {
                        final note = await _ask('سبب الردّ', 'لماذا يُردّ؟');
                        if (note != null) await _do('reject', {'id': d.id, 'note': note});
                      },
                      child: const Text('أردّه'),
                    ),
                  ]),
                const SizedBox(height: 12),
                const Text('من يُعِدّ قيود هذا الدفتر', style: TextStyle(fontWeight: FontWeight.w700)),
                if (b.preparers.isEmpty) Text('لا أحد غيرك.', style: TextStyle(color: mutedOn(context))),
                for (final p in b.preparers)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(p.name),
                    subtitle: Text(p.open && !p.standing ? '${p.statusLabel} · سقط إذن الوكيل' : p.statusLabel),
                    trailing: p.open ? TextButton(onPressed: () => _do('end', {'id': p.id}), child: const Text('أنهِ الإذن')) : null,
                  ),
                Wrap(spacing: 8, runSpacing: 8, children: [
                  OutlinedButton.icon(
                    onPressed: () async {
                      final contact = await _ask('ادعُ محاسباً', 'جوّاله أو بريده (له حسابٌ في سوداقري)', min: 5);
                      if (contact != null) await _do('invite', {'book': b.id, 'contact': contact});
                    },
                    icon: const Icon(Icons.person_add_alt, size: 18),
                    label: const Text('ادعُ محاسباً'),
                  ),
                  if (b.kind == 'farm')
                    for (final a in v.agents)
                      OutlinedButton.icon(
                        onPressed: () => _do('add_agent', {'book': b.id, 'mandate': a.id}),
                        icon: const Icon(Icons.handshake_outlined, size: 18),
                        label: Text('اجعل «${a.name}» مُعِدّاً'),
                      ),
                ]),
              ],
              if (v.preparing.isNotEmpty) ...[
                const SizedBox(height: 16),
                const SectionTitle('دفاترُ تُعِدّ قيودها'),
                for (final b in v.preparing)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(b.label),
                    trailing: const Icon(Icons.edit_note_outlined),
                    onTap: () => Navigator.of(context)
                        .push(MaterialPageRoute(builder: (_) => JournalEntryScreen(api: widget.api, book: b.id)))
                        .then((_) => _reload()),
                  ),
              ],
              if (v.prepared.isNotEmpty) ...[
                const SizedBox(height: 16),
                const SectionTitle('ما أعددته لغيرك'),
                for (final d in v.prepared)
                  _DraftCard(d: d, actions: [
                    if (d.status == 'pending') OutlinedButton(onPressed: () => _do('withdraw', {'id': d.id}), child: const Text('اسحبه')),
                  ]),
              ],
            ],
          ),
        );
      },
    );
  }
}

class _DraftCard extends StatelessWidget {
  const _DraftCard({required this.d, required this.actions});
  final DraftView d;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(top: 8),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(d.memo, style: const TextStyle(fontWeight: FontWeight.w700)),
          Text([d.date, 'أعدّه ${d.by}', d.statusLabel, d.hasDocument ? 'بمستند' : 'بلا مستند'].join(' · '),
              style: TextStyle(color: mutedOn(context), fontSize: 12)),
          if (d.note != null) Text('السبب: ${d.note}'),
          const SizedBox(height: 6),
          for (final l in d.lines)
            Row(children: [
              Expanded(child: Text(l.account, overflow: TextOverflow.ellipsis)),
              Text(l.side == 'D' ? 'مدين ${l.amount}' : 'دائن ${l.amount}'),
            ]),
          if (actions.isNotEmpty) ...[
            const SizedBox(height: 8),
            Wrap(spacing: 8, runSpacing: 8, children: actions),
          ],
        ]),
      ),
    );
  }
}

class _TextDialog extends StatefulWidget {
  const _TextDialog({required this.title, required this.label, required this.min});
  final String title;
  final String label;
  final int min;

  @override
  State<_TextDialog> createState() => _TextDialogState();
}

class _TextDialogState extends State<_TextDialog> {
  final _text = TextEditingController();

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ok = _text.text.trim().length >= widget.min;
    return AlertDialog(
      title: Text(widget.title),
      content: TextField(
        controller: _text,
        autofocus: true,
        maxLength: 300,
        onChanged: (_) => setState(() {}),
        decoration: InputDecoration(labelText: widget.label),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('تراجع')),
        FilledButton(onPressed: ok ? () => Navigator.pop(context, _text.text.trim()) : null, child: const Text('أرسل')),
      ],
    );
  }
}
