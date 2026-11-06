/// «القوائم الماليّة» في التطبيق (البند ٢٠٥): ما تعرضه صفحة /books/statements على الموقع — قائمة الدخل والميزانيّة
/// والتدفّقات النقديّة مقارنةً بالفترة السابقة، وأعمار الذمم، والميزانيّة مقابل الفعليّ، وقائمة التغيّر في حقوق الملكيّة،
/// والإيضاحات، وبصمة الأرقام — وحزمة PDF نفسها التي يعطيها الموقع.
///
/// The route /api/app/books/statements takes the page's own query (`book`, `basis`, `y`, `m`, `s`, `compare`) and
/// answers with the same bundle the page and the PDF are made from (src/lib/ledger/statements.ts), money in whole
/// cents. The app only writes the figures as the website writes them; it adds nothing up except what it shows as a
/// sum the website also shows, so the two cannot disagree.
library;

import 'account.dart';
import 'api.dart';
import 'i18n.dart';

List<Map<String, dynamic>> _maps(Object? v) => [for (final x in (v as List? ?? const [])) (x as Map).cast<String, dynamic>()];
Map<String, dynamic> _map(Object? v) => (v as Map?)?.cast<String, dynamic>() ?? const <String, dynamic>{};
int _int(Object? v) => (v as num?)?.round() ?? 0;
int? _intOrNull(Object? v) => (v as num?)?.round();

/// Cents as the website writes a figure: grouped thousands, two decimals, a minus in front ("-1,234.50").
String usd(int cents) {
  final neg = cents < 0;
  final abs = neg ? -cents : cents;
  final whole = (abs ~/ 100).toString().replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => ',');
  final frac = (abs % 100).toString().padLeft(2, '0');
  return '${neg ? '-' : ''}$whole.$frac';
}

/// A change, signed as the website signs it ("+70.00"); a dash when there is nothing to compare with.
String signed(int? cents) => cents == null ? '—' : '${cents > 0 ? '+' : ''}${usd(cents)}';

/// A percentage to one decimal ("+17.5%"); a dash when the previous figure was nothing.
String percent(double? p, {bool sign = true}) => p == null ? '—' : '${sign && p > 0 ? '+' : ''}${p.toStringAsFixed(1)}%';

/// A figure in two columns, this period and the previous, with the change and its percentage.
class Figure {
  const Figure(this.current, this.previous, this.change, this.pct);
  final int current;
  final int? previous;
  final int? change;
  final double? pct;

  factory Figure.fromJson(Object? v) {
    final j = _map(v);
    return Figure(_int(j['current']), _intOrNull(j['previous']), _intOrNull(j['change']), (j['pct'] as num?)?.toDouble());
  }
}

class StatementLine {
  const StatementLine(this.code, this.name, this.v);
  final String code;
  final String name;
  final Figure v;

  /// The computed lines (profit not yet closed) carry a code of their own that is not an account's.
  bool get computed => code.startsWith('_') || code.startsWith('399');

  static List<StatementLine> list(Object? v) => [
        for (final r in _maps(v)) StatementLine(r['code'] as String? ?? '', _map(r['name'])['ar'] as String? ?? '', Figure.fromJson(r['v'])),
      ];
}

const bucketKeys = ['0_30', '31_60', '61_90', '90_plus', 'advance'];
Map<String, String> get bucketLabels => {
  '0_30': tr('حتى ٣٠ يوماً', '0–30 days'),
  '31_60': tr('٣١–٦٠', '31–60'),
  '61_90': tr('٦١–٩٠', '61–90'),
  '90_plus': tr('أكثر من ٩٠', 'Over 90'),
  'advance': tr('مدفوعٌ مقدّماً', 'Paid ahead'),
};

class AgeingAccount {
  const AgeingAccount(this.code, this.name, this.buckets, this.items, this.total);
  final String code;
  final String name;
  final Map<String, int> buckets;
  final int items;
  final int total;
}

class AgeingSide {
  const AgeingSide(this.accounts, this.buckets, this.total);
  final List<AgeingAccount> accounts;
  final Map<String, int> buckets;
  final int total;

  /// The buckets worth a column: the four ages, and «paid ahead» only when something was.
  List<String> get keys => [for (final k in bucketKeys) if (k != 'advance' || (buckets['advance'] ?? 0) != 0) k];

  static Map<String, int> _buckets(Object? v) => {for (final k in bucketKeys) k: _int(_map(v)[k])};

  factory AgeingSide.fromJson(Object? v) {
    final j = _map(v);
    return AgeingSide(
      [
        for (final a in _maps(j['accounts']))
          AgeingAccount(a['code'] as String? ?? '', _map(a['name'])['ar'] as String? ?? '', _buckets(a['buckets']), _int(a['items']), _int(a['total'])),
      ],
      _buckets(j['buckets']),
      _int(j['total']),
    );
  }
}

class BudgetStage {
  const BudgetStage(this.name, this.budget, this.actual, this.variance, this.usedPct);
  final String name;
  final int budget;
  final int actual;
  final int variance;
  final double? usedPct;
}

class BudgetSeason {
  const BudgetSeason(this.id, this.name, this.stages, this.budget, this.actual, this.variance, this.usedPct);
  final String id;
  final String name;
  final List<BudgetStage> stages;
  final int budget;
  final int actual;
  final int variance;
  final double? usedPct;
}

class SeasonChoice {
  const SeasonChoice(this.id, this.name, this.plantingDate);
  final String id;
  final String name;
  final String plantingDate;
}

/// What the page is asked for: the basis (a year, a month or a season), which one, and whether to compare.
class StatementsQuery {
  const StatementsQuery({this.basis = 'year', this.year, this.month, this.season, this.compare = true, this.book});
  final String basis;
  final int? year;
  final String? month;
  final String? season;
  final bool compare;
  final String? book;

  StatementsQuery copyWith({String? basis, int? year, String? month, String? season, bool? compare}) => StatementsQuery(
        basis: basis ?? this.basis,
        year: year ?? this.year,
        month: month ?? this.month,
        season: season ?? this.season,
        compare: compare ?? this.compare,
        book: book,
      );

  /// The page's own query string (statementsQuery in src/lib/ledger/statementsParams.ts reads it).
  String get query {
    final q = <String, String>{
      'book': ?book,
      if (basis != 'year') 'basis': basis,
      if (basis == 'year' && year != null) 'y': '$year',
      if (basis == 'month' && month != null) 'm': month!,
      if (basis == 'season' && season != null) 's': season!,
      if (!compare) 'compare': '0',
    };
    return q.isEmpty ? '' : '?${Uri(queryParameters: q).query}';
  }

  String get path => '/api/app/books/statements$query';
}

class StatementsView {
  const StatementsView({
    required this.today,
    required this.basis,
    required this.year,
    required this.month,
    required this.season,
    required this.compare,
    required this.seasons,
    required this.heading,
    required this.ownerName,
    required this.period,
    required this.previousPeriod,
    required this.from,
    required this.to,
    required this.previousTo,
    required this.revenue,
    required this.expense,
    required this.totalRevenue,
    required this.totalExpense,
    required this.netIncome,
    required this.assets,
    required this.liabilities,
    required this.equity,
    required this.totalAssets,
    required this.totalLiabilities,
    required this.totalEquity,
    required this.balanced,
    required this.cashSections,
    required this.cashOpening,
    required this.cashClosing,
    required this.cashTies,
    required this.equityRows,
    required this.equityCloses,
    required this.ageingAsOf,
    required this.receivable,
    required this.payable,
    required this.budget,
    required this.notes,
    required this.fingerprint,
    required this.fingerprintGroups,
    required this.pdfPath,
  });

  final String today;
  final String basis;
  final int year;
  final String month;
  final String? season;
  final bool compare;
  final List<SeasonChoice> seasons;
  final String heading;
  final String? ownerName;
  final String period;
  final String? previousPeriod;
  final String from;
  final String to;
  final String? previousTo;
  final List<StatementLine> revenue;
  final List<StatementLine> expense;
  final Figure totalRevenue;
  final Figure totalExpense;
  final Figure netIncome;
  final List<StatementLine> assets;
  final List<StatementLine> liabilities;
  final List<StatementLine> equity;
  final Figure totalAssets;
  final Figure totalLiabilities;
  final Figure totalEquity;
  final bool balanced;

  /// (title, lines, total) for operating, investing and financing.
  final List<(String, List<StatementLine>, Figure)> cashSections;
  final Figure cashOpening;
  final Figure cashClosing;
  final bool cashTies;
  final List<(String, String, int)> equityRows;
  final bool equityCloses;
  final String ageingAsOf;
  final AgeingSide receivable;
  final AgeingSide payable;
  final List<BudgetSeason> budget;
  final List<(String, String)> notes;
  final String fingerprint;
  final String fingerprintGroups;
  final String pdfPath;

  /// Two columns or one: there is a previous period to compare with.
  bool get hasPrevious => previousPeriod != null;

  factory StatementsView.fromJson(Map<String, dynamic> j) {
    final p = _map(j['params']);
    final s = _map(j['statements']);
    final book = _map(s['book']);
    final cur = _map(s['current']);
    final prev = s['previous'] == null ? null : _map(s['previous']);
    final income = _map(s['income']);
    final balance = _map(s['balance']);
    final cash = _map(s['cash']);
    final eq = _map(s['equity']);
    final ageing = _map(s['ageing']);
    return StatementsView(
      today: j['today'] as String? ?? '',
      basis: p['basis'] as String? ?? 'year',
      year: _int(p['year']),
      month: p['month'] as String? ?? '',
      season: p['season'] as String?,
      compare: p['compare'] != false,
      seasons: [
        for (final x in _maps(j['seasons'])) SeasonChoice(x['id'] as String? ?? '', x['name'] as String? ?? '', x['planting_date'] as String? ?? ''),
      ],
      heading: _map(book['heading'])['ar'] as String? ?? '',
      ownerName: book['ownerName'] as String?,
      period: j['period'] as String? ?? '',
      previousPeriod: j['previous_period'] as String?,
      from: cur['from'] as String? ?? '',
      to: cur['to'] as String? ?? '',
      previousTo: prev?['to'] as String?,
      revenue: StatementLine.list(income['revenue']),
      expense: StatementLine.list(income['expense']),
      totalRevenue: Figure.fromJson(income['totalRevenue']),
      totalExpense: Figure.fromJson(income['totalExpense']),
      netIncome: Figure.fromJson(income['net']),
      assets: StatementLine.list(balance['assets']),
      liabilities: StatementLine.list(balance['liabilities']),
      equity: StatementLine.list(balance['equity']),
      totalAssets: Figure.fromJson(balance['totalAssets']),
      totalLiabilities: Figure.fromJson(balance['totalLiabilities']),
      totalEquity: Figure.fromJson(balance['totalEquity']),
      balanced: balance['balanced'] == true,
      cashSections: [
        (tr('تشغيليّة', 'Operating'), StatementLine.list(cash['operating']), Figure.fromJson(cash['totalOperating'])),
        (tr('استثماريّة', 'Investing'), StatementLine.list(cash['investing']), Figure.fromJson(cash['totalInvesting'])),
        (tr('تمويليّة', 'Financing'), StatementLine.list(cash['financing']), Figure.fromJson(cash['totalFinancing'])),
      ],
      cashOpening: Figure.fromJson(cash['opening']),
      cashClosing: Figure.fromJson(cash['closing']),
      cashTies: cash['ties'] == true,
      equityRows: [
        for (final r in _maps(eq['rows'])) (r['line'] as String? ?? '', _map(r['name'])['ar'] as String? ?? '', _int(r['amount'])),
      ],
      equityCloses: eq['closesToBalance'] == true,
      ageingAsOf: ageing['asOf'] as String? ?? '',
      receivable: AgeingSide.fromJson(ageing['receivable']),
      payable: AgeingSide.fromJson(ageing['payable']),
      budget: [
        for (final b in _maps(s['budget']))
          BudgetSeason(
            b['seasonId'] as String? ?? '',
            b['name'] as String? ?? '',
            [
              for (final st in _maps(b['stages']))
                BudgetStage(_map(st['name'])['ar'] as String? ?? '', _int(st['budget']), _int(st['actual']), _int(st['variance']),
                    (st['usedPct'] as num?)?.toDouble()),
            ],
            _int(b['budget']),
            _int(b['actual']),
            _int(b['variance']),
            (b['usedPct'] as num?)?.toDouble(),
          ),
      ],
      notes: [for (final n in _maps(s['notes'])) (_map(n['title'])['ar'] as String? ?? '', _map(n['body'])['ar'] as String? ?? '')],
      fingerprint: s['fingerprint'] as String? ?? '',
      fingerprintGroups: j['fingerprint_groups'] as String? ?? '',
      pdfPath: j['pdf'] as String? ?? '/api/app/books/statements/pdf',
    );
  }
}

/// The statements' PDF as the website gives it, with its name and the fingerprint printed on its pages.
class StatementsPdf {
  const StatementsPdf(this.bytes, this.fileName, this.fingerprint);
  final List<int> bytes;
  final String fileName;
  final String? fingerprint;

  /// A PDF starts with «%PDF-»; anything else is not the file asked for.
  bool get looksLikePdf => bytes.length > 5 && String.fromCharCodes(bytes.take(5)) == '%PDF-';
}

class StatementsApi {
  StatementsApi({AccountController? account}) : _account = account ?? accountController;
  final AccountController _account;

  Future<StatementsView> load(StatementsQuery q) async => StatementsView.fromJson(await _account.call('GET', q.path));

  /// The bundle as a PDF, fetched with the app's own session: a link opened in the browser would not carry it.
  Future<StatementsPdf> pdf(String path) async {
    final r = await _account.download(path);
    final disposition = r.headers['content-disposition'] ?? '';
    final name = RegExp(r'filename="([^"]+)"').firstMatch(disposition)?.group(1) ?? 'sudagri-statements.pdf';
    final out = StatementsPdf(r.bytes, name, r.headers['x-statements-fingerprint']);
    if (!out.looksLikePdf) throw ApiException(tr('لم يصل ملفّ PDF. أعد المحاولة بعد قليل.', 'The PDF did not arrive. Try again in a little while.'));
    return out;
  }
}
