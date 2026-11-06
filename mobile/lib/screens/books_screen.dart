/// «دفتر الحسابات» (البند ٢٠٣): the website's /books inside the app — the farm book and the investor book with their
/// eight tabs (trial balance, income, balance sheet, cash flow, season profit, journal, chart of accounts with each
/// account's statement, and the partner's proposals with the website's answers), and the fixed assets with their
/// depreciation (/books/assets).
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api.dart';
import '../books.dart';
import '../i18n.dart';
import '../theme.dart';
import '../ui.dart';
import 'account_screen.dart';
import 'books_review_screen.dart';
import 'season_screen.dart';
import 'seasons_screen.dart';
import 'statements_screen.dart';

class BooksScreen extends StatelessWidget {
  const BooksScreen({super.key, this.api});

  /// For tests; the app's own client otherwise.
  final BooksApi? api;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(tr('دفتر الحسابات', 'Ledger'))),
      body: RequireSignIn(what: tr('دفترك', 'your book'), builder: (_) => _BooksBody(api: api ?? BooksApi())),
    );
  }
}

class _BooksBody extends StatefulWidget {
  const _BooksBody({required this.api});
  final BooksApi api;

  @override
  State<_BooksBody> createState() => _BooksBodyState();
}

class _BooksBodyState extends State<_BooksBody> {
  BooksQuery _q = const BooksQuery();
  late Future<BooksView> _future = widget.api.load(_q);

  void _go(BooksQuery q) => setState(() {
        _q = q;
        _future = widget.api.load(q);
      });

  void _reload() => _go(_q);

  void _say(String m) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));

  Future<String?> _pickDate(String current, String today) async {
    final init = DateTime.tryParse(current) ?? DateTime.now();
    final last = DateTime.tryParse(today) ?? DateTime.now();
    final d = await showDatePicker(
      context: context,
      initialDate: init.isAfter(last) ? last : init,
      firstDate: DateTime(2000),
      lastDate: last.add(const Duration(days: 366)),
    );
    if (d == null) return null;
    String p(int n) => n.toString().padLeft(2, '0');
    return '${d.year}-${p(d.month)}-${p(d.day)}';
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<BooksView>(
      future: _future,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) return const LoadingView();
        if (snap.hasError) {
          final e = snap.error;
          return StateView.error(e is ApiException ? e.message : tr('تعذّر تحميل الدفتر.', 'Could not load the book.'), onRetry: _reload, scrollable: true);
        }
        final v = snap.data!;
        return RefreshIndicator(
          onRefresh: () async => _reload(),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
            children: [
              FadeIn(
                child: HeroBand(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(v.book?.heading ?? tr('لم يُفتح لك دفتر بعد', 'No book opened for you yet'),
                        style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
                    const SizedBox(height: 4),
                    Text(
                      [
                        tr('كلّ المبالغ بالدولار', 'all amounts in US dollars'),
                        if (v.book?.closedThrough != null) tr('مقفل حتى ${v.book!.closedThrough}', 'Closed through ${v.book!.closedThrough}'),
                      ].join(' · '),
                      style: TextStyle(color: mutedOn(context)),
                    ),
                    const SizedBox(height: 6),
                    Text(tr('حسابات إداريّة تساعدك على المتابعة، وليست قوائم قانونيّة مدقَّقة.', 'Management accounts to help you keep track — not audited statutory statements.'),
                        style: TextStyle(color: mutedOn(context), fontSize: 12)),
                  ]),
                ),
              ),
              const SizedBox(height: 10),
              if (v.kinds.length > 1)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: SegmentedButton<String>(
                    segments: [for (final k in v.kinds) ButtonSegment(value: k, label: Text(bookKindLabel(k)))],
                    selected: {v.book?.kind ?? v.kinds.first},
                    onSelectionChanged: (s) => _go(BooksQuery(report: _q.report == 'account' ? 'chart' : _q.report, book: s.first)),
                  ),
                ),
              Wrap(spacing: 8, runSpacing: 8, children: [
                FilledButton.icon(
                  onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const JournalHubScreen())).then((_) => _reload()),
                  icon: const Icon(Icons.edit_note_outlined, size: 18),
                  label: Text(tr('القيود والمراجعة', 'Entries and review')),
                ),
                if (v.book != null)
                  OutlinedButton.icon(
                    onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => StatementsScreen(book: _q.book))),
                    icon: const Icon(Icons.picture_as_pdf_outlined, size: 18),
                    label: Text(tr('القوائم الماليّة', 'Financial statements')),
                  ),
                OutlinedButton.icon(
                  onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => AssetsScreen(api: widget.api))),
                  icon: const Icon(Icons.agriculture_outlined, size: 18),
                  label: Text(tr('الأصول الثابتة', 'Fixed assets')),
                ),
                OutlinedButton.icon(
                  onPressed: () => openOnSite(context, '/books/fees'),
                  icon: const Icon(Icons.open_in_new, size: 18),
                  label: Text(v.feesWaiting > 0 ? tr('رسوم المنصّة (${v.feesWaiting})', 'Platform fees (${v.feesWaiting})') : tr('رسوم المنصّة', 'Platform fees')),
                ),
                if (v.book != null && v.book!.owned)
                  OutlinedButton.icon(
                    onPressed: () => openOnSite(context, '/books/reconcile${v.book!.kind == 'investor' ? '?book=investor' : ''}'),
                    icon: const Icon(Icons.open_in_new, size: 18),
                    label: Text(tr('مطابقة الكشف', 'Match a statement')),
                  ),
              ]),
              const SizedBox(height: 10),
              SizedBox(
                height: 44,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  children: [
                    for (final (key, label) in bookReports)
                      Padding(
                        padding: const EdgeInsetsDirectional.only(end: 6),
                        child: ChoiceChip(
                          label: Text(key == 'links' && v.waitingForMe > 0 ? '$label (${v.waitingForMe})' : label),
                          selected: v.report == key || (v.report == 'account' && key == 'chart'),
                          onSelected: (_) => _go(BooksQuery(report: key, book: _q.book, from: _q.from, to: _q.to, asOf: _q.asOf)),
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 8),
              if (v.book != null || v.report == 'links') _dates(v),
              if (v.data == null && v.message != null) ...[
                StateView(icon: Icons.menu_book_outlined, title: tr('لا دفتر بعد', 'No book yet'), message: v.message, compact: true),
                Center(
                  child: FilledButton(
                    onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const SeasonsScreen())),
                    child: Text(tr('مواسمي', 'My seasons')),
                  ),
                ),
              ],
              if (v.data != null) FadeIn(child: _report(v, v.data!)),
            ],
          ),
        );
      },
    );
  }

  Widget _dates(BooksView v) {
    final dates = datesOf(v.report);
    if (dates == ReportDates.none) return const SizedBox.shrink();
    Widget chip(String label, String value, void Function(String) set) => ActionChip(
          avatar: const Icon(Icons.event, size: 18),
          label: Text('$label $value'),
          onPressed: () async {
            final d = await _pickDate(value, v.today);
            if (d != null) set(d);
          },
        );
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Wrap(spacing: 8, runSpacing: 8, children: [
        if (dates == ReportDates.period) ...[
          chip(tr('من', 'From'), v.from, (d) => _go(BooksQuery(report: v.report, book: _q.book, from: d, to: v.to, account: _q.account))),
          chip(tr('إلى', 'To'), v.to, (d) => _go(BooksQuery(report: v.report, book: _q.book, from: v.from, to: d, account: _q.account))),
        ] else
          chip(tr('حتى يوم', 'As of'), v.asOf, (d) => _go(BooksQuery(report: v.report, book: _q.book, asOf: d))),
      ]),
    );
  }

  Widget _report(BooksView v, BookReport r) {
    return switch (r) {
      TrialReport() => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          _Verdict(ok: r.balanced, good: tr('الميزان متوازن: المدين = الدائن', 'Balanced: debits equal credits'), bad: tr('الميزان غير متوازن — أبلغ الإدارة', 'Not balanced — tell the administrators')),
          _Table(
            head: [tr('الحساب', 'Account'), tr('مدين', 'Debit'), tr('دائن', 'Credit')],
            rows: [
              for (final l in r.rows) ['${l.code} · ${l.name}', l.debit, l.credit],
            ],
            foot: [tr('المجموع', 'Total'), r.totalDebit, r.totalCredit],
          ),
          if (r.memo.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(tr('حسابات إحصائيّة (خارج الميزانيّة)', 'Statistical accounts (off balance sheet)'), style: TextStyle(fontWeight: FontWeight.w800)),
            _Table(head: [tr('الحساب', 'Account'), tr('مدين', 'Debit'), tr('دائن', 'Credit')], rows: [
              for (final l in r.memo) ['${l.code} · ${l.name}', l.debit, l.credit],
            ]),
          ],
        ]),
      IncomeReport() => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          _Table(rows: [
            for (final l in r.revenue) ['${l.code} · ${l.name}', l.amount],
          ], title: tr('الإيرادات', 'Revenue'), foot: [tr('مجموع الإيراد', 'Total revenue'), r.totalRevenue]),
          _Table(rows: [
            for (final l in r.expense) ['${l.code} · ${l.name}', l.amount],
          ], title: tr('التكاليف والمصروفات', 'Costs and expenses'), foot: [tr('مجموع المصروف', 'Total expense'), r.totalExpense]),
          _Table(rows: const [], foot: [tr('صافي الدخل', 'Net income'), r.netIncome]),
          _note(tr('تكلفة المواسم الجارية تُرسمل (حساب ٥٩٠٠ سالب) فلا تظهر مصروفاً حتى يُقفل الموسم وتصير «تكلفة المحصول المباع».', 'The cost of seasons still running is capitalised (account 5900, negative), so it shows as an expense only once the season closes and becomes the cost of the crop sold.')),
        ]),
      BalanceReport() => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          _Verdict(
            ok: r.balanced,
            good: tr('الميزانيّة متوازنة: الأصول = الالتزامات + الملكيّة', 'Balanced: assets equal liabilities plus equity'),
            bad: tr('الميزانيّة غير متوازنة — أبلغ الإدارة', 'Not balanced — tell the administrators'),
          ),
          _Table(title: tr('الأصول', 'Assets'), rows: [for (final l in r.assets) ['${l.code} · ${l.name}', l.amount]], foot: [tr('مجموع الأصول', 'Total assets'), r.totalAssets]),
          _Table(
            title: tr('الالتزامات', 'Liabilities'),
            rows: [for (final l in r.liabilities) ['${l.code} · ${l.name}', l.amount]],
            foot: [tr('مجموع الالتزامات', 'Total liabilities'), r.totalLiabilities],
          ),
          _Table(
            title: tr('الملكيّة', 'Equity'),
            rows: [
              for (final l in r.equity) ['${l.code} · ${l.name}', l.amount],
              if (r.retainedIncome != null) [tr('أرباح السنوات السابقة (محتجزة)', 'Earnings of earlier years (retained)'), r.retainedIncome!],
              [r.currentIncomeLabel, r.currentIncome],
            ],
            foot: [tr('مجموع الملكيّة', 'Total equity'), r.totalEquity],
          ),
          _Table(rows: const [], foot: [tr('الالتزامات + الملكيّة', 'Liabilities + equity'), r.totalLiabilitiesEquity]),
        ]),
      CashReport() => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          _Verdict(
            ok: r.ties,
            good: tr('الحركة تطابق رصيد النقد: أوّل الفترة + الحركة = آخرها', 'The movement matches the cash balance: opening + movement = closing'),
            bad: tr('الحركة لا تطابق رصيد النقد — أبلغ الإدارة', 'The movement does not match the cash balance — tell the administrators'),
          ),
          _Table(rows: const [], foot: [tr('رصيد النقد أوّل الفترة', 'Cash at the start'), r.opening]),
          for (final (title, rows, total) in r.sections)
            _Table(title: title, rows: [for (final l in rows) ['${l.code} · ${l.name}', l.amount]], foot: [tr('الصافي', 'Left with'), total]),
          _Table(rows: [[tr('صافي حركة النقد', 'Net movement'), r.net]], foot: [tr('رصيد النقد آخر الفترة', 'Cash at the end'), r.closing]),
        ]),
      SeasonsProfitReport() => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          if (r.rows.isEmpty) _note(tr('لا حركة في هذه الفترة.', 'No activity in this period.')),
          for (final s in r.rows)
            Card(
              child: ListTile(
                title: Text(s.name, style: const TextStyle(fontWeight: FontWeight.w800)),
                subtitle: Text(tr('الإيراد ${s.revenue} · المصروف ${s.expense}', 'Revenue ${s.revenue} · Expense ${s.expense}')),
                trailing: Text(s.profit, style: const TextStyle(fontWeight: FontWeight.w900)),
                onTap: s.seasonId == null
                    ? null
                    : () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => SeasonScreen(id: s.seasonId!, name: s.name))),
              ),
            ),
          _note(tr('الموسم الجاري لا يُظهر مصروفاً لأنّ تكلفته مرسملة؛ يظهر ربحه الحقيقيّ حين يُقفل.', 'A running season shows no expense because its cost is capitalised; its real profit shows once it is closed.')),
        ]),
      JournalReport() => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          if (r.entries.isEmpty) _note(tr('لا قيود في هذه الفترة.', 'No entries in this period.')),
          for (final e in r.entries)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Row(children: [
                    Text('#${e.entryNo} · ${e.date}', style: const TextStyle(fontWeight: FontWeight.w800)),
                    if (e.reversal) ...[const SizedBox(width: 6), TagPill(tr('قيد عاكس', 'Reversal'), gold: true)],
                  ]),
                  if (e.memo.isNotEmpty) Text(e.memo, style: TextStyle(color: mutedOn(context), fontSize: 12)),
                  const SizedBox(height: 6),
                  _Table(
                    head: [tr('الحساب', 'Account'), tr('مدين', 'Debit'), tr('دائن', 'Credit')],
                    rows: [
                      for (final l in e.lines)
                        [l.foreign.isEmpty ? l.account : '${l.account}\n${l.foreign}', l.debit, l.credit],
                    ],
                  ),
                ]),
              ),
            ),
          Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            if (v.page > 1)
              TextButton(onPressed: () => _go(_q.copyWith(page: v.page - 1)), child: Text(tr('→ الأحدث', '← Newer')))
            else
              const SizedBox.shrink(),
            if (r.hasMore) TextButton(onPressed: () => _go(_q.copyWith(page: v.page + 1)), child: Text(tr('الأقدم ←', 'Older →'))),
          ]),
          _note(tr('٢٥ قيداً في الصفحة، من الأحدث.', '25 entries a page, newest first.')),
        ]),
      ChartReport() => Card(
          child: Column(children: [
            for (final a in r.accounts)
              ListTile(
                dense: true,
                contentPadding: EdgeInsetsDirectional.only(start: 12.0 + a.depth * 12, end: 12),
                title: Text(
                  tr('${a.code} · ${a.name}${a.active ? '' : ' (موقوف)'}', '${a.code} · ${a.name}${a.active ? '' : ' (suspended)'}'),
                  style: TextStyle(
                    fontWeight: a.postable ? FontWeight.w500 : FontWeight.w800,
                    color: a.postable ? textGreenOn(context) : null,
                  ),
                ),
                trailing: Text(a.type, style: TextStyle(color: mutedOn(context), fontSize: 12)),
                onTap: a.postable
                    ? () => _go(BooksQuery(report: 'account', book: _q.book, account: a.id, from: _q.from, to: _q.to))
                    : null,
              ),
          ]),
        ),
      AccountReport() => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('${r.code} · ${r.name}', style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900)),
          const SizedBox(height: 6),
          _Table(
            head: [tr('التاريخ والبيان', 'Date and description'), tr('الحركة', 'Movement'), tr('الرصيد', 'Balance')],
            rows: [
              for (final s in r.rows)
                ['${s.date}${s.entryNo != null ? ' · #${s.entryNo}' : ''}\n${s.memo}', s.movement, s.balance],
            ],
          ),
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: TextButton(
              onPressed: () => _go(BooksQuery(report: 'chart', book: _q.book)),
              child: Text(tr('← شجرة الحسابات', '← Chart of accounts')),
            ),
          ),
        ]),
      LinksReport() => _LinksPanel(report: r, api: widget.api, onDone: (m) {
          if (!mounted) return;
          _say(m);
          _reload();
        }),
    };
  }

  Widget _note(String text) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Text(text, style: TextStyle(color: mutedOn(context), fontSize: 12, height: 1.6)),
      );
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
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: ok ? leafTintOn(context) : warnTintOn(context),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(children: [
        Icon(ok ? Icons.check_circle_outline : Icons.warning_amber_rounded, color: c, size: 20),
        const SizedBox(width: 8),
        Expanded(child: Text(ok ? good : bad, style: TextStyle(color: c, fontWeight: FontWeight.w700))),
      ]),
    );
  }
}

/// A statement's table: the first column the account, the rest figures, read left to right as the website prints
/// them (`dir=ltr` on the numbers).
class _Table extends StatelessWidget {
  const _Table({this.head, required this.rows, this.foot, this.title});
  final List<String>? head;
  final List<List<String>> rows;
  final List<String>? foot;
  final String? title;

  @override
  Widget build(BuildContext context) {
    Widget line(List<String> cells, {bool bold = false, bool header = false}) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 12),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(
              flex: 5,
              child: Text(cells.first,
                  style: TextStyle(
                    fontWeight: bold || header ? FontWeight.w800 : FontWeight.w500,
                    color: header ? mutedOn(context) : null,
                    fontSize: header ? 12 : 13,
                    height: 1.5,
                  )),
            ),
            for (final c in cells.skip(1))
              Expanded(
                flex: 3,
                child: Text(
                  c,
                  textAlign: TextAlign.end,
                  textDirection: TextDirection.ltr,
                  style: TextStyle(
                    fontWeight: bold || header ? FontWeight.w800 : FontWeight.w500,
                    color: header ? mutedOn(context) : null,
                    fontSize: header ? 12 : 13,
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
              ),
          ]),
        );
    return Card(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          if (title != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 6, 12, 2),
              child: Text(title!, style: const TextStyle(fontWeight: FontWeight.w900)),
            ),
          if (head != null) line(head!, header: true),
          for (final r in rows) ...[const Divider(height: 1), line(r)],
          if (foot != null) ...[const Divider(height: 1), line(foot!, bold: true)],
        ]),
      ),
    );
  }
}

// ── Partner proposals ────────────────────────────────────────────────────────

class _LinksPanel extends StatelessWidget {
  const _LinksPanel({required this.report, required this.api, required this.onDone});
  final LinksReport report;
  final BooksApi api;
  final void Function(String message) onDone;

  @override
  Widget build(BuildContext context) {
    final r = report;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      IntroNote(
        tr('اقتراح القيد لا يدخل أيّ دفتر حتى يؤكّده الطرف الآخر؛ وعند التأكيد يُقيَّد في دفترَيكما معاً بالمبلغ والتاريخ والسعر نفسه. والمنصّة لا تلمس المال: هي تسجّل ما أقررتما به.', 'A proposed entry enters no book until the other party confirms it; on confirmation it is booked in both your books with the same amount, date and rate. The platform never touches the money — it records what you both agreed happened.'),
      ),
      const SizedBox(height: 14),
      SectionTitle(tr('تنتظر تأكيدك', 'Waiting for your confirmation')),
      if (r.waitingForMe.isEmpty) _empty(context, tr('لا شيء ينتظرك.', 'Nothing is waiting for you.')),
      for (final l in r.waitingForMe)
        _LinkCard(link: l, highlight: true, actions: [
          FilledButton(
            onPressed: () => _confirm(context, l),
            child: Text(tr('أؤكّد أنّ هذا حدث', 'I confirm this happened')),
          ),
          OutlinedButton(
            onPressed: () => _withReason(context, title: tr('سبب الاعتراض', 'Reason for objecting'), button: tr('أعترض', 'Object'), run: (why) => api.answer('reject', linkId: l.id, reason: why)),
            child: Text(tr('أعترض', 'Object')),
          ),
        ]),
      if (r.reversalsForMe.isNotEmpty) ...[
        const SizedBox(height: 10),
        SectionTitle(tr('طلبات إلغاءٍ تنتظر ردّك', 'Cancellation requests waiting for your reply')),
        for (final l in r.reversalsForMe)
          _LinkCard(
            link: l,
            highlight: true,
            extra: [
              Text(tr('سبب الطلب: ${l.reversalReason ?? ''}', 'Reason for the request: ${l.reversalReason ?? ''}'), style: const TextStyle(fontWeight: FontWeight.w700, height: 1.6)),
              Text(
                tr('إن وافقتَ عُكس القيد في دفترك ودفتر شريكك معاً، ويبقى القيدان الأصليّان في السجلّ. وإن رفضتَ بقي كلّ شيءٍ كما هو.', 'If you agree, the entry is reversed in your book and your partner\'s together, and both original entries stay on record. If you refuse, everything stays as it is.'),
                style: TextStyle(color: mutedOn(context), fontSize: 12, height: 1.6),
              ),
            ],
            actions: [
              FilledButton(
                onPressed: () => _run(context, () => api.answer('accept_reversal', reversalId: l.reversalId)),
                child: Text(tr('أوافق على إلغائه', 'I agree to cancel it')),
              ),
              OutlinedButton(
                onPressed: () => _withReason(context,
                    title: tr('سبب الرفض', 'Reason for refusing'), button: tr('أرفض', 'Refuse'), run: (why) => api.answer('reject_reversal', reversalId: l.reversalId, reason: why)),
                child: Text(tr('أرفض', 'Refuse')),
              ),
            ],
          ),
      ],
      const SizedBox(height: 10),
      SectionTitle(tr('اقترحتَها وتنتظر ردّ شريكك', 'You proposed these; waiting for your partner')),
      if (r.waitingForThem.isEmpty) _empty(context, tr('لا شيء معلّق.', 'Nothing pending.')),
      for (final l in r.waitingForThem)
        _LinkCard(link: l, actions: [
          OutlinedButton(onPressed: () => _run(context, () => api.answer('cancel', linkId: l.id)), child: Text(tr('ألغِ الاقتراح', 'Cancel the proposal'))),
        ]),
      const SizedBox(height: 10),
      SectionTitle(tr('ما بُتّ فيه', 'Decided')),
      if (r.decided.isEmpty) _empty(context, tr('لا شيء بعد.', 'Nothing yet.')),
      for (final l in r.decided)
        _LinkCard(
          link: l,
          extra: [
            Text(
              [l.statusLabel, if (l.status == 'rejected' && l.rejectReason != null) l.rejectReason!].join(' — '),
              style: TextStyle(color: l.live ? textGreenOn(context) : mutedOn(context), fontSize: 12),
            ),
            if (l.status == 'confirmed' && l.reversalLabel != null && l.live)
              Text(
                [
                  l.reversalLabel!,
                  if (l.reversalStatus == 'rejected' && l.reversalRejectReason != null) l.reversalRejectReason!,
                  if (l.reversalStatus == 'pending' && l.reversalReason != null) l.reversalReason!,
                ].join(' — '),
                style: TextStyle(color: mutedOn(context), fontSize: 12),
              ),
          ],
          actions: [
            if (l.action == 'request')
              TextButton(
                onPressed: () => _withReason(
                  context,
                  title: tr('سبب الإلغاء (يراه شريكك)', 'Why cancel it (your partner sees this)'),
                  button: tr('أرسل الطلب', 'Send request'),
                  note:
                      tr('لا يتغيّر شيء حتى يوافق شريكك. وإن وافق عُكس القيد في الدفترين؛ فإن كان قد بُني عليه قيدٌ آخر (تمويلٌ أُطفئ بنصيب حصادٍ مثلاً) فألغِ الأحدث أولاً.', 'Nothing changes until your partner agrees. If they do, the entry is reversed in both books; if another entry was built on it (financing settled by a harvest share, say), cancel the later one first.'),
                  run: (why) => api.answer('request_reversal', linkId: l.id, reason: why),
                ),
                child: Text(tr('أطلب إلغاء هذا القيد', 'Ask to cancel this entry')),
              ),
            if (l.action == 'withdraw')
              OutlinedButton(
                onPressed: () => _run(context, () => api.answer('withdraw_reversal', reversalId: l.reversalId)),
                child: Text(tr('أسحب طلب الإلغاء', 'Withdraw my request')),
              ),
          ],
        ),
    ]);
  }

  Widget _empty(BuildContext context, String text) =>
      Padding(padding: const EdgeInsets.only(bottom: 8), child: Text(text, style: TextStyle(color: mutedOn(context))));

  Future<void> _run(BuildContext context, Future<String> Function() step) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      onDone(await step());
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _confirm(BuildContext context, LinkView l) async {
    if (!l.needsAccount) return _run(context, () => api.answer('confirm', linkId: l.id));
    final account = await showDialog<String>(
      context: context,
      builder: (c) => SimpleDialog(
        title: Text(tr('استلمتُ في', 'Received into')),
        children: [
          for (final (k, label) in [('cash', tr('نقد', 'Cash')), ('bank', tr('بنك', 'Bank')), ('wallet', tr('محفظة', 'Wallet'))])
            SimpleDialogOption(onPressed: () => Navigator.pop(c, k), child: Text(label)),
        ],
      ),
    );
    if (account == null || !context.mounted) return;
    await _run(context, () => api.answer('confirm', linkId: l.id, account: account));
  }

  Future<void> _withReason(
    BuildContext context, {
    required String title,
    required String button,
    required Future<String> Function(String reason) run,
    String? note,
  }) async {
    final reason = await showDialog<String>(context: context, builder: (_) => _ReasonDialog(title: title, button: button, note: note));
    if (reason == null || !context.mounted) return;
    await _run(context, () => run(reason));
  }
}

class _ReasonDialog extends StatefulWidget {
  const _ReasonDialog({required this.title, required this.button, this.note});
  final String title;
  final String button;
  final String? note;

  @override
  State<_ReasonDialog> createState() => _ReasonDialogState();
}

class _ReasonDialogState extends State<_ReasonDialog> {
  final _text = TextEditingController();

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ok = _text.text.trim().length >= 3;
    return AlertDialog(
      title: Text(widget.title),
      content: Column(mainAxisSize: MainAxisSize.min, children: [
        TextField(
          controller: _text,
          autofocus: true,
          maxLength: 300,
          minLines: 2,
          maxLines: 4,
          onChanged: (_) => setState(() {}),
          decoration: InputDecoration(hintText: tr('٣ أحرفٍ فأكثر', '3 characters or more')),
        ),
        if (widget.note != null) Text(widget.note!, style: TextStyle(color: mutedOn(context), fontSize: 12, height: 1.6)),
      ]),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text(tr('تراجع', 'Back'))),
        FilledButton(onPressed: ok ? () => Navigator.pop(context, _text.text.trim()) : null, child: Text(widget.button)),
      ],
    );
  }
}

class _LinkCard extends StatelessWidget {
  const _LinkCard({required this.link, this.actions = const [], this.extra = const [], this.highlight = false});
  final LinkView link;
  final List<Widget> actions;
  final List<Widget> extra;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final l = link;
    return Card(
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: highlight ? scheme.primary.withValues(alpha: 0.4) : scheme.outline),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(
            tr('${l.kindLabel} · ${l.amount}${l.settles != null ? ' · يُطفئ من التمويل ${l.settles}' : ''}', '${l.kindLabel} · ${l.amount}${l.settles != null ? ' · settles financing ${l.settles}' : ''}'),
            style: const TextStyle(fontWeight: FontWeight.w800, height: 1.5),
          ),
          Text(l.facts, style: TextStyle(color: mutedOn(context), fontSize: 12, height: 1.6)),
          if (extra.isNotEmpty) ...[const SizedBox(height: 6), ...extra],
          if (actions.isNotEmpty) ...[const SizedBox(height: 8), Wrap(spacing: 8, runSpacing: 8, children: actions)],
        ]),
      ),
    );
  }
}

// ── Fixed assets ─────────────────────────────────────────────────────────────

class AssetsScreen extends StatefulWidget {
  const AssetsScreen({super.key, this.api});
  final BooksApi? api;

  @override
  State<AssetsScreen> createState() => _AssetsScreenState();
}

class _AssetsScreenState extends State<AssetsScreen> {
  late final BooksApi _api = widget.api ?? BooksApi();
  late Future<AssetsView> _future = _api.assets();

  void _reload() => setState(() => _future = _api.assets());

  Future<void> _step(Future<String> Function() run) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      final m = await run();
      messenger.showSnackBar(SnackBar(content: Text(m)));
      if (mounted) _reload();
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(tr('الأصول الثابتة', 'Fixed assets'))),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () async {
          final today = (await _future.catchError((_) => const AssetsView(today: '', assets: [], totals: (cost: '', accumulated: '', bookValue: '')))).today;
          if (!context.mounted) return;
          final fields = await showModalBottomSheet<Map<String, String>>(
            context: context,
            isScrollControlled: true,
            showDragHandle: true,
            builder: (c) => Padding(
              padding: EdgeInsets.only(bottom: MediaQuery.of(c).viewInsets.bottom),
              child: _AssetForm(today: today),
            ),
          );
          if (fields != null) await _step(() => _api.assetAction('add', fields));
        },
        icon: const Icon(Icons.add),
        label: Text(tr('سجّل أصلاً', 'Register an asset')),
      ),
      body: FutureBuilder<AssetsView>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) return const LoadingView();
          if (snap.hasError) {
            final e = snap.error;
            return StateView.error(e is ApiException ? e.message : tr('تعذّر تحميل الأصول.', 'Could not load the assets.'), onRetry: _reload, scrollable: true);
          }
          final v = snap.data!;
          return RefreshIndicator(
            onRefresh: () async => _reload(),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
              children: [
                IntroNote(
                  tr('الجرّار والمضخّة والبئر والقناة: ما تملكه المزرعة لأكثر من موسم. يُقيَّد شراؤه مرّة، ثمّ يُوزَّع ثمنه على عمره شهراً بشهر (القسط الثابت)، فيحمل كلّ موسمٍ نصيبه من الآلة لا ثمنها كلّه في شهر شرائها. يُقيَّد الإهلاك وحده كلّ يوم لما انتهى من الأشهر.', 'A tractor, a pump, a well, a canal: what the farm owns for more than a season. Its purchase is booked once, then its price is spread over its life month by month (straight line), so each season carries its share of the machine and not the whole price in the month it was bought. Depreciation is booked on its own each day for the months that have ended.'),
                  icon: Icons.agriculture_outlined,
                ),
                const SizedBox(height: 12),
                if (v.assets.isEmpty)
                  StateView(
                    icon: Icons.inventory_2_outlined,
                    title: tr('لا أصول مسجّلة', 'No assets registered'),
                    message: tr('سجّل الجرّار أو المضخّة أو البئر من «سجّل أصلاً»، فيُقيَّد شراؤه في دفتر مزرعتك.', 'Register the tractor, the pump or the well from «Register an asset», and its purchase is booked in your farm book.'),
                    compact: true,
                  ),
                for (final a in v.assets)
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(14),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                        Text(a.name, style: const TextStyle(fontWeight: FontWeight.w800)),
                        Text(a.facts, style: TextStyle(color: mutedOn(context), fontSize: 12, height: 1.6)),
                        const SizedBox(height: 6),
                        _AssetFigures([(tr('الثمن', 'Cost'), a.cost), (tr('الإهلاك المقيَّد', 'Depreciation booked'), a.accumulated), (tr('القيمة الدفتريّة', 'Book value'), a.bookValue)]),
                        if (a.disposal != null)
                          Padding(
                            padding: const EdgeInsets.only(top: 6),
                            child: Text(a.disposal!, style: TextStyle(color: warnOn(context), fontWeight: FontWeight.w800, fontSize: 12)),
                          )
                        else
                          Align(
                            alignment: AlignmentDirectional.centerStart,
                            child: TextButton(
                              onPressed: () async {
                                final fields = await showDialog<Map<String, String>>(
                                  context: context,
                                  builder: (_) => _DisposeDialog(asset: a, today: v.today),
                                );
                                if (fields != null) await _step(() => _api.assetAction('dispose', fields));
                              },
                              child: Text(tr('بيع أو استبعاد', 'Sell or write off')),
                            ),
                          ),
                      ]),
                    ),
                  ),
                if (v.assets.isNotEmpty) ...[
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(14),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                        Text(tr('المجموع', 'Total'), style: TextStyle(fontWeight: FontWeight.w900)),
                        const SizedBox(height: 6),
                        _AssetFigures([
                          (tr('الثمن', 'Cost'), v.totals.cost),
                          (tr('الإهلاك المقيَّد', 'Depreciation booked'), v.totals.accumulated),
                          (tr('القيمة الدفتريّة', 'Book value'), v.totals.bookValue),
                        ]),
                      ]),
                    ),
                  ),
                  const SizedBox(height: 8),
                  OutlinedButton.icon(
                    onPressed: () => _step(() => _api.assetAction('depreciate')),
                    icon: const Icon(Icons.trending_down),
                    label: Text(tr('قيّد ما استحقّ من الإهلاك الآن', 'Book the depreciation due now')),
                  ),
                ],
              ],
            ),
          );
        },
      ),
    );
  }
}

class _AssetFigures extends StatelessWidget {
  const _AssetFigures(this.figures);
  final List<(String, String)> figures;

  @override
  Widget build(BuildContext context) {
    return Wrap(spacing: 16, runSpacing: 8, children: [
      for (final (l, v) in figures)
        Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
          Text(l, style: TextStyle(color: mutedOn(context), fontSize: 12)),
          Text(v, textDirection: TextDirection.ltr, style: const TextStyle(fontWeight: FontWeight.w800)),
        ]),
    ]);
  }
}

final _figure = [FilteringTextInputFormatter.allow(RegExp(r'[0-9٠-٩.,٬]'))]; // ar-only

/// The website's «سجّل أصلاً» form. It returns the fields; the screen sends them.
class _AssetForm extends StatefulWidget {
  const _AssetForm({required this.today});
  final String today;

  @override
  State<_AssetForm> createState() => _AssetFormState();
}

class _AssetFormState extends State<_AssetForm> {
  final _name = TextEditingController();
  final _cost = TextEditingController();
  final _salvage = TextEditingController();
  final _life = TextEditingController(text: '5');
  late final _date = TextEditingController(text: widget.today);
  String _account = 'machinery';
  String _paidFrom = 'cash_on_hand';

  @override
  void dispose() {
    for (final c in [_name, _cost, _salvage, _life, _date]) {
      c.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ready = _name.text.trim().length >= 2 && _cost.text.trim().isNotEmpty && _life.text.trim().isNotEmpty;
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        SectionTitle(tr('سجّل أصلاً', 'Register an asset')),
        TextField(
          controller: _name,
          maxLength: 120,
          onChanged: (_) => setState(() {}),
          decoration: InputDecoration(labelText: tr('اسم الأصل', 'Name'), hintText: tr('جرّار ماسي فيرغسون ٢٩٠', 'Massey Ferguson 290 tractor')),
        ),
        DropdownButtonFormField<String>(
          initialValue: _account,
          isExpanded: true,
          decoration: InputDecoration(labelText: tr('النوع', 'Type')),
          items: [
            DropdownMenuItem(value: 'machinery', child: Text(tr('آلات ومعدّات', 'Machinery and equipment'))),
            DropdownMenuItem(value: 'land_improvements', child: Text(tr('تحسينات أرض (قناة، بئر، سور)', 'Land improvements (canal, well, fence)'))),
          ],
          onChanged: (v) => setState(() => _account = v ?? 'machinery'),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _date,
          keyboardType: TextInputType.datetime,
          decoration: InputDecoration(labelText: tr('تاريخ الشراء', 'Bought on'), hintText: 'YYYY-MM-DD'),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _cost,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          inputFormatters: _figure,
          onChanged: (_) => setState(() {}),
          decoration: InputDecoration(labelText: tr('الثمن بالدولار', 'Price in dollars')),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _salvage,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          inputFormatters: _figure,
          decoration: InputDecoration(labelText: tr('قيمته خردةً في آخر عمره (اختياري)', 'Its scrap value at the end (optional)'), hintText: '0'),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _life,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          inputFormatters: _figure,
          onChanged: (_) => setState(() {}),
          decoration: InputDecoration(labelText: tr('عمره بالسنوات', 'Life in years')),
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          initialValue: _paidFrom,
          isExpanded: true,
          decoration: InputDecoration(labelText: tr('دُفع ثمنه من', 'Paid from')),
          items: [
            DropdownMenuItem(value: 'cash_on_hand', child: Text(tr('النقد', 'Cash'))),
            DropdownMenuItem(value: 'bank', child: Text(tr('البنك', 'Bank'))),
            DropdownMenuItem(value: 'wallet', child: Text(tr('محفظة إلكترونيّة', 'Mobile wallet'))),
            DropdownMenuItem(value: 'owner_capital', child: Text(tr('كان عندي قبل الدفتر (رأس مال)', 'I had it before the book (capital)'))),
          ],
          onChanged: (v) => setState(() => _paidFrom = v ?? 'cash_on_hand'),
        ),
        const SizedBox(height: 8),
        Text(
          tr('يُقيَّد الشراء الآن في دفتر مزرعتك، ويبدأ الإهلاك من الشهر التالي للشراء: (الثمن − الخردة) ÷ عدد الأشهر، كلّ شهرٍ بآخر يومٍ فيه. أعمارٌ شائعة: الجرّار ٨–١٠ سنوات، المضخّة ٥، البئر والقناة ١٥–٢٠.', 'The purchase is booked now in your farm book, and depreciation starts the month after: (price − scrap) ÷ months, each month on its last day. Common lives: a tractor 8–10 years, a pump 5, a well or canal 15–20.'),
          style: TextStyle(color: mutedOn(context), fontSize: 12, height: 1.6),
        ),
        const SizedBox(height: 12),
        FilledButton(
          onPressed: ready
              ? () => Navigator.pop(context, {
                    'name': _name.text.trim(),
                    'account': _account,
                    'acquired_on': _date.text.trim(),
                    'cost': _cost.text.trim(),
                    'salvage': _salvage.text.trim(),
                    'life_years': _life.text.trim(),
                    'paid_from': _paidFrom,
                  })
              : null,
          child: Text(tr('سجّل وقيّد الشراء', 'Register and book the purchase')),
        ),
      ]),
    );
  }
}

class _DisposeDialog extends StatefulWidget {
  const _DisposeDialog({required this.asset, required this.today});
  final FixedAsset asset;
  final String today;

  @override
  State<_DisposeDialog> createState() => _DisposeDialogState();
}

class _DisposeDialogState extends State<_DisposeDialog> {
  late final _date = TextEditingController(text: widget.today);
  final _proceeds = TextEditingController(text: '0');
  String _into = 'cash_on_hand';

  @override
  void dispose() {
    _date.dispose();
    _proceeds.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(tr('بيع أو استبعاد: ${widget.asset.name}', 'Sell or write off: ${widget.asset.name}')),
      content: SingleChildScrollView(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: _date, decoration: InputDecoration(labelText: tr('التاريخ', 'Date'), hintText: 'YYYY-MM-DD')),
          TextField(
            controller: _proceeds,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            inputFormatters: _figure,
            decoration: InputDecoration(labelText: tr('ما قُبض بالدولار (0 إن استُبعد)', 'Received in dollars (0 if written off)')),
          ),
          DropdownButtonFormField<String>(
            initialValue: _into,
            decoration: InputDecoration(labelText: tr('قُبض في', 'Received into')),
            items: [
              DropdownMenuItem(value: 'cash_on_hand', child: Text(tr('النقد', 'Cash'))),
              DropdownMenuItem(value: 'bank', child: Text(tr('البنك', 'Bank'))),
              DropdownMenuItem(value: 'wallet', child: Text(tr('محفظة إلكترونيّة', 'Mobile wallet'))),
            ],
            onChanged: (v) => setState(() => _into = v ?? 'cash_on_hand'),
          ),
        ]),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text(tr('تراجع', 'Back'))),
        FilledButton(
          onPressed: () => Navigator.pop(context, {
            'asset_id': widget.asset.id,
            'disposed_on': _date.text.trim(),
            'proceeds': _proceeds.text.trim(),
            'received_into': _into,
          }),
          child: Text(tr('قيّد', 'Book it')),
        ),
      ],
    );
  }
}
