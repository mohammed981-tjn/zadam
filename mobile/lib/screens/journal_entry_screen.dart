/// «قيدٌ جديد» (البند ٢٠٥): the website's /books/journal/new in the app — a journal entry of several debit and credit
/// lines from the book's own accounts, a description, a date and a document (a photo of the receipt or a PDF), written by
/// hand or from a ready entry (one tap fills the lines). The owner's entry posts at once; a preparer's waits for the
/// owner. What the website refuses, the app shows in its words, and keeps everything typed.
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api.dart';
import '../evidence.dart';
import '../i18n.dart';
import '../journal.dart';
import '../seasons.dart' show isOutage;
import '../theme.dart';
import '../ui.dart';
import 'evidence_sheet.dart';
import 'seasons_screen.dart';

final _figure = [FilteringTextInputFormatter.allow(RegExp(r'[0-9٠-٩.,٬٫]'))]; // ar-only

class JournalEntryScreen extends StatelessWidget {
  const JournalEntryScreen({super.key, this.api, this.sender, this.pick, this.book});

  /// For tests; the app's own clients otherwise.
  final JournalApi? api;
  final EvidenceSender? sender;
  final EvidencePicker? pick;

  /// The book to open on (a preparer's book from the review screen); the farm book otherwise.
  final String? book;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(tr('قيدٌ جديد', 'New entry'))),
      body: RequireSignIn(
        what: tr('دفترك', 'your book'),
        builder: (_) => JournalEntryBody(api: api ?? JournalApi(), sender: sender, pick: pick, book: book),
      ),
    );
  }
}

class JournalEntryBody extends StatefulWidget {
  const JournalEntryBody({super.key, required this.api, this.sender, this.pick, this.book});
  final JournalApi api;
  final EvidenceSender? sender;
  final EvidencePicker? pick;
  final String? book;

  @override
  State<JournalEntryBody> createState() => _JournalEntryBodyState();
}

class _JournalEntryBodyState extends State<JournalEntryBody> {
  late Future<JournalContext> _future = _load(widget.book);
  EntryTemplate? _template;
  List<JournalLine> _lines = [JournalLine(side: 'D'), JournalLine(side: 'C')];
  final _memo = TextEditingController();
  final _date = TextEditingController();
  final _rate = TextEditingController();
  final _amount = TextEditingController();
  String _currency = 'USD';
  bool _adjusting = false;
  EvidenceFile? _file;
  final _receipt = ReceiptKeeper();
  String _key = newEntryKey();
  bool _busy = false;
  String? _message;
  bool _ok = false;
  int _lineKeys = 0;

  Future<JournalContext> _load(String? book) async {
    final c = await widget.api.context(book: book);
    if (_date.text.isEmpty) _date.text = c.today;
    return c;
  }

  @override
  void dispose() {
    for (final c in [_memo, _date, _rate, _amount]) {
      c.dispose();
    }
    super.dispose();
  }

  void _switchBook(String id) => setState(() {
        _template = null;
        _lines = [JournalLine(side: 'D'), JournalLine(side: 'C')];
        _lineKeys++;
        _message = null;
        _future = _load(id);
      });

  void _pickTemplate(EntryTemplate? t, JournalContext c) {
    setState(() {
      _message = null;
      _template = t;
      _lineKeys++;
      if (t == null) {
        _lines = [JournalLine(side: 'D'), JournalLine(side: 'C')];
        _adjusting = false;
        return;
      }
      final filled = fillTemplate(t, c.accounts, amount: _amount.text.trim());
      if (filled == null) {
        _template = null;
        _ok = false;
        _message = tr('في دفترك حسابٌ ينقص هذا القيد الجاهز؛ اكتبه يدويّاً.', 'Your book lacks an account this ready entry needs; write it by hand.');
        return;
      }
      _lines = filled;
      _memo.text = t.name;
      _adjusting = t.group == 'adjusting';
    });
  }

  Future<void> _attach(EvidenceSource source) async {
    final f = await (widget.pick ?? ((s) => pickEvidence(s)))(source);
    if (f == null) return;
    final problem = evidenceFileProblem(f);
    setState(() {
      if (problem != null) {
        _ok = false;
        _message = problem;
      } else {
        _file = f;
      }
    });
  }

  Future<void> _send(JournalContext c) async {
    if (_template != null) {
      for (final l in _lines) {
        l.amount = _amount.text;
      }
    }
    final problem = entryProblem(date: _date.text.trim(), memo: _memo.text, lines: _lines, accounts: c.accounts);
    if (problem != null) {
      setState(() {
        _ok = false;
        _message = problem;
      });
      return;
    }
    setState(() {
      _busy = true;
      _message = null;
    });
    try {
      // Stored once and kept with the entry until it is answered: a retry carries the same path with the same key.
      final file = _file;
      final attachment = await _receipt.forFile(
          file, () async => widget.api.storeReceipt(await (widget.sender ?? EvidenceSender()).attach('ledger', file!)));
      final (_, message) = await widget.api.submit({
        'book': c.bookId,
        'key': _key,
        'date': _date.text.trim(),
        'memo': _memo.text.trim(),
        'currency': _currency,
        'rate': _currency == 'SDG' ? _rate.text.trim() : '',
        'lines': [for (final l in _lines.where((l) => l.account.isNotEmpty || l.amount.trim().isNotEmpty)) l.toJson()],
        'template': ?_template?.key,
        'kind': _adjusting ? 'adjusting' : 'manual',
      }, attachment: attachment);
      _receipt.reset();
      if (!mounted) return;
      setState(() {
        _ok = true;
        _message = message;
        _key = newEntryKey();
        _file = null;
        _amount.clear();
        _rate.clear();
        _lineKeys++;
        _lines = _template != null ? (fillTemplate(_template!, c.accounts) ?? _lines) : [JournalLine(side: 'D'), JournalLine(side: 'C')];
      });
    } on ApiException catch (e) {
      // After an outage the stored receipt waits for the retry; a refusal removed it on the server.
      _receipt.settle(outage: isOutage(e));
      if (mounted) {
        setState(() {
          _ok = false;
          _message = e.message;
        });
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<JournalContext>(
      future: _future,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) return const LoadingView();
        if (snap.hasError) {
          final e = snap.error;
          return StateView.error(e is ApiException ? e.message : tr('تعذّر تحميل الدفتر.', 'Could not load the book.'),
              onRetry: () => setState(() {
        _future = _load(widget.book);
      }), scrollable: true);
        }
        final c = snap.data!;
        final book = c.book;
        if (book == null) {
          return StateView(
            icon: Icons.menu_book_outlined,
            title: tr('لا دفتر تكتب فيه بعد', 'No book to write in yet'),
            message: tr('يُفتح دفتر مزرعتك من الموقع أو بأوّل قيدٍ في أحد مواسمك.', 'Your farm book opens from the website or with the first entry in one of your seasons.'),
          );
        }
        final t = totalsOf(_template != null ? [for (final l in _lines) JournalLine(account: l.account, side: l.side, amount: _amount.text)] : _lines);
        final balanced = t.debit == t.credit && t.debit > 0;
        return ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
          children: [
            if (c.books.length > 1)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: DropdownButtonFormField<String>(
                  initialValue: book.id,
                  isExpanded: true,
                  decoration: InputDecoration(labelText: tr('الدفتر', 'Book')),
                  items: [for (final b in c.books) DropdownMenuItem(value: b.id, child: Text(b.label))],
                  onChanged: (v) => v == null || v == book.id ? null : _switchBook(v),
                ),
              ),
            Text(
              [
                book.label,
                if (book.closedThrough != null) tr('مقفل حتى ${book.closedThrough}', 'Closed through ${book.closedThrough}'),
                if (book.preparer) tr('أنت مُعِدّ: ما ترسله ينتظر اعتماد صاحب الدفتر', 'You are a preparer: what you send waits for the book owner\'s approval') else if (book.alwaysReview) tr('طلبت مراجعة كلّ قيد', 'You asked to review every entry'),
              ].join(' · '),
              style: TextStyle(color: mutedOn(context)),
            ),
            const SizedBox(height: 12),
            SectionTitle(tr('قيودٌ جاهزة', 'Ready entries'), subtitle: tr('نقرةٌ تملأ السطور، ثمّ اكتب المبلغ والبيان.', 'One tap fills the lines; then write the amount and the description.')),
            Wrap(spacing: 6, runSpacing: 6, children: [
              ChoiceChip(label: Text(tr('قيدٌ يدويّ', 'Manual entry')), selected: _template == null, onSelected: (_) => _pickTemplate(null, c)),
              for (final x in c.templates)
                ChoiceChip(label: Text(x.name), selected: _template?.key == x.key, onSelected: (_) => _pickTemplate(x, c)),
            ]),
            if (_template != null) ...[
              const SizedBox(height: 8),
              IntroNote(_template!.hint),
            ],
            const SizedBox(height: 16),
            TextField(
              controller: _date,
              keyboardType: TextInputType.datetime,
              decoration: InputDecoration(labelText: tr('التاريخ', 'Date'), hintText: 'YYYY-MM-DD'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _memo,
              maxLength: 500,
              decoration: InputDecoration(labelText: tr('البيان', 'Description'), hintText: tr('ماذا حدث، ولمن، ولماذا', 'What happened, with whom, and why')),
            ),
            SegmentedButton<String>(
              segments: [ButtonSegment(value: 'USD', label: Text(tr('دولار', 'USD'))), ButtonSegment(value: 'SDG', label: Text(tr('جنيه', 'SDG')))],
              selected: {_currency},
              onSelectionChanged: (s) => setState(() => _currency = s.first),
            ),
            if (_currency == 'SDG') ...[
              const SizedBox(height: 12),
              TextField(
                controller: _rate,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                inputFormatters: _figure,
                decoration: InputDecoration(labelText: tr('سعر الصرف (جنيه لكلّ دولار)', 'Exchange rate (pounds per dollar)'), helperText: tr('اتركه فارغاً لسعر السوق المنشور', 'Leave it empty for the published market rate')),
              ),
            ],
            if (_template == null)
              CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                value: _adjusting,
                onChanged: (v) => setState(() => _adjusting = v ?? false),
                title: Text(tr('قيد تسوية آخر الفترة', 'End-of-period adjusting entry')),
              ),
            const SizedBox(height: 12),
            SectionTitle(tr('السطور', 'Lines')),
            if (_template != null)
              TextField(
                controller: _amount,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                inputFormatters: _figure,
                onChanged: (_) => setState(() {}),
                decoration: InputDecoration(labelText: tr('المبلغ', 'Amount')),
              ),
            for (var i = 0; i < _lines.length; i++) _LineRow(
              key: ValueKey('line-$_lineKeys-$i'),
              index: i,
              line: _lines[i],
              accounts: _template?.lines.elementAtOrNull(i) != null
                  ? (_template!.lines[i].choose == null
                      ? c.accounts.where((a) => a.code == _lines[i].account).toList()
                      : choicesFor(c.accounts, _template!.lines[i].choose))
                  : c.accounts,
              fixed: _template != null,
              onChanged: () => setState(() {}),
              onRemove: _template == null && _lines.length > 2 ? () => setState(() {
                    _lines.removeAt(i);
                    _lineKeys++;
                  }) : null,
            ),
            if (_template == null)
              Align(
                alignment: AlignmentDirectional.centerStart,
                child: TextButton.icon(
                  onPressed: () => setState(() => _lines.add(JournalLine())),
                  icon: const Icon(Icons.add, size: 18),
                  label: Text(tr('أضف سطراً', 'Add a line')),
                ),
              ),
            const SizedBox(height: 6),
            Text(
              tr('المدين ${formatMinor(t.debit)} · الدائن ${formatMinor(t.credit)} · ${balanced ? 'متوازن' : 'الفرق ${formatMinor((t.debit - t.credit).abs())}'}', 'Debit ${formatMinor(t.debit)} · Credit ${formatMinor(t.credit)} · ${balanced ? 'Balanced' : 'Difference ${formatMinor((t.debit - t.credit).abs())}'}'),
              style: TextStyle(fontWeight: FontWeight.w700, color: balanced ? textGreenOn(context) : mutedOn(context)),
            ),
            const SizedBox(height: 16),
            SectionTitle(tr('المستند', 'Document'), subtitle: tr('صورة الإيصال أو الفاتورة، أو PDF حتى ١٠ ميجابايت.', 'A photo of the receipt or invoice, or a PDF up to 10 MB.')),
            if (_file != null)
              Row(children: [
                Icon(_file!.pdf ? Icons.picture_as_pdf_outlined : Icons.photo_outlined, size: 18),
                const SizedBox(width: 6),
                Expanded(child: Text(_file!.pdf ? (_file!.name.isEmpty ? tr('مستند PDF', 'PDF document') : _file!.name) : tr('صورةٌ مرفقة', 'An attached photo'))),
                TextButton(onPressed: () => setState(() => _file = null), child: Text(tr('أزله', 'Remove it'))),
              ])
            else
              Wrap(spacing: 8, runSpacing: 8, children: [
                OutlinedButton.icon(
                  onPressed: () => _attach(EvidenceSource.camera),
                  icon: const Icon(Icons.photo_camera_outlined, size: 18),
                  label: Text(tr('صوّر الإيصال', 'Photograph the receipt')),
                ),
                OutlinedButton.icon(
                  onPressed: () => _attach(EvidenceSource.gallery),
                  icon: const Icon(Icons.photo_library_outlined, size: 18),
                  label: Text(tr('من الصور', 'From photos')),
                ),
                OutlinedButton.icon(
                  onPressed: () => _attach(EvidenceSource.pdf),
                  icon: const Icon(Icons.picture_as_pdf_outlined, size: 18),
                  label: const Text('PDF'),
                ),
              ]),
            Text(tr('القيد بلا مستندٍ يُقبل، ويظهر في تقرير الاستثناءات.', 'An entry without a document is accepted, and shows in the exceptions report.'), style: TextStyle(color: mutedOn(context), fontSize: 12)),
            if (_message != null) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: _ok ? leafTintOn(context) : warnTintOn(context),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(_message!, style: TextStyle(color: _ok ? inkOn(context) : warnOn(context))),
              ),
            ],
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _busy ? null : () => _send(c),
              child: Text(_busy ? tr('يُرسَل…', 'Sending…') : (book.preparer ? tr('أرسله لاعتماد صاحب الدفتر', 'Send it for the owner\'s approval') : tr('رحِّل القيد', 'Post the entry'))),
            ),
          ],
        );
      },
    );
  }
}

class _LineRow extends StatefulWidget {
  const _LineRow({
    super.key,
    required this.index,
    required this.line,
    required this.accounts,
    required this.fixed,
    required this.onChanged,
    this.onRemove,
  });
  final int index;
  final JournalLine line;
  final List<AccountOption> accounts;

  /// A ready entry's line: its side and the shared amount are the template's.
  final bool fixed;
  final VoidCallback onChanged;
  final VoidCallback? onRemove;

  @override
  State<_LineRow> createState() => _LineRowState();
}

class _LineRowState extends State<_LineRow> {
  late final _amount = TextEditingController(text: widget.line.amount);

  @override
  void dispose() {
    _amount.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = widget.line;
    final known = widget.accounts.any((a) => a.code == l.account);
    return Container(
      margin: const EdgeInsets.only(top: 8),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        border: Border.all(color: Theme.of(context).dividerColor),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        DropdownButtonFormField<String>(
          initialValue: known ? l.account : null,
          isExpanded: true,
          decoration: InputDecoration(labelText: tr('حساب السطر ${widget.index + 1}', 'Account for line ${widget.index + 1}')),
          items: [for (final a in widget.accounts) DropdownMenuItem(value: a.code, child: Text(a.label, overflow: TextOverflow.ellipsis))],
          onChanged: widget.accounts.length <= 1 && widget.fixed
              ? null
              : (v) {
                  l.account = v ?? '';
                  widget.onChanged();
                },
        ),
        const SizedBox(height: 8),
        Row(children: [
          SegmentedButton<String>(
            segments: [ButtonSegment(value: 'D', label: Text(tr('مدين', 'Debit'))), ButtonSegment(value: 'C', label: Text(tr('دائن', 'Credit')))],
            selected: {l.side},
            onSelectionChanged: widget.fixed
                ? null
                : (s) {
                    setState(() => l.side = s.first);
                    widget.onChanged();
                  },
          ),
          const SizedBox(width: 8),
          if (!widget.fixed)
            Expanded(
              child: TextField(
                controller: _amount,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                inputFormatters: _figure,
                onChanged: (v) {
                  l.amount = v;
                  widget.onChanged();
                },
                decoration: InputDecoration(labelText: tr('مبلغ السطر ${widget.index + 1}', 'Amount for line ${widget.index + 1}')),
              ),
            ),
          if (widget.onRemove != null)
            IconButton(onPressed: widget.onRemove, tooltip: tr('احذف السطر', 'Remove line'), icon: const Icon(Icons.close)),
        ]),
      ]),
    );
  }
}
