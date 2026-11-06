/// القيد اليدويّ والمراجعة في التطبيق (البند ٢٠٥): what /api/app/books/{journal,review,audit,close} return, and the form's
/// own reading of what was typed.
///
/// The form refuses here what the website's form refuses (src/lib/ledger/journal.ts): fewer than two lines, a line with
/// no account, an amount that is not money, debits that do not equal credits — so nothing obviously wrong is sent. The
/// website's route and the database check it all again; their sentence is what the app shows when they refuse.
library;

import 'dart:math';

import 'account.dart';
import 'i18n.dart';

List<Map<String, dynamic>> _maps(Object? v) => [for (final x in (v as List? ?? const [])) (x as Map).cast<String, dynamic>()];

// ── Money as typed ───────────────────────────────────────────────────────────

/// Arabic-Indic digits and separators to plain ones, spaces dropped (as `normaliseNumber` on the website).
String normaliseNumber(String raw) {
  final b = StringBuffer();
  for (final r in raw.runes) {
    if (r >= 0x660 && r <= 0x669) {
      b.writeCharCode(0x30 + r - 0x660);
    } else if (r >= 0x6f0 && r <= 0x6f9) {
      b.writeCharCode(0x30 + r - 0x6f0);
    } else if (r == 0x66b) {
      b.write('.');
    } else if (r == 0x66c) {
      b.write(',');
    } else if (r == 0x20 || r == 0xa0 || r == 0x202f) {
      continue;
    } else {
      b.writeCharCode(r);
    }
  }
  return b.toString();
}

final _amount = RegExp(r'^(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?$');

/// "1,234.50" or "١٢٣٤٫٥٠" to cents (or piastres); null when it is not a plain amount or has more than two decimals.
int? parseMinor(String raw) {
  final m = _amount.firstMatch(normaliseNumber(raw.trim()));
  if (m == null) return null;
  final frac = m.group(2) ?? '';
  if (frac.length > 2) return null;
  final whole = m.group(1)!.replaceAll(',', '');
  if (whole.length > 11) return null;
  return int.parse(whole) * 100 + (frac.isEmpty ? 0 : int.parse(frac.padRight(2, '0')));
}

/// Cents to "1,234.50".
String formatMinor(int minor) {
  final neg = minor < 0;
  final a = minor.abs();
  final whole = (a ~/ 100).toString().replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => ',');
  return '${neg ? '-' : ''}$whole.${(a % 100).toString().padLeft(2, '0')}';
}

// ── The book and its accounts ────────────────────────────────────────────────

class JournalBook {
  const JournalBook({required this.id, required this.kind, required this.role, required this.label, this.closedThrough, this.alwaysReview = false});
  final String id;
  final String kind;

  /// `owner` or `preparer`: a preparer's entry waits for the owner.
  final String role;
  final String label;
  final String? closedThrough;
  final bool alwaysReview;

  bool get preparer => role == 'preparer';

  factory JournalBook.fromJson(Map<String, dynamic> j) => JournalBook(
        id: j['id'] as String? ?? '',
        kind: j['kind'] as String? ?? '',
        role: j['role'] as String? ?? 'owner',
        label: j['label'] as String? ?? '',
        closedThrough: j['closed_through'] as String?,
        alwaysReview: j['always_review'] == true,
      );
}

class AccountOption {
  const AccountOption({required this.code, required this.name, required this.type, this.systemKey, this.currency, this.provider});
  final String code;
  final String name;
  final String type;
  final String? systemKey;
  final String? currency;
  final String? provider;

  String get label => '$code — $name';

  bool get isMoney => type == 'asset' && (const {'cash_on_hand', 'bank', 'wallet'}.contains(systemKey) || provider != null);
  bool get isInventory => type == 'asset' && code.startsWith('13');

  factory AccountOption.fromJson(Map<String, dynamic> j) => AccountOption(
        code: j['code'] as String? ?? '',
        name: j['name'] as String? ?? '',
        type: j['type'] as String? ?? '',
        systemKey: j['system_key'] as String?,
        currency: j['currency'] as String?,
        provider: j['provider'] as String?,
      );
}

/// A line of a ready entry: the account (by its fixed key), its side, and which accounts may replace it.
class TemplateLine {
  const TemplateLine({required this.side, required this.key, this.choose});
  final String side;
  final String key;
  final String? choose;
}

class EntryTemplate {
  const EntryTemplate({required this.key, required this.group, required this.name, required this.hint, required this.lines});
  final String key;

  /// `daily` or `adjusting`.
  final String group;
  final String name;
  final String hint;
  final List<TemplateLine> lines;

  factory EntryTemplate.fromJson(Map<String, dynamic> j) => EntryTemplate(
        key: j['key'] as String? ?? '',
        group: j['group'] as String? ?? 'daily',
        name: j['name'] as String? ?? '',
        hint: j['hint'] as String? ?? '',
        lines: [
          for (final l in _maps(j['lines']))
            TemplateLine(side: l['side'] as String? ?? 'D', key: l['key'] as String? ?? '', choose: l['choose'] as String?),
        ],
      );
}

/// The accounts a template line lets the person pick instead of its own (as `choicesFor` on the website).
List<AccountOption> choicesFor(List<AccountOption> accounts, String? choose) => switch (choose) {
      'money' => accounts.where((a) => a.isMoney).toList(),
      'expense' => accounts.where((a) => a.type == 'expense').toList(),
      'revenue' => accounts.where((a) => a.type == 'revenue').toList(),
      'inventory' => accounts.where((a) => a.isInventory).toList(),
      'expense_or_inventory' => accounts.where((a) => a.type == 'expense' || a.isInventory).toList(),
      _ => accounts,
    };

class JournalContext {
  const JournalContext({required this.today, required this.books, required this.bookId, required this.accounts, required this.templates});
  final String today;
  final List<JournalBook> books;
  final String? bookId;
  final List<AccountOption> accounts;
  final List<EntryTemplate> templates;

  JournalBook? get book => books.where((b) => b.id == bookId).firstOrNull;

  factory JournalContext.fromJson(Map<String, dynamic> j) => JournalContext(
        today: j['today'] as String? ?? '',
        books: [for (final b in _maps(j['books'])) JournalBook.fromJson(b)],
        bookId: j['book_id'] as String?,
        accounts: [for (final a in _maps(j['accounts'])) AccountOption.fromJson(a)],
        templates: [for (final t in _maps(j['templates'])) EntryTemplate.fromJson(t)],
      );
}

// ── The form ─────────────────────────────────────────────────────────────────

class JournalLine {
  JournalLine({this.account = '', this.side = 'D', this.amount = ''});
  String account;
  String side;
  String amount;

  Map<String, String> toJson() => {'account': account, 'side': side, 'amount': amount.trim()};
}

/// The lines a ready entry fills from the book's own accounts; null when the book lacks one of them.
List<JournalLine>? fillTemplate(EntryTemplate t, List<AccountOption> accounts, {String amount = ''}) {
  final out = <JournalLine>[];
  for (final l in t.lines) {
    final a = accounts.where((x) => x.systemKey == l.key).firstOrNull;
    if (a == null) return null;
    out.add(JournalLine(account: a.code, side: l.side, amount: amount));
  }
  return out;
}

/// Debits and credits of what is typed so far, in cents; what cannot be read counts nothing.
({int debit, int credit}) totalsOf(List<JournalLine> lines) {
  var d = 0;
  var c = 0;
  for (final l in lines) {
    final m = parseMinor(l.amount);
    if (m == null) continue;
    if (l.side == 'D') {
      d += m;
    } else {
      c += m;
    }
  }
  return (debit: d, credit: c);
}

/// Why the entry cannot be sent, in the website's words; null when it can.
String? entryProblem({required String date, required String memo, required List<JournalLine> lines, required List<AccountOption> accounts}) {
  if (!RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(date)) return tr('اكتب تاريخ القيد.', 'Enter the entry\'s date.');
  if (memo.trim().isEmpty || memo.trim().length > 500) return tr('اكتب بيان القيد (حتى ٥٠٠ حرف).', 'Write the entry\'s description (up to 500 characters).');
  final typed = lines.where((l) => l.account.isNotEmpty || l.amount.trim().isNotEmpty).toList();
  if (typed.length < 2) return tr('القيد من سطرين إلى مئتي سطر.', 'An entry has from two to two hundred lines.');
  final codes = {for (final a in accounts) a.code};
  for (var i = 0; i < typed.length; i++) {
    if (!codes.contains(typed[i].account)) return tr('اختر حساباً يُقيَّد عليه في السطر ${i + 1}.', 'Choose an account to post to on line ${i + 1}.');
    final m = parseMinor(typed[i].amount);
    if (m == null || m <= 0) return tr('اكتب مبلغاً صحيحاً في السطر ${i + 1}.', 'Enter a valid amount on line ${i + 1}.');
  }
  final t = totalsOf(typed);
  if (t.debit != t.credit) return tr('القيد غير متوازن: المدين ${formatMinor(t.debit)} والدائن ${formatMinor(t.credit)}.', 'The entry does not balance: debit ${formatMinor(t.debit)} and credit ${formatMinor(t.credit)}.');
  return null;
}

/// A key the server keeps with the entry: a retry with it (a reply lost on a weak network) writes nothing twice.
String newEntryKey([Random? random]) {
  final r = random ?? Random.secure();
  return 'app-${List.generate(24, (_) => r.nextInt(16).toRadixString(16)).join()}';
}

// ── Review ───────────────────────────────────────────────────────────────────

class DraftLineView {
  const DraftLineView(this.account, this.side, this.amount);
  final String account;
  final String side;
  final String amount;
}

class DraftView {
  const DraftView({
    required this.id,
    required this.date,
    required this.memo,
    required this.status,
    required this.statusLabel,
    required this.by,
    required this.hasDocument,
    required this.lines,
    this.note,
  });
  final String id;
  final String date;
  final String memo;
  final String status;
  final String statusLabel;
  final String by;
  final bool hasDocument;
  final List<DraftLineView> lines;
  final String? note;

  factory DraftView.fromJson(Map<String, dynamic> j) => DraftView(
        id: j['id'] as String? ?? '',
        date: j['date'] as String? ?? '',
        memo: j['memo'] as String? ?? '',
        status: j['status'] as String? ?? '',
        statusLabel: j['status_label'] as String? ?? '',
        by: j['by'] as String? ?? '',
        hasDocument: j['has_document'] == true,
        note: j['note'] as String?,
        lines: [
          for (final l in _maps(j['lines']))
            DraftLineView(l['account'] as String? ?? '', l['side'] as String? ?? 'D', l['amount'] as String? ?? ''),
        ],
      );
}

class PreparerView {
  const PreparerView({required this.id, required this.name, required this.statusLabel, required this.open, required this.standing});
  final String id;
  final String name;
  final String statusLabel;
  final bool open;
  final bool standing;

  factory PreparerView.fromJson(Map<String, dynamic> j) => PreparerView(
        id: j['id'] as String? ?? '',
        name: j['name'] as String? ?? '',
        statusLabel: j['status_label'] as String? ?? '',
        open: j['open'] == true,
        standing: j['standing'] == true,
      );
}

class ReviewBook {
  const ReviewBook({required this.id, required this.label, required this.kind, required this.alwaysReview, required this.pending, required this.preparers});
  final String id;
  final String label;
  final String kind;
  final bool alwaysReview;
  final List<DraftView> pending;
  final List<PreparerView> preparers;
}

class ReviewView {
  const ReviewView({required this.books, required this.invitations, required this.agents, required this.preparing, required this.prepared});
  final List<ReviewBook> books;
  final List<({String id, String ownerName})> invitations;
  final List<({String id, String name})> agents;
  final List<({String id, String label})> preparing;
  final List<DraftView> prepared;

  int get waiting => books.fold(0, (n, b) => n + b.pending.length) + invitations.length;

  factory ReviewView.fromJson(Map<String, dynamic> j) => ReviewView(
        books: [
          for (final b in _maps(j['books']))
            ReviewBook(
              id: b['id'] as String? ?? '',
              label: b['label'] as String? ?? '',
              kind: b['kind'] as String? ?? '',
              alwaysReview: b['always_review'] == true,
              pending: [for (final d in _maps(b['pending'])) DraftView.fromJson(d)],
              preparers: [for (final p in _maps(b['preparers'])) PreparerView.fromJson(p)],
            ),
        ],
        invitations: [for (final i in _maps(j['invitations'])) (id: i['id'] as String? ?? '', ownerName: i['owner_name'] as String? ?? '')],
        agents: [for (final a in _maps(j['agents'])) (id: a['id'] as String? ?? '', name: a['name'] as String? ?? '')],
        preparing: [for (final b in _maps(j['preparing'])) (id: b['id'] as String? ?? '', label: b['label'] as String? ?? '')],
        prepared: [for (final d in _maps(j['prepared'])) DraftView.fromJson(d)],
      );
}

// ── Audit log and exceptions ─────────────────────────────────────────────────

class AuditLine {
  const AuditLine({required this.id, required this.at, required this.action, required this.who, required this.via, required this.detail});
  final int id;
  final String at;
  final String action;
  final String who;
  final String via;
  final String detail;
}

class AuditView {
  const AuditView({required this.bookId, required this.rows, required this.more});
  final String? bookId;
  final List<AuditLine> rows;
  final bool more;

  factory AuditView.fromJson(Map<String, dynamic> j) => AuditView(
        bookId: j['book_id'] as String?,
        more: j['more'] == true,
        rows: [
          for (final r in _maps(j['rows']))
            AuditLine(
              id: (r['id'] as num?)?.toInt() ?? 0,
              at: r['at'] as String? ?? '',
              action: r['action'] as String? ?? '',
              who: r['who'] as String? ?? '',
              via: r['via'] as String? ?? '',
              detail: r['detail'] as String? ?? '',
            ),
        ],
      );
}

class ExceptionLine {
  const ExceptionLine({required this.kind, required this.title, required this.hint, this.entryNo, this.date, this.account, required this.amount, this.memo});
  final String kind;
  final String title;
  final String hint;
  final int? entryNo;
  final String? date;
  final String? account;
  final String amount;
  final String? memo;

  String get facts => [
        if (entryNo != null) '#$entryNo',
        ?date,
        ?account,
        if (amount.isNotEmpty) amount,
        ?memo,
      ].join(' · ');
}

List<ExceptionLine> exceptionsFromJson(Map<String, dynamic> j) => [
      for (final r in _maps(j['rows']))
        ExceptionLine(
          kind: r['kind'] as String? ?? '',
          title: r['title'] as String? ?? '',
          hint: r['hint'] as String? ?? '',
          entryNo: (r['entry_no'] as num?)?.toInt(),
          date: r['date'] as String?,
          account: r['account'] as String?,
          amount: r['amount'] as String? ?? '',
          memo: r['memo'] as String?,
        ),
    ];

// ── Closing ──────────────────────────────────────────────────────────────────

class CloseView {
  const CloseView({
    required this.today,
    required this.bookId,
    required this.owned,
    required this.closedThrough,
    required this.incomeClosedThrough,
    required this.seasons,
    required this.history,
  });
  final String today;
  final String? bookId;
  final bool owned;
  final String? closedThrough;
  final String? incomeClosedThrough;
  final List<({String id, String name, bool closed})> seasons;
  final List<String> history;

  factory CloseView.fromJson(Map<String, dynamic> j) => CloseView(
        today: j['today'] as String? ?? '',
        bookId: j['book_id'] as String?,
        owned: j['owned'] == true,
        closedThrough: j['closed_through'] as String?,
        incomeClosedThrough: j['income_closed_through'] as String?,
        seasons: [for (final s in _maps(j['seasons'])) (id: s['id'] as String? ?? '', name: s['name'] as String? ?? '', closed: s['closed'] == true)],
        history: [for (final h in (j['history'] as List? ?? const [])) '$h'],
      );
}

/// The day before an ISO date ("2026-11-06" → "2026-11-05").
String dayBefore(String iso) {
  final d = DateTime.tryParse(iso);
  if (d == null) return iso;
  final p = d.subtract(const Duration(days: 1));
  String two(int n) => n.toString().padLeft(2, '0');
  return '${p.year}-${two(p.month)}-${two(p.day)}';
}

// ── The client ───────────────────────────────────────────────────────────────

class JournalApi {
  JournalApi({AccountController? account}) : _account = account ?? accountController;
  final AccountController _account;

  Future<JournalContext> context({String? book}) async => JournalContext.fromJson(
      await _account.call('GET', '/api/app/books/journal${book == null ? '' : '?${Uri(queryParameters: {'book': book}).query}'}'));

  /// Sends the entry; [attachment] is what EvidenceSender.attach('ledger', …) gave (`photo` or `storage_path`).
  /// Returns `(status, message)`: `posted`, or `pending` when it waits for the owner.
  Future<(String, String)> submit(Map<String, dynamic> entry, {Map<String, dynamic>? attachment}) async {
    final r = await _account.call('POST', '/api/app/books/journal', body: {...entry, ...?attachment});
    return (r['status'] as String? ?? '', r['message'] as String? ?? '');
  }

  Future<ReviewView> review() async => ReviewView.fromJson(await _account.call('GET', '/api/app/books/review'));

  /// approve, reject, withdraw, review, invite, add_agent, answer, end — the website's answers.
  Future<String> reviewAction(String action, [Map<String, dynamic> fields = const {}]) async {
    final r = await _account.call('POST', '/api/app/books/review', body: {'action': action, ...fields});
    return r['message'] as String? ?? '';
  }

  Future<AuditView> audit({String? book, int? before}) async {
    final q = <String, String>{'book': ?book, if (before != null) 'before': '$before'};
    return AuditView.fromJson(await _account.call('GET', '/api/app/books/audit${q.isEmpty ? '' : '?${Uri(queryParameters: q).query}'}'));
  }

  Future<List<ExceptionLine>> exceptions({String? book}) async {
    final q = <String, String>{'view': 'exceptions', 'book': ?book};
    return exceptionsFromJson(await _account.call('GET', '/api/app/books/audit?${Uri(queryParameters: q).query}'));
  }

  Future<CloseView> close({String? book}) async =>
      CloseView.fromJson(await _account.call('GET', '/api/app/books/close${book == null ? '' : '?${Uri(queryParameters: {'book': book}).query}'}'));

  /// lock, close_income, close_season.
  Future<String> closeAction(String action, Map<String, dynamic> fields) async {
    final r = await _account.call('POST', '/api/app/books/close', body: {'action': action, ...fields});
    return r['message'] as String? ?? '';
  }
}
