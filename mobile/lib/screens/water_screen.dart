/// Crop water requirement, computed on the device.
///
/// Every number here comes from agronomy.dart running locally — no request, no
/// waiting, no signal needed. The screen states every assumption it made back
/// to the user, because a figure that quietly assumed flood irrigation in
/// Khartoum when the farmer is on drip in Dongola is worse than no figure.
library;

import 'package:flutter/material.dart';

import '../agronomy.dart';
import '../theme.dart';

class WaterScreen extends StatefulWidget {
  const WaterScreen({super.key});

  @override
  State<WaterScreen> createState() => _WaterScreenState();
}

class _WaterScreenState extends State<WaterScreen> {
  CropCoefficients _crop = crops.first;
  StationClimate _station = stations.first;
  IrrigationMethod _method = IrrigationMethod.flood;
  int _plantingMonth = 6;
  double _feddans = 1;

  WaterRequirement get _result =>
      waterRequirement(_crop, _station, _plantingMonth, _method);

  String _n(double v, [int digits = 0]) => v.toStringAsFixed(digits);

  @override
  Widget build(BuildContext context) {
    final r = _result;
    final muted = mutedOn(context);

    return Scaffold(
      appBar: AppBar(title: const Text('الاحتياج المائي')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _Dropdown<CropCoefficients>(
                    label: 'المحصول',
                    value: _crop,
                    items: crops,
                    nameOf: (c) => c.name,
                    onChanged: (v) => setState(() => _crop = v),
                  ),
                  const SizedBox(height: 12),
                  _Dropdown<StationClimate>(
                    label: 'المنطقة',
                    value: _station,
                    items: stations,
                    nameOf: (s) => s.name,
                    onChanged: (v) => setState(() => _station = v),
                  ),
                  const SizedBox(height: 12),
                  _Dropdown<IrrigationMethod>(
                    label: 'طريقة الري',
                    value: _method,
                    items: IrrigationMethod.values,
                    nameOf: (m) => irrigationLabel[m]!,
                    onChanged: (v) => setState(() => _method = v),
                  ),
                  const SizedBox(height: 12),
                  _Dropdown<int>(
                    label: 'شهر الزراعة',
                    value: _plantingMonth,
                    items: List.generate(12, (i) => i),
                    nameOf: (i) => monthNames[i],
                    onChanged: (v) => setState(() => _plantingMonth = v),
                  ),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Text('المساحة: ${_n(_feddans, _feddans < 10 ? 1 : 0)} فدان',
                          style: const TextStyle(fontWeight: FontWeight.w600)),
                    ],
                  ),
                  Slider(
                    value: _feddans,
                    min: 1,
                    max: 500,
                    onChanged: (v) => setState(() => _feddans = v),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),

          _ResultCard(
            title: 'إجمالي الموسم',
            primary: '${_n(r.m3PerFeddan * _feddans)} م³',
            secondary:
                '${_n(r.m3PerFeddan)} م³ للفدان · طول الموسم ${r.seasonDays} يوماً',
          ),
          const SizedBox(height: 12),

          // The number that sizes the pump. Averages under-size pumps, and an
          // under-sized pump fails in the worst month, which is the month the
          // crop can least afford it.
          _ResultCard(
            title: 'أعلى شهر طلباً — ${monthNames[r.peakMonthIndex]}',
            primary:
                '${_n(r.peakM3PerFeddanPerDay * _feddans, 1)} م³ / يوم',
            secondary:
                '${_n(r.peakM3PerFeddanPerDay, 1)} م³ للفدان يومياً — على هذا تُحسب الطلمبة، لا على المتوسط',
            highlight: true,
          ),
          const SizedBox(height: 16),

          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('التفصيل بالمليمتر',
                      style: TextStyle(fontWeight: FontWeight.w800)),
                  const SizedBox(height: 12),
                  _Row('الاستهلاك المائي للمحصول', '${_n(r.totalEtc)} مم'),
                  _Row('الأمطار الفعّالة', '${_n(r.totalEffectiveRain)} مم'),
                  _Row('صافي الري المطلوب', '${_n(r.totalNet)} مم'),
                  _Row(
                    'إجمالي الري بعد الكفاءة',
                    '${_n(r.totalGross)} مم',
                    bold: true,
                  ),
                  const Divider(height: 24),
                  Text(
                    'كفاءة ${irrigationLabel[_method]}: '
                    '${(irrigationEfficiency[_method]! * 100).round()}٪',
                    style: TextStyle(color: muted, fontSize: 13),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),

          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('الطلب الشهري',
                      style: TextStyle(fontWeight: FontWeight.w800)),
                  const SizedBox(height: 8),
                  ...r.monthly.map(
                    (m) => _MonthBar(
                      month: monthNames[m.monthIndex],
                      days: m.days,
                      gross: m.grossIrrigation,
                      maxGross: r.monthly
                          .map((x) => x.grossIrrigation)
                          .reduce((a, b) => a > b ? a : b),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),

          Text(
            'الحساب بمنهجية FAO-56 على متوسطات مناخية استرشادية للمنطقة، '
            'وليست قراءات محطة مقيسة لأرضك. عاملها كتقدير تخطيطي.',
            style: TextStyle(color: muted, fontSize: 12, height: 1.6),
          ),
        ],
      ),
    );
  }
}

class _Dropdown<T> extends StatelessWidget {
  const _Dropdown({
    required this.label,
    required this.value,
    required this.items,
    required this.nameOf,
    required this.onChanged,
  });

  final String label;
  final T value;
  final List<T> items;
  final String Function(T) nameOf;
  final void Function(T) onChanged;

  @override
  Widget build(BuildContext context) {
    return DropdownButtonFormField<T>(
      initialValue: value,
      decoration: InputDecoration(labelText: label),
      isExpanded: true,
      items: items
          .map((i) => DropdownMenuItem<T>(value: i, child: Text(nameOf(i))))
          .toList(),
      onChanged: (v) {
        if (v != null) onChanged(v);
      },
    );
  }
}

class _ResultCard extends StatelessWidget {
  const _ResultCard({
    required this.title,
    required this.primary,
    required this.secondary,
    this.highlight = false,
  });

  final String title;
  final String primary;
  final String secondary;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    final colour = highlight
        ? accentOn(context)
        : Theme.of(context).colorScheme.primary;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title,
                style: TextStyle(
                    color: mutedOn(context),
                    fontSize: 13,
                    fontWeight: FontWeight.w600)),
            const SizedBox(height: 6),
            Text(primary,
                style: TextStyle(
                    fontSize: 26,
                    fontWeight: FontWeight.w900,
                    color: colour)),
            const SizedBox(height: 6),
            Text(secondary,
                style: TextStyle(
                    color: mutedOn(context), fontSize: 12, height: 1.5)),
          ],
        ),
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row(this.label, this.value, {this.bold = false});

  final String label;
  final String value;
  final bool bold;

  @override
  Widget build(BuildContext context) {
    final weight = bold ? FontWeight.w800 : FontWeight.w400;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Flexible(child: Text(label, style: TextStyle(fontWeight: weight))),
          Text(value, style: TextStyle(fontWeight: weight)),
        ],
      ),
    );
  }
}

class _MonthBar extends StatelessWidget {
  const _MonthBar({
    required this.month,
    required this.days,
    required this.gross,
    required this.maxGross,
  });

  final String month;
  final int days;
  final double gross;
  final double maxGross;

  @override
  Widget build(BuildContext context) {
    final fraction = maxGross > 0 ? (gross / maxGross).clamp(0.0, 1.0) : 0.0;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('$month · $days يوماً',
                  style: const TextStyle(fontSize: 13)),
              Text('${gross.toStringAsFixed(0)} مم',
                  style: const TextStyle(
                      fontSize: 13, fontWeight: FontWeight.w700)),
            ],
          ),
          const SizedBox(height: 4),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: fraction,
              minHeight: 6,
              backgroundColor:
                  Theme.of(context).colorScheme.outline.withValues(alpha: 0.4),
            ),
          ),
        ],
      ),
    );
  }
}
