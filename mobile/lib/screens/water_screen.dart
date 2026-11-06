/// Crop water requirement, computed on the device.
///
/// Every number here comes from agronomy.dart running locally — no request, no
/// waiting, no signal needed. The screen states every assumption it made back
/// to the user, because a figure that quietly assumed flood irrigation in
/// Khartoum when the farmer is on drip in Dongola is worse than no figure.
library;

import 'package:flutter/material.dart';

import '../agronomy.dart';
import '../i18n.dart';
import '../soil_water.dart';
import '../theme.dart';
import '../ui.dart';

class WaterScreen extends StatefulWidget {
  /// Opened from a land just saved (backlog 134): its climate station and its area, so the answer is for that field.
  const WaterScreen({super.key, this.stationKey, this.feddans});

  final String? stationKey;
  final double? feddans;

  @override
  State<WaterScreen> createState() => _WaterScreenState();
}

class _WaterScreenState extends State<WaterScreen> {
  CropCoefficients _crop = crops.first;
  StationClimate _station = stations.first;
  IrrigationMethod _method = IrrigationMethod.flood;
  int _plantingMonth = 6;
  double _feddans = 1;

  /// A middle-light texture rather than the lightest or the heaviest.
  ///
  /// There is no honest default here — the app cannot know the farmer's soil,
  /// and the choice moves the answer by a factor of three. So the default sits
  /// mid-range and the comparison panel below shows the whole spread, which
  /// makes the cost of leaving it wrong visible instead of hiding it.
  String _soil = 'sandy loam';

  @override
  void initState() {
    super.initState();
    _station = stations.firstWhere((s) => s.key == widget.stationKey, orElse: () => stations.first);
    // The slider runs from one feddan to five hundred.
    if (widget.feddans != null) _feddans = widget.feddans!.clamp(1, 500).toDouble();
  }

  WaterRequirement get _result =>
      waterRequirement(_crop, _station, _plantingMonth, _method);

  IrrigationInterval? get _interval =>
      irrigationInterval(_crop, _station, _plantingMonth, _method, _soil);

  String _n(double v, [int digits = 0]) => v.toStringAsFixed(digits);

  /// The same crop and climate across all eight textures.
  ///
  /// This is the panel that carries the finding. A farmer on sand who reads
  /// only the seasonal total concludes they need more water; what they need is
  /// the same water more often, in smaller doses — and that is only visible
  /// when the intervals sit next to each other.
  ///
  /// Ordered lightest-first rather than by interval, because the picker above
  /// is in that order and a reader looking for their own row should find it in
  /// the same place. Note the two are not the same ordering: clay holds less
  /// available water than clay loam, so its bar is shorter despite being the
  /// heavier soil.
  List<Widget> _soilComparison() {
    final rows = <MapEntry<String, IrrigationInterval>>[];
    for (final soil in soilKeys) {
      final r =
          irrigationInterval(_crop, _station, _plantingMonth, _method, soil);
      if (r != null) rows.add(MapEntry(soil, r));
    }
    if (rows.isEmpty) return const [];

    final maxDays =
        rows.map((e) => e.value.days).reduce((a, b) => a > b ? a : b);

    return [
      for (final e in rows)
        _SoilBar(
          label: soilLabel[e.key]!,
          days: e.value.days,
          fraction: maxDays > 0 ? e.value.days / maxDays : 0,
          selected: e.key == _soil,
        ),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final r = _result;
    final iv = _interval;
    final muted = mutedOn(context);

    return Scaffold(
      appBar: AppBar(title: Text(tr('الاحتياج المائي', 'Water requirement'))),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      const IconChip(Icons.tune_rounded, size: 40),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              tr('حقلك', 'Your field'),
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            Text(
                              tr('يُحسب على الجهاز، بلا شبكة', 'Worked out on the phone, with no network'),
                              style: TextStyle(fontSize: 12, color: muted),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  _Dropdown<CropCoefficients>(
                    label: tr('المحصول', 'Crop'),
                    icon: Icons.grass_rounded,
                    value: _crop,
                    items: allCrops,
                    nameOf: (c) =>
                        isNewCrop(c.key) ? tr('${c.name} — جديد على السودان', '${c.name} — new to Sudan') : c.name,
                    onChanged: (v) => setState(() => _crop = v),
                  ),
                  const SizedBox(height: 12),
                  _Dropdown<StationClimate>(
                    label: tr('المنطقة', 'Region'),
                    icon: Icons.place_outlined,
                    value: _station,
                    items: stations,
                    nameOf: (s) => s.name,
                    onChanged: (v) => setState(() => _station = v),
                  ),
                  const SizedBox(height: 12),
                  _Dropdown<IrrigationMethod>(
                    label: tr('طريقة الري', 'Irrigation method'),
                    icon: Icons.water_drop_outlined,
                    value: _method,
                    items: IrrigationMethod.values,
                    nameOf: (m) => irrigationLabel[m]!,
                    onChanged: (v) => setState(() => _method = v),
                  ),
                  const SizedBox(height: 12),
                  _Dropdown<String>(
                    label: tr('نوع التربة', 'Soil type'),
                    icon: Icons.layers_outlined,
                    value: _soil,
                    items: soilKeys,
                    nameOf: (s) => soilLabel[s]!,
                    onChanged: (v) => setState(() => _soil = v),
                  ),
                  const SizedBox(height: 12),
                  _Dropdown<int>(
                    label: tr('شهر الزراعة', 'Planting month'),
                    icon: Icons.calendar_month_outlined,
                    value: _plantingMonth,
                    items: List.generate(12, (i) => i),
                    nameOf: (i) => monthNames[i],
                    onChanged: (v) => setState(() => _plantingMonth = v),
                  ),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Icon(
                        Icons.landscape_outlined,
                        size: 20,
                        color: textGreenOn(context),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        tr('المساحة: ${_n(_feddans, _feddans < 10 ? 1 : 0)} فدان', 'Area: ${_n(_feddans, _feddans < 10 ? 1 : 0)} feddans'),
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
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
            hero: true,
            icon: Icons.water_drop,
            title: tr('إجمالي الموسم', 'Season total'),
            primary: tr('${_n(r.m3PerFeddan * _feddans)} م³', '${_n(r.m3PerFeddan * _feddans)} m³'),
            secondary:
                tr('${_n(r.m3PerFeddan)} م³ للفدان · طول الموسم ${r.seasonDays} يوماً', '${_n(r.m3PerFeddan)} m³ per feddan · season length ${r.seasonDays} days'),
          ),
          const SizedBox(height: 12),

          // The number that sizes the pump. Averages under-size pumps, and an
          // under-sized pump fails in the worst month, which is the month the
          // crop can least afford it.
          _ResultCard(
            icon: Icons.speed_rounded,
            title: tr('أعلى شهر طلباً — ${monthNames[r.peakMonthIndex]}', 'Peak month — ${monthNames[r.peakMonthIndex]}'),
            primary:
                tr('${_n(r.peakM3PerFeddanPerDay * _feddans, 1)} م³ / يوم', '${_n(r.peakM3PerFeddanPerDay * _feddans, 1)} m³ / day'),
            secondary:
                tr('${_n(r.peakM3PerFeddanPerDay, 1)} م³ للفدان يومياً — على هذا تُحسب الطلمبة، لا على المتوسط', '${_n(r.peakM3PerFeddanPerDay, 1)} m³ per feddan per day — size the pump on this, not on the average'),
            highlight: true,
          ),
          const SizedBox(height: 16),

          /*
           * متى تروي — لا كم تروي.
           *
           * The seasonal total above answers a question the farmer did not ask.
           * More than half the questions the assistant has been asked are this
           * one instead: the ground is thirsty, the water dries fast in the
           * sand, how often should I irrigate. Until now the only path that
           * understood it was the language model, and the model needs a signal
           * this screen deliberately does without.
           */
          if (iv != null) ...[
            _ResultCard(
              icon: Icons.event_repeat_rounded,
              title: tr('الفترة بين ريّة وريّة — تربة ${soilLabel[_soil]}', 'Interval between irrigations — ${soilLabel[_soil]} soil'),
              primary: tr('كل ${_n(iv.days, 1)} يوم', 'Every ${_n(iv.days, 1)} days'),
              secondary:
                  tr('الجرعة ${_n(iv.doseMm)} مم تبلغ الجذور، وتضخّ لها ${_n(iv.doseM3PerFeddan * _feddans)} م³ '
                  '(${_n(iv.doseM3PerFeddan)} م³ للفدان) في كل ريّة مع فاقد طريقة الريّ، '
                  'محسوبة على شهر الذروة لا على المتوسط', 'A dose of ${_n(iv.doseMm)} mm reaches the roots, and you pump ${_n(iv.doseM3PerFeddan * _feddans)} m³ for it (${_n(iv.doseM3PerFeddan)} m³ per feddan) at each irrigation with the method\'s losses, worked out on the peak month, not the average'),
            ),
            const SizedBox(height: 12),

            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _CardHeading(
                      tr('من أين جاء هذا الرقم', 'Where this number comes from'),
                      Icons.calculate_outlined,
                    ),
                    const SizedBox(height: 12),
                    _Row(
                      tr('ما تمسكه التربة', 'What the soil holds'),
                      tr('${_n(tawMmPerM[_soil]!)} مم لكل متر عمق', '${_n(tawMmPerM[_soil]!)} mm per metre of depth'),
                    ),
                    _Row(tr('عمق جذور ${_crop.name}', 'Root depth of ${_crop.name}'),
                        tr('${rootDepthM[_crop.key]!.toStringAsFixed(1)} م', '${rootDepthM[_crop.key]!.toStringAsFixed(1)} m')),
                    _Row(
                      tr('المتاح بيسر في منطقة الجذور', 'Readily available in the root zone'),
                      tr('${_n(iv.rawMm)} مم', '${_n(iv.rawMm)} mm'),
                      bold: true,
                    ),
                    _Row(tr('استهلاك المحصول في الذروة', 'Crop use at peak'),
                        tr('${_n(iv.peakMmPerDay, 1)} مم يومياً', '${_n(iv.peakMmPerDay, 1)} mm per day')),
                    const Divider(height: 24),
                    Text(
                      tr('الخزّان مقسوماً على الاستهلاك اليومي: '
                      '${_n(iv.rawMm)} ÷ ${_n(iv.peakMmPerDay, 1)} = '
                      '${_n(iv.days, 1)} يوم.', 'The reservoir divided by the daily use: ${_n(iv.rawMm)} ÷ ${_n(iv.peakMmPerDay, 1)} = ${_n(iv.days, 1)} days.'),
                      style: TextStyle(color: muted, fontSize: 13, height: 1.6),
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
                    _CardHeading(
                      tr('ولو كانت أرضك غير ذلك', 'And if your land were different'),
                      Icons.compare_arrows_rounded,
                    ),
                    const SizedBox(height: 6),
                    Text(
                      tr('نفس المحصول ونفس المناخ ونفس طريقة الريّ — '
                      'التربة وحدها هي التي تغيّر الفترة.', 'The same crop, the same climate and the same irrigation method — the soil alone changes the interval.'),
                      style: TextStyle(color: muted, fontSize: 13, height: 1.5),
                    ),
                    const SizedBox(height: 12),
                    ..._soilComparison(),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
          ] else ...[
            /*
             * A crop with no root depth in the model has no irrigation interval, and the
             * seasonal total above is all this screen can honestly say about it. Say
             * so, rather than leave the farmer to wonder where the panel went.
             */
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Text(
                  tr('الفترة بين ريّة وريّة لا تُحسب لـ${_crop.name} بهذه الطريقة: '
                  'ليس له عمق جذورٍ في الجدول الذي نعتمد عليه (أو يُروى بالغمر الدائم كالأرز)، '
                  'ولا نُخمّنه. الاحتياج الموسمي أعلاه محسوبٌ كاملاً.', 'The interval between irrigations is not worked out for ${_crop.name} this way: it has no root depth in the table we rely on (or it is kept flooded, like rice), and we do not guess one. The seasonal requirement above is worked out in full.'),
                  style: TextStyle(color: muted, fontSize: 13, height: 1.5),
                ),
              ),
            ),
            const SizedBox(height: 16),
          ],

          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _CardHeading(
                    tr('التفصيل بالمليمتر', 'The detail in millimetres'),
                    Icons.straighten_rounded,
                  ),
                  const SizedBox(height: 12),
                  _Row(tr('الاستهلاك المائي للمحصول', 'Crop water use'), tr('${_n(r.totalEtc)} مم', '${_n(r.totalEtc)} mm')),
                  _Row(tr('الأمطار الفعّالة', 'Effective rainfall'), tr('${_n(r.totalEffectiveRain)} مم', '${_n(r.totalEffectiveRain)} mm')),
                  _Row(tr('صافي الري المطلوب', 'Net irrigation needed'), tr('${_n(r.totalNet)} مم', '${_n(r.totalNet)} mm')),
                  _Row(
                    tr('إجمالي الري بعد الكفاءة', 'Gross irrigation after efficiency'),
                    tr('${_n(r.totalGross)} مم', '${_n(r.totalGross)} mm'),
                    bold: true,
                  ),
                  const Divider(height: 24),
                  Text(
                    tr('كفاءة ${irrigationLabel[_method]}: '
                    '${(irrigationEfficiency[_method]! * 100).round()}٪', '${irrigationLabel[_method]} efficiency: ${(irrigationEfficiency[_method]! * 100).round()}%'),
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
                  _CardHeading(tr('الطلب الشهري', 'Monthly demand'), Icons.bar_chart_rounded),
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
            tr('الحساب بمنهجية FAO-56 على متوسطات مناخية استرشادية للمنطقة، '
            'وليست قراءات محطة مقيسة لأرضك. عاملها كتقدير تخطيطي.\n\n'
            'والفترة بين الريّات مبنيّة على جداول FAO-56 لسعة التربة وعمق '
            'الجذور، ونوع التربة فيها اختيارك أنت لا قياساً لأرضك — فإن جهلته '
            'فانظر لوح المقارنة أعلاه قبل أن تعتمد رقماً.', 'Worked out with the FAO-56 method on indicative climate averages for the region, not readings from a station measured for your land. Treat it as a planning estimate.\n\nThe interval between irrigations is built on the FAO-56 tables for soil capacity and root depth, and the soil type in it is your choice, not a measurement of your land — if you do not know it, look at the comparison panel above before you rely on a number.'),
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
    required this.icon,
    required this.value,
    required this.items,
    required this.nameOf,
    required this.onChanged,
  });

  final String label;
  final IconData icon;
  final T value;
  final List<T> items;
  final String Function(T) nameOf;
  final void Function(T) onChanged;

  @override
  Widget build(BuildContext context) {
    return DropdownButtonFormField<T>(
      initialValue: value,
      decoration: InputDecoration(
        labelText: label,
        prefixIcon: Icon(icon, size: 20, color: textGreenOn(context)),
      ),
      isExpanded: true,
      borderRadius: BorderRadius.circular(14),
      icon: const Icon(Icons.expand_more_rounded),
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
    required this.icon,
    this.highlight = false,
    this.hero = false,
  });

  final String title;
  final String primary;
  final String secondary;
  final IconData icon;
  final bool highlight;

  /// The seasonal total, in the hero band: the first answer the farmer reads.
  final bool hero;

  @override
  Widget build(BuildContext context) {
    if (hero) {
      final ink = Theme.of(context).colorScheme.onSurface;
      final olive = textGreenOn(context);
      return HeroBand(
        padding: const EdgeInsets.fromLTRB(18, 16, 18, 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icon, size: 18, color: olive),
                const SizedBox(width: 6),
                Text(
                  title,
                  style: TextStyle(
                    color: ink,
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            AnimatedSwitcher(
              duration: const Duration(milliseconds: 200),
              child: Text(
                primary,
                key: ValueKey(primary),
                style: TextStyle(
                  fontSize: 32,
                  fontWeight: FontWeight.w900,
                  color: olive,
                ),
              ),
            ),
            const SizedBox(height: 4),
            Text(
              secondary,
              style: TextStyle(
                color: mutedOn(context),
                fontSize: 12.5,
                height: 1.5,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
      );
    }

    // Large figures only (26 px, heavy), so the gold passes as large text.
    final colour = highlight ? accentOn(context) : textGreenOn(context);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      color: mutedOn(context),
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 6),
                  AnimatedSwitcher(
                    duration: const Duration(milliseconds: 200),
                    child: Text(
                      primary,
                      key: ValueKey(primary),
                      style: TextStyle(
                        fontSize: 26,
                        fontWeight: FontWeight.w900,
                        color: colour,
                      ),
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    secondary,
                    style: TextStyle(
                      color: mutedOn(context),
                      fontSize: 12,
                      height: 1.5,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 10),
            IconChip(icon, size: 40),
          ],
        ),
      ),
    );
  }
}

/// A card's heading: its icon on the chip, then the words.
class _CardHeading extends StatelessWidget {
  const _CardHeading(this.text, this.icon);

  final String text;
  final IconData icon;

  @override
  Widget build(BuildContext context) => Row(
    children: [
      IconChip(icon, size: 32),
      const SizedBox(width: 10),
      Expanded(
        child: Text(
          text,
          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800),
        ),
      ),
    ],
  );
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

class _SoilBar extends StatelessWidget {
  const _SoilBar({
    required this.label,
    required this.days,
    required this.fraction,
    required this.selected,
  });

  final String label;
  final double days;
  final double fraction;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    final primary = Theme.of(context).colorScheme.primary;
    // The bar is a fill; the figure beside it is text, so it takes the
    // text-safe shade of the same colour.
    final colour = selected ? accentOn(context) : primary;
    final ink = selected ? warnOn(context) : textGreenOn(context);
    final weight = selected ? FontWeight.w900 : FontWeight.w400;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(label, style: TextStyle(fontSize: 13, fontWeight: weight)),
              Text(
                tr('كل ${days.toStringAsFixed(1)} يوم', 'Every ${days.toStringAsFixed(1)} days'),
                style: TextStyle(fontSize: 13, fontWeight: weight, color: ink),
              ),
            ],
          ),
          const SizedBox(height: 4),
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: LinearProgressIndicator(
              value: fraction.clamp(0.0, 1.0),
              minHeight: selected ? 10 : 8,
              color: colour,
              backgroundColor: leafTintOn(context),
            ),
          ),
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
              Text(tr('$month · $days يوماً', '$month · $days days'),
                  style: const TextStyle(fontSize: 13)),
              Text(tr('${gross.toStringAsFixed(0)} مم', '${gross.toStringAsFixed(0)} mm'),
                  style: const TextStyle(
                      fontSize: 13, fontWeight: FontWeight.w700)),
            ],
          ),
          const SizedBox(height: 4),
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: LinearProgressIndicator(
              value: fraction,
              minHeight: 8,
              backgroundColor: leafTintOn(context),
            ),
          ),
        ],
      ),
    );
  }
}
