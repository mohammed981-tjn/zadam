/// الطلبات الجماعية في التطبيق (البند ٢٠٣): the website's /suppliers/orders and /suppliers/orders/[id] — the current
/// orders, opening one, pledging on its lines, and the organiser's panel (deposits, pledges, the order's status and
/// assigning deliveries). Each step is the website's own, as the signed-in person; the database decides who may.
library;

import 'package:flutter/material.dart';

import '../suppliers.dart';
import '../ui.dart';
import 'suppliers_kit.dart';

const _orderSteps = [
  ('١. يفتح المنظّم الطلب', 'المورد، والأصناف بأسعارها، ونقطة الاستلام، ويوم التوصيل، وآخر موعد.'),
  ('٢. يتعهّد المزارعون', 'كلٌّ بكميّته، والحمولة تُحسب بالطن أمام الجميع.'),
  ('٣. المقدّم مباشرةً', '١٠٪ إلى حساب المورد أو الجمعية، والمنظّم يسجّل رقم التحويل.'),
  ('٤. يوم التوصيل', 'الاستلام من النقطة، والباقي يُدفع عندها. أو توصيلٌ إلى الأرض بالرمز.'),
];

const _noMoneyHeld = 'سوداقري لا تستلم أيّ مبلغ ولا تمسكه: المقدّم يذهب من المزارع إلى حساب المورد أو الجمعية مباشرةً، '
    'والباقي يُدفع عند الاستلام. لا تحوّل لأيّ حسابٍ غير المكتوب في الطلب.';

class OrdersTab extends StatefulWidget {
  const OrdersTab({super.key, required this.api});
  final SuppliersApi api;

  @override
  State<OrdersTab> createState() => _OrdersTabState();
}

class _OrdersTabState extends State<OrdersTab> {
  Future<OrdersBoard>? _board;

  void _reload() => setState(() => _board = widget.api.orders());

  @override
  Widget build(BuildContext context) {
    return SignedInGate(
      why: 'ادخل لترى الطلبات الجماعية وتتعهّد بكميّتك، أو لتفتح طلباً لجمعيتك أو قسمك.',
      builder: (context) {
        _board ??= widget.api.orders();
        return FutureBuilder<OrdersBoard>(
          future: _board,
          builder: (context, snap) {
            if (snap.connectionState != ConnectionState.done) return const LoadingView();
            if (snap.hasError) return StateView.error(snap.error, onRetry: _reload, scrollable: true);
            final b = snap.data!;
            return RefreshIndicator(
              onRefresh: () async => _reload(),
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
                children: [
                  const IntroNote(
                    'جوالٌ واحدٌ يُشترى بسعر التجزئة، وحمولةُ شاحنةٍ بسعرٍ أفضل. تفتح الجمعية أو مندوب القسم طلباً على موردٍ '
                    'موثّق، ويتعهّد كلُّ مزارعٍ بكميّته حتى تكتمل الحمولة، ثمّ تصل الشاحنة نقطة الاستلام في اليوم المعلن.',
                    icon: Icons.local_shipping_outlined,
                  ),
                  const SizedBox(height: 10),
                  InfoCard(children: [
                    for (final (h, d) in _orderSteps) ...[
                      Text(h, style: const TextStyle(fontWeight: FontWeight.w800)),
                      Muted(d),
                      const SizedBox(height: 4),
                    ],
                  ]),
                  const SizedBox(height: 10),
                  const Muted(_noMoneyHeld),
                  const SizedBox(height: 16),
                  SectionTitle(
                    'الطلبات الجارية',
                    trailing: b.comingSoon || b.suppliers.isEmpty
                        ? null
                        : FilledButton.icon(
                            onPressed: () async {
                              await Navigator.of(context).push(MaterialPageRoute(builder: (_) => NewOrderScreen(api: widget.api)));
                              if (mounted) _reload();
                            },
                            icon: const Icon(Icons.add_rounded, size: 18),
                            label: const Text('افتح طلباً'),
                          ),
                  ),
                  if (b.comingSoon)
                    const StateView(icon: Icons.hourglass_empty_rounded, title: 'يُفعَّل قريباً', compact: true)
                  else if (b.orders.isEmpty)
                    const StateView(
                      icon: Icons.groups_outlined,
                      title: 'لا طلب جماعيّاً بعد',
                      message: 'كن أوّل من يفتح واحداً لجمعيتك.',
                      compact: true,
                    )
                  else
                    for (final (i, o) in b.orders.indexed) ...[
                      FadeIn(delay: i, child: OrderCard(order: o, onTap: () => _open(o.id))),
                      const SizedBox(height: 10),
                    ],
                  if (!b.comingSoon && b.suppliers.isEmpty)
                    const Muted('لا مورد موثّقاً بعد يُفتح عليه طلب. دُلّ تاجرك على «صفحتي كمورد».'),
                ],
              ),
            );
          },
        );
      },
    );
  }

  Future<void> _open(String id) async {
    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => OrderScreen(id: id, api: widget.api)));
    if (mounted) _reload();
  }
}

class OrderCard extends StatelessWidget {
  const OrderCard({super.key, required this.order, this.onTap});
  final OrderSummary order;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final o = order;
    return InfoCard(
      onTap: onTap,
      children: [
        Text(o.title, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
        Muted('${o.supplierName} ← ${o.pickupName ?? o.pickupLocality}، ${o.pickupState}'),
        Row(
          children: [
            Expanded(child: Text('يوم التوصيل: ${dateAr(o.dropDay)}', style: const TextStyle(fontSize: 12.5))),
            Flexible(child: TagPill(o.statusLabel, gold: o.status != 'open')),
          ],
        ),
        const SizedBox(height: 8),
        ClipRRect(
          borderRadius: BorderRadius.circular(6),
          child: LinearProgressIndicator(value: o.fill, minHeight: 8),
        ),
        const SizedBox(height: 4),
        Muted('${figure(o.pledgedTonnes, 1)} من ${figure(o.targetTonnes, 1)} طن · ${o.members} مزارع'),
      ],
    );
  }
}

// ── Opening an order ───────────────────────────────────────────────────────

class _LineInput {
  _LineInput({this.product = '', String name = '', String unit = '', String kg = '', String price = ''})
      : name = TextEditingController(text: name),
        unit = TextEditingController(text: unit),
        kg = TextEditingController(text: kg),
        price = TextEditingController(text: price);
  final String product;
  final TextEditingController name;
  final TextEditingController unit;
  final TextEditingController kg;
  final TextEditingController price;
}

/// «افتح طلباً جماعيّاً»: the supplier first, then the order's form with their valid offers as its first lines.
class NewOrderScreen extends StatefulWidget {
  const NewOrderScreen({super.key, required this.api, this.supplierId});
  final SuppliersApi api;
  final String? supplierId;

  @override
  State<NewOrderScreen> createState() => _NewOrderScreenState();
}

class _NewOrderScreenState extends State<NewOrderScreen> {
  Future<OrdersBoard>? _board;
  String? _supplier;
  String? _loadedFor;
  final _title = TextEditingController();
  final _organiser = TextEditingController();
  final _phone = TextEditingController();
  final _pickup = TextEditingController();
  final _locality = TextEditingController();
  final _account = TextEditingController();
  final _notes = TextEditingController();
  final _target = TextEditingController(text: '30');
  final _deposit = TextEditingController(text: '10');
  String? _pickupState;
  String _deadline = isoDay(14);
  String _dropDay = isoDay(21);
  String _payee = 'cooperative';
  List<_LineInput> _lines = [];
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _supplier = widget.supplierId;
  }

  void _load() {
    _loadedFor = _supplier;
    _board = widget.api.orders(supplier: _supplier).then((b) {
      final chosen = b.suppliers.where((s) => s.id == _supplier).firstOrNull;
      _pickupState ??= chosen?.state;
      _lines = [
        for (final p in b.products)
          _LineInput(
            product: p.id,
            name: p.name,
            unit: p.packLabel,
            kg: p.unitKg == null ? '' : figure(p.unitKg!, 3),
            price: figure(p.priceUsd),
          ),
        for (var i = 0; i < (4 - b.products.length).clamp(2, 4); i++) _LineInput(),
      ];
      return b;
    });
  }

  Future<void> _pickDate(bool deadline) async {
    final now = DateTime.now();
    final d = await showDatePicker(
      context: context,
      firstDate: now,
      lastDate: now.add(const Duration(days: 365)),
      initialDate: DateTime.tryParse(deadline ? _deadline : _dropDay) ?? now,
    );
    if (d == null) return;
    final iso = d.toIso8601String().substring(0, 10);
    setState(() => deadline ? _deadline = iso : _dropDay = iso);
  }

  Future<void> _submit() async {
    setState(() => _busy = true);
    String? id;
    final ok = await runStep(context, () async {
      final a = await widget.api.createOrder({
        'supplier_id': _supplier,
        'title': _title.text,
        'organiser_name': _organiser.text,
        'organiser_phone': _phone.text,
        'pickup_name': _pickup.text,
        'pickup_locality': _locality.text,
        'pickup_state': _pickupState ?? '',
        'deadline': _deadline,
        'drop_day': _dropDay,
        'target_tonnes': _target.text,
        'deposit_pct': _deposit.text,
        'payee': _payee,
        'payee_account': _account.text,
        'notes': _notes.text,
        'line_product': [for (final l in _lines) l.product],
        'line_name': [for (final l in _lines) l.name.text],
        'line_unit': [for (final l in _lines) l.unit.text],
        'line_kg': [for (final l in _lines) l.kg.text],
        'line_price': [for (final l in _lines) l.price.text],
      });
      id = a.id;
      return a.message;
    });
    if (!mounted) return;
    setState(() => _busy = false);
    if (ok && id != null) {
      await Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => OrderScreen(id: id!, api: widget.api)));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('افتح طلباً جماعيّاً')),
      body: SignedInGate(
        why: 'ادخل لتفتح طلباً لجمعيتك أو قسمك.',
        builder: (context) {
          if (_board == null || _loadedFor != _supplier) _load();
          return FutureBuilder<OrdersBoard>(
            future: _board,
            builder: (context, snap) {
              if (snap.connectionState != ConnectionState.done) return const LoadingView();
              if (snap.hasError) return StateView.error(snap.error, onRetry: () => setState(_load));
              final b = snap.data!;
              if (b.suppliers.isEmpty) {
                return const StateView(
                  icon: Icons.storefront_outlined,
                  title: 'لا مورد موثّقاً بعد',
                  message: 'لا مورد موثّقاً بعد يُفتح عليه طلب. دُلّ تاجرك على «صفحتي كمورد».',
                );
              }
              final chosen = b.suppliers.where((s) => s.id == _supplier).firstOrNull;
              return ListView(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 40),
                children: [
                  DropdownButtonFormField<String>(
                    initialValue: chosen?.id,
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: '١) اختر المورد الموثّق'),
                    items: [for (final s in b.suppliers) DropdownMenuItem(value: s.id, child: Text('${s.name} — ${s.state}'))],
                    onChanged: (v) => setState(() {
                      _supplier = v;
                      _pickupState = b.suppliers.where((s) => s.id == v).firstOrNull?.state;
                    }),
                  ),
                  if (chosen != null) ..._form(),
                ],
              );
            },
          );
        },
      ),
    );
  }

  List<Widget> _form() {
    const gap = SizedBox(height: 10);
    return [
      gap,
      TextField(controller: _title, maxLength: 100, decoration: const InputDecoration(labelText: 'عنوان الطلب', hintText: 'يوريا قسم الحصاحيصا — موسم الشتاء')),
      TextField(controller: _organiser, maxLength: 60, decoration: const InputDecoration(labelText: 'اسمك أو اسم الجمعية')),
      gap,
      TextField(
        controller: _phone,
        keyboardType: TextInputType.phone,
        textDirection: TextDirection.ltr,
        decoration: const InputDecoration(labelText: 'هاتفك', helperText: 'يراه المتعهّدون وحدهم'),
      ),
      const SizedBox(height: 16),
      const SectionTitle('نقطة الاستلام'),
      TextField(controller: _pickup, maxLength: 100, decoration: const InputDecoration(labelText: 'الجمعية، أو مكتب القسم، أو مخزن تاجرٍ شريك')),
      TextField(controller: _locality, maxLength: 80, decoration: const InputDecoration(labelText: 'المحلية أو القرية')),
      gap,
      StateField(value: _pickupState, onChanged: (v) => setState(() => _pickupState = v)),
      const SizedBox(height: 16),
      Row(
        children: [
          Expanded(
            child: OutlinedButton(onPressed: () => _pickDate(true), child: Text('آخر موعدٍ للانضمام\n${dateAr(_deadline)}', textAlign: TextAlign.center)),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: OutlinedButton(onPressed: () => _pickDate(false), child: Text('يوم التوصيل\n${dateAr(_dropDay)}', textAlign: TextAlign.center)),
          ),
        ],
      ),
      gap,
      Row(
        children: [
          Expanded(
            child: TextField(
              controller: _target,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(labelText: 'الحمولة المستهدفة (طن)'),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: TextField(controller: _deposit, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'المقدّم ٪')),
          ),
        ],
      ),
      const SizedBox(height: 16),
      const SectionTitle('أين يُدفع المقدّم؟'),
      SegmentedButton<String>(
        segments: const [
          ButtonSegment(value: 'cooperative', label: Text('حساب الجمعية')),
          ButtonSegment(value: 'supplier', label: Text('حساب المورد')),
        ],
        selected: {_payee},
        onSelectionChanged: (s) => setState(() => _payee = s.first),
      ),
      gap,
      TextField(controller: _account, maxLength: 200, decoration: const InputDecoration(labelText: 'بنكك: رقم الحساب واسم صاحبه')),
      const Muted('يراه من تعهّد وحده. المال يذهب من المزارع إلى هذا الحساب مباشرةً — المنصّة لا تمسك شيئاً.'),
      const SizedBox(height: 16),
      SectionTitle(
        'الأصناف',
        subtitle: 'الوحدة كما تُسلَّم (جوال ٥٠ كجم)، ووزنها بالكيلو لتُحسب الحمولة، وسعرها بالدولار من المورد.',
        trailing: IconButton(onPressed: () => setState(() => _lines.add(_LineInput())), icon: const Icon(Icons.add_circle_outline)),
      ),
      for (final l in _lines)
        Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: InfoCard(children: [
            TextField(controller: l.name, decoration: const InputDecoration(labelText: 'الصنف')),
            const SizedBox(height: 6),
            Row(
              children: [
                Expanded(child: TextField(controller: l.unit, decoration: const InputDecoration(labelText: 'الوحدة'))),
                const SizedBox(width: 6),
                Expanded(
                  child: TextField(
                    controller: l.kg,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    decoration: const InputDecoration(labelText: 'كجم/وحدة'),
                  ),
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: TextField(
                    controller: l.price,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    decoration: const InputDecoration(labelText: 'US\$'),
                  ),
                ),
              ],
            ),
          ]),
        ),
      TextField(controller: _notes, maxLength: 1000, maxLines: 2, decoration: const InputDecoration(labelText: 'ملاحظات (اختياري): ساعات الاستلام، ما يُحضره المزارع')),
      gap,
      FilledButton(onPressed: _busy ? null : _submit, child: Text(_busy ? 'جارٍ الفتح…' : 'افتح الطلب')),
    ];
  }
}

// ── One order ──────────────────────────────────────────────────────────────

class OrderScreen extends StatefulWidget {
  const OrderScreen({super.key, required this.id, required this.api});
  final String id;
  final SuppliersApi api;

  @override
  State<OrderScreen> createState() => _OrderScreenState();
}

class _OrderScreenState extends State<OrderScreen> {
  Future<OrderView>? _view;

  void _reload() => setState(() => _view = widget.api.order(widget.id));

  Future<void> _step(String action, Map<String, dynamic> body) async {
    final ok = await runStep(context, () async => (await widget.api.orderStep(widget.id, action, body)).message);
    if (ok && mounted) _reload();
  }

  Future<void> _pledge(OrderView v, OrderLine l, Pledge? my) async {
    final qty = TextEditingController(text: my != null && my.status != 'withdrawn' ? figure(my.quantity, 3) : '');
    final name = TextEditingController(text: my?.displayName ?? v.myName);
    final phone = TextEditingController(text: my?.phone ?? '');
    final go = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l.name),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(controller: qty, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: const InputDecoration(labelText: 'الكميّة (وحدات)')),
              const SizedBox(height: 8),
              TextField(controller: name, maxLength: 60, decoration: const InputDecoration(labelText: 'اسمك كما يراه المنظّم')),
              TextField(
                controller: phone,
                keyboardType: TextInputType.phone,
                textDirection: TextDirection.ltr,
                decoration: const InputDecoration(labelText: 'هاتفك (للمنظّم وحده)'),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('إلغاء')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(my != null && my.status == 'pledged' ? 'عدّل' : 'تعهّد')),
        ],
      ),
    );
    if (go == true) await _step('pledge', {'line_id': l.id, 'quantity': qty.text, 'display_name': name.text, 'phone': phone.text});
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('طلب جماعي')),
      body: SignedInGate(
        why: 'ادخل لتتعهّد بكميّتك في هذا الطلب.',
        builder: (context) {
          _view ??= widget.api.order(widget.id);
          return FutureBuilder<OrderView>(
            future: _view,
            builder: (context, snap) {
              if (snap.connectionState != ConnectionState.done) return const LoadingView();
              if (snap.hasError) return StateView.error(snap.error, onRetry: _reload);
              return RefreshIndicator(onRefresh: () async => _reload(), child: _body(snap.data!));
            },
          );
        },
      ),
    );
  }

  Widget _body(OrderView v) {
    final o = v.order;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 40),
      children: [
        HeroBand(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(o.title, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
              const SizedBox(height: 4),
              Text('المورد: ${o.supplierName}${o.organiserName != null ? ' · ينظّمه: ${o.organiserName}' : ''}'),
              const SizedBox(height: 6),
              TagPill(o.statusLabel, gold: o.status != 'open'),
            ],
          ),
        ),
        const SizedBox(height: 12),
        InfoCard(children: [
          const Text('الحمولة حتى الآن', style: TextStyle(fontWeight: FontWeight.w800)),
          const SizedBox(height: 6),
          ClipRRect(borderRadius: BorderRadius.circular(6), child: LinearProgressIndicator(value: o.fill, minHeight: 10)),
          const SizedBox(height: 4),
          Muted('${figure(o.pledgedTonnes, 1)} من ${figure(o.targetTonnes, 1)} طن · ${o.members} مزارع'),
          const Divider(height: 20),
          LabelValue('نقطة الاستلام', '${o.pickupName != null ? '${o.pickupName} — ' : ''}${o.pickupLocality}، ${o.pickupState}'),
          if (o.pickupName == null) const Muted('المكان الدقيق يظهر لمن انضمّ إلى الطلب.'),
          if (o.pickupLat != null && o.pickupLng != null)
            TextButton.icon(
              onPressed: () => openLink(context, 'https://www.google.com/maps?q=${o.pickupLat},${o.pickupLng}'),
              icon: const Icon(Icons.map_outlined, size: 18),
              label: const Text('الخريطة'),
            ),
          LabelValue('يوم التوصيل', dateAr(o.dropDay)),
          LabelValue('آخر موعدٍ للانضمام', dateAr(o.deadline)),
          if (o.notes != null && o.notes!.isNotEmpty) Text(o.notes!, style: const TextStyle(height: 1.7)),
        ]),
        const SizedBox(height: 16),
        const SectionTitle('الأصناف'),
        for (final l in v.lines) ...[_lineCard(v, l), const SizedBox(height: 10)],
        if (v.mine.any((p) => p.live)) _depositCard(v),
        if (v.isOrganiser) ...[const SizedBox(height: 16), _organiserPanel(v)],
        const SizedBox(height: 16),
        const Muted(_noMoneyHeld),
      ],
    );
  }

  Widget _lineCard(OrderView v, OrderLine l) {
    final my = v.myPledgeOn(l.id);
    final canPledge = v.open && (my == null || my.status == 'pledged' || my.status == 'withdrawn');
    return InfoCard(children: [
      Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(child: Text(l.name, style: const TextStyle(fontWeight: FontWeight.w800))),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text('${usd(l.unitPriceUsd)} / ${l.unitLabel}', style: const TextStyle(fontWeight: FontWeight.w700)),
              if (v.rate != null) Muted('≈ ${sdg(l.unitPriceUsd * v.rate!)}'),
            ],
          ),
        ],
      ),
      Muted('تعهّد الأعضاء حتى الآن: ${figure(v.totals[l.id] ?? 0, 1)} وحدة'),
      if (my != null) Text('تعهّدك: ${figure(my.quantity, 3)} — ${my.statusLabel}', style: const TextStyle(fontSize: 13.5)),
      if (canPledge || (my != null && my.status == 'pledged'))
        Wrap(
          spacing: 8,
          children: [
            if (canPledge)
              FilledButton(onPressed: () => _pledge(v, l, my), child: Text(my != null && my.status == 'pledged' ? 'عدّل' : 'تعهّد')),
            if (my != null && my.status == 'pledged')
              TextButton(
                onPressed: () async {
                  if (await askSure(context, title: 'الانسحاب', message: 'تنسحب من هذا الصنف؟', action: 'انسحب')) {
                    await _step('withdraw', {'pledge_id': my.id});
                  }
                },
                child: const Text('انسحب من هذا الصنف'),
              ),
          ],
        ),
    ]);
  }

  Widget _depositCard(OrderView v) {
    final o = v.order;
    return InfoCard(highlight: true, children: [
      const Text('مقدّمك وكيف تدفعه', style: TextStyle(fontWeight: FontWeight.w800)),
      const SizedBox(height: 6),
      Text(
        'قيمة تعهّدك ${usd(v.myValue)}، والمقدّم ${figure(o.depositPct)}٪ = ${usd(v.myDeposit)}'
        '${v.rate != null ? ' (≈ ${sdg(v.myDeposit * v.rate!)})' : ''}',
      ),
      const SizedBox(height: 6),
      Text(o.payee == 'supplier' ? 'حوّله مباشرةً إلى حساب المورد:' : 'حوّله مباشرةً إلى حساب الجمعية:'),
      SelectableText(o.payeeAccount ?? '—', style: const TextStyle(fontWeight: FontWeight.w700)),
      const SizedBox(height: 6),
      const Text('ثمّ أرسل رقم التحويل إلى المنظّم، والباقي تدفعه عند الاستلام.'),
      if (o.organiserPhone != null)
        Wrap(spacing: 6, children: [
          OutlinedButton.icon(
            onPressed: () => openLink(context, 'tel:${o.organiserPhone}'),
            icon: const Icon(Icons.call_outlined, size: 18),
            label: Text(o.organiserPhone!),
          ),
          OutlinedButton.icon(
            onPressed: () => openLink(context, whatsappLink(o.organiserPhone!)),
            icon: const Icon(Icons.chat_outlined, size: 18),
            label: const Text('واتساب'),
          ),
        ]),
      const Muted('سوداقري لا تستلم أيّ مبلغ. لا تحوّل لأيّ حسابٍ غير المكتوب هنا.'),
    ]);
  }

  Widget _organiserPanel(OrderView v) {
    final o = v.order;
    return InfoCard(children: [
      const Text('لوحة المنظّم', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w900)),
      const Muted(
        'سجّل المقدّم حين يصلك رقم التحويل وتتأكّد منه في كشف الحساب. وإن تعثّر عضوٌ فعلّمه متعثّراً: يخرج تعهّده وحده '
        'من الحمولة، ولا يتغيّر شيءٌ لغيره.',
      ),
      const SizedBox(height: 6),
      Wrap(
        spacing: 6,
        runSpacing: 6,
        children: [
          for (final s in orderMoves[o.status] ?? const <String>[])
            OutlinedButton(
              onPressed: () async {
                if (s != 'cancelled' || await askSure(context, title: 'إلغاء الطلب', message: 'يُلغى الطلب كلّه؟', action: 'ألغِ الطلب')) {
                  await _step('order_status', {'status': s});
                }
              },
              child: Text(orderMoveLabels[s] ?? s),
            ),
        ],
      ),
      const Divider(height: 24),
      Text('التعهّدات (${v.pledges.length})', style: const TextStyle(fontWeight: FontWeight.w800)),
      if (v.pledges.isEmpty) const Muted('لا تعهّد بعد. أرسل رابط هذه الصفحة لأعضاء الجمعية.'),
      for (final p in v.pledges) _pledgeRow(v, p),
      const Divider(height: 24),
      const Text('الشاحنة إلى نقطة الاستلام', style: TextStyle(fontWeight: FontWeight.w800)),
      for (final d in v.deliveries.where((d) => d.kind == 'to_pickup' && d.status != 'cancelled'))
        Muted('${d.destination} — ${d.statusLabel} (رمز الاستلام والتفاصيل في «التوصيل»)'),
      if (v.carriers.isEmpty)
        const Muted('لا ناقل موثّقاً بعد. يسجّل الناقلون من «التوصيل».')
      else
        TextButton.icon(
          onPressed: () => _assign(v, null, '${o.pickupName ?? ''} — ${o.pickupLocality}'),
          icon: const Icon(Icons.local_shipping_outlined, size: 18),
          label: const Text('أسند الحمولة إلى ناقل'),
        ),
      const Muted(
        'يُعلَّم التوصيل «مستحقّ الدفع» للناقل حين يُدخل رمز المستلم مع صورةٍ وموقع. الدفع للناقل منك أو من المورد، خارج المنصّة.',
      ),
    ]);
  }

  Widget _pledgeRow(OrderView v, Pledge p) {
    final l = v.lineOf(p.lineId);
    final value = p.quantity * (l?.unitPriceUsd ?? 0);
    final d = v.deliveryFor(p.id);
    final working = p.status == 'pledged' || p.status == 'deposit_received';
    return Container(
      margin: const EdgeInsets.only(top: 8),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        border: Border.all(color: Theme.of(context).colorScheme.outline),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Expanded(child: Text(p.displayName, style: const TextStyle(fontWeight: FontWeight.w700))),
            Flexible(child: TagPill(p.statusLabel, gold: p.status == 'defaulted' || p.status == 'pledged')),
          ]),
          Muted('${l?.name ?? ''} × ${figure(p.quantity, 3)} = ${usd(value)} · المقدّم ${usd(value * v.order.depositPct / 100)}'
              '${p.phone != null && p.phone!.isNotEmpty ? ' · ${p.phone}' : ''}'),
          if (p.depositRef != null) Text('رقم التحويل: ${p.depositRef}', style: const TextStyle(fontSize: 12.5)),
          if (p.statusNote != null && p.statusNote!.isNotEmpty) Muted(p.statusNote!),
          Wrap(
            spacing: 6,
            children: [
              if (p.status == 'pledged')
                FilledButton(
                  onPressed: () async {
                    final ref = await askText(context, title: 'استُلم المقدّم', label: 'رقم التحويل', minLength: 4, maxLength: 60, direction: TextDirection.ltr);
                    if (ref != null) await _step('deposit', {'pledge_id': p.id, 'reference': ref});
                  },
                  child: const Text('استُلم المقدّم'),
                ),
              if (working) ...[
                OutlinedButton(onPressed: () => _step('pledge_status', {'pledge_id': p.id, 'status': 'collected'}), child: const Text('استلم بضاعته')),
                OutlinedButton(
                  onPressed: () async {
                    if (await askSure(context, title: 'متعثّر', message: 'يخرج تعهّد ${p.displayName} وحده من الحمولة.', action: 'متعثّر')) {
                      await _step('pledge_status', {'pledge_id': p.id, 'status': 'defaulted'});
                    }
                  },
                  child: const Text('متعثّر'),
                ),
              ],
              if (p.status == 'defaulted' || p.status == 'collected')
                OutlinedButton(onPressed: () => _step('pledge_status', {'pledge_id': p.id, 'status': 'pledged'}), child: const Text('أعده متعهّداً')),
            ],
          ),
          if (d != null)
            Muted('التوصيل إلى الأرض: ${d.statusLabel} — التفاصيل في «التوصيل»')
          else if (working && v.carriers.isNotEmpty)
            TextButton(onPressed: () => _assign(v, p.id, ''), child: const Text('أسند توصيلاً إلى أرضه')),
        ],
      ),
    );
  }

  /// «أسند»: a verified carrier, where to, and the fee if agreed.
  Future<void> _assign(OrderView v, String? pledgeId, String destination) async {
    String? carrier;
    final dest = TextEditingController(text: destination);
    final fee = TextEditingController();
    final go = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setState) => AlertDialog(
          title: Text(pledgeId == null ? 'أسند الحمولة إلى ناقل' : 'أسند توصيلاً إلى أرضه'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                DropdownButtonFormField<String>(
                  initialValue: carrier,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'الناقل الموثّق'),
                  items: [
                    for (final c in v.carriers)
                      DropdownMenuItem(value: c.id, child: Text('${c.name} — ${c.vehicle} (${figure(c.capacityTonnes, 1)} طن)')),
                  ],
                  onChanged: (x) => setState(() => carrier = x),
                ),
                const SizedBox(height: 8),
                TextField(controller: dest, maxLength: 200, decoration: const InputDecoration(labelText: 'إلى أين: الحواشة، القرية، العلامة')),
                TextField(
                  controller: fee,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: const InputDecoration(labelText: 'أجرة الناقل بالدولار (اختياري)'),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('إلغاء')),
            FilledButton(onPressed: carrier == null ? null : () => Navigator.pop(ctx, true), child: const Text('أسند')),
          ],
        ),
      ),
    );
    if (go == true) {
      await _step('assign', {'pledge_id': ?pledgeId, 'carrier_id': carrier, 'destination': dest.text, 'fee_usd': fee.text});
    }
  }
}
