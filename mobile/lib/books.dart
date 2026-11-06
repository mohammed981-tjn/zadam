/// الدفتر المحاسبيّ في التطبيق (البند ٢٠٣): دفتر المزرعة ودفتر المستثمر كما تعرضهما صفحات /books.
///
/// The route /api/app/books takes the page's own address (`r`, `book`, `from`, `to`, `as_of`, `a`, `p`) and answers
/// with what the page would show, read by the same lib/ledger code through the app's session. Every figure arrives
/// already written as the page writes it, so the app does no sums of its own and cannot disagree with the website.
///
/// The partner proposals are answered through /api/app/books/links with the website's own steps (confirm, object,
/// cancel, and the cancellation requests), and the fixed assets through /api/app/books/assets.
library;

import 'account.dart';

// ── Reports ──────────────────────────────────────────────────────────────────

/// The website's tabs, in its order (src/app/books/page.tsx, TABS).
const bookReports = <(String, String)>[
  ('trial', 'ميزان المراجعة'),
  ('income', 'قائمة الدخل'),
  ('balance', 'الميزانيّة'),
  ('cash', 'التدفّقات النقديّة'),
  ('seasons', 'ربحيّة المواسم'),
  ('journal', 'اليوميّة'),
  ('chart', 'شجرة الحسابات'),
  ('links', 'اقتراحات الشريك'),
];

/// Which of a report's dates the page offers: a period, one day, or none.
enum ReportDates { period, asOf, none }

ReportDates datesOf(String report) => switch (report) {
      'income' || 'cash' || 'seasons' || 'journal' || 'account' => ReportDates.period,
      'chart' || 'links' => ReportDates.none,
      _ => ReportDates.asOf,
    };

String bookKindLabel(String kind) => switch (kind) {
      'farm' => 'دفتر المزرعة',
      'investor' => 'دفتر المستثمر',
      _ => kind,
    };

List<Map<String, dynamic>> _maps(Object? v) => [for (final x in (v as List? ?? const [])) (x as Map).cast<String, dynamic>()];

/// One line of a statement: the account and its figure.
class ReportLine {
  const ReportLine(this.code, this.name, this.amount);
  final String code;
  final String name;
  final String amount;

  static List<ReportLine> list(Object? v) => [
        for (final r in _maps(v)) ReportLine(r['code'] as String? ?? '', r['name'] as String? ?? '', r['amount'] as String? ?? ''),
      ];
}

class TrialLine {
  const TrialLine(this.code, this.name, this.debit, this.credit);
  final String code;
  final String name;
  final String debit;
  final String credit;

  static List<TrialLine> list(Object? v) => [
        for (final r in _maps(v))
          TrialLine(r['code'] as String? ?? '', r['name'] as String? ?? '', r['debit'] as String? ?? '', r['credit'] as String? ?? ''),
      ];
}

sealed class BookReport {
  const BookReport();

  static BookReport? fromJson(Map<String, dynamic>? j) {
    if (j == null) return null;
    return switch (j['kind']) {
      'trial' => TrialReport(
          balanced: j['balanced'] == true,
          rows: TrialLine.list(j['rows']),
          memo: TrialLine.list(j['memo']),
          totalDebit: j['total_debit'] as String? ?? '',
          totalCredit: j['total_credit'] as String? ?? '',
        ),
      'income' => IncomeReport(
          revenue: ReportLine.list(j['revenue']),
          expense: ReportLine.list(j['expense']),
          totalRevenue: j['total_revenue'] as String? ?? '',
          totalExpense: j['total_expense'] as String? ?? '',
          netIncome: j['net_income'] as String? ?? '',
        ),
      'balance' => BalanceReport(
          balanced: j['balanced'] == true,
          assets: ReportLine.list(j['assets']),
          liabilities: ReportLine.list(j['liabilities']),
          equity: ReportLine.list(j['equity']),
          retainedIncome: j['retained_income'] as String?,
          currentIncomeLabel: j['current_income_label'] as String? ?? '',
          currentIncome: j['current_income'] as String? ?? '',
          totalAssets: j['total_assets'] as String? ?? '',
          totalLiabilities: j['total_liabilities'] as String? ?? '',
          totalEquity: j['total_equity'] as String? ?? '',
          totalLiabilitiesEquity: j['total_liabilities_equity'] as String? ?? '',
        ),
      'cash' => CashReport(
          ties: j['ties'] == true,
          opening: j['opening'] as String? ?? '',
          sections: [
            for (final s in _maps(j['sections']))
              (s['title'] as String? ?? '', ReportLine.list(s['rows']), s['total'] as String? ?? ''),
          ],
          net: j['net'] as String? ?? '',
          closing: j['closing'] as String? ?? '',
        ),
      'seasons' => SeasonsProfitReport([
          for (final r in _maps(j['rows']))
            (
              seasonId: r['season_id'] as String?,
              name: r['name'] as String? ?? '',
              revenue: r['revenue'] as String? ?? '',
              expense: r['expense'] as String? ?? '',
              profit: r['profit'] as String? ?? '',
            ),
        ]),
      'journal' => JournalReport(
          hasMore: j['has_more'] == true,
          entries: [
            for (final e in _maps(j['entries']))
              JournalEntry(
                entryNo: (e['entry_no'] as num?)?.toInt() ?? 0,
                date: e['entry_date'] as String? ?? '',
                memo: e['memo'] as String? ?? '',
                reversal: e['reversal'] == true,
                lines: [
                  for (final l in _maps(e['lines']))
                    (
                      account: '${l['code'] ?? ''} · ${l['account'] ?? ''}',
                      debit: l['debit'] as String? ?? '',
                      credit: l['credit'] as String? ?? '',
                      foreign: l['foreign'] as String? ?? '',
                    ),
                ],
              ),
          ],
        ),
      'chart' => ChartReport([
          for (final a in _maps(j['accounts']))
            ChartAccount(
              id: a['id'] as String? ?? '',
              code: a['code'] as String? ?? '',
              name: a['name'] as String? ?? '',
              type: a['type'] as String? ?? '',
              postable: a['postable'] == true,
              active: a['active'] != false,
              depth: (a['depth'] as num?)?.toInt() ?? 0,
            ),
        ]),
      'account' => AccountReport(
          code: (j['account'] as Map?)?['code'] as String? ?? '',
          name: (j['account'] as Map?)?['name'] as String? ?? '',
          rows: [
            for (final r in _maps(j['rows']))
              (
                date: r['date'] as String? ?? '',
                entryNo: (r['entry_no'] as num?)?.toInt(),
                memo: r['memo'] as String? ?? '',
                movement: r['movement'] as String? ?? '',
                balance: r['balance'] as String? ?? '',
              ),
          ],
        ),
      'links' => LinksReport(
          waitingForMe: LinkView.list(j['waiting_for_me']),
          reversalsForMe: LinkView.list(j['reversals_for_me']),
          waitingForThem: LinkView.list(j['waiting_for_them']),
          decided: LinkView.list(j['decided']),
        ),
      _ => null,
    };
  }
}

class TrialReport extends BookReport {
  const TrialReport({required this.balanced, required this.rows, required this.memo, required this.totalDebit, required this.totalCredit});
  final bool balanced;
  final List<TrialLine> rows;
  final List<TrialLine> memo;
  final String totalDebit;
  final String totalCredit;
}

class IncomeReport extends BookReport {
  const IncomeReport({
    required this.revenue,
    required this.expense,
    required this.totalRevenue,
    required this.totalExpense,
    required this.netIncome,
  });
  final List<ReportLine> revenue;
  final List<ReportLine> expense;
  final String totalRevenue;
  final String totalExpense;
  final String netIncome;
}

class BalanceReport extends BookReport {
  const BalanceReport({
    required this.balanced,
    required this.assets,
    required this.liabilities,
    required this.equity,
    required this.retainedIncome,
    required this.currentIncomeLabel,
    required this.currentIncome,
    required this.totalAssets,
    required this.totalLiabilities,
    required this.totalEquity,
    required this.totalLiabilitiesEquity,
  });
  final bool balanced;
  final List<ReportLine> assets;
  final List<ReportLine> liabilities;
  final List<ReportLine> equity;
  final String? retainedIncome;
  final String currentIncomeLabel;
  final String currentIncome;
  final String totalAssets;
  final String totalLiabilities;
  final String totalEquity;
  final String totalLiabilitiesEquity;
}

class CashReport extends BookReport {
  const CashReport({required this.ties, required this.opening, required this.sections, required this.net, required this.closing});
  final bool ties;
  final String opening;
  final List<(String title, List<ReportLine> rows, String total)> sections;
  final String net;
  final String closing;
}

typedef SeasonProfit = ({String? seasonId, String name, String revenue, String expense, String profit});

class SeasonsProfitReport extends BookReport {
  const SeasonsProfitReport(this.rows);
  final List<SeasonProfit> rows;
}

typedef JournalLine = ({String account, String debit, String credit, String foreign});

class JournalEntry {
  const JournalEntry({required this.entryNo, required this.date, required this.memo, required this.reversal, required this.lines});
  final int entryNo;
  final String date;
  final String memo;
  final bool reversal;
  final List<JournalLine> lines;
}

class JournalReport extends BookReport {
  const JournalReport({required this.hasMore, required this.entries});
  final bool hasMore;
  final List<JournalEntry> entries;
}

class ChartAccount {
  const ChartAccount({
    required this.id,
    required this.code,
    required this.name,
    required this.type,
    required this.postable,
    required this.active,
    required this.depth,
  });
  final String id;
  final String code;
  final String name;
  final String type;
  final bool postable;
  final bool active;
  final int depth;
}

class ChartReport extends BookReport {
  const ChartReport(this.accounts);
  final List<ChartAccount> accounts;
}

typedef StatementRow = ({String date, int? entryNo, String memo, String movement, String balance});

class AccountReport extends BookReport {
  const AccountReport({required this.code, required this.name, required this.rows});
  final String code;
  final String name;
  final List<StatementRow> rows;
}

// ── Partner proposals ────────────────────────────────────────────────────────

class LinkView {
  const LinkView({
    required this.id,
    required this.kindLabel,
    required this.status,
    required this.amount,
    required this.settles,
    required this.otherName,
    required this.entryDate,
    required this.agreementRef,
    required this.memo,
    required this.statusLabel,
    required this.live,
    required this.rejectReason,
    required this.needsAccount,
    required this.reversalId,
    required this.reversalStatus,
    required this.reversalLabel,
    required this.reversalReason,
    required this.reversalRejectReason,
    required this.action,
  });

  final String id;
  final String kindLabel;
  final String status;
  final String amount;
  final String? settles;
  final String otherName;
  final String entryDate;
  final String? agreementRef;
  final String memo;
  final String statusLabel;
  final bool live;
  final String? rejectReason;

  /// The receiver says where the money came in (a payout, a rent) when confirming.
  final bool needsAccount;
  final String? reversalId;
  final String? reversalStatus;
  final String? reversalLabel;
  final String? reversalReason;
  final String? reversalRejectReason;

  /// What the reader may do about cancelling it: request, answer, withdraw, or none (ledgerLinks.ts `reversalAction`).
  final String action;

  String get facts => [
        otherName,
        entryDate,
        if (agreementRef != null && agreementRef!.isNotEmpty) agreementRef!,
        if (memo.isNotEmpty) memo,
      ].join(' · ');

  static List<LinkView> list(Object? v) => [
        for (final r in _maps(v))
          LinkView(
            id: r['id'] as String? ?? '',
            kindLabel: r['kind_label'] as String? ?? '',
            status: r['status'] as String? ?? '',
            amount: r['amount'] as String? ?? '',
            settles: r['settles'] as String?,
            otherName: r['other_name'] as String? ?? '',
            entryDate: r['entry_date'] as String? ?? '',
            agreementRef: r['agreement_ref'] as String?,
            memo: r['memo'] as String? ?? '',
            statusLabel: r['status_label'] as String? ?? '',
            live: r['live'] == true,
            rejectReason: r['reject_reason'] as String?,
            needsAccount: r['needs_account'] == true,
            reversalId: (r['reversal'] as Map?)?['id'] as String?,
            reversalStatus: (r['reversal'] as Map?)?['status'] as String?,
            reversalLabel: (r['reversal'] as Map?)?['label'] as String?,
            reversalReason: (r['reversal'] as Map?)?['reason'] as String?,
            reversalRejectReason: (r['reversal'] as Map?)?['reject_reason'] as String?,
            action: r['action'] as String? ?? 'none',
          ),
      ];
}

class LinksReport extends BookReport {
  const LinksReport({required this.waitingForMe, required this.reversalsForMe, required this.waitingForThem, required this.decided});
  final List<LinkView> waitingForMe;
  final List<LinkView> reversalsForMe;
  final List<LinkView> waitingForThem;
  final List<LinkView> decided;
}

// ── The page ─────────────────────────────────────────────────────────────────

class BookInfo {
  const BookInfo({required this.id, required this.kind, required this.heading, required this.closedThrough, required this.owned});
  final String id;
  final String kind;
  final String heading;
  final String? closedThrough;
  final bool owned;
}

/// What the page is asked for. Null dates take the page's defaults (the year so far, today).
class BooksQuery {
  const BooksQuery({this.report = 'trial', this.book, this.from, this.to, this.asOf, this.account, this.page = 1});
  final String report;
  final String? book;
  final String? from;
  final String? to;
  final String? asOf;
  final String? account;
  final int page;

  BooksQuery copyWith({String? report, String? book, String? from, String? to, String? asOf, String? account, int? page}) =>
      BooksQuery(
        report: report ?? this.report,
        book: book ?? this.book,
        from: from ?? this.from,
        to: to ?? this.to,
        asOf: asOf ?? this.asOf,
        account: account ?? this.account,
        page: page ?? this.page,
      );

  /// The page's own query string (`reportHref`), so the route reads it with the page's `parseReportParams`.
  String get path {
    final q = <String, String>{
      'r': report,
      'book': ?book,
      'from': ?from,
      'to': ?to,
      'as_of': ?asOf,
      'a': ?account,
      if (page > 1) 'p': '$page',
    };
    return '/api/app/books?${Uri(queryParameters: q).query}';
  }
}

class BooksView {
  const BooksView({
    required this.today,
    required this.report,
    required this.from,
    required this.to,
    required this.asOf,
    required this.page,
    required this.kinds,
    required this.waitingForMe,
    required this.feesWaiting,
    required this.book,
    required this.data,
    required this.message,
  });

  final String today;
  final String report;
  final String from;
  final String to;
  final String asOf;
  final int page;
  final List<String> kinds;
  final int waitingForMe;
  final int feesWaiting;
  final BookInfo? book;
  final BookReport? data;
  final String? message;

  factory BooksView.fromJson(Map<String, dynamic> j) {
    final p = (j['params'] as Map?)?.cast<String, dynamic>() ?? const <String, dynamic>{};
    final b = (j['book'] as Map?)?.cast<String, dynamic>();
    return BooksView(
      today: j['today'] as String? ?? '',
      report: p['report'] as String? ?? 'trial',
      from: p['from'] as String? ?? '',
      to: p['to'] as String? ?? '',
      asOf: p['as_of'] as String? ?? '',
      page: (p['page'] as num?)?.toInt() ?? 1,
      kinds: [for (final k in (j['kinds'] as List? ?? const [])) '$k'],
      waitingForMe: (j['waiting_for_me'] as num?)?.toInt() ?? 0,
      feesWaiting: (j['fees_waiting'] as num?)?.toInt() ?? 0,
      book: b == null
          ? null
          : BookInfo(
              id: b['id'] as String? ?? '',
              kind: b['kind'] as String? ?? '',
              heading: b['heading'] as String? ?? '',
              closedThrough: b['closed_through'] as String?,
              owned: b['owned'] == true,
            ),
      data: BookReport.fromJson((j['report'] as Map?)?.cast<String, dynamic>()),
      message: j['message'] as String?,
    );
  }
}

// ── Fixed assets ─────────────────────────────────────────────────────────────

class FixedAsset {
  const FixedAsset({
    required this.id,
    required this.name,
    required this.kind,
    required this.acquiredOn,
    required this.lifeMonths,
    required this.monthsPosted,
    required this.cost,
    required this.salvage,
    required this.accumulated,
    required this.bookValue,
    required this.disposedOn,
    required this.proceeds,
  });

  final String id;
  final String name;
  final String kind;
  final String acquiredOn;
  final int lifeMonths;
  final int monthsPosted;
  final String cost;
  final String? salvage;
  final String accumulated;
  final String bookValue;
  final String? disposedOn;
  final String? proceeds;

  /// The line under the name, as the website writes it.
  String get facts => [
        kind,
        acquiredOn,
        '$monthsPosted من $lifeMonths شهراً',
        if (salvage != null) 'خردة $salvage',
      ].join(' · ');

  String? get disposal => disposedOn == null ? null : (proceeds != null ? 'بِيع في $disposedOn بـ$proceeds' : 'استُبعد في $disposedOn');

  factory FixedAsset.fromJson(Map<String, dynamic> j) => FixedAsset(
        id: j['id'] as String? ?? '',
        name: j['name'] as String? ?? '',
        kind: j['kind'] as String? ?? '',
        acquiredOn: j['acquired_on'] as String? ?? '',
        lifeMonths: (j['life_months'] as num?)?.toInt() ?? 0,
        monthsPosted: (j['months_posted'] as num?)?.toInt() ?? 0,
        cost: j['cost'] as String? ?? '',
        salvage: j['salvage'] as String?,
        accumulated: j['accumulated'] as String? ?? '',
        bookValue: j['book_value'] as String? ?? '',
        disposedOn: j['disposed_on'] as String?,
        proceeds: j['proceeds'] as String?,
      );
}

class AssetsView {
  const AssetsView({required this.today, required this.assets, required this.totals});
  final String today;
  final List<FixedAsset> assets;
  final ({String cost, String accumulated, String bookValue}) totals;

  factory AssetsView.fromJson(Map<String, dynamic> j) {
    final t = (j['totals'] as Map?)?.cast<String, dynamic>() ?? const <String, dynamic>{};
    return AssetsView(
      today: j['today'] as String? ?? '',
      assets: [for (final a in _maps(j['assets'])) FixedAsset.fromJson(a)],
      totals: (
        cost: t['cost'] as String? ?? '',
        accumulated: t['accumulated'] as String? ?? '',
        bookValue: t['book_value'] as String? ?? '',
      ),
    );
  }
}

// ── The client ───────────────────────────────────────────────────────────────

class BooksApi {
  BooksApi({AccountController? account}) : _account = account ?? accountController;
  final AccountController _account;

  Future<BooksView> load(BooksQuery q) async => BooksView.fromJson(await _account.call('GET', q.path));

  /// One of the website's answers to a partner's entry: confirm, reject, cancel, request_reversal, accept_reversal,
  /// reject_reversal, withdraw_reversal. Returns the website's sentence for what happened.
  Future<String> answer(String action, {String? linkId, String? reversalId, String? account, String? reason}) async {
    final r = await _account.call('POST', '/api/app/books/links', body: {
      'action': action,
      'link_id': ?linkId,
      'reversal_id': ?reversalId,
      'account': ?account,
      'reason': ?reason,
    });
    return r['message'] as String? ?? '';
  }

  Future<AssetsView> assets() async => AssetsView.fromJson(await _account.call('GET', '/api/app/books/assets'));

  /// `add`, `depreciate` or `dispose`, with the fields of the website's form for it.
  Future<String> assetAction(String action, [Map<String, String> fields = const {}]) async {
    final r = await _account.call('POST', '/api/app/books/assets', body: {'action': action, ...fields});
    return r['message'] as String? ?? '';
  }
}
