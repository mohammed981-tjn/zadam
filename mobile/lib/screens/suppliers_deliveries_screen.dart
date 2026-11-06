/// التوصيل إلى الأرض في التطبيق (البند ٢٠٣): the website's /suppliers/deliveries — deliveries to the reader (with the
/// six-digit handover code only they see), those assigned to them as carrier (the handover: a photo, the place and
/// the code, delivery_confirm), those they assigned (paying the carrier, or cancelling: delivery_cancel), and their
/// own carrier details.
library;

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';

import '../api.dart';
import '../i18n.dart';
import '../suppliers.dart';
import '../theme.dart';
import '../ui.dart';
import 'suppliers_kit.dart';
import 'suppliers_orders_screen.dart';

class DeliveriesTab extends StatefulWidget {
  const DeliveriesTab({super.key, required this.api});
  final SuppliersApi api;

  @override
  State<DeliveriesTab> createState() => _DeliveriesTabState();
}

class _DeliveriesTabState extends State<DeliveriesTab> {
  Future<DeliveriesView>? _view;

  void _reload() => setState(() => _view = widget.api.deliveries());

  Future<void> _step(String action, Map<String, dynamic> body) async {
    final ok = await runStep(context, () async => (await widget.api.deliveryStep(action, body)).message);
    if (ok && mounted) _reload();
  }

  /// The code exists in clear on this screen and nowhere else; pressing again issues a new one.
  Future<void> _issueCode(Delivery d) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      final a = await widget.api.deliveryStep('issue_code', {'delivery_id': d.id});
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Text(tr('رمز الاستلام', 'Handover code')),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(tr('أعطه للسائق وحده عند وصول البضاعة.', 'Give it to the driver alone, when the goods arrive.'), textAlign: TextAlign.center),
              const SizedBox(height: 12),
              Directionality(
                textDirection: TextDirection.ltr,
                child: SelectableText(a.code ?? '', style: const TextStyle(fontSize: 34, fontWeight: FontWeight.w900, letterSpacing: 8)),
              ),
              const SizedBox(height: 8),
              Muted(tr('إن ضغطت «أصدر رمزاً» مرّةً أخرى توقّف هذا الرمز وصدر غيره.', 'If you press «Issue a code» again, this code stops and another is issued.')),
            ],
          ),
          actions: [FilledButton(onPressed: () => Navigator.pop(ctx), child: Text(tr('حسناً', 'OK')))],
        ),
      );
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    return SignedInGate(
      why: tr('ادخل لترى توصيلاتك أو لتسجّل ناقلاً.', 'Sign in to see your deliveries or to register as a carrier.'),
      builder: (context) {
        _view ??= widget.api.deliveries();
        return FutureBuilder<DeliveriesView>(
          future: _view,
          builder: (context, snap) {
            if (snap.connectionState != ConnectionState.done) return const LoadingView();
            if (snap.hasError) return StateView.error(snap.error, onRetry: _reload, scrollable: true);
            final v = snap.data!;
            if (v.comingSoon) {
              return StateView(icon: Icons.hourglass_empty_rounded, title: tr('يُفعَّل قريباً', 'Coming soon'), scrollable: true);
            }
            return RefreshIndicator(
              onRefresh: () async => _reload(),
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 40),
                children: [
                  IntroNote(
                    tr('المنصّة لا تملك شاحنات. التوصيل بناقلين محلّيين يوثّقهم المشرف، والتسليم لا يُثبت إلا بثلاثة أشياء معاً: '
                    'صورةٌ يلتقطها السائق للبضاعة في مكان التسليم، وموقعُ هاتفه لحظتها، ورمزُ المزارع — ستّة أرقامٍ يراها المستلم '
                    'وحده ويعطيها للسائق بعد أن يرى بضاعته، ويُقفل بعد خمس محاولاتٍ خاطئة. حين يطابق الرمز يصير التوصيل «مستحقّ '
                    'الدفع» للناقل، ومن أسنده يدفع له خارج المنصّة.', 'The platform owns no trucks. Delivery is by local carriers the supervisor verifies, and a handover is proven only by three things together: a photo the driver takes of the goods at the handover place, the phone\'s location at that moment, and the farmer\'s code — six digits only the recipient sees and gives to the driver after seeing the goods, locked after five wrong tries. When the code matches, the delivery becomes «payment due» to the carrier, and whoever assigned it pays them outside the platform.'),
                    icon: Icons.local_shipping_outlined,
                  ),
                  const SizedBox(height: 16),
                  SectionTitle(tr('توصيلاتٌ إليك', 'Deliveries to you')),
                  if (v.toMe.isEmpty)
                    Muted(tr('لا توصيل إليك الآن. حين يُسند منظّم طلبك توصيلاً إلى أرضك يظهر هنا مع زرّ رمز الاستلام.', 'No delivery to you now. When your order’s organiser assigns one to your farm it appears here with the handover-code button.')),
                  for (final d in v.toMe)
                    _DeliveryCard(d: d, api: widget.api, actions: [
                      if (d.status == 'assigned')
                        FilledButton.icon(
                          onPressed: () => _issueCode(d),
                          icon: const Icon(Icons.pin_outlined, size: 18),
                          label: Text(tr('أصدر رمز الاستلام', 'Issue the handover code')),
                        ),
                    ]),
                  if (v.toCarry.isNotEmpty) ...[
                    const SizedBox(height: 16),
                    SectionTitle(tr('توصيلاتٌ أُسندت إليك ناقلاً', 'Deliveries assigned to you as carrier')),
                    for (final d in v.toCarry)
                      _DeliveryCard(d: d, api: widget.api, actions: [
                        if (d.status == 'assigned')
                          FilledButton.icon(
                            onPressed: () async {
                              final done = await Navigator.of(context).push<bool>(
                                MaterialPageRoute(builder: (_) => HandoverScreen(delivery: d, api: widget.api)),
                              );
                              if (done == true && mounted) _reload();
                            },
                            icon: const Icon(Icons.task_alt_rounded, size: 18),
                            label: Text(tr('أكّد التسليم', 'Confirm handover')),
                          ),
                      ]),
                  ],
                  if (v.assigned.isNotEmpty) ...[
                    const SizedBox(height: 16),
                    SectionTitle(tr('توصيلاتٌ أسندتَها', 'Deliveries you assigned')),
                    for (final d in v.assigned)
                      _DeliveryCard(d: d, api: widget.api, actions: [
                        if (d.status == 'confirmed')
                          FilledButton(
                            onPressed: () async {
                              final ref = await askText(context,
                                  title: tr('دفعتُ للناقل', 'I paid the carrier'), label: tr('رقم تحويل الأجرة', 'Fee transfer ref.'), minLength: 4, maxLength: 60, direction: TextDirection.ltr);
                              if (ref != null) await _step('paid', {'delivery_id': d.id, 'reference': ref});
                            },
                            child: Text(tr('دفعتُ للناقل', 'I paid the carrier')),
                          ),
                        if (d.status == 'assigned')
                          TextButton(
                            onPressed: () async {
                              if (await askSure(context, title: tr('إلغاء التوصيل', 'Cancel the delivery'), message: tr('يُلغى هذا التوصيل، ولا يُسلَّم بالرمز بعده.', 'This delivery is cancelled, and cannot be handed over with the code after this.'), action: tr('ألغِ التوصيل', 'Cancel the delivery'))) {
                                await _step('cancel', {'delivery_id': d.id});
                              }
                            },
                            child: Text(tr('ألغِ هذا التوصيل', 'Cancel this delivery')),
                          ),
                      ]),
                  ],
                  const SizedBox(height: 20),
                  _carrierCard(v.carrier),
                ],
              ),
            );
          },
        );
      },
    );
  }

  Widget _carrierCard(Carrier? c) {
    return InfoCard(highlight: true, children: [
      Text(c == null ? tr('أنا ناقل — سجّلني', 'I am a carrier — register me') : tr('بياناتك ناقلاً', 'Your carrier details'), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
      if (c != null) ...[
        c.verifiedAt != null
            ? Text(tr('✓ موثّق منذ ${dateAr(c.verifiedAt)}', '✓ Verified since ${dateAr(c.verifiedAt)}'), style: TextStyle(color: textGreenOn(context), fontWeight: FontWeight.w700))
            : WarnText(tr('بانتظار مراجعة المشرف', 'Awaiting administrator review')),
        Muted(tr('${c.name} · ${c.vehicle} · ${figure(c.capacityTonnes, 1)} طن · ${c.states.join('، ')}', '${c.name} · ${c.vehicle} · ${figure(c.capacityTonnes, 1)} t · ${c.states.join(', ')}')),
        if (c.reviewNote != null && c.reviewNote!.isNotEmpty) Muted(tr('ملاحظة المشرف: ${c.reviewNote}', 'Supervisor\'s note: ${c.reviewNote}')),
      ],
      const SizedBox(height: 8),
      OutlinedButton(
        onPressed: () async {
          final saved = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => CarrierScreen(carrier: c, api: widget.api)));
          if (saved == true && mounted) _reload();
        },
        child: Text(c == null ? tr('سجّلني ناقلاً', 'Register me as a carrier') : tr('عدّل بياناتي', 'Edit my details')),
      ),
    ]);
  }
}

class _DeliveryCard extends StatelessWidget {
  const _DeliveryCard({required this.d, required this.api, required this.actions});
  final Delivery d;
  final SuppliersApi api;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: InfoCard(children: [
        Row(children: [
          Expanded(child: Text(d.heading, style: const TextStyle(fontWeight: FontWeight.w700))),
          Flexible(child: TagPill(d.statusLabel, gold: d.status == 'assigned')),
        ]),
        Muted([
          if (d.feeUsd != null) tr('الأجرة ${usd(d.feeUsd!)}', 'Fee ${usd(d.feeUsd!)}'),
          if (d.confirmedAt != null) tr('سُلّم ${dateAr(d.confirmedAt)}', 'Handed over ${dateAr(d.confirmedAt)}'),
          if (d.paidRef != null) tr('دُفع: ${d.paidRef}', 'Paid: ${d.paidRef}'),
        ].join(' · ')),
        Wrap(spacing: 6, runSpacing: 6, children: [
          TextButton(
            onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => OrderScreen(id: d.orderId, api: api))),
            child: Text(tr('الطلب', 'The order')),
          ),
          if (d.gpsLat != null && d.gpsLng != null)
            TextButton(
              onPressed: () => openLink(context, 'https://www.google.com/maps?q=${d.gpsLat},${d.gpsLng}'),
              child: Text('${d.gpsLat!.toStringAsFixed(4)}, ${d.gpsLng!.toStringAsFixed(4)}'),
            ),
          ...actions,
        ]),
      ]),
    );
  }
}

/// The carrier's handover: a photo of the goods where they are handed over, the phone's place at that moment, and the
/// recipient's six digits — then delivery_confirm decides.
class HandoverScreen extends StatefulWidget {
  const HandoverScreen({super.key, required this.delivery, required this.api});
  final Delivery delivery;
  final SuppliersApi api;

  @override
  State<HandoverScreen> createState() => _HandoverScreenState();
}

class _HandoverScreenState extends State<HandoverScreen> {
  List<int>? _photo;
  Position? _at;
  final _code = TextEditingController();
  bool _busy = false;

  void _say(String text) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));

  Future<void> _locate() async {
    if (!await Geolocator.isLocationServiceEnabled()) return _say(tr('شغّل الموقع (GPS) في الجوّال ثمّ أعد المحاولة.', 'Turn on location (GPS) on the phone, then try again.'));
    var p = await Geolocator.checkPermission();
    if (p == LocationPermission.denied) p = await Geolocator.requestPermission();
    if (p == LocationPermission.denied || p == LocationPermission.deniedForever) {
      return _say(tr('لم يُؤذن للتطبيق بموقعك، والتسليم لا يُؤكَّد بغيره.', 'The app was not given permission for your location, and a handover cannot be confirmed without it.'));
    }
    try {
      final pos = await Geolocator.getCurrentPosition(locationSettings: const LocationSettings(accuracy: LocationAccuracy.best));
      if (mounted) setState(() => _at = pos);
    } catch (_) {
      _say(tr('تعذّرت قراءة الموقع. جرّب في مكانٍ مكشوف.', 'Could not read the location. Try in an open place.'));
    }
  }

  Future<void> _confirm() async {
    setState(() => _busy = true);
    final ok = await runStep(context, () async {
      final a = await widget.api.deliveryStep('confirm', {
        'delivery_id': widget.delivery.id,
        'code': _code.text,
        'lat': _at?.latitude,
        'lng': _at?.longitude,
        'accuracy': _at?.accuracy,
        'photo': base64Encode(_photo!),
      });
      return a.message;
    });
    if (!mounted) return;
    setState(() => _busy = false);
    if (ok) Navigator.of(context).pop(true);
  }

  @override
  Widget build(BuildContext context) {
    final ready = _photo != null && _at != null && _code.text.replaceAll(RegExp(r'\D'), '').length == 6;
    return Scaffold(
      appBar: AppBar(title: Text(tr('أكّد التسليم', 'Confirm handover'))),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 40),
        children: [
          Text(widget.delivery.heading, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
          const SizedBox(height: 12),
          InfoCard(children: [
            Text(tr('١. صوّر البضاعة في مكان التسليم', '1. Photograph the goods at the handover place'), style: TextStyle(fontWeight: FontWeight.w800)),
            const SizedBox(height: 6),
            OutlinedButton.icon(
              onPressed: () async {
                final b = await takePhoto(context);
                if (b != null && mounted) setState(() => _photo = b);
              },
              icon: Icon(_photo == null ? Icons.photo_camera_outlined : Icons.check_circle_outline),
              label: Text(_photo == null ? tr('صوّر', 'Photograph') : tr('صُوّرت ✓ — أعد التصوير', 'Photographed ✓ — take it again')),
            ),
          ]),
          const SizedBox(height: 10),
          InfoCard(children: [
            Text(tr('٢. موقع التسليم', '2. Handover location'), style: TextStyle(fontWeight: FontWeight.w800)),
            const SizedBox(height: 6),
            OutlinedButton.icon(
              onPressed: _locate,
              icon: const Icon(Icons.my_location_rounded),
              label: Text(_at == null ? tr('حدّد موقعي الآن', 'Use my location now') : tr('${_at!.latitude.toStringAsFixed(5)}, ${_at!.longitude.toStringAsFixed(5)} (±${_at!.accuracy.round()} م)', '${_at!.latitude.toStringAsFixed(5)}, ${_at!.longitude.toStringAsFixed(5)} (±${_at!.accuracy.round()} m)')),
            ),
          ]),
          const SizedBox(height: 10),
          InfoCard(children: [
            Text(tr('٣. رمز المستلم (٦ أرقام)', '3. The recipient\'s code (6 digits)'), style: TextStyle(fontWeight: FontWeight.w800)),
            const SizedBox(height: 6),
            TextField(
              controller: _code,
              maxLength: 6,
              keyboardType: TextInputType.number,
              textAlign: TextAlign.center,
              textDirection: TextDirection.ltr,
              style: const TextStyle(fontSize: 24, letterSpacing: 8, fontWeight: FontWeight.w800),
              onChanged: (_) => setState(() {}),
            ),
            Muted(tr('يعطيك إيّاه المستلم بعد أن يرى بضاعته. يُقفل بعد خمس محاولاتٍ خاطئة.', 'The recipient gives it to you after seeing the goods. It locks after five wrong tries.')),
          ]),
          const SizedBox(height: 16),
          FilledButton(onPressed: ready && !_busy ? _confirm : null, child: Text(_busy ? tr('جارٍ التأكيد…', 'Confirming…') : tr('أكّد التسليم', 'Confirm handover'))),
        ],
      ),
    );
  }
}

/// «أنا ناقل — سجّلني», or the carrier's details to edit.
class CarrierScreen extends StatefulWidget {
  const CarrierScreen({super.key, required this.carrier, required this.api});
  final Carrier? carrier;
  final SuppliersApi api;

  @override
  State<CarrierScreen> createState() => _CarrierScreenState();
}

class _CarrierScreenState extends State<CarrierScreen> {
  late final _name = TextEditingController(text: widget.carrier?.name);
  late final _phone = TextEditingController(text: widget.carrier?.phone);
  late final _vehicle = TextEditingController(text: widget.carrier?.vehicle);
  late final _capacity = TextEditingController(text: widget.carrier == null ? '' : figure(widget.carrier!.capacityTonnes, 1));
  late Set<String> _states = {...?widget.carrier?.states};
  bool _busy = false;

  Future<void> _save() async {
    setState(() => _busy = true);
    final ok = await runStep(context, () async => (await widget.api.deliveryStep('carrier', {
          'name': _name.text,
          'phone': _phone.text,
          'vehicle': _vehicle.text,
          'capacity_tonnes': _capacity.text,
          'states': _states.toList(),
        }))
            .message);
    if (!mounted) return;
    setState(() => _busy = false);
    if (ok) Navigator.of(context).pop(true);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.carrier == null ? tr('سجّلني ناقلاً', 'Register me as a carrier') : tr('بياناتي ناقلاً', 'My carrier details'))),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 40),
        children: [
          TextField(controller: _name, maxLength: 80, decoration: InputDecoration(labelText: tr('اسمك أو اسم شركة الترحيل', 'Your name or the transport company’s'))),
          TextField(controller: _phone, keyboardType: TextInputType.phone, textDirection: TextDirection.ltr, decoration: InputDecoration(labelText: tr('الهاتف', 'Phone'))),
          const SizedBox(height: 10),
          TextField(controller: _vehicle, maxLength: 80, decoration: InputDecoration(labelText: tr('المركبة: دفّار ٧ طن، لوري، بوكس', 'Vehicle: 7 t truck, lorry, pickup'))),
          TextField(
            controller: _capacity,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: InputDecoration(labelText: tr('الحمولة بالطن', 'Capacity in tonnes')),
          ),
          const SizedBox(height: 16),
          SectionTitle(tr('الولايات التي تعمل فيها', 'States you work in')),
          StatesPicker(selected: _states, onChanged: (s) => setState(() => _states = s)),
          const SizedBox(height: 10),
          Muted(tr('تغيير الاسم أو المركبة بعد التوثيق يعيدك إلى المراجعة.', 'Changing the name or vehicle after verification sends you back for review.')),
          const SizedBox(height: 16),
          FilledButton(onPressed: _busy ? null : _save, child: Text(tr('احفظ', 'Save'))),
        ],
      ),
    );
  }
}
