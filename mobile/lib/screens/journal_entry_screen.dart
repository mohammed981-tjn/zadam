/// «قيدٌ جديد» (البند ٢٠٥): the website's /books/journal/new in the app — a journal entry of several debit and credit
/// lines from the book's own accounts, a description, a date and a document (a photo of the receipt or a PDF), written by
/// hand or from a ready entry (one tap fills the lines). The owner's entry posts at once; a preparer's waits for the
/// owner. What the website refuses, the app shows in its words, and keeps everything typed.
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api.dart';
import '../evidence.dart';
import '../journal.dart';
import '../theme.dart';
import '../ui.dart';
import 'evidence_sheet.dart';
import 'seasons_screen.dart';

final _figure = [FilteringTextInputFormatter.allow(RegExp(r'[0-9٠-٩.,٬٫]'))];

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
      appBar: AppBar(title: const Text('قيدٌ جديد')),
      body: RequireSignIn(
        what: 'دفترك',
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
        _message = 'في دفترك حسابٌ ينقص هذا القيد الجاهز؛ اكتبه يدويّاً.';
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
      final attachment = _file == null ? null : await (widget.sender ?? EvidenceSender()).attach('ledger', _file!);
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
          return StateView.error(e is ApiException ? e.message : 'تعذّر تحميل الدفتر.',
              onRetry: () => setState(() {
        _future = _load(widget.book);
      }), scrollable: true);
        }
        final c = snap.data!;
        final book = c.book;
        if (book == null) {
          return const StateView(
            icon: Icons.menu_book_outlined,
            title: 'لا دفتر تكتب فيه بعد',
            message: 'يُفتح دفتر مزرعتك من الموقع أو بأوّل قيدٍ في أحد مواسمك.',
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
                  decoration: const InputDecoration(labelText: 'الدفتر'),
                  items: [for (final b in c.books) DropdownMenuItem(value: b.id, child: Text(b.label))],
                  onChanged: (v) => v == null || v == book.id ? null : _switchBook(v),
                ),
              ),
            Text(
              [
                book.label,
                if (book.closedThrough != null) 'مقفل حتى ${book.closedThrough}',
                if (book.preparer) 'أنت مُعِدّ: ما ترسله ينتظر اعتماد صاحب الدفتر' else if (book.alwaysReview) 'طلبت مراجعة كلّ قيد',
              ].join(' · '),
              style: TextStyle(color: mutedOn(context)),
            ),
            const SizedBox(height: 12),
            const SectionTitle('قيودٌ جاهزة', subtitle: 'نقرةٌ تملأ السطور، ثمّ اكتب المبلغ والبيان.'),
            Wrap(spacing: 6, runSpacing: 6, children: [
              ChoiceChip(label: const Text('قيدٌ يدويّ'), selected: _template == null, onSelected: (_) => _pickTemplate(null, c)),
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
              decoration: const InputDecoration(labelText: 'التاريخ', hintText: 'YYYY-MM-DD'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _memo,
              maxLength: 500,
              decoration: const InputDecoration(labelText: 'البيان', hintText: 'ماذا حدث، ولمن، ولماذا'),
            ),
            SegmentedButton<String>(
              segments: const [ButtonSegment(value: 'USD', label: Text('دولار')), ButtonSegment(value: 'SDG', label: Text('جنيه'))],
              selected: {_currency},
              onSelectionChanged: (s) => setState(() => _currency = s.first),
            ),
            if (_currency == 'SDG') ...[
              const SizedBox(height: 12),
              TextField(
                controller: _rate,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                inputFormatters: _figure,
                decoration: const InputDecoration(labelText: 'سعر الصرف (جنيه لكلّ دولار)', helperText: 'اتركه فارغاً لسعر السوق المنشور'),
              ),
            ],
            if (_template == null)
              CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                value: _adjusting,
                onChanged: (v) => setState(() => _adjusting = v ?? false),
                title: const Text('قيد تسوية آخر الفترة'),
              ),
            const SizedBox(height: 12),
            const SectionTitle('السطور'),
            if (_template != null)
              TextField(
                controller: _amount,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                inputFormatters: _figure,
                onChanged: (_) => setState(() {}),
                decoration: const InputDecoration(labelText: 'المبلغ'),
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
                  label: const Text('أضف سطراً'),
                ),
              ),
            const SizedBox(height: 6),
            Text(
              'المدين ${formatMinor(t.debit)} · الدائن ${formatMinor(t.credit)} · ${balanced ? 'متوازن' : 'الفرق ${formatMinor((t.debit - t.credit).abs())}'}',
              style: TextStyle(fontWeight: FontWeight.w700, color: balanced ? textGreenOn(context) : mutedOn(context)),
            ),
            const SizedBox(height: 16),
            const SectionTitle('المستند', subtitle: 'صورة الإيصال أو الفاتورة، أو PDF حتى ١٠ ميجابايت.'),
            if (_file != null)
              Row(children: [
                Icon(_file!.pdf ? Icons.picture_as_pdf_outlined : Icons.photo_outlined, size: 18),
                const SizedBox(width: 6),
                Expanded(child: Text(_file!.pdf ? (_file!.name.isEmpty ? 'مستند PDF' : _file!.name) : 'صورةٌ مرفقة')),
                TextButton(onPressed: () => setState(() => _file = null), child: const Text('أزله')),
              ])
            else
              Wrap(spacing: 8, runSpacing: 8, children: [
                OutlinedButton.icon(
                  onPressed: () => _attach(EvidenceSource.camera),
                  icon: const Icon(Icons.photo_camera_outlined, size: 18),
                  label: const Text('صوّر الإيصال'),
                ),
                OutlinedButton.icon(
                  onPressed: () => _attach(EvidenceSource.gallery),
                  icon: const Icon(Icons.photo_library_outlined, size: 18),
                  label: const Text('من الصور'),
                ),
                OutlinedButton.icon(
                  onPressed: () => _attach(EvidenceSource.pdf),
                  icon: const Icon(Icons.picture_as_pdf_outlined, size: 18),
                  label: const Text('PDF'),
                ),
              ]),
            Text('القيد بلا مستندٍ يُقبل، ويظهر في تقرير الاستثناءات.', style: TextStyle(color: mutedOn(context), fontSize: 12)),
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
              child: Text(_busy ? 'يُرسَل…' : (book.preparer ? 'أرسله لاعتماد صاحب الدفتر' : 'رحِّل القيد')),
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
          decoration: InputDecoration(labelText: 'حساب السطر ${widget.index + 1}'),
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
            segments: const [ButtonSegment(value: 'D', label: Text('مدين')), ButtonSegment(value: 'C', label: Text('دائن'))],
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
                decoration: InputDecoration(labelText: 'مبلغ السطر ${widget.index + 1}'),
              ),
            ),
          if (widget.onRemove != null)
            IconButton(onPressed: widget.onRemove, tooltip: 'احذف السطر', icon: const Icon(Icons.close)),
        ]),
      ]),
    );
  }
}
