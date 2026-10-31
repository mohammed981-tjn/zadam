/// حسابي في التطبيق: الدخول، وإنشاء الحساب، والجلسة على الهاتف (البند ١٣٨).
///
/// The owner found the app opening as a visitor for him, the administrator, and
/// chose full sign-in inside the app, and then: «إذا أراد الاستثمار أو تسجيل
/// الأرض… يسجّل مثله ومثل الويب». So it is the website's account, not a second
/// one: the same number and password open both.
///
/// Signing in and signing up go through the website's routes (/api/app/signin
/// and /api/app/signup). Those read the number with the website's own rule
/// (src/lib/phone.ts) and fold it into the website's own internal address, so
/// there is one definition of a Sudanese number, not two that can drift. The
/// session they return is kept on the phone and refreshed with the auth server
/// directly, as any Supabase client refreshes; every read after that goes
/// through /api/app/me with the access token, and row-level security applies
/// exactly as it does on the website.
///
/// The session is kept in the app's private preferences. That is the app's own
/// sandbox, readable by no other app; the refresh token in it is revoked by
/// «خروج», which signs it out on the server as well as on the phone.
library;

import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import 'api.dart';
import 'land_shape.dart';

/// The country codes the website's phone field offers, in its order
/// (src/lib/phone.ts, COUNTRIES). scripts/verify-app-account.ts holds the two
/// lists to each other.
const dialCodes = <(String, String)>[
  ('249', 'السودان'),
  ('20', 'مصر'),
  ('966', 'السعودية'),
  ('971', 'الإمارات'),
  ('974', 'قطر'),
  ('965', 'الكويت'),
  ('90', 'تركيا'),
  ('44', 'بريطانيا'),
  ('1', 'أمريكا وكندا'),
];

/// The account's kind as the website's menu names it (src/components/Navbar.tsx).
String roleLabel(String? role) => switch (role) {
      'admin' => 'مدير',
      'investor' => 'مستثمر',
      'farmer' => 'مزارع وصاحب أرض',
      _ => '',
    };

class Session {
  const Session({
    required this.accessToken,
    required this.refreshToken,
    required this.expiresAt,
  });

  final String accessToken;
  final String refreshToken;
  final DateTime expiresAt;

  /// A minute's margin, so a request does not leave with a token that expires
  /// on its way.
  bool get isStale =>
      DateTime.now().toUtc().isAfter(expiresAt.subtract(const Duration(minutes: 1)));

  /// Reads both the website route's reply and the auth server's: the second
  /// may give `expires_in` without `expires_at`.
  factory Session.fromJson(Map<String, dynamic> j) {
    final at = j['expires_at'] as num?;
    final inSeconds = (j['expires_in'] as num?)?.toInt() ?? 3600;
    return Session(
      accessToken: j['access_token'] as String,
      refreshToken: j['refresh_token'] as String,
      expiresAt: at != null
          ? DateTime.fromMillisecondsSinceEpoch(at.toInt() * 1000, isUtc: true)
          : DateTime.now().toUtc().add(Duration(seconds: inSeconds)),
    );
  }

  Map<String, dynamic> toJson() => {
        'access_token': accessToken,
        'refresh_token': refreshToken,
        'expires_at': expiresAt.millisecondsSinceEpoch ~/ 1000,
      };
}

class AppNotice {
  const AppNotice({
    required this.id,
    required this.title,
    required this.body,
    required this.read,
    required this.at,
    this.link,
  });

  final String id;
  final String title;
  final String body;
  final String? link;
  final bool read;
  final DateTime at;

  factory AppNotice.fromJson(Map<String, dynamic> j) => AppNotice(
        id: j['id'] as String,
        title: j['title'] as String? ?? '',
        body: j['body'] as String? ?? '',
        link: j['link'] as String?,
        read: j['read'] as bool? ?? true,
        at: DateTime.tryParse(j['at'] as String? ?? '') ?? DateTime.now(),
      );
}

class MyLand {
  const MyLand({
    required this.id,
    required this.name,
    required this.state,
    required this.verification,
    this.locality,
    this.feddans,
    this.verificationNote,
    this.listed = false,
    this.openToInvestors = false,
    this.openToPartners = false,
  });

  final String id;
  final String name;
  final String state;
  final String? locality;
  final num? feddans;
  final String verification;
  final String? verificationNote;
  final bool listed;
  final bool openToInvestors;
  final bool openToPartners;

  /// The website's labels for the same states (src/app/lands/page.tsx).
  String get statusLabel => switch (verification) {
        'verified' => 'محقّقة',
        'submitted' => 'قيد المراجعة',
        'rejected' => 'مرفوضة',
        _ => 'غير محقّقة',
      };

  factory MyLand.fromJson(Map<String, dynamic> j) => MyLand(
        id: j['id'] as String,
        name: j['name'] as String? ?? '',
        state: j['state'] as String? ?? '',
        locality: j['locality'] as String?,
        feddans: j['feddans'] as num?,
        verification: j['verification'] as String? ?? 'unverified',
        verificationNote: j['verification_note'] as String?,
        listed: j['listed'] as bool? ?? false,
        openToInvestors: j['open_to_investors'] as bool? ?? false,
        openToPartners: j['open_to_partners'] as bool? ?? false,
      );
}

/// What the site answers when a land is saved from the app.
class LandSaved {
  const LandSaved({
    required this.id,
    required this.feddans,
    required this.message,
    this.station,
    this.soilName,
    this.soilProbability,
  });

  final String id;
  final num feddans;

  /// The climate station nearest the land's centre (the key in agronomy.dart's `stations`).
  final String? station;
  final String message;
  final String? soilName;
  final num? soilProbability;

  factory LandSaved.fromJson(Map<String, dynamic> j) {
    final soil = j['soil'] as Map<String, dynamic>?;
    return LandSaved(
      id: j['id'] as String? ?? '',
      feddans: j['feddans'] as num? ?? 0,
      message: j['message'] as String? ?? '',
      station: j['station'] as String?,
      soilName: soil?['name'] as String?,
      soilProbability: soil?['probability'] as num?,
    );
  }
}

class ReviewItem {
  const ReviewItem({required this.title, this.meta});
  final String title;
  final String? meta;

  factory ReviewItem.fromJson(Map<String, dynamic> j) =>
      ReviewItem(title: j['title'] as String? ?? '', meta: j['meta'] as String?);
}

/// One queue of the administrator's review list (src/lib/adminQueue.ts).
class ReviewSection {
  const ReviewSection({
    required this.key,
    required this.title,
    required this.what,
    required this.href,
    required this.count,
    required this.items,
    this.info = false,
  });

  final String key;
  final String title;
  final String what;
  final String href;
  final int count;
  final bool info;
  final List<ReviewItem> items;

  factory ReviewSection.fromJson(Map<String, dynamic> j) => ReviewSection(
        key: j['key'] as String? ?? '',
        title: j['title'] as String? ?? '',
        what: j['what'] as String? ?? '',
        href: j['href'] as String? ?? '/admin/inbox',
        count: (j['count'] as num?)?.toInt() ?? 0,
        info: j['info'] as bool? ?? false,
        items: ((j['items'] as List<dynamic>?) ?? const [])
            .map((e) => ReviewItem.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

/// What /api/app/me returns: who is signed in and what is theirs.
class Account {
  const Account({
    required this.name,
    required this.role,
    required this.unread,
    required this.notifications,
    required this.lands,
    this.reviewTotal,
    this.review = const [],
  });

  final String name;
  final String? role;
  final int unread;
  final List<AppNotice> notifications;
  final List<MyLand> lands;

  /// Null for everyone but an administrator.
  final int? reviewTotal;
  final List<ReviewSection> review;

  bool get isAdmin => role == 'admin';

  factory Account.fromJson(Map<String, dynamic> j) {
    final review = j['review'] as Map<String, dynamic>?;
    return Account(
      name: j['name'] as String? ?? '',
      role: j['role'] as String?,
      unread: (j['unread'] as num?)?.toInt() ?? 0,
      notifications: ((j['notifications'] as List<dynamic>?) ?? const [])
          .map((e) => AppNotice.fromJson(e as Map<String, dynamic>))
          .toList(),
      lands: ((j['lands'] as List<dynamic>?) ?? const [])
          .map((e) => MyLand.fromJson(e as Map<String, dynamic>))
          .toList(),
      reviewTotal: (review?['total'] as num?)?.toInt(),
      review: ((review?['sections'] as List<dynamic>?) ?? const [])
          .map((e) => ReviewSection.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}

/// The signed-in session, kept on the phone; null when signed out.
/// One line of «الرسائل»: what /api/app/messages returns per conversation.
class ConversationRow {
  const ConversationRow({
    required this.id,
    required this.kind,
    required this.myRole,
    required this.title,
    required this.lastBody,
    required this.unread,
    required this.open,
    required this.reported,
    required this.needsReply,
    this.lastAt,
  });

  final String id;
  final String kind;
  final String myRole;
  final String title;
  final String lastBody;
  final int unread;
  final bool open;
  final bool reported;
  final bool needsReply;
  final DateTime? lastAt;

  bool get isAdmin => myRole == 'admin';

  factory ConversationRow.fromJson(Map<String, dynamic> j) => ConversationRow(
        id: j['id'] as String,
        kind: j['kind'] as String? ?? 'partnership',
        myRole: j['my_role'] as String? ?? '',
        title: j['title'] as String? ?? '',
        lastBody: j['last_body'] as String? ?? '',
        unread: (j['unread'] as num?)?.toInt() ?? 0,
        open: j['open'] as bool? ?? true,
        reported: j['reported'] as bool? ?? false,
        needsReply: j['needs_reply'] as bool? ?? false,
        lastAt: DateTime.tryParse(j['last_message_at'] as String? ?? ''),
      );
}

/// Who wrote a message, by the part they play — never their name, as on the website.
const senderLabels = <String, String>{
  'investor': 'المستثمر',
  'owner': 'صاحب الأرض',
  'manager': 'الشركة المديرة',
  'member': 'العضو',
  'buyer': 'المشتري',
  'seller': 'البائع',
  'platform': 'سوداقري',
};

const _offerUnits = <String, String>{
  'qintar': 'قنطار',
  'ardeb': 'أردب',
  'sack': 'جوال',
  'ton': 'طن',
  'kg': 'كيلوغرام',
};

/// The market offer a market thread is about, in one line, as the board shows it.
String? offerLine(Map? o) {
  if (o == null) return null;
  final q = o['quantity'];
  final qty = q is num ? (q == q.roundToDouble() ? q.toInt().toString() : q.toString()) : '$q';
  return '${o['kind'] == 'sell' ? 'عرض بيع' : 'طلب شراء'}: ${o['crop']} · $qty ${_offerUnits[o['unit']] ?? o['unit']}'
      ' — ${o['state']}، ${o['locality']}';
}

class ConversationMessage {
  const ConversationMessage({
    required this.id,
    required this.role,
    required this.mine,
    required this.body,
    required this.at,
    this.attachmentKind,
    this.fileUrl,
  });

  final String id;
  final String role;
  final bool mine;
  final String body;
  final DateTime at;
  final String? attachmentKind;
  /// A ten-minute link the server made for a photo or a document.
  final String? fileUrl;

  factory ConversationMessage.fromJson(Map<String, dynamic> j, Map<String, dynamic> files) {
    final path = j['attachment_path'] as String?;
    return ConversationMessage(
      id: j['id'] as String,
      role: j['role'] as String? ?? '',
      mine: j['mine'] as bool? ?? false,
      body: j['body'] as String? ?? '',
      at: DateTime.tryParse(j['created_at'] as String? ?? '') ?? DateTime.now(),
      attachmentKind: j['attachment_kind'] as String?,
      fileUrl: path == null ? null : files[path] as String?,
    );
  }
}

class ConversationView {
  const ConversationView({
    required this.id,
    required this.kind,
    required this.me,
    required this.title,
    required this.open,
    required this.messages,
    this.status,
    this.request,
    this.othersReadAt,
  });

  final String id;
  final String kind;
  final String me;
  final String title;
  final bool open;
  final String? status;
  /// The investor's first message, from the partnership request itself, or
  /// the market offer a market thread is about.
  final String? request;
  final DateTime? othersReadAt;
  final List<ConversationMessage> messages;

  bool get pending => kind == 'partnership' && status == 'pending';

  /// «قُرئت» belongs under this message: the reader's last, opened since by the other side.
  String? get seenMessageId {
    final mine = messages.where((m) => m.mine).toList();
    if (mine.isEmpty || othersReadAt == null) return null;
    final last = mine.last;
    return othersReadAt!.isBefore(last.at) ? null : last.id;
  }

  factory ConversationView.fromJson(Map<String, dynamic> j) {
    final files = (j['files'] as Map?)?.cast<String, dynamic>() ?? const <String, dynamic>{};
    return ConversationView(
      id: j['id'] as String,
      kind: j['kind'] as String? ?? 'partnership',
      me: j['me'] as String? ?? '',
      title: j['title'] as String? ?? '',
      open: j['open'] as bool? ?? true,
      status: j['status'] as String?,
      request: (j['request'] as Map?)?['message'] as String? ?? offerLine(j['offer'] as Map?),
      othersReadAt: DateTime.tryParse(j['others_read_at'] as String? ?? ''),
      messages: [
        for (final m in (j['messages'] as List? ?? const []))
          ConversationMessage.fromJson(m as Map<String, dynamic>, files),
      ],
    );
  }
}

class AccountController extends ValueNotifier<Session?> {
  AccountController({
    http.Client? client,
    String? siteUrl,
    String? supabaseUrl,
    String? anonKey,
  })  : _client = client ?? http.Client(),
        _site = siteUrl ?? ApiConfig.siteUrl,
        _supabase = supabaseUrl ?? ApiConfig.supabaseUrl,
        _anon = anonKey ?? ApiConfig.supabaseAnonKey,
        super(null);

  static const _key = 'sudagri.session';
  static const _timeout = Duration(seconds: 30);

  final http.Client _client;
  final String _site;
  final String _supabase;
  final String _anon;

  /// False until the saved session has been read, so the screen does not
  /// flash the sign-in form at someone who is signed in.
  bool loaded = false;

  Future<void> load() async {
    try {
      final raw = (await SharedPreferences.getInstance()).getString(_key);
      if (raw != null) value = Session.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      // An unreadable saved session is a signed-out phone, not a crash.
      value = null;
    }
    loaded = true;
    notifyListeners();
  }

  Future<void> _keep(Session? s) async {
    final prefs = await SharedPreferences.getInstance();
    if (s == null) {
      await prefs.remove(_key);
    } else {
      await prefs.setString(_key, jsonEncode(s.toJson()));
    }
    value = s;
  }

  Future<http.Response> _post(String path, Map<String, dynamic> body) async {
    if (_site.isEmpty) throw ApiException('التطبيق غير مضبوط للاتصال بالموقع.');
    try {
      return await _client
          .post(Uri.parse('$_site$path'),
              headers: {'content-type': 'application/json'}, body: jsonEncode(body))
          .timeout(_timeout);
    } catch (_) {
      throw ApiException('تعذّر الاتصال. تحقّق من الشبكة وأعد المحاولة.');
    }
  }

  static Map<String, dynamic> _json(http.Response res) {
    try {
      return jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>;
    } catch (_) {
      return const {};
    }
  }

  /// [method] is 'phone' (with [dialCode] and [phone]) or 'email'.
  Future<void> signIn({
    required String method,
    required String password,
    String dialCode = '249',
    String phone = '',
    String email = '',
  }) async {
    final res = await _post('/api/app/signin', {
      'method': method,
      'dial_code': dialCode,
      'phone': phone,
      'email': email,
      'password': password,
    });
    final body = _json(res);
    if (res.statusCode != 200) {
      throw ApiException(body['error'] as String? ?? 'تعذّر الدخول (${res.statusCode}).');
    }
    await _keep(Session.fromJson(body));
  }

  // ── الدخول بحساب Google (البند ١٧٣) ─────────────────────────────────────────

  static const _verifierKey = 'sudagri.oauth.verifier';

  /// What went wrong on the way back from the browser, for the sign-in form to say.
  final providerError = ValueNotifier<String?>(null);

  /// The address to open in the phone's browser for [provider]. A random secret is made and kept here; only its
  /// fingerprint leaves with the request. The site sends the session back sealed, openable only with that secret
  /// (src/lib/appHandoff.ts), so another app that catches the link gets nothing.
  Future<Uri> providerSignInUrl(String provider, {String side = 'farmer'}) async {
    if (_site.isEmpty) throw ApiException('التطبيق غير مضبوط للاتصال بالموقع.');
    final random = Random.secure();
    final verifier = base64Url.encode([for (var i = 0; i < 32; i++) random.nextInt(256)]).replaceAll('=', '');
    final challenge = base64Url.encode(sha256.convert(utf8.encode(verifier)).bytes).replaceAll('=', '');
    await (await SharedPreferences.getInstance()).setString(_verifierKey, verifier);
    providerError.value = null;
    return Uri.parse('$_site/api/app/oauth')
        .replace(queryParameters: {'provider': provider, 'side': side, 'challenge': challenge});
  }

  /// The link the browser opens the app with, `sudagri://auth?h=…`: the sealed session and the kept secret go to
  /// the site, and the session that comes back is kept. Other links are not this one's to handle.
  Future<void> handleLink(Uri link) async {
    if (link.scheme != 'sudagri' || link.host != 'auth') return;
    final sealed = link.queryParameters['h'];
    final prefs = await SharedPreferences.getInstance();
    final verifier = prefs.getString(_verifierKey);
    if (sealed == null || verifier == null) {
      providerError.value = 'لم يكتمل الدخول بهذا الحساب. اضغط الزرّ مرّةً أخرى.';
      return;
    }
    try {
      final res = await _post('/api/app/oauth/finish', {'handoff': sealed, 'verifier': verifier});
      final body = _json(res);
      if (res.statusCode != 200) {
        providerError.value = body['error'] as String? ?? 'لم يكتمل الدخول بهذا الحساب.';
        return;
      }
      await prefs.remove(_verifierKey);
      providerError.value = null;
      await _keep(Session.fromJson(body));
    } on ApiException catch (e) {
      providerError.value = e.message;
    }
  }

  /// Creates the account and signs in with it. When the account was created
  /// but the sign-in that follows was not, throws with a message saying so —
  /// the person signs in from the form, and nothing is lost.
  Future<void> signUp({
    required String fullName,
    required String role,
    required String dialCode,
    required String phone,
    required String password,
  }) async {
    final res = await _post('/api/app/signup', {
      'full_name': fullName,
      'role': role,
      'dial_code': dialCode,
      'phone': phone,
      'password': password,
    });
    final body = _json(res);
    if (res.statusCode != 201) {
      throw ApiException(body['error'] as String? ?? 'تعذّر إنشاء الحساب (${res.statusCode}).');
    }
    await _keep(Session.fromJson(body));
  }

  /// A session good for the next request: refreshed with the auth server when
  /// stale (or when [force]d after a refusal). A refresh token the server
  /// refuses means the session is over — signed out elsewhere, or revoked — and
  /// the phone is signed out with it.
  Future<Session?> fresh({bool force = false}) async {
    final s = value;
    if (s == null) return null;
    if (!force && !s.isStale) return s;
    late final http.Response res;
    try {
      res = await _client
          .post(
            Uri.parse('$_supabase/auth/v1/token?grant_type=refresh_token'),
            headers: {'apikey': _anon, 'content-type': 'application/json'},
            body: jsonEncode({'refresh_token': s.refreshToken}),
          )
          .timeout(_timeout);
    } catch (_) {
      // No network: try with what we have rather than sign the person out.
      return s;
    }
    if (res.statusCode == 200) {
      final next = Session.fromJson(_json(res));
      await _keep(next);
      return next;
    }
    if (res.statusCode == 400 || res.statusCode == 401) {
      await _keep(null);
      return null;
    }
    return s;
  }

  Future<http.Response> _authed(String method, String path, {Map<String, dynamic>? body}) async {
    for (var attempt = 0; attempt < 2; attempt++) {
      final s = await fresh(force: attempt > 0);
      if (s == null) throw ApiException('ادخل إلى حسابك.');
      final uri = Uri.parse('$_site$path');
      final headers = {
        'authorization': 'Bearer ${s.accessToken}',
        if (body != null) 'content-type': 'application/json',
      };
      late final http.Response res;
      try {
        res = await (method == 'POST'
                ? _client.post(uri, headers: headers, body: body == null ? null : jsonEncode(body))
                : _client.get(uri, headers: headers))
            .timeout(_timeout);
      } catch (_) {
        throw ApiException('تعذّر الاتصال. تحقّق من الشبكة وأعد المحاولة.');
      }
      if (res.statusCode != 401) return res;
    }
    await _keep(null);
    throw ApiException('انتهت جلستك. ادخل من جديد.');
  }

  Future<Account> me() async {
    if (_site.isEmpty) throw ApiException('التطبيق غير مضبوط للاتصال بالموقع.');
    final res = await _authed('GET', '/api/app/me');
    final body = _json(res);
    if (res.statusCode != 200) {
      throw ApiException(body['error'] as String? ?? 'تعذّر تحميل حسابك (${res.statusCode}).');
    }
    return Account.fromJson(body);
  }

  Future<void> markAllRead() async {
    final res = await _authed('POST', '/api/app/notifications/read');
    if (res.statusCode != 200) {
      throw ApiException(_json(res)['error'] as String? ?? 'تعذّر تعليمها مقروءة.');
    }
  }

  // ── «حدّد أرضك» (البند ١٣٤) ────────────────────────────────────────────────

  /// Saves a land from its corners. The site works out the area and the centre from them, as the website saves a
  /// land: submitted, unlisted, as this person. Then it reads the soil at the centre and sends it back.
  Future<LandSaved> registerLand({
    required String name,
    required String state,
    String? locality,
    required String waterSource,
    required String tenure,
    required List<Corner> corners,
  }) async {
    final res = await _authed('POST', '/api/app/lands', body: {
      'name': name,
      'state': state,
      if (locality != null && locality.isNotEmpty) 'locality': locality,
      'water_source': waterSource,
      'tenure': tenure,
      'boundary': [for (final c in thin(corners)) c.toJson()],
    });
    final body = _json(res);
    if (res.statusCode != 200) {
      throw ApiException(body['error'] as String? ?? 'تعذّر تسجيل الأرض (${res.statusCode}).');
    }
    return LandSaved.fromJson(body);
  }

  // ── صندوق الرسائل (البند ١٤٤) ────────────────────────────────────────────

  Future<List<ConversationRow>> conversations() async {
    final res = await _authed('GET', '/api/app/messages');
    final body = _json(res);
    if (res.statusCode != 200) {
      throw ApiException(body['error'] as String? ?? 'تعذّر تحميل الرسائل (${res.statusCode}).');
    }
    return [
      for (final r in (body['conversations'] as List? ?? const []))
        ConversationRow.fromJson(r as Map<String, dynamic>),
    ];
  }

  /// «راسل سوداقري»: the member's one conversation with the administration.
  Future<String> openSupport() async {
    final res = await _authed('POST', '/api/app/messages', body: const {});
    final body = _json(res);
    if (res.statusCode != 200 || body['id'] == null) {
      throw ApiException(body['error'] as String? ?? 'تعذّر فتح المحادثة.');
    }
    return body['id'] as String;
  }

  Future<ConversationView> conversation(String id) async {
    final res = await _authed('GET', '/api/app/messages/$id');
    final body = _json(res);
    if (res.statusCode != 200) {
      throw ApiException(body['error'] as String? ?? 'تعذّر فتح المحادثة.');
    }
    return ConversationView.fromJson(body);
  }

  Future<void> sendMessage(String id, String text) async {
    final res = await _authed('POST', '/api/app/messages/$id', body: {'body': text});
    if (res.statusCode != 200) {
      throw ApiException(_json(res)['error'] as String? ?? 'لم تُرسل الرسالة. أعد المحاولة.');
    }
  }

  /// Signs out on the server too, so the refresh token kept on this phone
  /// stops working even if it was copied; then forgets it here.
  Future<void> signOut() async {
    final s = value;
    if (s != null && _supabase.isNotEmpty) {
      try {
        await _client
            .post(Uri.parse('$_supabase/auth/v1/logout'),
                headers: {'apikey': _anon, 'authorization': 'Bearer ${s.accessToken}'})
            .timeout(_timeout);
      } catch (_) {
        // Offline: the phone forgets the session regardless.
      }
    }
    await _keep(null);
  }
}

/// The app's one account controller.
final accountController = AccountController();
