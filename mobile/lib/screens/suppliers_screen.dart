/// «الموردون» في التطبيق (البند ٢٠٣): the website's /suppliers, in four tabs — the verified suppliers (public, as on
/// the website), the group orders, the deliveries to the farm, and «صفحتي كمورد» for a supplier.
library;

import 'package:flutter/material.dart';

import '../i18n.dart';
import '../suppliers.dart';
import '../theme.dart';
import '../ui.dart';
import 'suppliers_deliveries_screen.dart';
import 'suppliers_kit.dart';
import 'suppliers_mine_screen.dart';
import 'suppliers_orders_screen.dart';

class SuppliersScreen extends StatefulWidget {
  const SuppliersScreen({super.key, this.api, this.initialTab = 0});

  /// The calls, for a test to stand in for; the app's own otherwise.
  final SuppliersApi? api;
  final int initialTab;

  @override
  State<SuppliersScreen> createState() => _SuppliersScreenState();
}

class _SuppliersScreenState extends State<SuppliersScreen> {
  late final calls = widget.api ?? SuppliersApi();

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 4,
      initialIndex: widget.initialTab,
      child: Scaffold(
        appBar: AppBar(
          title: Text(tr('الموردون', 'Suppliers')),
          bottom: TabBar(
            isScrollable: true,
            tabAlignment: TabAlignment.start,
            tabs: [
              Tab(text: tr('من أين أشتري؟', 'Where do I buy?')),
              Tab(text: tr('الطلبات الجماعية', 'Group orders')),
              Tab(text: tr('التوصيل', 'Deliveries')),
              Tab(text: tr('صفحتي كمورد', 'My supplier page')),
            ],
          ),
        ),
        body: TabBarView(
          children: [
            DirectoryTab(api: calls),
            OrdersTab(api: calls),
            DeliveriesTab(api: calls),
            MineTab(api: calls),
          ],
        ),
      ),
    );
  }
}

/// «من أين أشتري؟ — الموردون الموثّقون»: filtered by need and state, as the website's form.
class DirectoryTab extends StatefulWidget {
  const DirectoryTab({super.key, required this.api});
  final SuppliersApi api;

  @override
  State<DirectoryTab> createState() => _DirectoryTabState();
}

class _DirectoryTabState extends State<DirectoryTab> {
  late Future<SupplierDirectory> _dir = widget.api.directory();
  String? _item;
  String? _state;

  void _reload() => setState(() => _dir = widget.api.directory());

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<SupplierDirectory>(
      future: _dir,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) return const LoadingView();
        if (snap.hasError) return StateView.error(snap.error, onRetry: _reload, scrollable: true);
        final d = snap.data!;
        final shown = d.shown(item: _item, state: _state);
        return RefreshIndicator(
          onRefresh: () async => _reload(),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
            children: [
              IntroNote(
                tr('واردات السماد هبطت من نحو ٤٥٠ ألف طن في السنة إلى نحو ٥٠ ألفاً في 2024، وتضاعفت الأسعار، وانتشرت '
                'المبيدات المغشوشة. هنا موردون رأينا رخصهم بأعيننا، وكلُّ منتجٍ برقم تسجيله، وسعره بالدولار وبالجنيه اليوم.', 'Fertiliser imports fell from about 450 thousand tonnes a year to about 50 thousand in 2024, prices doubled, and counterfeit pesticides spread. Here are suppliers whose licences we saw with our own eyes, every product with its registration number, and its price in dollars and in pounds today.'),
                icon: Icons.storefront_outlined,
              ),
              const SizedBox(height: 12),
              _filters(),
              if (d.rateNote != null) ...[const SizedBox(height: 8), Muted(d.rateNote!)],
              const SizedBox(height: 12),
              if (d.comingSoon)
                StateView(
                  icon: Icons.hourglass_empty_rounded,
                  title: tr('يُفعَّل قريباً', 'Coming soon'),
                  message: tr('دليل الموردين بُني وينتظر تفعيل قاعدة بياناته. يستطيع الموردون التسجيل فور تفعيلها.', 'The supplier directory is built and waiting for its database to be switched on. Suppliers can register as soon as it is.'),
                  compact: true,
                )
              else if (shown.isEmpty)
                StateView(
                  icon: Icons.storefront_outlined,
                  title: _item != null || _state != null ? tr('لا مورد موثّقاً بهذا بعد.', 'No verified supplier for this yet.') : tr('لا مورد موثّقاً بعد.', 'No verified supplier yet.'),
                  message: tr('إن كنت تعرف تاجراً مرخّصاً في منطقتك فدُلّه على «صفحتي كمورد». '
                      'ويمكن لجمعيتك أن تجمع طلبات الأعضاء في طلبٍ جماعيٍّ واحد.', 'If you know a licensed trader in your area, point them to «My supplier page». And your association can gather its members\' orders into one group order.'),
                  compact: true,
                )
              else
                for (final (i, e) in shown.indexed) ...[
                  FadeIn(delay: i, child: _SupplierCard(supplier: e.$1, products: e.$2, rate: d.rate, api: widget.api)),
                  const SizedBox(height: 10),
                ],
              const SizedBox(height: 8),
              IntroNote(
                tr('الأسعار هنا عروضٌ يكتبها المورد بنفسه حتى تاريخٍ يحدّده، لا أسعار سوقٍ مرجعيّة. '
                'وإن شككت في منتج فتحقّق من رقم تسجيله لدى المجلس القومي للمبيدات قبل أن تشتري.', 'The prices here are offers the supplier writes themselves, valid until a date they set, not reference market prices. If you doubt a product, check its registration number with the National Pesticides Council before you buy.'),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _filters() {
    return Row(
      children: [
        Expanded(
          child: DropdownButtonFormField<String?>(
            initialValue: _item,
            isExpanded: true,
            decoration: InputDecoration(labelText: tr('ماذا تريد؟', 'What do you need?')),
            items: [
              DropdownMenuItem<String?>(value: null, child: Text(tr('كلّ المدخلات', 'All inputs'))),
              for (final e in supplyCategories.entries) DropdownMenuItem<String?>(value: e.key, child: Text(e.value)),
              for (final e in inputLabels.entries) DropdownMenuItem<String?>(value: e.key, child: Text(e.value.$1)),
            ],
            onChanged: (v) => setState(() => _item = v),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: DropdownButtonFormField<String?>(
            initialValue: _state,
            isExpanded: true,
            decoration: InputDecoration(labelText: tr('ولايتك', 'Your state')),
            items: [
              DropdownMenuItem<String?>(value: null, child: Text(tr('كلّ الولايات', 'All states'))),
              for (final s in sudanStates) DropdownMenuItem<String?>(value: s, child: Text(placeName(s))),
            ],
            onChanged: (v) => setState(() => _state = v),
          ),
        ),
      ],
    );
  }
}

class _SupplierCard extends StatelessWidget {
  const _SupplierCard({required this.supplier, required this.products, required this.rate, required this.api});
  final Supplier supplier;
  final List<Product> products;
  final double? rate;
  final SuppliersApi api;

  @override
  Widget build(BuildContext context) {
    final s = supplier;
    return InfoCard(
      onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => SupplierScreen(id: s.id, api: api))),
      children: [
        Row(
          children: [
            Expanded(child: Text(s.name, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800))),
            if (s.verified) TagPill(tr('موثّق', 'Verified'), icon: Icons.verified_outlined),
          ],
        ),
        Muted(tr('${s.state} — ${s.locality}${s.deliveryStates.isNotEmpty ? ' · يوصل إلى: ${s.deliveryStates.join('، ')}' : ''}', '${s.state} — ${s.locality}${s.deliveryStates.isNotEmpty ? ' · delivers to: ${s.deliveryStates.join(', ')}' : ''}')),
        if ([s.pesticideLicenceNo, s.seedRegistrationNo, s.commercialRegistrationNo].any((x) => x != null && x.isNotEmpty))
          Muted([
            if (s.pesticideLicenceNo?.isNotEmpty == true) tr('رخصة المجلس القومي للمبيدات: ${s.pesticideLicenceNo}', 'National Pesticides Council licence: ${s.pesticideLicenceNo}'),
            if (s.seedRegistrationNo?.isNotEmpty == true) tr('تسجيل التقاوي: ${s.seedRegistrationNo}', 'Seed registration: ${s.seedRegistrationNo}'),
            if (s.commercialRegistrationNo?.isNotEmpty == true) tr('السجلّ التجاري: ${s.commercialRegistrationNo}', 'Commercial registration: ${s.commercialRegistrationNo}'),
          ].join(' · '), size: 11.5),
        for (final p in products.take(4)) ProductTile(p, rate: rate),
        const SizedBox(height: 6),
        Row(
          children: [
            Expanded(child: ContactButtons(supplier: s)),
            Text(products.length > 4 ? tr('كلّ منتجاته (${products.length}) ←', 'All their products (${products.length}) →') : tr('صفحة المورد ←', 'Supplier page →'),
                style: TextStyle(color: textGreenOn(context), fontWeight: FontWeight.w700, fontSize: 13)),
          ],
        ),
      ],
    );
  }
}

/// Call or WhatsApp the supplier directly — buying happens between them and the farmer.
class ContactButtons extends StatelessWidget {
  const ContactButtons({super.key, required this.supplier});
  final Supplier supplier;

  @override
  Widget build(BuildContext context) {
    final wa = supplier.whatsapp?.isNotEmpty == true ? supplier.whatsapp! : supplier.phone;
    return Wrap(
      spacing: 6,
      children: [
        OutlinedButton.icon(
          onPressed: () => openLink(context, 'tel:${supplier.phone}'),
          icon: const Icon(Icons.call_outlined, size: 18),
          label: Text(tr('اتّصل', 'Call')),
        ),
        OutlinedButton.icon(
          onPressed: () => openLink(context, whatsappLink(wa)),
          icon: const Icon(Icons.chat_outlined, size: 18),
          label: Text(tr('واتساب', 'WhatsApp')),
        ),
      ],
    );
  }
}

/// One supplier's page, as /suppliers/[id].
class SupplierScreen extends StatefulWidget {
  const SupplierScreen({super.key, required this.id, required this.api});
  final String id;
  final SuppliersApi api;

  @override
  State<SupplierScreen> createState() => _SupplierScreenState();
}

class _SupplierScreenState extends State<SupplierScreen> {
  late var _page = widget.api.supplier(widget.id);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(tr('مورد', 'Supplier'))),
      body: FutureBuilder(
        future: _page,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) return const LoadingView();
          if (snap.hasError) {
            return StateView.error(snap.error, onRetry: () => setState(() => _page = widget.api.supplier(widget.id)));
          }
          final s = snap.data!.supplier;
          final products = snap.data!.products;
          final rate = snap.data!.rate;
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
            children: [
              HeroBand(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(s.name, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
                    const SizedBox(height: 6),
                    s.verified ? TagPill(tr('موثّق', 'Verified'), icon: Icons.verified_outlined) : TagPill(tr('بانتظار التوثيق', 'Awaiting verification'), gold: true),
                    const SizedBox(height: 6),
                    Text(tr('${s.state} — ${s.locality}${s.verified ? ' · وُثّق في ${dateAr(s.verifiedAt)}' : ''}', '${s.state} — ${s.locality}${s.verified ? ' · verified on ${dateAr(s.verifiedAt)}' : ''}')),
                    if (s.bio != null && s.bio!.isNotEmpty) ...[const SizedBox(height: 8), Text(s.bio!, style: const TextStyle(height: 1.8))],
                    const SizedBox(height: 10),
                    ContactButtons(supplier: s),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              InfoCard(children: [
                LabelValue(tr('يوصل إلى', 'Delivers to'), s.deliveryStates.isEmpty ? tr('لا توصيل — الاستلام من المحلّ', 'No delivery — collect from the shop') : s.deliveryStates.join(tr('، ', ', '))),
                LabelValue(tr('يبيع', 'Sells'), s.categories.map((c) => supplyCategories[c] ?? c).join(tr('، ', ', '))),
                LabelValue(tr('رخصة المجلس القومي للمبيدات', 'National Pesticides Council licence'), s.pesticideLicenceNo ?? '—'),
                LabelValue(tr('التسجيل لدى الإدارة القومية للتقاوي', 'Registration with the National Seed Administration'), s.seedRegistrationNo ?? '—'),
                LabelValue(tr('السجلّ التجاري', 'Commercial registration'), s.commercialRegistrationNo ?? '—'),
              ]),
              const SizedBox(height: 16),
              SectionTitle(tr('المنتجات والعروض', 'Products and offers')),
              if (products.isEmpty)
                Muted(tr('لم يُدرج منتجاتٍ بعد. اتّصل به وسَله.', 'No products listed yet. Call and ask.'))
              else
                for (final c in supplyCategories.keys)
                  if (products.any((p) => p.category == c)) ...[
                    InfoCard(children: [
                      Text(supplyCategories[c]!, style: const TextStyle(fontWeight: FontWeight.w800)),
                      for (final p in products.where((p) => p.category == c)) ProductTile(p, rate: rate),
                    ]),
                    const SizedBox(height: 10),
                  ],
              const SizedBox(height: 8),
              FilledButton.icon(
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => NewOrderScreen(api: widget.api, supplierId: s.id)),
                ),
                icon: const Icon(Icons.groups_outlined),
                label: Text(tr('اجمع جيرانك في طلبٍ جماعيٍّ من هذا المورد', 'Gather your neighbours into a group order from this supplier')),
              ),
            ],
          );
        },
      ),
    );
  }
}
