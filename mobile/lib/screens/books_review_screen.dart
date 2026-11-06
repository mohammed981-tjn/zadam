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
import '../i18n.dart';
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
      (Icons.edit_note_outlined, tr('قيدٌ جديد', 'New entry'), tr('يدويّاً أو من قيدٍ جاهز، بمستنده', 'By hand or from a ready entry, with its document'), JournalEntryScreen(api: api)),
      (Icons.fact_check_outlined, tr('المراجعة', 'Review'), tr('المُعِدّ والمعتمِد، وما ينتظر اعتمادك', 'The preparer and the approver, and what waits for your approval'), BooksReviewScreen(api: api)),
      (Icons.report_gmailerrorred_outlined, tr('الاستثناءات', 'Exceptions'), tr('ما يستحقّ نظرةً ثانية قبل الإقفال', 'What deserves a second look before the close'), BooksAuditScreen(api: api, exceptions: true)),
      (Icons.history_outlined, tr('سجلّ التدقيق', 'Audit log'), tr('كلّ ما جرى في الدفتر، لا يُمحى', 'Everything that happened in the book, never erased'), BooksAuditScreen(api: api)),
      (Icons.lock_clock_outlined, tr('إقفال الفترة', 'Close the period'), tr('وقيد الإقفال في الأرباح المحتجزة', 'and the closing entry into retained earnings'), BooksCloseScreen(api: api)),
    ];
    return Scaffold(
      appBar: AppBar(title: Text(tr('القيود والمراجعة', 'Entries and review'))),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        children: [
          IntroNote(tr('كلّ قيدٍ مدينٌ ودائنٌ بالمبلغ نفسه. لا يُعدَّل القيد بعد ترحيله: يُعكس بقيدٍ جديد، وكلّ ذلك في سجلّ التدقيق.', 'Every entry has a debit and a credit of the same amount. An entry is not edited after it posts: it is reversed with a new entry, and all of it is in the audit log.')),
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
      appBar: AppBar(title: Text(tr('المراجعة', 'Review'))),
      body: RequireSignIn(what: tr('دفترك', 'your book'), builder: (_) => BooksReviewBody(api: api ?? JournalApi())),
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
          return StateView.error(e is ApiException ? e.message : tr('تعذّر تحميل المراجعة.', 'Could not load the review.'), onRetry: _reload, scrollable: true);
        }
        final v = snap.data!;
        return RefreshIndicator(
          onRefresh: () async => _reload(),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
            children: [
              IntroNote(tr('من تأذن له يُعِدّ قيود دفترك، ولا يُرحَّل شيءٌ ممّا أعدّه حتى تعتمده أنت، أو تردّه بسبب.', 'Whoever you allow prepares your book\'s entries, and nothing they prepare posts until you approve it, or turn it back with a reason.')),
              for (final i in v.invitations) ...[
                const SizedBox(height: 12),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(tr('${i.ownerName} يدعوك لتُعِدّ قيود دفتره.', '${i.ownerName} invites you to prepare the entries of their book.')),
                      const SizedBox(height: 8),
                      Wrap(spacing: 8, children: [
                        FilledButton(onPressed: () => _do('answer', {'id': i.id, 'accept': true}), child: Text(tr('أقبل', 'Accept'))),
                        OutlinedButton(onPressed: () => _do('answer', {'id': i.id, 'accept': false}), child: Text(tr('أعتذر', 'Decline'))),
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
                  title: Text(tr('راجع كلّ قيد، قيودي أنا أيضاً، قبل ترحيله', 'Review every entry, mine too, before it posts')),
                ),
                Text(tr('ينتظر اعتمادك (${b.pending.length})', 'Waiting for your approval (${b.pending.length})'), style: const TextStyle(fontWeight: FontWeight.w700)),
                if (b.pending.isEmpty) Text(tr('لا شيء ينتظر.', 'Nothing is waiting.'), style: TextStyle(color: mutedOn(context))),
                for (final d in b.pending)
                  _DraftCard(d: d, actions: [
                    FilledButton(onPressed: () => _do('approve', {'id': d.id}), child: Text(tr('أعتمده فيُرحَّل', 'Approve and post'))),
                    OutlinedButton(
                      onPressed: () async {
                        final note = await _ask(tr('سبب الردّ', 'Why it is turned back'), tr('لماذا يُردّ؟', 'Why is it turned back?'));
                        if (note != null) await _do('reject', {'id': d.id, 'note': note});
                      },
                      child: Text(tr('أردّه', 'Turn it back')),
                    ),
                  ]),
                const SizedBox(height: 12),
                Text(tr('من يُعِدّ قيود هذا الدفتر', 'Who prepares this book\'s entries'), style: TextStyle(fontWeight: FontWeight.w700)),
                if (b.preparers.isEmpty) Text(tr('لا أحد غيرك.', 'Nobody but you.'), style: TextStyle(color: mutedOn(context))),
                for (final p in b.preparers)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(p.name),
                    subtitle: Text(p.open && !p.standing ? tr('${p.statusLabel} · سقط إذن الوكيل', '${p.statusLabel} · the agent\'s permission lapsed') : p.statusLabel),
                    trailing: p.open ? TextButton(onPressed: () => _do('end', {'id': p.id}), child: Text(tr('أنهِ الإذن', 'End the permission'))) : null,
                  ),
                Wrap(spacing: 8, runSpacing: 8, children: [
                  OutlinedButton.icon(
                    onPressed: () async {
                      final contact = await _ask(tr('ادعُ محاسباً', 'Invite an accountant'), tr('جوّاله أو بريده (له حسابٌ في سوداقري)', 'Their phone or email (they have a Sudagri account)'), min: 5);
                      if (contact != null) await _do('invite', {'book': b.id, 'contact': contact});
                    },
                    icon: const Icon(Icons.person_add_alt, size: 18),
                    label: Text(tr('ادعُ محاسباً', 'Invite an accountant')),
                  ),
                  if (b.kind == 'farm')
                    for (final a in v.agents)
                      OutlinedButton.icon(
                        onPressed: () => _do('add_agent', {'book': b.id, 'mandate': a.id}),
                        icon: const Icon(Icons.handshake_outlined, size: 18),
                        label: Text(tr('اجعل «${a.name}» مُعِدّاً', 'Make «${a.name}» a preparer')),
                      ),
                ]),
              ],
              if (v.preparing.isNotEmpty) ...[
                const SizedBox(height: 16),
                SectionTitle(tr('دفاترُ تُعِدّ قيودها', 'Books you prepare entries for')),
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
                SectionTitle(tr('ما أعددته لغيرك', 'What you prepared for others')),
                for (final d in v.prepared)
                  _DraftCard(d: d, actions: [
                    if (d.status == 'pending') OutlinedButton(onPressed: () => _do('withdraw', {'id': d.id}), child: Text(tr('اسحبه', 'Withdraw it'))),
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
          Text([d.date, tr('أعدّه ${d.by}', 'Prepared by ${d.by}'), d.statusLabel, d.hasDocument ? tr('بمستند', 'with a document') : tr('بلا مستند', 'No document')].join(' · '),
              style: TextStyle(color: mutedOn(context), fontSize: 12)),
          if (d.note != null) Text(tr('السبب: ${d.note}', 'Reason: ${d.note}')),
          const SizedBox(height: 6),
          for (final l in d.lines)
            Row(children: [
              Expanded(child: Text(l.account, overflow: TextOverflow.ellipsis)),
              Text(l.side == 'D' ? tr('مدين ${l.amount}', 'Debit ${l.amount}') : tr('دائن ${l.amount}', 'Credit ${l.amount}')),
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
        TextButton(onPressed: () => Navigator.pop(context), child: Text(tr('تراجع', 'Back'))),
        FilledButton(onPressed: ok ? () => Navigator.pop(context, _text.text.trim()) : null, child: Text(tr('أرسل', 'Send'))),
      ],
    );
  }
}
