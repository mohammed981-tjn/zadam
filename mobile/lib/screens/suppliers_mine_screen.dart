/// «صفحتي كمورد» في التطبيق (البند ٢٠٣): the website's /suppliers/mine — a shop registers, sends a photo of its
/// licences for the administrator to review, keeps its products with dated dollar prices, and pauses its listing.
library;

import 'dart:convert';

import 'package:flutter/material.dart';

import '../i18n.dart';
import '../suppliers.dart';
import '../theme.dart';
import '../ui.dart';
import 'suppliers_kit.dart';

class MineTab extends StatefulWidget {
  const MineTab({super.key, required this.api});
  final SuppliersApi api;

  @override
  State<MineTab> createState() => _MineTabState();
}

class _MineTabState extends State<MineTab> {
  Future<MySupplierView>? _view;

  void _reload() => setState(() => _view = widget.api.mine());

  Future<void> _step(String action, Map<String, dynamic> body) async {
    final ok = await runStep(context, () async => (await widget.api.mineStep(action, body)).message);
    if (ok && mounted) _reload();
  }

  Future<void> _edit(Widget screen) async {
    final saved = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => screen));
    if (saved == true && mounted) _reload();
  }

  @override
  Widget build(BuildContext context) {
    return SignedInGate(
      why: tr('ادخل لتسجّل متجرك مورداً موثّقاً.', 'Sign in to register your shop as a verified supplier.'),
      builder: (context) {
        _view ??= widget.api.mine();
        return FutureBuilder<MySupplierView>(
          future: _view,
          builder: (context, snap) {
            if (snap.connectionState != ConnectionState.done) return const LoadingView();
            if (snap.hasError) return StateView.error(snap.error, onRetry: _reload, scrollable: true);
            final v = snap.data!;
            if (v.comingSoon) {
              return StateView(
                icon: Icons.hourglass_empty_rounded,
                title: tr('يُفعَّل قريباً', 'Coming soon'),
                message: tr('جهّز الآن: رقم السجلّ التجاري، ورخصة المجلس القومي للمبيدات إن كنت تبيع المبيدات، وتسجيل الإدارة '
                    'القومية للتقاوي إن كنت تبيع البذور، وصورةً واضحةً لها.', 'Get ready now: the commercial registration number, the National Pesticides Council licence if you sell pesticides, the National Seed Administration registration if you sell seed, and a clear photo of them.'),
                scrollable: true,
              );
            }
            final s = v.supplier;
            return RefreshIndicator(
              onRefresh: () async => _reload(),
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 40),
                children: [
                  IntroNote(
                    tr('التسجيل مجّاني. تكتب بياناتك ورخصك، وترفع صورتها، فيراها المشرف ويمنحك شارة «موثّق». بعدها يجدك المزارعون '
                    'حين يبحثون عن مدخلٍ في ولايتك، وتستطيع الجمعيات أن تفتح عليك طلباتٍ جماعية بحمولة شاحنة.', 'Registration is free. You write your details and licences and upload a photo of them; the supervisor sees them and gives you the «Verified» badge. After that farmers find you when they search for an input in your state, and associations can open truck-load group orders with you.'),
                    icon: Icons.storefront_outlined,
                  ),
                  const SizedBox(height: 12),
                  if (s == null)
                    FilledButton.icon(
                      onPressed: () => _edit(SupplierFormScreen(api: widget.api)),
                      icon: const Icon(Icons.app_registration_rounded),
                      label: Text(tr('١) سجّل متجرك', '1) Register your shop')),
                    )
                  else ...[
                    _status(s),
                    const SizedBox(height: 12),
                    InfoCard(children: [
                      Text(s.name, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
                      Muted('${s.state} — ${s.locality} · ${s.phone}'),
                      Muted(tr('يبيع: ${s.categories.map((c) => supplyCategories[c] ?? c).join('، ')}', 'Sells: ${s.categories.map((c) => supplyCategories[c] ?? c).join(', ')}')),
                      const SizedBox(height: 6),
                      OutlinedButton(
                        onPressed: () => _edit(SupplierFormScreen(api: widget.api, supplier: s)),
                        child: Text(tr('عدّل البيانات', 'Edit the details')),
                      ),
                    ]),
                    const SizedBox(height: 12),
                    InfoCard(children: [
                      Text(tr('٢) صورة المستندات', '2) Document photo'), style: TextStyle(fontWeight: FontWeight.w800)),
                      Muted(tr('صورةٌ واضحةٌ للسجلّ التجاري والرخص. تُحفظ في مجلّدك الخاصّ ولا يراها إلا المشرف.', 'A clear photo of the commercial registration and the licences. It is kept in your private folder and only the supervisor sees it.')),
                      if (s.hasDocument) Text(tr('✓ رُفعت صورة المستندات.', '✓ Document photo uploaded.'), style: TextStyle(color: textGreenOn(context), fontWeight: FontWeight.w700)),
                      const SizedBox(height: 6),
                      OutlinedButton.icon(
                        onPressed: () async {
                          final photo = await takePhoto(context);
                          if (photo != null) await _step('document', {'photo': base64Encode(photo)});
                        },
                        icon: const Icon(Icons.upload_file_outlined),
                        label: Text(s.hasDocument ? tr('استبدل الصورة وأرسلها للمراجعة', 'Replace the photo and send it for review') : tr('صوّر المستندات وأرسلها للمراجعة', 'Photograph the documents and send them for review')),
                      ),
                    ]),
                    const SizedBox(height: 12),
                    InfoCard(children: [
                      Text(tr('٣) منتجاتك وأسعارك', '3) Your products and prices'), style: TextStyle(fontWeight: FontWeight.w800)),
                      Muted(
                        tr('السعر بالدولار، حتى تاريخٍ تحدّده (سنةٌ على الأكثر)، ونعرضه بالجنيه بسعر البنك اليوم. المبيد يُعرض برقم '
                        'تسجيله لدى المجلس، والبذور باسم صنفها المعتمد.', 'The price is in dollars, valid until a date you set (a year at most), and we show it in pounds at today\'s bank rate. A pesticide is listed with its council registration number, and seed with its approved variety name.'),
                      ),
                      for (final p in v.products)
                        Opacity(
                          opacity: p.active ? 1 : 0.55,
                          child: ProductTile(
                            p,
                            rate: v.rate,
                            trailing: Wrap(children: [
                              TextButton(onPressed: () => _edit(ProductFormScreen(api: widget.api, product: p)), child: Text(tr('عدّل', 'Update'))),
                              if (p.active)
                                TextButton(
                                  onPressed: () async {
                                    if (await askSure(context, title: tr('أوقف عرضه', 'Stop listing it'), message: tr('يتوقّف عرض «${p.name}».', '«${p.name}» stops being listed.'), action: tr('أوقف', 'Stop'))) {
                                      await _step('remove_product', {'product_id': p.id});
                                    }
                                  },
                                  child: Text(tr('أوقف عرضه', 'Stop listing it')),
                                ),
                            ]),
                          ),
                        ),
                      const SizedBox(height: 6),
                      FilledButton.icon(
                        onPressed: () => _edit(ProductFormScreen(api: widget.api)),
                        icon: const Icon(Icons.add_rounded),
                        label: Text(tr('أضف منتجاً', 'Add a product')),
                      ),
                    ]),
                    const SizedBox(height: 12),
                    OutlinedButton(
                      onPressed: () => _step('active', {'supplier_id': s.id, 'active': s.active ? 'false' : 'true'}),
                      child: Text(s.active ? tr('أوقف ظهوري مؤقّتاً', 'Pause my listing') : tr('أعد إظهاري', 'Show my listing again')),
                    ),
                  ],
                  const SizedBox(height: 16),
                  IntroNote(
                    tr('ما يلزم المورد: السجلّ التجاري، ورخصة المجلس القومي للمبيدات لمن يبيع المبيدات، والتسجيل لدى الإدارة '
                    'القومية للتقاوي لمن يبيع البذور. الأسعار عروضك أنت حتى تاريخك، لا أسعار سوقٍ مرجعيّة.', 'What a supplier needs: the commercial registration, the National Pesticides Council licence for those who sell pesticides, and registration with the National Seed Administration for those who sell seed. The prices are your own offers until your date, not reference market prices.'),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  Widget _status(Supplier s) {
    return InfoCard(highlight: s.verified, children: [
      Wrap(spacing: 8, children: [
        s.verified ? TagPill(tr('موثّق', 'Verified'), icon: Icons.verified_outlined) : TagPill(tr('بانتظار التوثيق', 'Awaiting verification'), gold: true),
        if (!s.active) TagPill(tr('موقوفٌ مؤقّتاً', 'Paused'), gold: true),
      ]),
      const SizedBox(height: 6),
      if (!s.verified && !s.hasDocument) Text(tr('الخطوة التالية: ارفع صورة المستندات.', 'Next step: upload the document photo.')),
      if (!s.verified && s.hasDocument) Text(tr('وصلت مستنداتك، ويراجعها المشرف.', 'Your documents arrived and are being reviewed.')),
      if (s.reviewNote != null && s.reviewNote!.isNotEmpty) Text(tr('ملاحظة المشرف: ${s.reviewNote}', 'Supervisor\'s note: ${s.reviewNote}')),
    ]);
  }
}

/// The supplier's details, as the website's first form.
class SupplierFormScreen extends StatefulWidget {
  const SupplierFormScreen({super.key, required this.api, this.supplier});
  final SuppliersApi api;
  final Supplier? supplier;

  @override
  State<SupplierFormScreen> createState() => _SupplierFormScreenState();
}

class _SupplierFormScreenState extends State<SupplierFormScreen> {
  late final s = widget.supplier;
  late final _name = TextEditingController(text: s?.name);
  late final _locality = TextEditingController(text: s?.locality);
  late final _phone = TextEditingController(text: s?.phone);
  late final _whatsapp = TextEditingController(text: s?.whatsapp);
  late final _cr = TextEditingController(text: s?.commercialRegistrationNo);
  late final _pesticide = TextEditingController(text: s?.pesticideLicenceNo);
  late final _seed = TextEditingController(text: s?.seedRegistrationNo);
  late final _bio = TextEditingController(text: s?.bio);
  late String? _state = s?.state;
  late final Set<String> _categories = {...?s?.categories};
  late Set<String> _delivers = {...?s?.deliveryStates};
  bool _busy = false;

  Future<void> _save() async {
    setState(() => _busy = true);
    final ok = await runStep(context, () async => (await widget.api.mineStep('save', {
          'name': _name.text,
          'state': _state ?? '',
          'locality': _locality.text,
          'phone': _phone.text,
          'whatsapp': _whatsapp.text,
          'categories': _categories.toList(),
          'delivery_states': _delivers.toList(),
          'commercial_registration_no': _cr.text,
          'pesticide_licence_no': _pesticide.text,
          'seed_registration_no': _seed.text,
          'bio': _bio.text,
        }))
            .message);
    if (!mounted) return;
    setState(() => _busy = false);
    if (ok) Navigator.of(context).pop(true);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(s == null ? tr('سجّل متجرك', 'Register your shop') : tr('بيانات المورد', 'Supplier details'))),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 40),
        children: [
          TextField(controller: _name, maxLength: 100, decoration: InputDecoration(labelText: tr('اسم المتجر أو الشركة', 'Shop or company name'))),
          StateField(value: _state, onChanged: (v) => setState(() => _state = v)),
          const SizedBox(height: 10),
          TextField(controller: _locality, maxLength: 80, decoration: InputDecoration(labelText: tr('المحلية أو السوق', 'Locality or market'))),
          TextField(controller: _phone, keyboardType: TextInputType.phone, textDirection: TextDirection.ltr, decoration: InputDecoration(labelText: tr('الهاتف: 0912345678', 'Phone: 0912345678'))),
          const SizedBox(height: 10),
          TextField(controller: _whatsapp, keyboardType: TextInputType.phone, textDirection: TextDirection.ltr, decoration: InputDecoration(labelText: tr('واتساب (اختياري)', 'WhatsApp (optional)'))),
          const SizedBox(height: 16),
          SectionTitle(tr('ماذا تبيع؟', 'What do you sell?')),
          Wrap(spacing: 6, children: [
            for (final e in supplyCategories.entries)
              FilterChip(
                label: Text(e.value),
                selected: _categories.contains(e.key),
                onSelected: (on) => setState(() => on ? _categories.add(e.key) : _categories.remove(e.key)),
              ),
          ]),
          const SizedBox(height: 16),
          SectionTitle(tr('الولايات التي توصل إليها', 'States you deliver to')),
          StatesPicker(selected: _delivers, onChanged: (v) => setState(() => _delivers = v)),
          const SizedBox(height: 16),
          TextField(controller: _cr, maxLength: 60, textDirection: TextDirection.ltr, decoration: InputDecoration(labelText: tr('رقم السجلّ التجاري', 'Commercial registration no.'))),
          TextField(controller: _pesticide, maxLength: 60, textDirection: TextDirection.ltr, decoration: InputDecoration(labelText: tr('رخصة المجلس القومي للمبيدات', 'National Pesticides Council licence'))),
          TextField(controller: _seed, maxLength: 60, textDirection: TextDirection.ltr, decoration: InputDecoration(labelText: tr('تسجيل الإدارة القومية للتقاوي', 'Seed Administration registration no.'))),
          TextField(controller: _bio, maxLength: 1000, maxLines: 3, decoration: InputDecoration(labelText: tr('نبذة (اختياري): منذ متى تعمل، وما تختصّ به', 'About (optional): how long you have traded, what you specialise in'))),
          Muted(tr('تغيير الاسم أو أرقام الرخص بعد التوثيق يُعيد طلبك إلى المراجعة.', 'Changing the name or licence numbers after verification sends your listing back for review.')),
          const SizedBox(height: 16),
          FilledButton(onPressed: _busy ? null : _save, child: Text(tr('احفظ', 'Save'))),
        ],
      ),
    );
  }
}

/// A product with its dated dollar price, as the website's product form.
class ProductFormScreen extends StatefulWidget {
  const ProductFormScreen({super.key, required this.api, this.product});
  final SuppliersApi api;
  final Product? product;

  @override
  State<ProductFormScreen> createState() => _ProductFormScreenState();
}

class _ProductFormScreenState extends State<ProductFormScreen> {
  late final p = widget.product;
  late String? _category = p?.category;
  late String _inputKey = p?.inputKey ?? '';
  late String _unit = p?.packUnit ?? 'kg';
  late final _name = TextEditingController(text: p?.name);
  late final _ingredient = TextEditingController(text: p?.activeIngredient);
  late final _registration = TextEditingController(text: p?.registrationNo);
  late final _lot = TextEditingController(text: p?.certLot);
  late final _size = TextEditingController(text: p == null ? '' : figure(p!.packSize, 3));
  late final _price = TextEditingController(text: p == null ? '' : figure(p!.priceUsd));
  late String _validUntil = p != null && !p!.expired ? p!.validUntil : isoDay(30);
  bool _busy = false;

  Future<void> _save() async {
    setState(() => _busy = true);
    final ok = await runStep(context, () async => (await widget.api.mineStep('product', {
          'product_id': ?p?.id,
          'category': _category ?? '',
          'input_key': _inputKey,
          'name': _name.text,
          'active_ingredient': _ingredient.text,
          'registration_no': _registration.text,
          'cert_lot': _lot.text,
          'pack_size': _size.text,
          'pack_unit': _unit,
          'price_usd': _price.text,
          'valid_until': _validUntil,
        }))
            .message);
    if (!mounted) return;
    setState(() => _busy = false);
    if (ok) Navigator.of(context).pop(true);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(p == null ? tr('أضف منتجاً', 'Add a product') : tr('عدّل المنتج', 'Edit the product'))),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 40),
        children: [
          DropdownButtonFormField<String>(
            initialValue: _category,
            isExpanded: true,
            decoration: InputDecoration(labelText: tr('الصنف', 'Item')),
            items: [for (final e in supplyCategories.entries) DropdownMenuItem(value: e.key, child: Text(e.value))],
            onChanged: (v) => setState(() => _category = v),
          ),
          const SizedBox(height: 10),
          DropdownButtonFormField<String>(
            initialValue: _inputKey,
            isExpanded: true,
            decoration: InputDecoration(labelText: tr('المدخل (ليظهر في دراسة الجدوى)', 'Input (to appear in the feasibility study)')),
            items: [
              const DropdownMenuItem(value: '', child: Text('—')),
              for (final e in inputLabels.entries) DropdownMenuItem(value: e.key, child: Text(e.value.$1)),
            ],
            onChanged: (v) => setState(() => _inputKey = v ?? ''),
          ),
          const SizedBox(height: 10),
          TextField(controller: _name, maxLength: 120, decoration: InputDecoration(labelText: tr('اسم المنتج التجاري', 'Trade name'))),
          TextField(controller: _ingredient, maxLength: 200, decoration: InputDecoration(labelText: tr('المادة الفعّالة وتركيزها', 'Active ingredient and strength'))),
          TextField(controller: _registration, maxLength: 60, decoration: InputDecoration(labelText: tr('رقم التسجيل / الصنف المعتمد', 'Registration no. / approved variety'))),
          TextField(controller: _lot, maxLength: 60, decoration: InputDecoration(labelText: tr('لوط الإكثار (للبذور)', 'Certified lot (seed)'))),
          Row(children: [
            Expanded(
              child: TextField(
                controller: _size,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: InputDecoration(labelText: tr('حجم العبوة', 'Pack size')),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: DropdownButtonFormField<String>(
                initialValue: _unit,
                decoration: InputDecoration(labelText: tr('الوحدة', 'Unit')),
                items: [for (final e in packUnits.entries) DropdownMenuItem(value: e.key, child: Text(e.value))],
                onChanged: (v) => setState(() => _unit = v ?? 'kg'),
              ),
            ),
          ]),
          const SizedBox(height: 10),
          TextField(
            controller: _price,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: InputDecoration(labelText: tr('السعر بالدولار', 'Price, US\$')),
          ),
          const SizedBox(height: 10),
          OutlinedButton(
            onPressed: () async {
              final now = DateTime.now();
              final d = await showDatePicker(
                context: context,
                firstDate: now,
                lastDate: now.add(const Duration(days: 365)),
                initialDate: DateTime.tryParse(_validUntil) ?? now,
              );
              if (d != null) setState(() => _validUntil = d.toIso8601String().substring(0, 10));
            },
            child: Text(tr('سارٍ حتى ${dateAr(_validUntil)}', 'Valid until ${dateAr(_validUntil)}')),
          ),
          const SizedBox(height: 16),
          FilledButton(onPressed: _busy ? null : _save, child: Text(p == null ? tr('أضف المنتج', 'Add the product') : tr('احفظ التعديل', 'Save changes'))),
        ],
      ),
    );
  }
}
