/// الموردون في التطبيق (البند ٢٠٣): the website's /suppliers, its group orders, its deliveries and «صفحتي كمورد»,
/// read and written through /api/app/suppliers/**.
///
/// Every step is a database function that checks who is taking it (supabase/migrations/
/// 20261012130000_supply_chain.sql). The routes run the very steps the website's forms run (src/lib/supplyCore.ts),
/// as the signed-in person, so what each party may do here is what the website lets them do — and a refusal comes
/// back in the database's own Arabic words. The directory and a supplier's page are public, as on the website, and
/// are read without a session.
library;

import 'dart:convert';

import 'package:http/http.dart' as http;

import 'account.dart';
import 'api.dart';
import 'i18n.dart';

// ── Labels, as src/lib/supplyChain.ts ──────────────────────────────────────

Map<String, String> get supplyCategories => <String, String>{
  'fertilizer': tr('أسمدة', 'Fertiliser'),
  'seed': tr('بذور وتقاوي', 'Seed'),
  'pesticide': tr('مبيدات', 'Pesticides'),
  'other': tr('أخرى', 'Other'),
};

/// The input keys a product can carry (so the feasibility study finds it), with their category.
Map<String, (String, String)> get inputLabels => <String, (String, String)>{
  'urea': (tr('يوريا', 'Urea'), 'fertilizer'),
  'DAP': (tr('داب', 'DAP'), 'fertilizer'),
  'TSP': (tr('سوبر فوسفات ثلاثي', 'TSP'), 'fertilizer'),
  'NPK': (tr('سماد مركّب NPK', 'NPK'), 'fertilizer'),
  'seed': (tr('تقاوي', 'Seed'), 'seed'),
  'insecticide': (tr('مبيد حشري', 'Insecticide'), 'pesticide'),
  'herbicide': (tr('مبيد حشائش', 'Herbicide'), 'pesticide'),
  'fungicide': (tr('مبيد فطري', 'Fungicide'), 'pesticide'),
};

Map<String, String> get packUnits => <String, String>{'kg': tr('كجم', 'kg'), 'g': tr('جم', 'g'), 'l': tr('لتر', 'L'), 'ml': tr('مل', 'mL'), 'unit': tr('وحدة', 'unit')};

Map<String, String> get orderStatusLabels => <String, String>{
  'open': tr('مفتوح للانضمام', 'Open to join'),
  'closed': tr('أُغلق الانضمام', 'Joining closed'),
  'delivered': tr('سُلّم', 'Delivered'),
  'cancelled': tr('أُلغي', 'Cancelled'),
};

Map<String, String> get pledgeStatusLabels => <String, String>{
  'pledged': tr('متعهّد — بانتظار المقدّم', 'Pledged — awaiting deposit'),
  'deposit_received': tr('استُلم المقدّم', 'Deposit received'),
  'collected': tr('استلم بضاعته', 'Collected'),
  'withdrawn': tr('انسحب', 'Withdrawn'),
  'defaulted': tr('متعثّر — خارج الحمولة', 'Defaulted — out of the load'),
};

Map<String, String> get deliveryStatusLabels => <String, String>{
  'assigned': tr('بانتظار التسليم', 'Awaiting handover'),
  'confirmed': tr('سُلّم بالرمز — مستحقّ الدفع للناقل', 'Delivered with the code — carrier payable'),
  'paid': tr('دُفع للناقل', 'Carrier paid'),
  'cancelled': tr('أُلغي', 'Cancelled'),
};

/// The organiser's moves on an order, as the website's panel offers them.
const orderMoves = <String, List<String>>{
  'open': ['closed', 'cancelled'],
  'closed': ['open', 'delivered', 'cancelled'],
};
Map<String, String> get orderMoveLabels => <String, String>{
  'closed': tr('أغلق الانضمام', 'Close joining'),
  'open': tr('أعد فتح الانضمام', 'Reopen joining'),
  'delivered': tr('سُلّمت الحمولة', 'Load delivered'),
  'cancelled': tr('ألغِ الطلب', 'Cancel the request'),
};

/// Sudan's eighteen states, as stored (src/lib/nafir.ts).
const sudanStates = [
  'الخرطوم', 'الجزيرة', 'سنار', 'النيل الأزرق', 'النيل الأبيض', 'القضارف', 'كسلا', // ar-only
  'البحر الأحمر', 'نهر النيل', 'الشمالية', 'شمال كردفان', 'جنوب كردفان', 'غرب كردفان', // ar-only
  'شمال دارفور', 'جنوب دارفور', 'شرق دارفور', 'غرب دارفور', 'وسط دارفور', // ar-only
];

// ── Numbers, money and dates ───────────────────────────────────────────────

double toDouble(Object? v) => v is num ? v.toDouble() : double.tryParse('$v') ?? 0;
double? toDoubleOrNull(Object? v) => v == null ? null : (v is num ? v.toDouble() : double.tryParse('$v'));

/// A figure without trailing zeros: 12, 12.5, 0.125.
String figure(num n, [int digits = 2]) {
  final s = n.toStringAsFixed(digits);
  return s.contains('.') ? s.replaceFirst(RegExp(r'\.?0+$'), '') : s;
}

String usd(num n) => '\$${figure(n)}';
String sdg(num n) => tr('${n.round()} جنيه', 'SDG ${n.round()}');

List<String> get _months => [
  tr('يناير', 'January'), tr('فبراير', 'February'), tr('مارس', 'March'), tr('أبريل', 'April'), tr('مايو', 'May'), tr('يونيو', 'June'),
  tr('يوليو', 'July'), tr('أغسطس', 'August'), tr('سبتمبر', 'September'), tr('أكتوبر', 'October'), tr('نوفمبر', 'November'), tr('ديسمبر', 'December'),
];

/// «12 أكتوبر 2026» from a date or a timestamp; the text as it came when it is neither.
String dateAr(String? iso) {
  if (iso == null || iso.length < 10) return iso ?? '';
  final d = DateTime.tryParse(iso.substring(0, 10));
  return d == null ? iso : '${d.day} ${_months[d.month - 1]} ${d.year}';
}

/// Today as YYYY-MM-DD, and n days from it.
String isoDay([int plus = 0]) => DateTime.now().toUtc().add(Duration(days: plus)).toIso8601String().substring(0, 10);

/// A wa.me link: Sudanese local numbers (0912…) become 249912….
String whatsappLink(String phone) {
  var d = phone.replaceAll(RegExp(r'\D'), '');
  if (d.startsWith('00')) {
    d = d.substring(2);
  } else if (d.startsWith('0')) {
    d = '249${d.substring(1)}';
  }
  return 'https://wa.me/$d';
}

List<String> _strings(Object? v) => [for (final x in (v as List? ?? const [])) '$x'];

// ── Rows ───────────────────────────────────────────────────────────────────

class Supplier {
  Supplier({
    required this.id,
    required this.name,
    required this.state,
    required this.locality,
    required this.phone,
    this.whatsapp,
    this.deliveryStates = const [],
    this.categories = const [],
    this.pesticideLicenceNo,
    this.seedRegistrationNo,
    this.commercialRegistrationNo,
    this.bio,
    this.verifiedAt,
    this.active = true,
    this.reviewNote,
    this.hasDocument = false,
  });

  final String id;
  final String name;
  final String state;
  final String locality;
  final String phone;
  final String? whatsapp;
  final List<String> deliveryStates;
  final List<String> categories;
  final String? pesticideLicenceNo;
  final String? seedRegistrationNo;
  final String? commercialRegistrationNo;
  final String? bio;
  final String? verifiedAt;
  final bool active;

  /// The administrator's note, on the owner's own page only.
  final String? reviewNote;

  /// The owner's page: a document photo was sent.
  final bool hasDocument;

  bool get verified => verifiedAt != null;

  factory Supplier.fromJson(Map<String, dynamic> j) => Supplier(
        id: j['id'] as String,
        name: j['name'] as String? ?? '',
        state: j['state'] as String? ?? '',
        locality: j['locality'] as String? ?? '',
        phone: j['phone'] as String? ?? '',
        whatsapp: j['whatsapp'] as String?,
        deliveryStates: _strings(j['delivery_states']),
        categories: _strings(j['categories']),
        pesticideLicenceNo: j['pesticide_licence_no'] as String?,
        seedRegistrationNo: j['seed_registration_no'] as String?,
        commercialRegistrationNo: j['commercial_registration_no'] as String?,
        bio: j['bio'] as String?,
        verifiedAt: j['verified_at'] as String?,
        active: j['active'] as bool? ?? true,
        reviewNote: j['review_note'] as String?,
        hasDocument: j['has_document'] as bool? ?? false,
      );
}

class Product {
  Product({
    required this.id,
    required this.supplierId,
    required this.category,
    this.inputKey,
    required this.name,
    this.activeIngredient,
    this.registrationNo,
    this.certLot,
    required this.packSize,
    required this.packUnit,
    required this.priceUsd,
    required this.validUntil,
    this.active = true,
  });

  final String id;
  final String supplierId;
  final String category;
  final String? inputKey;
  final String name;
  final String? activeIngredient;
  final String? registrationNo;
  final String? certLot;
  final double packSize;
  final String packUnit;
  final double priceUsd;
  final String validUntil;
  final bool active;

  bool get expired => validUntil.compareTo(isoDay()) < 0;
  String get packLabel => '${figure(packSize, 3)} ${packUnits[packUnit] ?? packUnit}';

  /// The weight of one unit in kg, for a group order's load (litres count as kilos), or null for a count.
  double? get unitKg => switch (packUnit) {
        'kg' || 'l' => packSize,
        'g' || 'ml' => packSize / 1000,
        _ => null,
      };

  /// ?item= on the website: an input key, or a category.
  bool matches(String? item) {
    if (item == null || item.isEmpty) return true;
    if (inputLabels.containsKey(item)) return inputKey == item || (item == 'seed' && category == 'seed');
    return category == item;
  }

  factory Product.fromJson(Map<String, dynamic> j) => Product(
        id: j['id'] as String,
        supplierId: j['supplier_id'] as String? ?? '',
        category: j['category'] as String? ?? 'other',
        inputKey: j['input_key'] as String?,
        name: j['name'] as String? ?? '',
        activeIngredient: j['active_ingredient'] as String?,
        registrationNo: j['registration_no'] as String?,
        certLot: j['cert_lot'] as String?,
        packSize: toDouble(j['pack_size']),
        packUnit: j['pack_unit'] as String? ?? 'unit',
        priceUsd: toDouble(j['price_usd']),
        validUntil: j['valid_until'] as String? ?? '',
        active: j['active'] as bool? ?? true,
      );
}

/// The public directory: the verified suppliers, their offers, and today's dollar rate.
class SupplierDirectory {
  SupplierDirectory({required this.suppliers, required this.products, this.rate, this.rateNote, this.comingSoon = false});

  final List<Supplier> suppliers;
  final List<Product> products;
  final double? rate;
  final String? rateNote;
  final bool comingSoon;

  factory SupplierDirectory.fromJson(Map<String, dynamic> j) => SupplierDirectory(
        suppliers: [for (final s in (j['suppliers'] as List? ?? const [])) Supplier.fromJson(s as Map<String, dynamic>)],
        products: [for (final p in (j['products'] as List? ?? const [])) Product.fromJson(p as Map<String, dynamic>)],
        rate: toDoubleOrNull(j['rate']),
        rateNote: j['rate_note'] as String?,
        comingSoon: j['coming_soon'] == true,
      );

  /// As the website filters: by what is needed (an input or a category) and by the state, where the supplier is or
  /// delivers to. With a need chosen, a supplier offering none of it is left out.
  List<(Supplier, List<Product>)> shown({String? item, String? state}) => [
        for (final s in suppliers)
          if (state == null || s.state == state || s.deliveryStates.contains(state))
            (s, [for (final p in products) if (p.supplierId == s.id && p.matches(item)) p]),
      ].where((e) => item == null || item.isEmpty || e.$2.isNotEmpty).toList();
}

class OrderSummary {
  OrderSummary(this.j);
  final Map<String, dynamic> j;

  String get id => j['id'] as String;
  String get title => j['title'] as String? ?? '';
  String get supplierId => j['supplier_id'] as String? ?? '';
  String get supplierName => j['supplier_name'] as String? ?? '';
  String? get pickupName => j['pickup_name'] as String?;
  String get pickupLocality => j['pickup_locality'] as String? ?? '';
  String get pickupState => j['pickup_state'] as String? ?? '';
  String get dropDay => j['drop_day'] as String? ?? '';
  String get deadline => j['deadline'] as String? ?? '';
  double get targetTonnes => toDouble(j['target_tonnes']);
  double get pledgedTonnes => toDouble(j['pledged_tonnes']);
  int get members => toDouble(j['members']).round();
  double get depositPct => toDouble(j['deposit_pct']);
  String get status => j['status'] as String? ?? 'open';
  String get statusLabel => orderStatusLabels[status] ?? status;

  /// How full the truck is, 0–1.
  double get fill => targetTonnes <= 0 ? 0 : (pledgedTonnes / targetTonnes).clamp(0, 1).toDouble();

  // The detail's extra columns (group_order_detail).
  String? get organiserName => j['organiser_name'] as String?;
  String? get organiserPhone => j['organiser_phone'] as String?;
  double? get pickupLat => toDoubleOrNull(j['pickup_lat']);
  double? get pickupLng => toDoubleOrNull(j['pickup_lng']);
  String get payee => j['payee'] as String? ?? 'cooperative';
  String? get payeeAccount => j['payee_account'] as String?;
  String? get notes => j['notes'] as String?;
  String? get myRole => j['my_role'] as String?;
}

class OrderLine {
  OrderLine(this.j);
  final Map<String, dynamic> j;
  String get id => j['id'] as String;
  String get name => j['name'] as String? ?? '';
  String get unitLabel => j['unit_label'] as String? ?? '';
  double get unitPriceUsd => toDouble(j['unit_price_usd']);
}

class Pledge {
  Pledge(this.j);
  final Map<String, dynamic> j;
  String get id => j['id'] as String;
  String get lineId => j['line_id'] as String? ?? '';
  String get userId => j['user_id'] as String? ?? '';
  String get displayName => j['display_name'] as String? ?? '';
  String? get phone => j['phone'] as String?;
  double get quantity => toDouble(j['quantity']);
  String get status => j['status'] as String? ?? 'pledged';
  String get statusLabel => pledgeStatusLabels[status] ?? status;
  String? get depositRef => j['deposit_ref'] as String?;
  String? get statusNote => j['status_note'] as String?;

  /// Still in the load: not withdrawn and not defaulted.
  bool get live => status != 'withdrawn' && status != 'defaulted';
}

class Carrier {
  Carrier(this.j);
  final Map<String, dynamic> j;
  String get id => j['id'] as String;
  String get name => j['name'] as String? ?? '';
  String get phone => j['phone'] as String? ?? '';
  String get vehicle => j['vehicle'] as String? ?? '';
  double get capacityTonnes => toDouble(j['capacity_tonnes']);
  List<String> get states => _strings(j['states']);
  String? get verifiedAt => j['verified_at'] as String?;
  String? get reviewNote => j['review_note'] as String?;
}

class Delivery {
  Delivery(this.j);
  final Map<String, dynamic> j;
  String get id => j['id'] as String;
  String get orderId => j['order_id'] as String? ?? '';
  String? get pledgeId => j['pledge_id'] as String?;
  String get kind => j['kind'] as String? ?? 'to_farm';
  String get destination => j['destination'] as String? ?? '';
  double? get feeUsd => toDoubleOrNull(j['fee_usd']);
  String get status => j['status'] as String? ?? 'assigned';
  String get statusLabel => deliveryStatusLabels[status] ?? status;
  double? get gpsLat => toDoubleOrNull(j['gps_lat']);
  double? get gpsLng => toDoubleOrNull(j['gps_lng']);
  String? get confirmedAt => j['confirmed_at'] as String?;
  String? get paidRef => j['paid_ref'] as String?;
  String get heading => tr('${kind == 'to_farm' ? 'إلى الأرض' : 'إلى نقطة الاستلام'}: $destination', '${kind == 'to_farm' ? 'To the farm' : 'To the collection point'}: $destination');
}

/// Opening an order: the current ones, the suppliers to choose from, and the chosen one's offers.
class OrdersBoard {
  OrdersBoard({required this.orders, required this.suppliers, required this.products, this.comingSoon = false});
  final List<OrderSummary> orders;
  final List<({String id, String name, String state})> suppliers;
  final List<Product> products;
  final bool comingSoon;

  factory OrdersBoard.fromJson(Map<String, dynamic> j) => OrdersBoard(
        orders: [for (final o in (j['orders'] as List? ?? const [])) OrderSummary(o as Map<String, dynamic>)],
        suppliers: [
          for (final s in (j['suppliers'] as List? ?? const []))
            (id: (s as Map)['id'] as String, name: s['name'] as String? ?? '', state: s['state'] as String? ?? ''),
        ],
        products: [for (final p in (j['products'] as List? ?? const [])) Product.fromJson(p as Map<String, dynamic>)],
        comingSoon: j['coming_soon'] == true,
      );
}

/// One order as /suppliers/orders/[id] shows it to the reader.
class OrderView {
  OrderView({
    required this.order,
    required this.lines,
    required this.totals,
    required this.pledges,
    required this.me,
    this.myName = '',
    this.carriers = const [],
    this.deliveries = const [],
    this.rate,
  });

  final OrderSummary order;
  final List<OrderLine> lines;
  final Map<String, double> totals;
  final List<Pledge> pledges;
  final String me;
  final String myName;
  final List<Carrier> carriers;
  final List<Delivery> deliveries;
  final double? rate;

  bool get isOrganiser => order.myRole == 'organiser';

  /// Joining is open: the status says so and the deadline has not passed.
  bool get open => order.status == 'open' && order.deadline.compareTo(isoDay()) >= 0;

  List<Pledge> get mine => [for (final p in pledges) if (p.userId == me) p];
  Pledge? myPledgeOn(String lineId) {
    for (final p in mine) {
      if (p.lineId == lineId) return p;
    }
    return null;
  }

  OrderLine? lineOf(String id) {
    for (final l in lines) {
      if (l.id == id) return l;
    }
    return null;
  }

  /// What the reader's live pledges are worth, and the deposit on it.
  double get myValue => mine.where((p) => p.live).fold(0, (s, p) => s + p.quantity * (lineOf(p.lineId)?.unitPriceUsd ?? 0));
  double get myDeposit => myValue * order.depositPct / 100;

  /// A pledge's farm delivery, if one is assigned and not cancelled.
  Delivery? deliveryFor(String pledgeId) {
    for (final d in deliveries) {
      if (d.pledgeId == pledgeId && d.status != 'cancelled') return d;
    }
    return null;
  }

  factory OrderView.fromJson(Map<String, dynamic> j) => OrderView(
        order: OrderSummary(j['order'] as Map<String, dynamic>),
        lines: [for (final l in (j['lines'] as List? ?? const [])) OrderLine(l as Map<String, dynamic>)],
        totals: {for (final e in ((j['totals'] as Map?) ?? const {}).entries) '${e.key}': toDouble(e.value)},
        pledges: [for (final p in (j['pledges'] as List? ?? const [])) Pledge(p as Map<String, dynamic>)],
        me: j['me'] as String? ?? '',
        myName: j['my_name'] as String? ?? '',
        carriers: [for (final c in (j['carriers'] as List? ?? const [])) Carrier(c as Map<String, dynamic>)],
        deliveries: [for (final d in (j['deliveries'] as List? ?? const [])) Delivery(d as Map<String, dynamic>)],
        rate: toDoubleOrNull(j['rate']),
      );
}

class DeliveriesView {
  DeliveriesView({this.carrier, required this.toMe, required this.toCarry, required this.assigned, this.comingSoon = false});
  final Carrier? carrier;
  final List<Delivery> toMe;
  final List<Delivery> toCarry;
  final List<Delivery> assigned;
  final bool comingSoon;

  static List<Delivery> _list(Object? v) => [for (final d in (v as List? ?? const [])) Delivery(d as Map<String, dynamic>)];

  factory DeliveriesView.fromJson(Map<String, dynamic> j) => DeliveriesView(
        carrier: j['carrier'] == null ? null : Carrier(j['carrier'] as Map<String, dynamic>),
        toMe: _list(j['to_me']),
        toCarry: _list(j['to_carry']),
        assigned: _list(j['assigned']),
        comingSoon: j['coming_soon'] == true,
      );
}

class MySupplierView {
  MySupplierView({this.supplier, this.products = const [], this.rate, this.comingSoon = false});
  final Supplier? supplier;
  final List<Product> products;
  final double? rate;
  final bool comingSoon;

  factory MySupplierView.fromJson(Map<String, dynamic> j) => MySupplierView(
        supplier: j['supplier'] == null ? null : Supplier.fromJson(j['supplier'] as Map<String, dynamic>),
        products: [for (final p in (j['products'] as List? ?? const [])) Product.fromJson(p as Map<String, dynamic>)],
        rate: toDoubleOrNull(j['rate']),
        comingSoon: j['coming_soon'] == true,
      );
}

/// A step's answer: the sentence to show, and for a new order its id, for a handover code the code.
typedef StepAnswer = ({String message, String? id, String? code});

StepAnswer _answer(Map<String, dynamic> j) =>
    (message: j['message'] as String? ?? '', id: j['id'] as String?, code: j['code'] as String?);

// ── The calls ──────────────────────────────────────────────────────────────

class SuppliersApi {
  SuppliersApi({AccountController? account, http.Client? client, String? siteUrl})
      : _account = account ?? accountController,
        _client = client ?? http.Client(),
        _site = siteUrl ?? ApiConfig.siteUrl;

  final AccountController _account;
  final http.Client _client;
  final String _site;

  /// The public reads, without a session — what the website shows a visitor.
  Future<Map<String, dynamic>> _public(String path) async {
    if (_site.isEmpty) throw ApiException(tr('التطبيق غير مضبوط للاتصال بالموقع.', 'The app is not set up to connect to the website.'));
    late final http.Response res;
    try {
      res = await _client.get(Uri.parse('$_site$path'), headers: langController.header).timeout(const Duration(seconds: 30));
    } catch (_) {
      throw ApiException(tr('تعذّر الاتصال. تحقّق من الشبكة وأعد المحاولة.', 'Could not connect. Check the network and try again.'));
    }
    Map<String, dynamic> body;
    try {
      body = jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>;
    } catch (_) {
      body = const {};
    }
    if (res.statusCode != 200) throw ApiException(body['error'] as String? ?? tr('تعذّر التحميل (${res.statusCode}).', 'Could not load (${res.statusCode}).'));
    return body;
  }

  Future<SupplierDirectory> directory() async => SupplierDirectory.fromJson(await _public('/api/app/suppliers'));

  Future<({Supplier supplier, List<Product> products, double? rate, bool comingSoon})> supplier(String id) async {
    final j = await _public('/api/app/suppliers/$id');
    if (j['coming_soon'] == true || j['supplier'] == null) {
      throw ApiException(tr('دليل الموردين يُفعَّل قريباً.', 'The supplier directory is coming soon.'));
    }
    return (
      supplier: Supplier.fromJson(j['supplier'] as Map<String, dynamic>),
      products: [for (final p in (j['products'] as List? ?? const [])) Product.fromJson(p as Map<String, dynamic>)],
      rate: toDoubleOrNull(j['rate']),
      comingSoon: false,
    );
  }

  Future<OrdersBoard> orders({String? supplier}) async => OrdersBoard.fromJson(
        await _account.call('GET', supplier == null ? '/api/app/suppliers/orders' : '/api/app/suppliers/orders?supplier=$supplier'),
      );

  /// Opens an order: the same fields as the website's form, the lines as parallel lists.
  Future<StepAnswer> createOrder(Map<String, dynamic> body) async =>
      _answer(await _account.call('POST', '/api/app/suppliers/orders', body: body));

  Future<OrderView> order(String id) async => OrderView.fromJson(await _account.call('GET', '/api/app/suppliers/orders/$id'));

  /// One of the order page's forms: pledge, withdraw, deposit, pledge_status, order_status, assign.
  Future<StepAnswer> orderStep(String id, String action, [Map<String, dynamic> body = const {}]) async =>
      _answer(await _account.call('POST', '/api/app/suppliers/orders/$id', body: {...body, 'action': action}));

  Future<DeliveriesView> deliveries() async => DeliveriesView.fromJson(await _account.call('GET', '/api/app/suppliers/deliveries'));

  /// One of the deliveries page's forms: issue_code, confirm (with the photo as base64), paid, cancel, carrier.
  Future<StepAnswer> deliveryStep(String action, Map<String, dynamic> body) async =>
      _answer(await _account.call('POST', '/api/app/suppliers/deliveries', body: {...body, 'action': action}));

  Future<MySupplierView> mine() async => MySupplierView.fromJson(await _account.call('GET', '/api/app/suppliers/mine'));

  /// One of «صفحتي كمورد»'s forms: save, document (with the photo as base64), active, product, remove_product.
  Future<StepAnswer> mineStep(String action, Map<String, dynamic> body) async =>
      _answer(await _account.call('POST', '/api/app/suppliers/mine', body: {...body, 'action': action}));
}
