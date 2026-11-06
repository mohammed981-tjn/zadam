/// «القوائم الماليّة» (البند ٢٠٥): the website's /books/statements inside the app — the period and what it is compared
/// with, the three statements in two columns, the ageing of what is owed, the budget against actual for each season,
/// the statement of changes in equity, the notes, the fingerprint of the figures — and «حمّل PDF», which fetches the
/// same bundle the website gives with the app's own session and saves it where the person chooses.
library;

import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api.dart';
import '../i18n.dart';
import '../statements.dart';
import '../theme.dart';
import '../ui.dart';
import 'account_screen.dart';
import 'seasons_screen.dart';

/// Where the PDF goes once fetched. The phone's own save dialog by default (file_picker, already in the app); tests
/// pass their own. Returns where it was saved, or null when the person cancelled.
typedef SavePdf = Future<Uri?> Function(StatementsPdf pdf);

Future<Uri?> savePdfWithDialog(StatementsPdf pdf) => FilePicker.saveFile(
      fileName: pdf.fileName,
      bytes: Uint8List.fromList(pdf.bytes),
      mimeType: 'application/pdf',
      dialogTitle: tr('احفظ القوائم الماليّة', 'Save the financial statements'),
    );

class StatementsScreen extends StatelessWidget {
  const StatementsScreen({super.key, this.api, this.book, this.save});

  /// For tests; the app's own client otherwise.
  final StatementsApi? api;

  /// The book asked for on the books screen (`farm` or `investor`); the reader's own farm book otherwise.
  final String? book;
  final SavePdf? save;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(tr('القوائم الماليّة', 'Financial statements'))),
      body: RequireSignIn(
        what: tr('قوائمك الماليّة', 'your financial statements'),
        builder: (_) => _StatementsBody(api: api ?? StatementsApi(), book: book, save: save ?? savePdfWithDialog),
      ),
    );
  }
}

class _StatementsBody extends StatefulWidget {
  const _StatementsBody({required this.api, required this.book, required this.save});
  final StatementsApi api;
  final String? book;
  final SavePdf save;

  @override
  State<_StatementsBody> createState() => _StatementsBodyState();
}

class _StatementsBodyState extends State<_StatementsBody> {
  late StatementsQuery _q = StatementsQuery(book: widget.book);
  late Future<StatementsView> _future = widget.api.load(_q);
  bool _downloading = false;

  void _go(StatementsQuery q) => setState(() {
        _q = q;
        _future = widget.api.load(q);
      });

  void _say(String m) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));

  Future<void> _download(StatementsView v) async {
    setState(() => _downloading = true);
    try {
      final pdf = await widget.api.pdf(v.pdfPath);
      final where = await widget.save(pdf);
      if (!mounted) return;
      if (where == null) {
        _say(tr('لم يُحفظ الملفّ.', 'The file was not saved.'));
      } else {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(tr('حُفظت الحزمة: ${pdf.fileName}', 'The bundle was saved: ${pdf.fileName}')),
          action: SnackBarAction(
            label: tr('افتحها', 'Open it'),
            onPressed: () => launchUrl(where, mode: LaunchMode.externalApplication),
          ),
        ));
      }
    } on ApiException catch (e) {
      if (mounted) _say(e.message);
    } catch (_) {
      if (mounted) _say(tr('تعذّر حفظ الملفّ على الهاتف.', 'Could not save the file on the phone.'));
    } finally {
      if (mounted) setState(() => _downloading = false);
    }
  }

  /// The last 24 months, newest first, as `YYYY-MM`.
  List<String> _months(String today) {
    final d = DateTime.tryParse(today) ?? DateTime.now();
    return [
      for (var i = 0; i < 24; i++)
        () {
          final m = DateTime(d.year, d.month - i);
          return '${m.year}-${m.month.toString().padLeft(2, '0')}';
        }(),
    ];
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<StatementsView>(
      future: _future,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) return const LoadingView();
        if (snap.hasError) {
          final e = snap.error;
          return StateView.error(e is ApiException ? e.message : tr('تعذّر تحميل القوائم.', 'Could not load the statements.'), onRetry: () => _go(_q), scrollable: true);
        }
        final v = snap.data!;
        final thisYear = int.tryParse(v.today.substring(0, 4)) ?? DateTime.now().year;
        return RefreshIndicator(
          onRefresh: () async => _go(_q),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
            children: [
              FadeIn(
                child: HeroBand(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(v.heading, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
                    if (v.ownerName != null) Text(v.ownerName!, style: TextStyle(color: mutedOn(context))),
                    const SizedBox(height: 4),
                    Text(v.period, style: const TextStyle(fontWeight: FontWeight.w700)),
                    if (v.previousPeriod != null)
                      Text(tr('مقارنةً بـ ${v.previousPeriod}', 'Compared with ${v.previousPeriod}'), style: TextStyle(color: mutedOn(context), fontSize: 12)),
                    const SizedBox(height: 6),
                    Text(tr('كلّ المبالغ بالدولار · حسابات إداريّة، لا قوائم قانونيّة مدقَّقة.', 'All amounts in dollars · management accounts, not audited statutory statements.'),
                        style: TextStyle(color: mutedOn(context), fontSize: 12)),
                  ]),
                ),
              ),
              const SizedBox(height: 10),
              SegmentedButton<String>(
                segments: [
                  ButtonSegment(value: 'year', label: Text(tr('سنة', 'A year'))),
                  ButtonSegment(value: 'month', label: Text(tr('شهر', 'A month'))),
                  if (v.seasons.isNotEmpty) ButtonSegment(value: 'season', label: Text(tr('موسم', 'A season'))),
                ],
                selected: {v.basis},
                onSelectionChanged: (s) => _go(_q.copyWith(
                  basis: s.first,
                  season: s.first == 'season' ? (v.season ?? (v.seasons.isEmpty ? null : v.seasons.first.id)) : null,
                )),
              ),
              const SizedBox(height: 8),
              Wrap(spacing: 8, runSpacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [
                if (v.basis == 'year')
                  DropdownButton<int>(
                    value: v.year,
                    items: [for (var y = thisYear; y >= thisYear - 5; y--) DropdownMenuItem(value: y, child: Text('$y'))],
                    onChanged: (y) => _go(_q.copyWith(year: y)),
                  ),
                if (v.basis == 'month')
                  DropdownButton<String>(
                    value: _months(v.today).contains(v.month) ? v.month : null,
                    items: [for (final m in _months(v.today)) DropdownMenuItem(value: m, child: Text(m, textDirection: TextDirection.ltr))],
                    onChanged: (m) => _go(_q.copyWith(month: m)),
                  ),
                if (v.basis == 'season' && v.seasons.isNotEmpty)
                  DropdownButton<String>(
                    value: v.seasons.any((s) => s.id == v.season) ? v.season : v.seasons.first.id,
                    items: [for (final s in v.seasons) DropdownMenuItem(value: s.id, child: Text('${s.name} (${s.plantingDate})'))],
                    onChanged: (id) => _go(_q.copyWith(season: id)),
                  ),
                FilterChip(
                  label: Text(tr('قارن بالفترة السابقة', 'Compare with the previous period')),
                  selected: v.compare,
                  onSelected: (on) => _go(_q.copyWith(compare: on)),
                ),
              ]),
              const SizedBox(height: 8),
              FilledButton.icon(
                onPressed: _downloading ? null : () => _download(v),
                icon: _downloading
                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.picture_as_pdf_outlined),
                label: Text(tr('حمّل PDF', 'Download PDF')),
              ),
              const SizedBox(height: 14),
              _Statement(
                title: tr('قائمة الدخل', 'Income statement'),
                compare: v.hasPrevious,
                blocks: [
                  (tr('الإيراد', 'Revenue'), v.revenue, (tr('مجموع الإيراد', 'Total revenue'), v.totalRevenue)),
                  (tr('المصروف', 'Expense'), v.expense, (tr('مجموع المصروف', 'Total expense'), v.totalExpense)),
                ],
                foot: (tr('صافي الدخل', 'Net income'), v.netIncome),
              ),
              _Statement(
                title: tr('الميزانيّة', 'Balance sheet'),
                sub: tr('في ${v.to}${v.previousTo != null ? ' مقارنةً بـ ${v.previousTo}' : ''}', 'On ${v.to}${v.previousTo != null ? ' compared with ${v.previousTo}' : ''}'),
                compare: v.hasPrevious,
                verdict: _Verdict(ok: v.balanced, good: tr('متوازنة: الأصول = الالتزامات + الملكيّة', 'Balanced: assets equal liabilities plus equity'), bad: tr('غير متوازنة — أبلغ الإدارة', 'Not balanced — tell the administrators')),
                blocks: [
                  (tr('الأصول', 'Assets'), v.assets, (tr('مجموع الأصول', 'Total assets'), v.totalAssets)),
                  (tr('الالتزامات', 'Liabilities'), v.liabilities, (tr('مجموع الالتزامات', 'Total liabilities'), v.totalLiabilities)),
                  (tr('حقوق الملكيّة', 'Equity'), v.equity, (tr('مجموع الملكيّة', 'Total equity'), v.totalEquity)),
                ],
              ),
              _Statement(
                title: tr('التدفّقات النقديّة', 'Cash flow'),
                compare: v.hasPrevious,
                verdict: _Verdict(ok: v.cashTies, good: tr('النقد أوّل الفترة + الحركة = النقد آخرها', 'Opening cash plus the movement equals closing cash'), bad: tr('لا يتطابق النقد — أبلغ الإدارة', 'Cash does not tie — tell the administrators')),
                blocks: [for (final (t, lines, total) in v.cashSections) (t, lines, (tr('الصافي', 'Left with'), total))],
                lead: (tr('النقد أوّل الفترة', 'Cash at the start'), v.cashOpening),
                foot: (tr('النقد آخر الفترة', 'Cash at the end'), v.cashClosing),
              ),
              _Card(
                title: tr('قائمة التغيّر في حقوق الملكيّة', 'Statement of changes in equity'),
                sub: '${v.from} — ${v.to}',
                children: [
                  for (final (line, name, amount) in v.equityRows)
                    _FigureRow(label: name, cells: [usd(amount)], bold: line == 'opening' || line == 'closing'),
                  const SizedBox(height: 6),
                  _Verdict(ok: v.equityCloses, good: tr('الملكيّة آخر الفترة = مجموع الملكيّة في الميزانيّة', 'Closing equity equals the balance sheet\'s equity'), bad: tr('لا تطابق الميزانيّة — أبلغ الإدارة', 'Does not agree with the balance sheet — tell the administrators')),
                ],
              ),
              _Card(
                title: tr('أعمار الذمم', 'Ageing of what is owed'),
                sub: tr('في ${v.ageingAsOf} · العمر من يوم القيد؛ سداد القيد الآجل يُطرح منه، وغيره من الأقدم.', 'On ${v.ageingAsOf} · age from the entry\'s date; a payment of a credit entry is taken off it, and others off the oldest.'),
                children: [
                  _AgeingBlock(title: tr('لك على غيرك', 'Owed to you'), side: v.receivable),
                  const Divider(),
                  _AgeingBlock(title: tr('عليك لغيرك', 'You owe'), side: v.payable),
                ],
              ),
              for (final s in v.budget)
                _Card(
                  title: tr('الميزانيّة مقابل الفعليّ · ${s.name}', 'Budget against actual · ${s.name}'),
                  children: [
                    _FigureRow(label: tr('المرحلة', 'Stage'), cells: [tr('الخطّة', 'The plan'), tr('الفعليّ', 'Actual'), tr('الباقي', 'Left')], header: true),
                    for (final st in s.stages)
                      _FigureRow(label: '${st.name} · ${percent(st.usedPct, sign: false)}', cells: [usd(st.budget), usd(st.actual), usd(st.variance)], warnLast: st.variance < 0),
                    _FigureRow(label: tr('مجموع الموسم · ${percent(s.usedPct, sign: false)}', 'Season total · ${percent(s.usedPct, sign: false)}'), cells: [usd(s.budget), usd(s.actual), usd(s.variance)], bold: true, warnLast: s.variance < 0),
                  ],
                ),
              _Card(
                title: tr('إيضاحات', 'Notes'),
                children: [
                  for (final (i, (title, body)) in v.notes.indexed)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: Text.rich(TextSpan(children: [
                        TextSpan(text: '${i + 1}. $title. ', style: const TextStyle(fontWeight: FontWeight.w800)),
                        TextSpan(text: body),
                      ]), style: const TextStyle(height: 1.6, fontSize: 13)),
                    ),
                ],
              ),
              _Card(
                title: tr('بصمة الأرقام', 'Fingerprint of the figures'),
                children: [
                  SelectableText('SHA-256 ${v.fingerprintGroups}',
                      textDirection: TextDirection.ltr, style: const TextStyle(fontFamily: 'monospace', fontSize: 12)),
                  const SizedBox(height: 6),
                  Text(
                    tr('هي نفسها المطبوعة في كلّ صفحةٍ من الحزمة PDF لهذه الفترة: إن تطابقت فأرقام الورق هي أرقام الدفتر الآن.', 'It is the same one printed on every page of the PDF bundle for this period: if they match, the figures on paper are the book\'s figures now.'),
                    style: TextStyle(color: mutedOn(context), fontSize: 12, height: 1.6),
                  ),
                ],
              ),
              Align(
                alignment: AlignmentDirectional.centerStart,
                child: TextButton.icon(
                  onPressed: () => openOnSite(context, '/books/statements${_q.query}'),
                  icon: const Icon(Icons.open_in_new, size: 18),
                  label: Text(tr('افتحها على الموقع', 'Open them on the website')),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({required this.title, this.sub, required this.children});
  final String title;
  final String? sub;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(title, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: textGreenOn(context))),
          if (sub != null) Text(sub!, style: TextStyle(color: mutedOn(context), fontSize: 12, height: 1.5)),
          const SizedBox(height: 8),
          ...children,
        ]),
      ),
    );
  }
}

/// A statement with its sections. With a comparison, each line shows this period, the previous, and the change.
class _Statement extends StatelessWidget {
  const _Statement({required this.title, this.sub, required this.compare, required this.blocks, this.lead, this.foot, this.verdict});
  final String title;
  final String? sub;
  final bool compare;
  final List<(String, List<StatementLine>, (String, Figure))> blocks;
  final (String, Figure)? lead;
  final (String, Figure)? foot;
  final Widget? verdict;

  List<String> _cells(Figure f) => compare ? [usd(f.current), f.previous == null ? '—' : usd(f.previous!), signed(f.change)] : [usd(f.current)];

  @override
  Widget build(BuildContext context) {
    Widget row(String label, Figure f, {bool bold = false}) =>
        _FigureRow(label: compare && f.pct != null ? '$label · ${percent(f.pct)}' : label, cells: _cells(f), bold: bold);
    return _Card(title: title, sub: sub, children: [
      ?verdict,
      _FigureRow(label: tr('البند', 'Item'), cells: compare ? [tr('هذه', 'This'), tr('السابقة', 'Earlier'), tr('التغيّر', 'Change')] : [tr('المبلغ', 'Amount')], header: true),
      if (lead != null) row(lead!.$1, lead!.$2),
      for (final (name, lines, (totalLabel, total)) in blocks) ...[
        Padding(
          padding: const EdgeInsets.only(top: 6),
          child: Text(name, style: const TextStyle(fontWeight: FontWeight.w800)),
        ),
        for (final l in lines) row(l.computed ? l.name : '${l.code} · ${l.name}', l.v),
        row(totalLabel, total, bold: true),
      ],
      if (foot != null) ...[const Divider(), row(foot!.$1, foot!.$2, bold: true)],
    ]);
  }
}

class _FigureRow extends StatelessWidget {
  const _FigureRow({required this.label, required this.cells, this.bold = false, this.header = false, this.warnLast = false});
  final String label;
  final List<String> cells;
  final bool bold;
  final bool header;
  final bool warnLast;

  @override
  Widget build(BuildContext context) {
    final style = TextStyle(
      fontWeight: bold || header ? FontWeight.w800 : FontWeight.w500,
      color: header ? mutedOn(context) : null,
      fontSize: header ? 11.5 : 12.5,
      height: 1.4,
    );
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Expanded(flex: 5, child: Text(label, style: style)),
        for (final (i, c) in cells.indexed)
          Expanded(
            flex: 3,
            child: Text(
              c,
              textAlign: TextAlign.end,
              textDirection: TextDirection.ltr,
              style: style.copyWith(
                fontFeatures: const [FontFeature.tabularFigures()],
                color: warnLast && i == cells.length - 1 ? warnOn(context) : style.color,
              ),
            ),
          ),
      ]),
    );
  }
}

class _AgeingBlock extends StatelessWidget {
  const _AgeingBlock({required this.title, required this.side});
  final String title;
  final AgeingSide side;

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Text('$title: ${usd(side.total)}', style: const TextStyle(fontWeight: FontWeight.w800)),
      if (side.accounts.isEmpty)
        Text(tr('لا شيء.', 'Nothing.'), style: TextStyle(color: mutedOn(context)))
      else ...[
        for (final k in side.keys)
          _FigureRow(label: bucketLabels[k] ?? k, cells: [usd(side.buckets[k] ?? 0)], warnLast: k == '90_plus' && (side.buckets[k] ?? 0) > 0),
        const SizedBox(height: 4),
        for (final a in side.accounts)
          Text(tr('${a.code} · ${a.name}: ${usd(a.total)} (${a.items} بنداً)', '${a.code} · ${a.name}: ${usd(a.total)} (${a.items} items)'), style: TextStyle(color: mutedOn(context), fontSize: 12)),
      ],
    ]);
  }
}

class _Verdict extends StatelessWidget {
  const _Verdict({required this.ok, required this.good, required this.bad});
  final bool ok;
  final String good;
  final String bad;

  @override
  Widget build(BuildContext context) {
    final c = ok ? textGreenOn(context) : warnOn(context);
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(color: ok ? leafTintOn(context) : warnTintOn(context), borderRadius: BorderRadius.circular(10)),
      child: Row(children: [
        Icon(ok ? Icons.check_circle_outline : Icons.warning_amber_rounded, color: c, size: 18),
        const SizedBox(width: 6),
        Expanded(child: Text(ok ? good : bad, style: TextStyle(color: c, fontWeight: FontWeight.w700, fontSize: 12.5))),
      ]),
    );
  }
}
