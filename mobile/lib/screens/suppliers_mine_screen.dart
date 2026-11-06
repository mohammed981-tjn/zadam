/// «صفحتي كمورد» في التطبيق (البند ٢٠٣): the website's /suppliers/mine — a shop registers, sends a photo of its
/// licences for the administrator to review, keeps its products with dated dollar prices, and pauses its listing.
library;

import 'dart:convert';

import 'package:flutter/material.dart';

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
      why: 'ادخل لتسجّل متجرك مورداً موثّقاً.',
      builder: (context) {
        _view ??= widget.api.mine();
        return FutureBuilder<MySupplierView>(
          future: _view,
          builder: (context, snap) {
            if (snap.connectionState != ConnectionState.done) return const LoadingView();
            if (snap.hasError) return StateView.error(snap.error, onRetry: _reload, scrollable: true);
            final v = snap.data!;
            if (v.comingSoon) {
              return const StateView(
                icon: Icons.hourglass_empty_rounded,
                title: 'يُفعَّل قريباً',
                message: 'جهّز الآن: رقم السجلّ التجاري، ورخصة المجلس القومي للمبيدات إن كنت تبيع المبيدات، وتسجيل الإدارة '
                    'القومية للتقاوي إن كنت تبيع البذور، وصورةً واضحةً لها.',
                scrollable: true,
              );
            }
            final s = v.supplier;
            return RefreshIndicator(
              onRefresh: () async => _reload(),
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 40),
                children: [
                  const IntroNote(
                    'التسجيل مجّاني. تكتب بياناتك ورخصك، وترفع صورتها، فيراها المشرف ويمنحك شارة «موثّق». بعدها يجدك المزارعون '
                    'حين يبحثون عن مدخلٍ في ولايتك، وتستطيع الجمعيات أن تفتح عليك طلباتٍ جماعية بحمولة شاحنة.',
                    icon: Icons.storefront_outlined,
                  ),
                  const SizedBox(height: 12),
                  if (s == null)
                    FilledButton.icon(
                      onPressed: () => _edit(SupplierFormScreen(api: widget.api)),
                      icon: const Icon(Icons.app_registration_rounded),
                      label: const Text('١) سجّل متجرك'),
                    )
                  else ...[
                    _status(s),
                    const SizedBox(height: 12),
                    InfoCard(children: [
                      Text(s.name, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
                      Muted('${s.state} — ${s.locality} · ${s.phone}'),
                      Muted('يبيع: ${s.categories.map((c) => supplyCategories[c] ?? c).join('، ')}'),
                      const SizedBox(height: 6),
                      OutlinedButton(
                        onPressed: () => _edit(SupplierFormScreen(api: widget.api, supplier: s)),
                        child: const Text('عدّل البيانات'),
                      ),
                    ]),
                    const SizedBox(height: 12),
                    InfoCard(children: [
                      const Text('٢) صورة المستندات', style: TextStyle(fontWeight: FontWeight.w800)),
                      const Muted('صورةٌ واضحةٌ للسجلّ التجاري والرخص. تُحفظ في مجلّدك الخاصّ ولا يراها إلا المشرف.'),
                      if (s.hasDocument) Text('✓ رُفعت صورة المستندات.', style: TextStyle(color: textGreenOn(context), fontWeight: FontWeight.w700)),
                      const SizedBox(height: 6),
                      OutlinedButton.icon(
                        onPressed: () async {
                          final photo = await takePhoto(context);
                          if (photo != null) await _step('document', {'photo': base64Encode(photo)});
                        },
                        icon: const Icon(Icons.upload_file_outlined),
                        label: Text(s.hasDocument ? 'استبدل الصورة وأرسلها للمراجعة' : 'صوّر المستندات وأرسلها للمراجعة'),
                      ),
                    ]),
                    const SizedBox(height: 12),
                    InfoCard(children: [
                      const Text('٣) منتجاتك وأسعارك', style: TextStyle(fontWeight: FontWeight.w800)),
                      const Muted(
                        'السعر بالدولار، حتى تاريخٍ تحدّده (سنةٌ على الأكثر)، ونعرضه بالجنيه بسعر البنك اليوم. المبيد يُعرض برقم '
                        'تسجيله لدى المجلس، والبذور باسم صنفها المعتمد.',
                      ),
                      for (final p in v.products)
                        Opacity(
                          opacity: p.active ? 1 : 0.55,
                          child: ProductTile(
                            p,
                            rate: v.rate,
                            trailing: Wrap(children: [
                              TextButton(onPressed: () => _edit(ProductFormScreen(api: widget.api, product: p)), child: const Text('عدّل')),
                              if (p.active)
                                TextButton(
                                  onPressed: () async {
                                    if (await askSure(context, title: 'أوقف عرضه', message: 'يتوقّف عرض «${p.name}».', action: 'أوقف')) {
                                      await _step('remove_product', {'product_id': p.id});
                                    }
                                  },
                                  child: const Text('أوقف عرضه'),
                                ),
                            ]),
                          ),
                        ),
                      const SizedBox(height: 6),
                      FilledButton.icon(
                        onPressed: () => _edit(ProductFormScreen(api: widget.api)),
                        icon: const Icon(Icons.add_rounded),
                        label: const Text('أضف منتجاً'),
                      ),
                    ]),
                    const SizedBox(height: 12),
                    OutlinedButton(
                      onPressed: () => _step('active', {'supplier_id': s.id, 'active': s.active ? 'false' : 'true'}),
                      child: Text(s.active ? 'أوقف ظهوري مؤقّتاً' : 'أعد إظهاري'),
                    ),
                  ],
                  const SizedBox(height: 16),
                  const IntroNote(
                    'ما يلزم المورد: السجلّ التجاري، ورخصة المجلس القومي للمبيدات لمن يبيع المبيدات، والتسجيل لدى الإدارة '
                    'القومية للتقاوي لمن يبيع البذور. الأسعار عروضك أنت حتى تاريخك، لا أسعار سوقٍ مرجعيّة.',
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
        s.verified ? const TagPill('موثّق', icon: Icons.verified_outlined) : const TagPill('بانتظار التوثيق', gold: true),
        if (!s.active) const TagPill('موقوفٌ مؤقّتاً', gold: true),
      ]),
      const SizedBox(height: 6),
      if (!s.verified && !s.hasDocument) const Text('الخطوة التالية: ارفع صورة المستندات.'),
      if (!s.verified && s.hasDocument) const Text('وصلت مستنداتك، ويراجعها المشرف.'),
      if (s.reviewNote != null && s.reviewNote!.isNotEmpty) Text('ملاحظة المشرف: ${s.reviewNote}'),
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
      appBar: AppBar(title: Text(s == null ? 'سجّل متجرك' : 'بيانات المورد')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 40),
        children: [
          TextField(controller: _name, maxLength: 100, decoration: const InputDecoration(labelText: 'اسم المتجر أو الشركة')),
          StateField(value: _state, onChanged: (v) => setState(() => _state = v)),
          const SizedBox(height: 10),
          TextField(controller: _locality, maxLength: 80, decoration: const InputDecoration(labelText: 'المحلية أو السوق')),
          TextField(controller: _phone, keyboardType: TextInputType.phone, textDirection: TextDirection.ltr, decoration: const InputDecoration(labelText: 'الهاتف: 0912345678')),
          const SizedBox(height: 10),
          TextField(controller: _whatsapp, keyboardType: TextInputType.phone, textDirection: TextDirection.ltr, decoration: const InputDecoration(labelText: 'واتساب (اختياري)')),
          const SizedBox(height: 16),
          const SectionTitle('ماذا تبيع؟'),
          Wrap(spacing: 6, children: [
            for (final e in supplyCategories.entries)
              FilterChip(
                label: Text(e.value),
                selected: _categories.contains(e.key),
                onSelected: (on) => setState(() => on ? _categories.add(e.key) : _categories.remove(e.key)),
              ),
          ]),
          const SizedBox(height: 16),
          const SectionTitle('الولايات التي توصل إليها'),
          StatesPicker(selected: _delivers, onChanged: (v) => setState(() => _delivers = v)),
          const SizedBox(height: 16),
          TextField(controller: _cr, maxLength: 60, textDirection: TextDirection.ltr, decoration: const InputDecoration(labelText: 'رقم السجلّ التجاري')),
          TextField(controller: _pesticide, maxLength: 60, textDirection: TextDirection.ltr, decoration: const InputDecoration(labelText: 'رخصة المجلس القومي للمبيدات')),
          TextField(controller: _seed, maxLength: 60, textDirection: TextDirection.ltr, decoration: const InputDecoration(labelText: 'تسجيل الإدارة القومية للتقاوي')),
          TextField(controller: _bio, maxLength: 1000, maxLines: 3, decoration: const InputDecoration(labelText: 'نبذة (اختياري): منذ متى تعمل، وما تختصّ به')),
          const Muted('تغيير الاسم أو أرقام الرخص بعد التوثيق يُعيد طلبك إلى المراجعة.'),
          const SizedBox(height: 16),
          FilledButton(onPressed: _busy ? null : _save, child: const Text('احفظ')),
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
      appBar: AppBar(title: Text(p == null ? 'أضف منتجاً' : 'عدّل المنتج')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 40),
        children: [
          DropdownButtonFormField<String>(
            initialValue: _category,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'الصنف'),
            items: [for (final e in supplyCategories.entries) DropdownMenuItem(value: e.key, child: Text(e.value))],
            onChanged: (v) => setState(() => _category = v),
          ),
          const SizedBox(height: 10),
          DropdownButtonFormField<String>(
            initialValue: _inputKey,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'المدخل (ليظهر في دراسة الجدوى)'),
            items: [
              const DropdownMenuItem(value: '', child: Text('—')),
              for (final e in inputLabels.entries) DropdownMenuItem(value: e.key, child: Text(e.value.$1)),
            ],
            onChanged: (v) => setState(() => _inputKey = v ?? ''),
          ),
          const SizedBox(height: 10),
          TextField(controller: _name, maxLength: 120, decoration: const InputDecoration(labelText: 'اسم المنتج التجاري')),
          TextField(controller: _ingredient, maxLength: 200, decoration: const InputDecoration(labelText: 'المادة الفعّالة وتركيزها')),
          TextField(controller: _registration, maxLength: 60, decoration: const InputDecoration(labelText: 'رقم التسجيل / الصنف المعتمد')),
          TextField(controller: _lot, maxLength: 60, decoration: const InputDecoration(labelText: 'لوط الإكثار (للبذور)')),
          Row(children: [
            Expanded(
              child: TextField(
                controller: _size,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(labelText: 'حجم العبوة'),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: DropdownButtonFormField<String>(
                initialValue: _unit,
                decoration: const InputDecoration(labelText: 'الوحدة'),
                items: [for (final e in packUnits.entries) DropdownMenuItem(value: e.key, child: Text(e.value))],
                onChanged: (v) => setState(() => _unit = v ?? 'kg'),
              ),
            ),
          ]),
          const SizedBox(height: 10),
          TextField(
            controller: _price,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: const InputDecoration(labelText: 'السعر بالدولار'),
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
            child: Text('سارٍ حتى ${dateAr(_validUntil)}'),
          ),
          const SizedBox(height: 16),
          FilledButton(onPressed: _busy ? null : _save, child: Text(p == null ? 'أضف المنتج' : 'احفظ التعديل')),
        ],
      ),
    );
  }
}
