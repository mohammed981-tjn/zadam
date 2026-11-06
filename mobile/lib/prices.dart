/// الأسعار والسوق في التطبيق (البند ٢٠٣): what the website's /market, /rates and
/// /market/inputs show, and the reader's own price alerts (/market/alerts).
///
/// The figures are not worked out here. Each route under /api/app/prices reads
/// the very loader the website's page reads (src/lib/priceBoards.ts,
/// src/lib/priceAlerts.ts), so a price, its date and whether it is old are the
/// same in the app and on the site. This file parses what the routes send and
/// words it the way the pages do.
///
/// The boards are public on the website, so they are read here without a
/// session ([siteJson]); the alerts belong to one person and go through the
/// account's signed-in helper ([AccountController.call]).
library;

import 'dart:convert';

import 'package:http/http.dart' as http;

import 'account.dart';
import 'api.dart';

// ── Reading a public route ──────────────────────────────────────────────────

/// One public GET to a route on the website, as the website's own visitors
/// read the same page: no session, no key of ours. The route's own `error`
/// sentence is shown when it refuses.
Future<Map<String, dynamic>> siteJson(
  String path, {
  http.Client? client,
  String? siteUrl,
}) async {
  final site = siteUrl ?? ApiConfig.siteUrl;
  if (site.isEmpty) throw ApiException('التطبيق غير مضبوط للاتصال بالموقع.');
  final c = client ?? http.Client();
  late final http.Response res;
  try {
    res = await c.get(Uri.parse('$site$path')).timeout(const Duration(seconds: 30));
  } catch (_) {
    throw ApiException('تعذّر الاتصال. تحقّق من الشبكة وأعد المحاولة.');
  } finally {
    if (client == null) c.close();
  }
  Map<String, dynamic> body;
  try {
    body = jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>;
  } catch (_) {
    // A proxy or an error page can answer with HTML: a failed load, not a crash.
    throw ApiException('تعذّر تحميل البيانات (${res.statusCode}).');
  }
  if (res.statusCode != 200) {
    throw ApiException(body['error'] as String? ?? 'تعذّر تحميل البيانات (${res.statusCode}).');
  }
  return body;
}

// ── Words and numbers, as the pages write them ──────────────────────────────

const arMonths = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

/// «3 نوفمبر 2026» from 2026-11-03, as the website writes a market day.
String arDay(String ymd) {
  final m = RegExp(r'^(\d{4})-(\d{2})-(\d{2})').firstMatch(ymd);
  if (m == null) return ymd;
  final month = int.parse(m[2]!);
  if (month < 1 || month > 12) return ymd;
  return '${int.parse(m[3]!)} ${arMonths[month - 1]} ${m[1]}';
}

/// «نوفمبر 2026» from 2026-11 (or a full date).
String arMonth(String ym) {
  final m = RegExp(r'^(\d{4})-(\d{2})').firstMatch(ym);
  if (m == null) return ym;
  final month = int.parse(m[2]!);
  if (month < 1 || month > 12) return ym;
  return '${arMonths[month - 1]} ${m[1]}';
}

/// 1234567.891 → «1,234,568», or with [digits] fraction digits at most — the
/// website's `money()` (en-US grouping).
String money(num v, {int digits = 0}) {
  final negative = v < 0;
  final fixed = v.abs().toStringAsFixed(digits);
  final parts = fixed.split('.');
  final whole = parts[0].replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => ',');
  var frac = parts.length > 1 ? parts[1].replaceFirst(RegExp(r'0+$'), '') : '';
  return '${negative ? '-' : ''}$whole${frac.isEmpty ? '' : '.$frac'}';
}

/// «اليوم» · «أمس» · «منذ ٣ أيّام», as the inputs board says when a report came.
String agoLabel(int days) => days <= 0 ? 'اليوم' : days == 1 ? 'أمس' : 'منذ $days أيّام';

/// What a figure's date line says: its day, and, when it is older than the
/// page's limit, how old and what to do — the website's wording for each board.
///
/// [stale] comes from the server (the same constant the page uses), so the app
/// never decides on its own that a figure is fresh.
String freshnessLabel({
  required String date,
  required int ageDays,
  required bool stale,
  FreshnessKind kind = FreshnessKind.crop,
}) {
  final day = arDay(date);
  switch (kind) {
    case FreshnessKind.crop:
      return stale
          ? 'بتاريخ $day — مضى $ageDays يوماً، فتحقّق قبل أن تبيع أو تشتري عليه'
          : 'بتاريخ $day';
    case FreshnessKind.rate:
      return stale ? 'بتاريخ $day — مضى $ageDays أيام، فتحقّق قبل أن تعتمده' : 'بتاريخ $day';
    case FreshnessKind.published:
      return stale ? 'نُشر في $day — قديم، فتحقّق قبل أن تشتري عليه' : 'نُشر في $day';
  }
}

enum FreshnessKind { crop, rate, published }

/// The daily feeds whose freshness the site watches (src/lib/priceFreshness.ts).
const feedNames = {
  'fx_bank': 'سعر بنك الخرطوم',
  'fx_parallel': 'سعر السوق الموازي',
  'crop_obeid': 'نشرة سوق الأبيض',
};

num? _num(Object? v) => v is num ? v : (v is String ? num.tryParse(v) : null);
int _int(Object? v) => _num(v)?.toInt() ?? 0;
String _str(Object? v) => v is String ? v : (v == null ? '' : '$v');
String? _strOrNull(Object? v) => v is String && v.isNotEmpty ? v : null;
List<Map<String, dynamic>> _list(Object? v) =>
    v is List ? v.whereType<Map>().map((e) => e.cast<String, dynamic>()).toList() : const [];

// ── /api/app/prices — the crop market ───────────────────────────────────────

class PricePoint {
  const PricePoint(this.date, this.price);
  final String date;
  final double price;
}

class SeriesCard {
  const SeriesCard({
    required this.marketName,
    required this.perUnit,
    required this.price,
    required this.date,
    required this.ageDays,
    required this.stale,
    required this.source,
    required this.history,
    required this.alertSubject,
    this.usd,
    this.note,
    this.change,
    this.changePct,
    this.arrivals,
    this.allSorghum = false,
  });

  final String marketName;
  final String perUnit;
  final double price;
  final double? usd;
  final String date;
  final int ageDays;
  final bool stale;
  final String source;
  final String? note;
  final double? change;
  final double? changePct;
  final double? arrivals;
  final bool allSorghum;
  final List<PricePoint> history;

  /// What the alert form takes for this series: `crop|market|crop|unit`.
  final String alertSubject;

  String get freshness => freshnessLabel(date: date, ageDays: ageDays, stale: stale);

  factory SeriesCard.fromJson(Map<String, dynamic> j) => SeriesCard(
        marketName: _str(j['market_name']),
        perUnit: _str(j['per_unit']),
        price: _num(j['price'])?.toDouble() ?? 0,
        usd: _num(j['usd'])?.toDouble(),
        date: _str(j['date']),
        ageDays: _int(j['age_days']),
        stale: j['stale'] == true,
        source: _str(j['source']),
        note: _strOrNull(j['note']),
        change: _num(j['change'])?.toDouble(),
        changePct: _num(j['change_pct'])?.toDouble(),
        arrivals: _num(j['arrivals'])?.toDouble(),
        allSorghum: j['all_sorghum'] == true,
        history: [
          for (final p in _list(j['history']))
            PricePoint(_str(p['date']), _num(p['price'])?.toDouble() ?? 0),
        ],
        alertSubject: _str(j['alert_subject']),
      );
}

class CropCard {
  const CropCard({required this.crop, required this.name, required this.series});
  final String crop;
  final String name;
  final List<SeriesCard> series;

  factory CropCard.fromJson(Map<String, dynamic> j) => CropCard(
        crop: _str(j['crop']),
        name: _str(j['name']),
        series: _list(j['series']).map(SeriesCard.fromJson).toList(),
      );
}

class FeedState {
  const FeedState({required this.key, required this.limitDays, required this.stale, this.newest, this.ageDays});
  final String key;
  final String? newest;
  final int? ageDays;
  final int limitDays;
  final bool stale;
  String get name => feedNames[key] ?? key;

  factory FeedState.fromJson(Map<String, dynamic> j) => FeedState(
        key: _str(j['key']),
        newest: _strOrNull(j['newest']),
        ageDays: _num(j['age_days'])?.toInt(),
        limitDays: _int(j['limit_days']),
        stale: j['stale'] == true,
      );
}

class FewsRow {
  const FewsRow({required this.market, required this.product, required this.unit, required this.value, required this.month, this.prev});
  final String market;
  final String product;
  final String unit;
  final double value;
  final double? prev;
  final String month;

  factory FewsRow.fromJson(Map<String, dynamic> j) => FewsRow(
        market: _str(j['market']),
        product: _str(j['product']),
        unit: _str(j['unit']),
        value: _num(j['value'])?.toDouble() ?? 0,
        prev: _num(j['prev'])?.toDouble(),
        month: _str(j['month']),
      );
}

class WfpItemRow {
  const WfpItemRow({required this.name, required this.unit, required this.month, required this.price, this.vsMonthPct, this.vsYearPct, this.unusual, this.median});
  final String name;
  final String unit;
  final String month;
  final double price;
  final num? vsMonthPct;
  final num? vsYearPct;

  /// 'low' or 'high' when the price is far from the towns' median — the page's «تحقّق منه».
  final String? unusual;
  final double? median;

  factory WfpItemRow.fromJson(Map<String, dynamic> j) => WfpItemRow(
        name: _str(j['name']),
        unit: _str(j['unit']),
        month: _str(j['month']),
        price: _num(j['price'])?.toDouble() ?? 0,
        vsMonthPct: _num(j['vs_month_pct']),
        vsYearPct: _num(j['vs_year_pct']),
        unusual: _strOrNull(j['unusual']),
        median: _num(j['median'])?.toDouble(),
      );
}

class WfpTown {
  const WfpTown({required this.name, required this.latest, required this.items, this.place});
  final String name;
  final String? place;
  final String latest;
  final List<WfpItemRow> items;

  factory WfpTown.fromJson(Map<String, dynamic> j) => WfpTown(
        name: _str(j['name']),
        place: _strOrNull(j['place']),
        latest: _str(j['latest']),
        items: _list(j['items']).map(WfpItemRow.fromJson).toList(),
      );
}

/// WFP's monthly Market Monitor, which leads the page while the bourses are quiet.
class WfpMonthly {
  const WfpMonthly({
    required this.month,
    required this.report,
    required this.source,
    required this.arrivalsTonnes,
    required this.arrivalsVsLastMonthPct,
    required this.priceVsLastMonthPct,
    required this.priceVsLastYearPct,
    required this.kordofanPrice,
    required this.kordofanLastMonth,
    required this.nationalPrice,
    required this.nationalLastMonth,
  });

  final String month;
  final String report;
  final String source;
  final double arrivalsTonnes;
  final double arrivalsVsLastMonthPct;
  final double priceVsLastMonthPct;
  final double priceVsLastYearPct;
  final double kordofanPrice;
  final double kordofanLastMonth;
  final double nationalPrice;
  final double nationalLastMonth;

  static WfpMonthly? tryParse(Object? raw) {
    if (raw is! Map) return null;
    final j = raw.cast<String, dynamic>();
    final a = (j['gedarefAuction'] as Map?)?.cast<String, dynamic>();
    final s = (j['sorghumRetailPerKg'] as Map?)?.cast<String, dynamic>();
    final k = (s?['northKordofan'] as Map?)?.cast<String, dynamic>();
    final n = (s?['national'] as Map?)?.cast<String, dynamic>();
    if (a == null || k == null || n == null) return null;
    double d(Object? v) => _num(v)?.toDouble() ?? 0;
    return WfpMonthly(
      month: _str(j['month']),
      report: _str(j['report']),
      source: _str(j['source']),
      arrivalsTonnes: d(a['arrivalsTonnes']),
      arrivalsVsLastMonthPct: d(a['arrivalsVsLastMonthPct']),
      priceVsLastMonthPct: d(a['priceVsLastMonthPct']),
      priceVsLastYearPct: d(a['priceVsLastYearPct']),
      kordofanPrice: d(k['price']),
      kordofanLastMonth: d(k['lastMonth']),
      nationalPrice: d(n['price']),
      nationalLastMonth: d(n['lastMonth']),
    );
  }
}

class MarketBoard {
  const MarketBoard({
    required this.quiet,
    required this.crops,
    required this.lastBulletins,
    required this.feeds,
    required this.staleLines,
    required this.unitsNote,
    this.checked,
    this.usdBank,
    this.usdSell,
    this.usdDate,
    this.wfpMonthly,
    this.fews,
    this.fewsSource = '',
    this.wfpTowns = const [],
    this.wfpLatest,
    this.wfpSource = '',
  });

  final String? checked;
  final bool quiet;
  final List<CropCard> crops;
  final List<({String market, String date})> lastBulletins;
  final String? usdBank;
  final double? usdSell;
  final String? usdDate;
  final WfpMonthly? wfpMonthly;

  /// Null when FEWS NET could not be reached — the page says so.
  final List<FewsRow>? fews;
  final String fewsSource;
  final List<WfpTown> wfpTowns;
  final String? wfpLatest;
  final String wfpSource;
  final List<FeedState> feeds;
  final List<String> staleLines;
  final String unitsNote;

  List<FeedState> get staleFeeds => feeds.where((f) => f.stale).toList();

  factory MarketBoard.fromJson(Map<String, dynamic> j) {
    final usd = (j['usd'] as Map?)?.cast<String, dynamic>();
    final towns = (j['wfp_towns'] as Map?)?.cast<String, dynamic>();
    return MarketBoard(
      checked: _strOrNull(j['checked']),
      quiet: j['quiet'] == true,
      crops: _list(j['crops']).map(CropCard.fromJson).toList(),
      lastBulletins: [
        for (final b in _list(j['last_bulletins'])) (market: _str(b['market_name']), date: _str(b['date'])),
      ],
      usdBank: _strOrNull(usd?['bank_name']),
      usdSell: _num(usd?['sell'])?.toDouble(),
      usdDate: _strOrNull(usd?['date']),
      wfpMonthly: WfpMonthly.tryParse(j['wfp_monthly']),
      fews: j['fews'] is List ? _list(j['fews']).map(FewsRow.fromJson).toList() : null,
      fewsSource: _str(j['fews_source']),
      wfpTowns: _list(towns?['towns']).map(WfpTown.fromJson).toList(),
      wfpLatest: _strOrNull(towns?['latest']),
      wfpSource: _str(towns?['source']),
      feeds: _list(j['feeds']).map(FeedState.fromJson).toList(),
      staleLines: [for (final l in (j['stale_lines'] as List? ?? const [])) '$l'],
      unitsNote: _str(j['units_note']),
    );
  }
}

// ── /api/app/prices/rates — exchange rates ──────────────────────────────────

class Quote {
  const Quote({required this.buy, required this.sell, required this.date, required this.source, required this.ageDays, required this.stale, this.name});
  final String? name;
  final double buy;
  final double sell;
  final String date;
  final String source;
  final int ageDays;
  final bool stale;

  String get freshness => freshnessLabel(date: date, ageDays: ageDays, stale: stale, kind: FreshnessKind.rate);

  static Quote? tryParse(Object? raw) {
    if (raw is! Map) return null;
    final j = raw.cast<String, dynamic>();
    return Quote(
      name: _strOrNull(j['name']),
      buy: _num(j['buy'])?.toDouble() ?? 0,
      sell: _num(j['sell'])?.toDouble() ?? 0,
      date: _str(j['date']),
      source: _str(j['source']),
      ageDays: _int(j['age_days']),
      stale: j['stale'] == true,
    );
  }
}

class CurrencyRow {
  const CurrencyRow({required this.code, required this.name, this.bank, this.parallel});
  final String code;
  final String name;

  /// Pounds for one unit of the currency at each rate.
  final double? bank;
  final double? parallel;

  factory CurrencyRow.fromJson(Map<String, dynamic> j) => CurrencyRow(
        code: _str(j['code']),
        name: _str(j['name']),
        bank: _num(j['bank'])?.toDouble(),
        parallel: _num(j['parallel'])?.toDouble(),
      );
}

class RatesBoard {
  const RatesBoard({required this.table, this.bank, this.parallel, this.cbosLastBulletin, this.cbosLiberalised, this.cbosCircular, this.cbosSource, this.crossSource});
  final Quote? bank;
  final Quote? parallel;
  final List<CurrencyRow> table;
  final String? cbosLastBulletin;
  final String? cbosLiberalised;
  final String? cbosCircular;
  final String? cbosSource;
  final String? crossSource;

  factory RatesBoard.fromJson(Map<String, dynamic> j) {
    final c = (j['cbos'] as Map?)?.cast<String, dynamic>();
    return RatesBoard(
      bank: Quote.tryParse(j['bank']),
      parallel: Quote.tryParse(j['parallel']),
      table: _list(j['table']).map(CurrencyRow.fromJson).toList(),
      cbosLastBulletin: _strOrNull(c?['last_bulletin']),
      cbosLiberalised: _strOrNull(c?['liberalised']),
      cbosCircular: _strOrNull(c?['circular']),
      cbosSource: _strOrNull(c?['source']),
      crossSource: _strOrNull(j['cross_source']),
    );
  }
}

/// The converter on /rates: [amount] of [row]'s currency in pounds at each rate.
({double? bank, double? parallel}) convert(double amount, CurrencyRow row) => (
      bank: row.bank == null ? null : amount * row.bank!,
      parallel: row.parallel == null ? null : amount * row.parallel!,
    );

// ── /api/app/prices/inputs — fertiliser and fuel ────────────────────────────

class InputSummaryRow {
  const InputSummaryRow({
    required this.state,
    required this.verdict,
    required this.verdictLabel,
    required this.perUnit,
    required this.reports,
    required this.reporters,
    required this.unavailable,
    required this.latestDaysAgo,
    this.kind,
    this.median,
    this.low,
    this.high,
  });

  final String state;
  final String? kind;
  final String verdict;
  final String verdictLabel;
  final double? median;
  final double? low;
  final double? high;
  final String perUnit;
  final int reports;
  final int reporters;
  final int unavailable;
  final int latestDaysAgo;

  /// The line under the price, as the board writes it.
  String get countLine {
    final parts = ['$reports بلاغ من $reporters شخص'];
    if (unavailable > 0) parts.add('$unavailable قال «غير موجود»');
    parts.add('آخرها ${agoLabel(latestDaysAgo)}');
    if (reporters == 1) parts.add('بلاغُ شخصٍ واحد: خذه بحذر');
    return parts.join(' · ');
  }

  factory InputSummaryRow.fromJson(Map<String, dynamic> j) => InputSummaryRow(
        state: _str(j['state']),
        kind: _strOrNull(j['kind']),
        verdict: _str(j['verdict']),
        verdictLabel: _str(j['verdict_label']),
        median: _num(j['median'])?.toDouble(),
        low: _num(j['low'])?.toDouble(),
        high: _num(j['high'])?.toDouble(),
        perUnit: _str(j['per_unit']),
        reports: _int(j['reports']),
        reporters: _int(j['reporters']),
        unavailable: _int(j['unavailable']),
        latestDaysAgo: _int(j['latest_days_ago']),
      );
}

class InputGroup {
  const InputGroup({required this.name, required this.rows});
  final String name;
  final List<InputSummaryRow> rows;

  factory InputGroup.fromJson(Map<String, dynamic> j) =>
      InputGroup(name: _str(j['name']), rows: _list(j['rows']).map(InputSummaryRow.fromJson).toList());
}

class InputReport {
  const InputReport({required this.item, required this.state, required this.locality, required this.perUnit, required this.availability, required this.availabilityLabel, required this.observedOn, this.kind, this.price, this.note});
  final String item;
  final String state;
  final String locality;
  final String? kind;
  final double? price;
  final String perUnit;
  final String availability;
  final String availabilityLabel;
  final String observedOn;
  final String? note;

  factory InputReport.fromJson(Map<String, dynamic> j) => InputReport(
        item: _str(j['item']),
        state: _str(j['state']),
        locality: _str(j['locality']),
        kind: _strOrNull(j['kind']),
        price: _num(j['price'])?.toDouble(),
        perUnit: _str(j['per_unit']),
        availability: _str(j['availability']),
        availabilityLabel: _str(j['availability_label']),
        observedOn: _str(j['observed_on']),
        note: _strOrNull(j['note']),
      );
}

class PublishedFigure {
  const PublishedFigure({required this.item, required this.place, required this.price, required this.perUnit, required this.date, required this.ageDays, required this.old, required this.source, required this.url, this.note});
  final String item;
  final String place;
  final double price;
  final String perUnit;
  final String date;
  final int ageDays;
  final bool old;
  final String? note;
  final String source;
  final String url;

  String get freshness => freshnessLabel(date: date, ageDays: ageDays, stale: old, kind: FreshnessKind.published);

  factory PublishedFigure.fromJson(Map<String, dynamic> j) => PublishedFigure(
        item: _str(j['item']),
        place: _str(j['place']),
        price: _num(j['price'])?.toDouble() ?? 0,
        perUnit: _str(j['per_unit']),
        date: _str(j['date']),
        ageDays: _int(j['age_days']),
        old: j['old'] == true,
        note: _strOrNull(j['note']),
        source: _str(j['source']),
        url: _str(j['url']),
      );
}

class PublishedTrend {
  const PublishedTrend({required this.month, required this.text, required this.source, required this.url});
  final String month;
  final String text;
  final String source;
  final String url;

  factory PublishedTrend.fromJson(Map<String, dynamic> j) =>
      PublishedTrend(month: _str(j['month']), text: _str(j['text']), source: _str(j['source']), url: _str(j['url']));
}

class InputsBoard {
  const InputsBoard({required this.pending, required this.windowDays, required this.groups, required this.reports, required this.suppliers, this.figures, this.trends = const []});
  final bool pending;
  final int windowDays;
  final List<InputGroup> groups;
  final List<InputReport> reports;
  final List<({String name, int count})> suppliers;

  /// Null when the sources file could not be read.
  final List<PublishedFigure>? figures;
  final List<PublishedTrend> trends;

  factory InputsBoard.fromJson(Map<String, dynamic> j) {
    final p = (j['published'] as Map?)?.cast<String, dynamic>();
    return InputsBoard(
      pending: j['pending'] == true,
      windowDays: _int(j['window_days']),
      groups: _list(j['groups']).map(InputGroup.fromJson).toList(),
      reports: _list(j['reports']).map(InputReport.fromJson).toList(),
      suppliers: [for (final s in _list(j['suppliers'])) (name: _str(s['name']), count: _int(s['count']))],
      figures: p == null ? null : _list(p['figures']).map(PublishedFigure.fromJson).toList(),
      trends: p == null ? const [] : _list(p['trends']).map(PublishedTrend.fromJson).toList(),
    );
  }
}

// ── /api/app/prices/alerts — the reader's own alerts ────────────────────────

class AlertOption {
  const AlertOption({required this.value, required this.label, required this.unit, required this.price, required this.date});
  final String value;
  final String label;
  final String unit;
  final double price;
  final String date;

  factory AlertOption.fromJson(Map<String, dynamic> j) => AlertOption(
        value: _str(j['value']),
        label: _str(j['label']),
        unit: _str(j['unit']),
        price: _num(j['price'])?.toDouble() ?? 0,
        date: _str(j['date']),
      );
}

class AlertEntry {
  const AlertEntry({required this.id, required this.text, required this.status, this.createdAt, this.firedValue, this.firedMarketDate, this.settledAt});
  final String id;
  final String text;
  final String status;
  final DateTime? createdAt;
  final double? firedValue;
  final String? firedMarketDate;
  final DateTime? settledAt;

  /// What «ما انتهى» says under a finished alert.
  String get outcome => status == 'fired'
      ? 'أُطلق بسعر ${money(firedValue ?? 0)} بتاريخ ${firedMarketDate ?? ''}'
      : 'أوقفتَه ${settledAt == null ? '' : arDay(settledAt!.toIso8601String())}'.trim();

  factory AlertEntry.fromJson(Map<String, dynamic> j, {String status = 'active'}) => AlertEntry(
        id: _str(j['id']),
        text: _str(j['text']),
        status: _strOrNull(j['status']) ?? status,
        createdAt: DateTime.tryParse(_str(j['created_at']))?.toLocal(),
        firedValue: _num(j['fired_value'])?.toDouble(),
        firedMarketDate: _strOrNull(j['fired_market_date']),
        settledAt: DateTime.tryParse(_str(j['settled_at']))?.toLocal(),
      );
}

class AlertsBoard {
  const AlertsBoard({required this.maxActive, required this.options, required this.running, required this.settled});
  final int maxActive;
  final List<AlertOption> options;
  final List<AlertEntry> running;
  final List<AlertEntry> settled;

  bool get full => running.length >= maxActive;

  factory AlertsBoard.fromJson(Map<String, dynamic> j) => AlertsBoard(
        maxActive: _num(j['max_active'])?.toInt() ?? 10,
        options: _list(j['options']).map(AlertOption.fromJson).toList(),
        running: [for (final r in _list(j['running'])) AlertEntry.fromJson(r)],
        settled: [for (final r in _list(j['settled'])) AlertEntry.fromJson(r, status: 'stopped')],
      );
}

/// «600,000» and «٦٠٠٠٠٠» are both ways a person writes a limit — the
/// website's `parseThreshold`. Null when it is not a usable limit in pounds.
double? parseThreshold(String input) {
  final raw = input
      .replaceAllMapped(RegExp('[٠-٩]'), (m) => '${m[0]!.codeUnitAt(0) - 0x660}')
      .replaceAll(RegExp(r'[,٬\s]'), '');
  if (raw.isEmpty) return null;
  final v = double.tryParse(raw);
  if (v == null || !v.isFinite || v <= 0 || v > 100000000000) return null;
  return v;
}

/// The alert form's checks, in the website's order and words, before the
/// round trip. The server makes them again; this only saves a refusal.
String? alertFormProblem({AlertOption? option, String? direction, required String threshold}) {
  if (option == null) return 'اختر ما تريد متابعة سعره.';
  if (direction != 'above' && direction != 'below') return 'اختر: حين يصير السعر فوق الحدّ أو تحته.';
  final limit = parseThreshold(threshold);
  if (limit == null) return 'اكتب سعراً صحيحاً بالجنيه.';
  final past = direction == 'above' ? option.price > limit : option.price < limit;
  if (past) {
    final word = direction == 'above' ? 'فوق' : 'تحت';
    final other = direction == 'above' ? 'أعلى' : 'أدنى';
    return 'السعر الآن ${money(option.price)} وهو $word ${money(limit)} أصلاً. اختر حدّاً $other منه.';
  }
  return null;
}

// ── The client ──────────────────────────────────────────────────────────────

/// The calls the prices screen makes. The boards are public reads; the alerts
/// are the signed-in person's. A screen can be given a stand-in for tests.
class PricesClient {
  PricesClient({this.client, this.siteUrl});

  /// A stand-in transport and site for tests; the app's own otherwise.
  final http.Client? client;
  final String? siteUrl;

  Future<MarketBoard> market() async =>
      MarketBoard.fromJson(await siteJson('/api/app/prices', client: client, siteUrl: siteUrl));

  Future<RatesBoard> rates() async =>
      RatesBoard.fromJson(await siteJson('/api/app/prices/rates', client: client, siteUrl: siteUrl));

  Future<InputsBoard> inputs() async =>
      InputsBoard.fromJson(await siteJson('/api/app/prices/inputs', client: client, siteUrl: siteUrl));

  bool get signedIn => accountController.value != null;

  Future<AlertsBoard> alerts() async =>
      AlertsBoard.fromJson(await accountController.call('GET', '/api/app/prices/alerts'));

  /// Adds an alert; returns the website's confirmation sentence.
  Future<String> addAlert({required String subject, required String direction, required String threshold}) async {
    final body = await accountController.call('POST', '/api/app/prices/alerts', body: {
      'subject': subject,
      'direction': direction,
      'threshold': threshold,
    });
    return body['message'] as String? ?? 'أضفنا التنبيه.';
  }

  Future<String> stopAlert(String id) async {
    final body = await accountController.call('POST', '/api/app/prices/alerts/stop', body: {'id': id});
    return body['message'] as String? ?? 'أوقفنا التنبيه.';
  }
}
