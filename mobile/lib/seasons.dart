/// المواسم في التطبيق (البند ٢٠٣): مواسمي، وصفحة الموسم بمراحلها ودفترها، والقيد بلا شبكة.
///
/// Everything is read and written through the website's routes under /api/app/seasons, with the app's session, so
/// row-level security and the ledger's own checks decide exactly as they do on the website: the list is /seasons, a
/// season is /seasons/[id], an entry goes through the same `recordLedgerEntry` as the website's form, and a stage is
/// signed off by the same `signOffStage`.
///
/// THE OUTBOX
///
/// A cost typed in the field with no network is kept on the phone and sent when the network is back, by the same
/// rules as the website's outbox (src/lib/outbox.ts):
///
///   - Only the form's text fields, under the account that wrote them: another account signed in on the same phone
///     is never offered them and never sends them.
///   - Each item is keyed by its season (`ledger:<seasonId>`; `ledger:unassigned` for the blank form, whose season is
///     chosen once online), and carries the phone's day it was written as `entry_date`, so a late send keeps the day.
///   - Seven days at most, twenty items at most, and the same form twice within a minute is one double tap.
///   - Sending takes each item out of the box first. One that never reached the server, or met a server that was
///     down, goes back with those after it; one the server answered with a refusal is not sent again, and its reason
///     is shown — as the website does. The app also keeps an item whose session had ended, rather than lose it.
library;

import 'dart:convert';
import 'dart:math';

import 'package:shared_preferences/shared_preferences.dart';

import 'account.dart';
import 'api.dart';

// ── Formatting ───────────────────────────────────────────────────────────────

/// A whole number with thousands commas, as the website's `n0` writes it (en-US grouping).
String n0(num v) {
  // JavaScript's Math.round (a half goes up, -1250.5 → -1250), so the app writes the website's figure, not Dart's.
  final r = (v + 0.5).floor();
  final neg = r < 0;
  final s = r.abs().toString();
  final b = StringBuffer();
  for (var i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 == 0) b.write(',');
    b.write(s[i]);
  }
  return '${neg ? '-' : ''}$b';
}

/// A figure with up to two decimals and commas, as `toLocaleString("en-US")` writes an amount.
String amount2(num v) {
  final fixed = v.abs().toStringAsFixed(2);
  final parts = fixed.split('.');
  final whole = n0(int.parse(parts[0]));
  final frac = parts[1].replaceFirst(RegExp(r'0+$'), '');
  final sign = v < 0 && fixed != '0.00' ? '-' : '';
  return frac.isEmpty ? '$sign$whole' : '$sign$whole.$frac';
}

double _d(Object? v) => v is num ? v.toDouble() : double.tryParse('$v') ?? 0;
double? _dn(Object? v) => v == null ? null : (v is num ? v.toDouble() : double.tryParse('$v'));

// ── The ledger's items ───────────────────────────────────────────────────────

/// The categories of a ledger entry, in the website's order (src/lib/season.ts, LEDGER_LABEL).
const ledgerCategories = <(String, String)>[
  ('seeds', 'بذور'),
  ('fertiliser', 'أسمدة'),
  ('pesticide', 'مبيدات'),
  ('labour', 'عمالة'),
  ('irrigation', 'ري ووقود'),
  ('transport', 'نقل'),
  ('other', 'أخرى'),
  ('revenue', 'إيراد'),
];

String categoryLabel(String key) =>
    ledgerCategories.firstWhere((c) => c.$1 == key, orElse: () => (key, key)).$2;

/// «دُفع أو قُبض», as the website's form offers it.
const paidFromChoices = <(String, String)>[
  ('cash', 'نقداً'),
  ('bank', 'من البنك'),
  ('wallet', 'محفظة إلكترونية'),
  ('credit', 'آجل — لم يُدفع أو يُقبض بعد'),
];

const currencyChoices = <(String, String)>[
  ('USD', 'دولار (\$)'),
  ('SDG', 'جنيه سوداني'),
];

// ── Models ───────────────────────────────────────────────────────────────────

String seasonStatusLabel(String status) => switch (status) {
      'completed' => 'مكتمل',
      'abandoned' => 'متوقف',
      _ => 'جارٍ',
    };

class SeasonRow {
  const SeasonRow({
    required this.id,
    required this.name,
    required this.crop,
    required this.feddans,
    required this.location,
    required this.plantingDate,
    required this.status,
  });

  final String id;
  final String name;
  final String crop;
  final double feddans;
  final String? location;
  final String plantingDate;
  final String status;

  bool get active => status == 'active';

  factory SeasonRow.fromJson(Map<String, dynamic> j) => SeasonRow(
        id: j['id'] as String,
        name: j['name'] as String? ?? '',
        crop: j['crop'] as String? ?? j['crop_key'] as String? ?? '',
        feddans: _d(j['feddans']),
        location: j['location'] as String?,
        plantingDate: j['planting_date'] as String? ?? '',
        status: j['status'] as String? ?? 'active',
      );
}

class SeasonsList {
  const SeasonsList({required this.mine, required this.partner});
  final List<SeasonRow> mine;
  final List<SeasonRow> partner;

  factory SeasonsList.fromJson(Map<String, dynamic> j) => SeasonsList(
        mine: [for (final r in (j['seasons'] as List? ?? const [])) SeasonRow.fromJson(r as Map<String, dynamic>)],
        partner: [for (final r in (j['partner'] as List? ?? const [])) SeasonRow.fromJson(r as Map<String, dynamic>)],
      );
}

class StageView {
  const StageView({
    required this.id,
    required this.name,
    required this.plannedStart,
    required this.plannedEnd,
    required this.waterM3,
    required this.budget,
    required this.spent,
    required this.left,
    required this.completed,
    required this.released,
    required this.reason,
    required this.activities,
    required this.evidence,
  });

  final String id;
  final String name;
  final String plannedStart;
  final String plannedEnd;
  final double waterM3;
  final double budget;
  final double spent;
  final double left;
  final bool completed;
  final bool released;
  final String? reason;
  final List<String> activities;
  final List<String> evidence;

  factory StageView.fromJson(Map<String, dynamic> j) => StageView(
        id: j['id'] as String,
        name: j['name'] as String? ?? '',
        plannedStart: j['planned_start'] as String? ?? '',
        plannedEnd: j['planned_end'] as String? ?? '',
        waterM3: _d(j['water_m3']),
        budget: _d(j['budget']),
        spent: _d(j['spent']),
        left: _d(j['left']),
        completed: j['completed'] == true,
        released: j['released'] == true,
        reason: j['reason'] as String?,
        activities: [for (final a in (j['activities'] as List? ?? const [])) '$a'],
        evidence: [
          for (final e in (j['evidence'] as List? ?? const []))
            ((e as Map)['caption'] as String?) ?? 'دليل',
        ],
      );
}

class EntryView {
  const EntryView({
    required this.id,
    required this.category,
    required this.label,
    required this.description,
    required this.entryDate,
    required this.currency,
    required this.amountUsd,
    required this.enteredAmount,
    required this.fxRate,
    required this.paidFrom,
    required this.paidFromLabel,
    this.settledOn,
  });

  final String id;
  final String category;
  final String label;
  final String? description;
  final String entryDate;
  final String currency;
  final double amountUsd;
  final double? enteredAmount;
  final double? fxRate;
  final String paidFrom;
  final String paidFromLabel;
  final String? settledOn;

  bool get isRevenue => category == 'revenue';

  /// The figure as it was paid, as the website's table writes it.
  String get paid => currency == 'SDG' && enteredAmount != null ? '${amount2(enteredAmount!)} ج.س' : '\$${amount2(amountUsd)}';

  factory EntryView.fromJson(Map<String, dynamic> j) => EntryView(
        id: j['id'] as String,
        category: j['category'] as String? ?? 'other',
        label: j['label'] as String? ?? categoryLabel(j['category'] as String? ?? ''),
        description: j['description'] as String?,
        entryDate: j['entry_date'] as String? ?? '',
        currency: j['currency'] as String? ?? 'USD',
        amountUsd: _d(j['amount_usd']),
        enteredAmount: _dn(j['entered_amount']),
        fxRate: _dn(j['fx_rate']),
        paidFrom: j['paid_from'] as String? ?? 'cash',
        paidFromLabel: j['paid_from_label'] as String? ?? '',
        settledOn: j['settled_on'] as String?,
      );
}

class CropValue {
  const CropValue({required this.usd, required this.pounds, required this.note});
  final double? usd;
  final double? pounds;
  final String note;

  String get headline => [
        if (usd != null) '\$${n0(usd!)}',
        if (pounds != null) '${n0(pounds!)} جنيه',
      ].join(' · ');

  factory CropValue.fromJson(Map<String, dynamic> j) =>
      CropValue(usd: _dn(j['usd']), pounds: _dn(j['pounds']), note: j['note'] as String? ?? '');
}

class Revaluation {
  const Revaluation({
    required this.payableBooked,
    required this.payableToday,
    required this.receivableBooked,
    required this.receivableToday,
    required this.difference,
  });
  final double payableBooked;
  final double payableToday;
  final double receivableBooked;
  final double receivableToday;
  final double difference;

  factory Revaluation.fromJson(Map<String, dynamic> j) => Revaluation(
        payableBooked: _d(j['payableBooked']),
        payableToday: _d(j['payableToday']),
        receivableBooked: _d(j['receivableBooked']),
        receivableToday: _d(j['receivableToday']),
        difference: _d(j['difference']),
      );
}

class SeasonView {
  const SeasonView({
    required this.id,
    required this.name,
    required this.crop,
    required this.station,
    required this.irrigation,
    required this.feddans,
    required this.location,
    required this.status,
    required this.partnershipId,
    required this.isOwner,
    required this.canWrite,
    required this.today,
    required this.done,
    required this.total,
    required this.pct,
    required this.totals,
    required this.byCategory,
    required this.variancePlanned,
    required this.varianceSpent,
    required this.unassigned,
    required this.stages,
    required this.entries,
    required this.credit,
    required this.rate,
    required this.rateDate,
    required this.revaluation,
    required this.cropValue,
    required this.bandP50,
  });

  final String id;
  final String name;
  final String crop;
  final String station;
  final String irrigation;
  final double feddans;
  final String? location;
  final String status;
  final String? partnershipId;
  final bool isOwner;
  final bool canWrite;
  final String today;
  final int done;
  final int total;
  final int pct;
  final Map<String, double?> totals;
  final List<(String label, double amount, int share)> byCategory;
  final double variancePlanned;
  final double varianceSpent;
  final double unassigned;
  final List<StageView> stages;
  final List<EntryView> entries;
  final List<EntryView> credit;
  final double? rate;
  final String? rateDate;
  final Revaluation? revaluation;
  final CropValue? cropValue;
  final double? bandP50;

  double t(String k) => totals[k] ?? 0;

  /// What the form says about the rate, as the website's form says it.
  String get rateHint => rate != null
      ? 'إن كتبت بالجنيه ولم تكتب سعراً، نأخذ ${amount2(rate!)} جنيهاً للدولار (السوق الموازي، $rateDate).'
      : 'إن كتبت بالجنيه فاكتب سعر الصرف الذي صرفت به (جنيهات لكل دولار)؛ لا سعر منشوراً اليوم نأخذه عنك.';

  factory SeasonView.fromJson(Map<String, dynamic> j) {
    final s = (j['season'] as Map?)?.cast<String, dynamic>() ?? const <String, dynamic>{};
    final p = (j['progress'] as Map?)?.cast<String, dynamic>() ?? const <String, dynamic>{};
    final totals = (j['totals'] as Map?)?.cast<String, dynamic>() ?? const <String, dynamic>{};
    final v = (j['variance'] as Map?)?.cast<String, dynamic>() ?? const <String, dynamic>{};
    final rate = (j['suggested_rate'] as Map?)?.cast<String, dynamic>();
    final reval = (j['revaluation'] as Map?)?.cast<String, dynamic>();
    final crop = (j['crop_value'] as Map?)?.cast<String, dynamic>();
    final band = (j['band'] as Map?)?.cast<String, dynamic>();
    return SeasonView(
      id: s['id'] as String? ?? '',
      name: s['name'] as String? ?? '',
      crop: s['crop'] as String? ?? '',
      station: s['station'] as String? ?? '',
      irrigation: s['irrigation'] as String? ?? '',
      feddans: _d(s['feddans']),
      location: s['location'] as String?,
      status: s['status'] as String? ?? 'active',
      partnershipId: s['partnership_id'] as String?,
      isOwner: j['is_owner'] == true,
      canWrite: j['can_write'] == true,
      today: j['today'] as String? ?? '',
      done: (p['done'] as num?)?.toInt() ?? 0,
      total: (p['total'] as num?)?.toInt() ?? 0,
      pct: (p['pct'] as num?)?.toInt() ?? 0,
      totals: {for (final e in totals.entries) e.key: _dn(e.value)},
      byCategory: [
        for (final c in (j['by_category'] as List? ?? const []))
          (
            (c as Map)['label'] as String? ?? '',
            _d(c['amount']),
            (c['share'] as num?)?.toInt() ?? 0,
          ),
      ],
      variancePlanned: _d(v['planned']),
      varianceSpent: _d(v['spent']),
      unassigned: _d(v['unassigned']),
      stages: [for (final x in (j['stages'] as List? ?? const [])) StageView.fromJson(x as Map<String, dynamic>)],
      entries: [for (final x in (j['entries'] as List? ?? const [])) EntryView.fromJson(x as Map<String, dynamic>)],
      credit: [for (final x in (j['credit'] as List? ?? const [])) EntryView.fromJson(x as Map<String, dynamic>)],
      rate: rate == null ? null : _dn(rate['rate']),
      rateDate: rate?['rate_date'] as String?,
      revaluation: reval == null ? null : Revaluation.fromJson(reval),
      cropValue: crop == null ? null : CropValue.fromJson(crop),
      bandP50: band == null ? null : _dn(band['p50']),
    );
  }
}

// ── The outbox ───────────────────────────────────────────────────────────────

/// One form kept on the phone: `src/lib/outbox.ts`'s OutboxItem, with the fields as a map.
class OutboxItem {
  const OutboxItem({
    required this.id,
    required this.key,
    required this.label,
    required this.userId,
    required this.createdAt,
    required this.fields,
  });

  final String id;

  /// `ledger:<seasonId>`, or `ledger:unassigned` for the blank form.
  final String key;
  final String label;
  final String userId;

  /// Milliseconds since the epoch.
  final int createdAt;
  final Map<String, String> fields;

  String? get seasonId {
    final s = key.startsWith('ledger:') ? key.substring(7) : null;
    return s == null || s == 'unassigned' ? null : s;
  }

  Map<String, dynamic> toJson() =>
      {'id': id, 'key': key, 'label': label, 'userId': userId, 'createdAt': createdAt, 'fields': fields};

  /// Null for anything malformed: a damaged box loses that item, not the rest.
  static OutboxItem? tryParse(Object? raw) {
    if (raw is! Map) return null;
    final id = raw['id'], key = raw['key'], label = raw['label'], user = raw['userId'], at = raw['createdAt'];
    final fields = raw['fields'];
    if (id is! String || key is! String || label is! String || user is! String || at is! int || fields is! Map) {
      return null;
    }
    final out = <String, String>{};
    for (final e in fields.entries) {
      if (e.key is! String || e.value is! String) return null;
      out[e.key as String] = e.value as String;
    }
    return OutboxItem(id: id, key: key, label: label, userId: user, createdAt: at, fields: out);
  }
}

enum KeepResult { kept, duplicate, full, unavailable, noOwner, unfit }

/// Whether the form's text is safe on the phone now (kept, or already kept).
bool keptOk(KeepResult r) => r == KeepResult.kept || r == KeepResult.duplicate;

/// What to tell the person after a form could not be sent, in the website's words (outboxClient.ts `keptMessage`).
String keptMessage(KeepResult r) => switch (r) {
      KeepResult.kept || KeepResult.duplicate =>
        'لا يوجد اتصال الآن. حفظنا ما كتبتَه على هاتفك، وسيُرسَل حين تعود الشبكة (افتح هذه الصفحة وأنت متّصل).',
      KeepResult.full =>
        'لا يوجد اتصال، وعندك عشرون شيئاً محفوظاً لم يُرسل، فلا نستطيع حفظ المزيد. أرسلها أولاً حين تعود الشبكة.',
      KeepResult.noOwner => 'لا يوجد اتصال، وتعذّر حفظ ما كتبتَه لأنّ الجلسة غير معروفة. أعد المحاولة حين تتّصل.',
      // The website's «unfit» is a file in the form; the app's form has none, so it can only be a field too long.
      KeepResult.unfit => 'لا يوجد اتصال، ولا يمكن حفظ هذا النموذج لأنّ فيه نصّاً أطول من أن يُحفظ. أعد المحاولة حين تتّصل.',
      KeepResult.unavailable => 'لا يوجد اتصال، وتعذّر حفظ ما كتبتَه على هذا الهاتف. أعد المحاولة حين تتّصل.',
    };

class SendReport {
  const SendReport({required this.sent, required this.refused, required this.waiting});
  final int sent;

  /// The items the server answered with a refusal, and its reason. They are not kept.
  final List<(OutboxItem, String)> refused;

  /// What is still in the box for this account and form after the send.
  final int waiting;
}

/// The messages `AccountController` raises when a request never got an answer about the form itself: no network, the
/// site not set, a session that ended (the person signs in again and the entry still waits), or a server that was
/// down (a 5xx with no JSON). Anything else is the server's own refusal of the form.
bool isOutage(ApiException e) {
  final m = e.message;
  return m.startsWith('تعذّر الاتصال') ||
      m.startsWith('التطبيق غير مضبوط') ||
      m == 'ادخل إلى حسابك.' ||
      m == 'انتهت جلستك. ادخل من جديد.' ||
      RegExp(r'\(5\d\d\)').hasMatch(m);
}

/// The `YYYY-MM-DD` the person wrote the form on, in the phone's own day (outbox.ts `localDay`).
String localDay(DateTime t) {
  final l = t.toLocal();
  String p(int n) => n.toString().padLeft(2, '0');
  return '${l.year}-${p(l.month)}-${p(l.day)}';
}

/// The account's id, read from its access token (the token's `sub`). Null when it cannot be read: then nothing is
/// kept, as the website keeps nothing without an owner.
String? userIdOf(String accessToken) {
  try {
    final parts = accessToken.split('.');
    if (parts.length < 2) return null;
    final payload = jsonDecode(utf8.decode(base64Url.decode(base64Url.normalize(parts[1]))));
    final sub = payload is Map ? payload['sub'] : null;
    return sub is String && sub.isNotEmpty ? sub : null;
  } catch (_) {
    return null;
  }
}

class LedgerOutbox {
  LedgerOutbox({DateTime Function()? now, Random? random})
      : _now = now ?? DateTime.now,
        _random = random ?? Random();

  final DateTime Function() _now;
  final Random _random;

  static const storageKey = 'sudagri.outbox.v1';
  static const maxItems = 20;
  static const maxAge = Duration(days: 7);
  static const maxValueChars = 2000;
  static const duplicateWindow = Duration(minutes: 1);
  static const unassigned = 'ledger:unassigned';
  static String keyFor(String seasonId) => 'ledger:$seasonId';

  static final _secret = RegExp(r'pass(word)?|secret|token|otp|pin\b', caseSensitive: false);
  static final _sending = <String>{};

  int get _ms => _now().millisecondsSinceEpoch;

  /// What is kept, with the malformed and the expired left out. Never throws.
  Future<List<OutboxItem>> load() async {
    try {
      final raw = (await SharedPreferences.getInstance()).getString(storageKey);
      if (raw == null) return [];
      final list = jsonDecode(raw);
      if (list is! List) return [];
      final now = _ms;
      return [
        for (final x in list)
          if (OutboxItem.tryParse(x) case final i?)
            if (now - i.createdAt < maxAge.inMilliseconds && i.createdAt <= now + 60000) i,
      ];
    } catch (_) {
      return [];
    }
  }

  Future<bool> _save(List<OutboxItem> items) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      if (items.isEmpty) {
        await prefs.remove(storageKey);
      } else {
        await prefs.setString(storageKey, jsonEncode([for (final i in items) i.toJson()]));
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  /// The items this account may send, optionally of one form. Another account's are never listed.
  Future<List<OutboxItem>> pending(String? userId, [String? key]) async {
    if (userId == null) return [];
    return [
      for (final i in await load())
        if (i.userId == userId && (key == null || i.key == key)) i,
    ];
  }

  /// Keeps a form that could not be sent, stamped with the phone's day as `entry_date` unless it has one.
  Future<KeepResult> keep({required String key, required String? userId, required Map<String, String> fields}) async {
    if (userId == null) return KeepResult.noOwner;
    final kept = <String, String>{};
    for (final e in fields.entries) {
      if (_secret.hasMatch(e.key)) continue;
      if (e.value.length > maxValueChars) return KeepResult.unfit;
      kept[e.key] = e.value;
    }
    final now = _ms;
    kept.putIfAbsent('entry_date', () => localDay(_now()));
    final items = await load();
    final same = jsonEncode(kept);
    if (items.any((i) =>
        i.userId == userId && i.key == key && now - i.createdAt < duplicateWindow.inMilliseconds && jsonEncode(i.fields) == same)) {
      return KeepResult.duplicate;
    }
    if (items.length >= maxItems) return KeepResult.full;
    final item = OutboxItem(
      id: '${now.toRadixString(36)}-${_random.nextInt(0xffffff).toRadixString(36)}',
      key: key,
      label: 'قيد مصروف أو إيراد',
      userId: userId,
      createdAt: now,
      fields: kept,
    );
    return await _save([...items, item]) ? KeepResult.kept : KeepResult.unavailable;
  }

  Future<void> drop(String id) async => _save([for (final i in await load()) if (i.id != id) i]);

  /// Sends what this account kept for [key] (every ledger item when null). Each item leaves the box before it is sent,
  /// so a second send at the same moment cannot send it twice; [post] throws [ApiException] on a refusal or an outage.
  /// [seasonFor] names the season of an unassigned item (the blank form's): one with none chosen stays in the box.
  Future<SendReport> send({
    required String? userId,
    String? key,
    required Future<void> Function(String seasonId, Map<String, String> fields) post,
    String? Function(OutboxItem item)? seasonFor,
  }) async {
    final guard = key ?? '*';
    if (userId == null || _sending.contains(guard)) {
      return SendReport(sent: 0, refused: const [], waiting: (await pending(userId, key)).length);
    }
    _sending.add(guard);
    var sent = 0;
    final refused = <(OutboxItem, String)>[];
    try {
      final all = await load();
      final mine = [
        for (final i in all)
          if (i.userId == userId && (key == null ? i.key.startsWith('ledger:') : i.key == key))
            if (i.seasonId != null || seasonFor?.call(i) != null) i,
      ];
      if (mine.isEmpty) return SendReport(sent: 0, refused: const [], waiting: (await pending(userId, key)).length);
      final ids = {for (final i in mine) i.id};
      await _save([for (final i in all) if (!ids.contains(i.id)) i]);
      for (var n = 0; n < mine.length; n++) {
        final item = mine[n];
        final season = item.seasonId ?? seasonFor!(item)!;
        try {
          await post(season, item.fields);
          sent++;
        } on ApiException catch (e) {
          if (isOutage(e)) {
            final back = await load();
            await _save([...back, ...mine.sublist(n)].take(maxItems).toList());
            break;
          }
          refused.add((item, e.message));
        }
      }
    } finally {
      _sending.remove(guard);
    }
    return SendReport(sent: sent, refused: refused, waiting: (await pending(userId, key)).length);
  }
}

// ── The client ───────────────────────────────────────────────────────────────

class SeasonsApi {
  SeasonsApi({AccountController? account, LedgerOutbox? outbox})
      : _account = account ?? accountController,
        outbox = outbox ?? LedgerOutbox();

  final AccountController _account;
  final LedgerOutbox outbox;

  String? get userId {
    final s = _account.value;
    return s == null ? null : userIdOf(s.accessToken);
  }

  Future<SeasonsList> list() async => SeasonsList.fromJson(await _account.call('GET', '/api/app/seasons'));

  Future<SeasonView> season(String id) async =>
      SeasonView.fromJson(await _account.call('GET', '/api/app/seasons/${Uri.encodeComponent(id)}'));

  /// Sends an entry now. Throws [ApiException]: [isOutage] tells a lost network from the server's refusal.
  Future<void> addEntry(String seasonId, Map<String, String> fields) async {
    await _account.call('POST', '/api/app/seasons/${Uri.encodeComponent(seasonId)}/entries', body: fields);
  }

  /// Sends an entry, or keeps it on the phone if it could not reach the server. Returns null when it was sent, or
  /// what happened to it on the phone. A refusal from the server is thrown, so the form keeps what was typed.
  Future<KeepResult?> addOrKeep(String seasonId, Map<String, String> fields) async {
    try {
      await addEntry(seasonId, fields);
      return null;
    } on ApiException catch (e) {
      if (!isOutage(e)) rethrow;
      return outbox.keep(key: LedgerOutbox.keyFor(seasonId), userId: userId, fields: fields);
    }
  }

  /// Keeps a blank-form entry with no season yet (the website's /seasons/offline).
  Future<KeepResult> keepUnassigned(Map<String, String> fields) =>
      outbox.keep(key: LedgerOutbox.unassigned, userId: userId, fields: fields);

  Future<SendReport> sendPending({String? seasonId, String? Function(OutboxItem)? seasonFor}) => outbox.send(
        userId: userId,
        key: seasonId == null ? null : LedgerOutbox.keyFor(seasonId),
        post: addEntry,
        seasonFor: seasonFor,
      );

  Future<String> completeStage(String seasonId, String stageId) async {
    final r = await _account.call('POST', '/api/app/seasons/${Uri.encodeComponent(seasonId)}/stages',
        body: {'stage_id': stageId});
    return r['message'] as String? ?? 'اعتُمدت المرحلة.';
  }
}
