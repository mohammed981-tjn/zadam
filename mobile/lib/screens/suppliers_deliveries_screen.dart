/// التوصيل إلى الأرض في التطبيق (البند ٢٠٣): the website's /suppliers/deliveries — deliveries to the reader (with the
/// six-digit handover code only they see), those assigned to them as carrier (the handover: a photo, the place and
/// the code, delivery_confirm), those they assigned (paying the carrier, or cancelling: delivery_cancel), and their
/// own carrier details.
library;

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';

import '../api.dart';
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
          title: const Text('رمز الاستلام'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('أعطه للسائق وحده عند وصول البضاعة.', textAlign: TextAlign.center),
              const SizedBox(height: 12),
              Directionality(
                textDirection: TextDirection.ltr,
                child: SelectableText(a.code ?? '', style: const TextStyle(fontSize: 34, fontWeight: FontWeight.w900, letterSpacing: 8)),
              ),
              const SizedBox(height: 8),
              const Muted('إن ضغطت «أصدر رمزاً» مرّةً أخرى توقّف هذا الرمز وصدر غيره.'),
            ],
          ),
          actions: [FilledButton(onPressed: () => Navigator.pop(ctx), child: const Text('حسناً'))],
        ),
      );
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    return SignedInGate(
      why: 'ادخل لترى توصيلاتك أو لتسجّل ناقلاً.',
      builder: (context) {
        _view ??= widget.api.deliveries();
        return FutureBuilder<DeliveriesView>(
          future: _view,
          builder: (context, snap) {
            if (snap.connectionState != ConnectionState.done) return const LoadingView();
            if (snap.hasError) return StateView.error(snap.error, onRetry: _reload, scrollable: true);
            final v = snap.data!;
            if (v.comingSoon) {
              return const StateView(icon: Icons.hourglass_empty_rounded, title: 'يُفعَّل قريباً', scrollable: true);
            }
            return RefreshIndicator(
              onRefresh: () async => _reload(),
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 40),
                children: [
                  const IntroNote(
                    'المنصّة لا تملك شاحنات. التوصيل بناقلين محلّيين يوثّقهم المشرف، والتسليم لا يُثبت إلا بثلاثة أشياء معاً: '
                    'صورةٌ يلتقطها السائق للبضاعة في مكان التسليم، وموقعُ هاتفه لحظتها، ورمزُ المزارع — ستّة أرقامٍ يراها المستلم '
                    'وحده ويعطيها للسائق بعد أن يرى بضاعته، ويُقفل بعد خمس محاولاتٍ خاطئة. حين يطابق الرمز يصير التوصيل «مستحقّ '
                    'الدفع» للناقل، ومن أسنده يدفع له خارج المنصّة.',
                    icon: Icons.local_shipping_outlined,
                  ),
                  const SizedBox(height: 16),
                  const SectionTitle('توصيلاتٌ إليك'),
                  if (v.toMe.isEmpty)
                    const Muted('لا توصيل إليك الآن. حين يُسند منظّم طلبك توصيلاً إلى أرضك يظهر هنا مع زرّ رمز الاستلام.'),
                  for (final d in v.toMe)
                    _DeliveryCard(d: d, api: widget.api, actions: [
                      if (d.status == 'assigned')
                        FilledButton.icon(
                          onPressed: () => _issueCode(d),
                          icon: const Icon(Icons.pin_outlined, size: 18),
                          label: const Text('أصدر رمز الاستلام'),
                        ),
                    ]),
                  if (v.toCarry.isNotEmpty) ...[
                    const SizedBox(height: 16),
                    const SectionTitle('توصيلاتٌ أُسندت إليك ناقلاً'),
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
                            label: const Text('أكّد التسليم'),
                          ),
                      ]),
                  ],
                  if (v.assigned.isNotEmpty) ...[
                    const SizedBox(height: 16),
                    const SectionTitle('توصيلاتٌ أسندتَها'),
                    for (final d in v.assigned)
                      _DeliveryCard(d: d, api: widget.api, actions: [
                        if (d.status == 'confirmed')
                          FilledButton(
                            onPressed: () async {
                              final ref = await askText(context,
                                  title: 'دفعتُ للناقل', label: 'رقم تحويل الأجرة', minLength: 4, maxLength: 60, direction: TextDirection.ltr);
                              if (ref != null) await _step('paid', {'delivery_id': d.id, 'reference': ref});
                            },
                            child: const Text('دفعتُ للناقل'),
                          ),
                        if (d.status == 'assigned')
                          TextButton(
                            onPressed: () async {
                              if (await askSure(context, title: 'إلغاء التوصيل', message: 'يُلغى هذا التوصيل، ولا يُسلَّم بالرمز بعده.', action: 'ألغِ التوصيل')) {
                                await _step('cancel', {'delivery_id': d.id});
                              }
                            },
                            child: const Text('ألغِ هذا التوصيل'),
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
      Text(c == null ? 'أنا ناقل — سجّلني' : 'بياناتك ناقلاً', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
      if (c != null) ...[
        c.verifiedAt != null
            ? Text('✓ موثّق منذ ${dateAr(c.verifiedAt)}', style: TextStyle(color: textGreenOn(context), fontWeight: FontWeight.w700))
            : const WarnText('بانتظار مراجعة المشرف'),
        Muted('${c.name} · ${c.vehicle} · ${figure(c.capacityTonnes, 1)} طن · ${c.states.join('، ')}'),
        if (c.reviewNote != null && c.reviewNote!.isNotEmpty) Muted('ملاحظة المشرف: ${c.reviewNote}'),
      ],
      const SizedBox(height: 8),
      OutlinedButton(
        onPressed: () async {
          final saved = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => CarrierScreen(carrier: c, api: widget.api)));
          if (saved == true && mounted) _reload();
        },
        child: Text(c == null ? 'سجّلني ناقلاً' : 'عدّل بياناتي'),
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
          if (d.feeUsd != null) 'الأجرة ${usd(d.feeUsd!)}',
          if (d.confirmedAt != null) 'سُلّم ${dateAr(d.confirmedAt)}',
          if (d.paidRef != null) 'دُفع: ${d.paidRef}',
        ].join(' · ')),
        Wrap(spacing: 6, runSpacing: 6, children: [
          TextButton(
            onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => OrderScreen(id: d.orderId, api: api))),
            child: const Text('الطلب'),
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
    if (!await Geolocator.isLocationServiceEnabled()) return _say('شغّل الموقع (GPS) في الجوّال ثمّ أعد المحاولة.');
    var p = await Geolocator.checkPermission();
    if (p == LocationPermission.denied) p = await Geolocator.requestPermission();
    if (p == LocationPermission.denied || p == LocationPermission.deniedForever) {
      return _say('لم يُؤذن للتطبيق بموقعك، والتسليم لا يُؤكَّد بغيره.');
    }
    try {
      final pos = await Geolocator.getCurrentPosition(locationSettings: const LocationSettings(accuracy: LocationAccuracy.best));
      if (mounted) setState(() => _at = pos);
    } catch (_) {
      _say('تعذّرت قراءة الموقع. جرّب في مكانٍ مكشوف.');
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
      appBar: AppBar(title: const Text('أكّد التسليم')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 40),
        children: [
          Text(widget.delivery.heading, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
          const SizedBox(height: 12),
          InfoCard(children: [
            const Text('١. صوّر البضاعة في مكان التسليم', style: TextStyle(fontWeight: FontWeight.w800)),
            const SizedBox(height: 6),
            OutlinedButton.icon(
              onPressed: () async {
                final b = await takePhoto(context);
                if (b != null && mounted) setState(() => _photo = b);
              },
              icon: Icon(_photo == null ? Icons.photo_camera_outlined : Icons.check_circle_outline),
              label: Text(_photo == null ? 'صوّر' : 'صُوّرت ✓ — أعد التصوير'),
            ),
          ]),
          const SizedBox(height: 10),
          InfoCard(children: [
            const Text('٢. موقع التسليم', style: TextStyle(fontWeight: FontWeight.w800)),
            const SizedBox(height: 6),
            OutlinedButton.icon(
              onPressed: _locate,
              icon: const Icon(Icons.my_location_rounded),
              label: Text(_at == null ? 'حدّد موقعي الآن' : '${_at!.latitude.toStringAsFixed(5)}, ${_at!.longitude.toStringAsFixed(5)} (±${_at!.accuracy.round()} م)'),
            ),
          ]),
          const SizedBox(height: 10),
          InfoCard(children: [
            const Text('٣. رمز المستلم (٦ أرقام)', style: TextStyle(fontWeight: FontWeight.w800)),
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
            const Muted('يعطيك إيّاه المستلم بعد أن يرى بضاعته. يُقفل بعد خمس محاولاتٍ خاطئة.'),
          ]),
          const SizedBox(height: 16),
          FilledButton(onPressed: ready && !_busy ? _confirm : null, child: Text(_busy ? 'جارٍ التأكيد…' : 'أكّد التسليم')),
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
      appBar: AppBar(title: Text(widget.carrier == null ? 'سجّلني ناقلاً' : 'بياناتي ناقلاً')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 40),
        children: [
          TextField(controller: _name, maxLength: 80, decoration: const InputDecoration(labelText: 'اسمك أو اسم شركة الترحيل')),
          TextField(controller: _phone, keyboardType: TextInputType.phone, textDirection: TextDirection.ltr, decoration: const InputDecoration(labelText: 'الهاتف')),
          const SizedBox(height: 10),
          TextField(controller: _vehicle, maxLength: 80, decoration: const InputDecoration(labelText: 'المركبة: دفّار ٧ طن، لوري، بوكس')),
          TextField(
            controller: _capacity,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: const InputDecoration(labelText: 'الحمولة بالطن'),
          ),
          const SizedBox(height: 16),
          const SectionTitle('الولايات التي تعمل فيها'),
          StatesPicker(selected: _states, onChanged: (s) => setState(() => _states = s)),
          const SizedBox(height: 10),
          const Muted('تغيير الاسم أو المركبة بعد التوثيق يعيدك إلى المراجعة.'),
          const SizedBox(height: 16),
          FilledButton(onPressed: _busy ? null : _save, child: const Text('احفظ')),
        ],
      ),
    );
  }
}
