import 'dart:async';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../account.dart';
import '../api.dart';
import '../feasibility.dart';
import '../i18n.dart';
import '../theme.dart';
import '../ui.dart';

/// دراسة الجدوى والخطّة (البند ٢٠٣): /tools/feasibility و/tools/new-crops
/// و/plan من الموقع، في التطبيق.
///
/// Three tabs: the phased study (pick the crop, region, month, irrigation,
/// area, costs; see the irrigation advice, what one feddan needs, the
/// reference, the phase ladder with its last safe exit, the season's totals
/// and the risks), the new crops worth trying, and the investment plan. Every
/// number on the study tab comes from /api/app/feasibility, which runs the
/// website's own functions; this screen only draws them.
class FeasibilityScreen extends StatelessWidget {
  const FeasibilityScreen({super.key, this.api, this.initialCrop});

  /// A stand-in in tests; the site otherwise.
  final FeasibilityApi? api;

  /// Opens the study on this crop, as /tools/feasibility?crop= does.
  final String? initialCrop;

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: AppBar(
          title: Text(tr('دراسة الجدوى والخطّة', 'Feasibility study and plan')),
          bottom: TabBar(
            isScrollable: true,
            tabAlignment: TabAlignment.start,
            tabs: [
              Tab(text: tr('الدراسة المرحلية', 'The phased study')),
              Tab(text: tr('محاصيل جديدة', 'New crops')),
              Tab(text: tr('تخطيط الاستثمار', 'Investment planning')),
            ],
          ),
        ),
        body: _Tabs(api: api ?? FeasibilityApi(), initialCrop: initialCrop),
      ),
    );
  }
}

class _Tabs extends StatefulWidget {
  const _Tabs({required this.api, this.initialCrop});
  final FeasibilityApi api;
  final String? initialCrop;

  @override
  State<_Tabs> createState() => _TabsState();
}

class _TabsState extends State<_Tabs> {
  late Future<StudyOptions> _options = widget.api.options();
  final _study = GlobalKey<_StudyTabState>();

  void _reload() => setState(() => _options = widget.api.options());

  void _tryCrop(String key) {
    DefaultTabController.of(context).animateTo(0);
    _study.currentState?.setCrop(key);
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<StudyOptions>(
      future: _options,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) return const LoadingView();
        if (snap.hasError) {
          final e = snap.error;
          return StateView.error(e is ApiException ? e.message : tr('تعذّر تحميل الدراسة.', 'Could not load the study.'), onRetry: _reload);
        }
        final options = snap.data!;
        return TabBarView(
          children: [
            _StudyTab(key: _study, api: widget.api, options: options, initialCrop: widget.initialCrop),
            _NewCropsTab(options: options, onTry: _tryCrop),
            _PlanTab(api: widget.api),
          ],
        );
      },
    );
  }
}

// ── Shared bits ──────────────────────────────────────────────────────────────

Future<void> _open(String url) async {
  final uri = Uri.tryParse(url);
  if (uri != null) await launchUrl(uri, mode: LaunchMode.externalApplication);
}

double? _parse(String s) {
  const digits = '٠١٢٣٤٥٦٧٨٩'; // ar-only
  final latin = s.trim().split('').map((c) {
    final i = digits.indexOf(c);
    return i >= 0 ? '$i' : (c == '٫' ? '.' : c); // ar-only
  }).join();
  if (latin.isEmpty) return null;
  final v = double.tryParse(latin);
  return v != null && v.isFinite ? v : null;
}

String _plain(double v) => v == v.roundToDouble() ? v.toInt().toString() : v.toString();

class _Panel extends StatelessWidget {
  const _Panel({required this.title, this.subtitle, required this.children});
  final String title;
  final String? subtitle;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 14),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [SectionTitle(title, subtitle: subtitle), ...children],
        ),
      ),
    );
  }
}

class _Note extends StatelessWidget {
  const _Note(this.text, {this.strong = false});
  final String text;
  final bool strong;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 6),
        child: Text(
          text,
          style: TextStyle(
            fontSize: strong ? 14 : 12.5,
            height: 1.7,
            color: strong ? inkOn(context) : mutedOn(context),
            fontWeight: strong ? FontWeight.w700 : FontWeight.w400,
          ),
        ),
      );
}

class _Row extends StatelessWidget {
  const _Row(this.label, this.value, {this.bold = false});
  final String label;
  final String value;
  final bool bold;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(
          children: [
            Expanded(child: Text(label, style: TextStyle(color: bold ? inkOn(context) : mutedOn(context)))),
            Text(
              value,
              textDirection: TextDirection.ltr,
              style: TextStyle(fontWeight: bold ? FontWeight.w800 : FontWeight.w600),
            ),
          ],
        ),
      );
}

class _Figure extends StatelessWidget {
  const _Figure(this.label, this.value, {this.note});
  final String label;
  final String value;
  final String? note;

  @override
  Widget build(BuildContext context) => Container(
        width: 150,
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: Theme.of(context).scaffoldBackgroundColor,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: TextStyle(fontSize: 11.5, color: mutedOn(context))),
            const SizedBox(height: 2),
            Text(value, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
            if (note != null) Text(note!, style: TextStyle(fontSize: 11, color: mutedOn(context))),
          ],
        ),
      );
}

class _Links extends StatelessWidget {
  const _Links(this.sources);
  final List<Source> sources;

  @override
  Widget build(BuildContext context) => Wrap(
        spacing: 10,
        children: [
          for (final s in sources)
            TextButton(
              style: TextButton.styleFrom(padding: EdgeInsets.zero, visualDensity: VisualDensity.compact),
              onPressed: () => _open(s.url),
              child: Text(s.label, style: const TextStyle(fontSize: 12, decoration: TextDecoration.underline)),
            ),
        ],
      );
}

class _NumberField extends StatelessWidget {
  const _NumberField({required this.label, required this.controller, required this.onChanged, this.helper, this.hint});
  final String label;
  final TextEditingController controller;
  final ValueChanged<String> onChanged;
  final String? helper;
  final String? hint;

  @override
  Widget build(BuildContext context) => TextField(
        controller: controller,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        decoration: InputDecoration(labelText: label, helperText: helper, hintText: hint, helperMaxLines: 3),
        onChanged: onChanged,
      );
}

// ── The study ────────────────────────────────────────────────────────────────

class _StudyTab extends StatefulWidget {
  const _StudyTab({super.key, required this.api, required this.options, this.initialCrop});
  final FeasibilityApi api;
  final StudyOptions options;
  final String? initialCrop;

  @override
  State<_StudyTab> createState() => _StudyTabState();
}

class _StudyTabState extends State<_StudyTab> with AutomaticKeepAliveClientMixin {
  late final StudyInputs _in = StudyInputs.fromOptions(widget.options, crop: widget.initialCrop);
  late final _feddans = TextEditingController(text: _plain(_in.feddans));
  late final _cost = TextEditingController(text: _plain(_in.costPerFeddan));
  late final _tariff = TextEditingController(text: _plain(_in.waterTariff));
  final _price = TextEditingController();
  final _sprays = TextEditingController(text: '0');
  final _sprayUsd = TextEditingController(text: '0');
  final Map<String, TextEditingController> _riskFields = {};

  FeasibilityStudy? _study;
  Object? _error;
  bool _busy = false;
  bool _saving = false;
  Timer? _debounce;
  int _asked = 0;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    for (final r in _in.risks) {
      _riskFields['${r.key}.every'] = TextEditingController(text: r.everyYears == null ? '' : _plain(r.everyYears!));
      _riskFields['${r.key}.loss'] = TextEditingController(text: r.lossPct == null ? '' : _plain(r.lossPct!));
      _riskFields['${r.key}.reserve'] = TextEditingController(text: r.reserveUsd == null ? '' : _plain(r.reserveUsd!));
    }
    _compute();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    for (final c in [_feddans, _cost, _tariff, _price, _sprays, _sprayUsd, ..._riskFields.values]) {
      c.dispose();
    }
    super.dispose();
  }

  void setCrop(String key) {
    setState(() => _in.crop = key);
    _compute();
  }

  void _changed() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 600), _compute);
  }

  Future<void> _compute() async {
    _debounce?.cancel();
    final ask = ++_asked;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final s = await widget.api.study(_in);
      if (!mounted || ask != _asked) return;
      setState(() {
        _study = s;
        _busy = false;
      });
    } catch (e) {
      if (!mounted || ask != _asked) return;
      setState(() {
        _error = e;
        _busy = false;
      });
    }
  }

  Future<void> _makeProject() async {
    final s = _study;
    if (s == null) return;
    final messenger = ScaffoldMessenger.of(context);
    if (accountController.value == null) {
      messenger.showSnackBar(SnackBar(content: Text(tr('ادخل إلى حسابك من «حسابي» أوّلاً، ثمّ حوّل الدراسة إلى مشروع.', 'Sign in to your account from «My account» first, then turn the study into a project.'))));
      return;
    }
    setState(() => _saving = true);
    try {
      final message = await widget.api.makeProject(crop: s.crop, feddans: s.feddans);
      messenger.showSnackBar(SnackBar(content: Text(tr('$message تجدها في «مشروعي» على الموقع.', '$message You will find it in «My project» on the website.'))));
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final o = widget.options;
    final s = _study;
    return RefreshIndicator(
      onRefresh: _compute,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 40),
        children: [
          IntroNote(
            tr('الموسم لا يُدفع دفعةً واحدة، والحصاد يأتي مرّة في آخره. فالسؤال ليس «هل الموسم مجدٍ» بل '
            '«وقد أنفقتُ ما أنفقت، هل أدفع القسط التالي؟» — وهذه الدراسة تجيبه مرحلةً مرحلة.', 'A season is not paid in one go, and the harvest comes once at its end. So the question is not «is the season worth it» but «having spent what I spent, do I pay the next instalment?» — and this study answers it phase by phase.'),
            icon: Icons.stacked_line_chart,
          ),
          const SizedBox(height: 14),
          _inputs(o),
          if (_busy && s == null) LoadingView(compact: true, label: tr('تُحسب الدراسة…', 'Working out the study…')),
          if (_error != null)
            StateView.error(
              _error is ApiException ? (_error as ApiException).message : tr('تعذّر حساب الدراسة.', 'Could not work out the study.'),
              onRetry: _compute,
              compact: true,
            ),
          if (s != null) ...[
            if (_busy) const LinearProgressIndicator(minHeight: 2),
            ..._result(context, s),
          ],
        ],
      ),
    );
  }

  Widget _inputs(StudyOptions o) {
    final sudan = o.crops.where((c) => c.group != 'new').toList();
    final fresh = o.crops.where((c) => c.group == 'new').toList();
    final sdg = _study?.sdgPerUsd;
    final parallel = _study?.sdgPerUsdParallel;
    final cost = _parse(_cost.text);
    return _Panel(
      title: tr('المدخلات', 'Inputs'),
      subtitle: tr('غيّر أيّ رقم فتُحسب الدراسة من جديد.', 'Change any number and the study is worked out again.'),
      children: [
        DropdownButtonFormField<String>(
          initialValue: _in.crop,
          isExpanded: true,
          decoration: InputDecoration(labelText: tr('المحصول', 'Crop')),
          items: [
            DropdownMenuItem(enabled: false, value: '__sudan', child: Text(tr('محاصيل سودانية', 'Sudanese crops'), style: TextStyle(fontWeight: FontWeight.w800))),
            for (final c in sudan) DropdownMenuItem(value: c.key, child: Text(c.label)),
            DropdownMenuItem(enabled: false, value: '__new', child: Text(tr('محاصيل جديدة تستحق التجربة', 'New crops worth trying'), style: TextStyle(fontWeight: FontWeight.w800))),
            for (final c in fresh) DropdownMenuItem(value: c.key, child: Text(c.label)),
          ],
          onChanged: (v) {
            if (v == null || v.startsWith('__')) return;
            setCrop(v);
          },
          key: ValueKey('crop-${_in.crop}'),
        ),
        const SizedBox(height: 10),
        DropdownButtonFormField<String>(
          initialValue: _in.station,
          isExpanded: true,
          decoration: InputDecoration(labelText: tr('المنطقة', 'Region')),
          items: [for (final s in o.stations) DropdownMenuItem(value: s.key, child: Text(s.label))],
          onChanged: (v) {
            if (v == null) return;
            setState(() => _in.station = v);
            _compute();
          },
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: DropdownButtonFormField<int>(
                initialValue: _in.plantingMonth,
                isExpanded: true,
                decoration: InputDecoration(labelText: tr('شهر الزراعة', 'Planting month')),
                items: [for (var i = 0; i < o.months.length; i++) DropdownMenuItem(value: i, child: Text(o.months[i]))],
                onChanged: (v) {
                  if (v == null) return;
                  setState(() => _in.plantingMonth = v);
                  _compute();
                },
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: DropdownButtonFormField<String>(
                initialValue: _in.method,
                isExpanded: true,
                decoration: InputDecoration(labelText: tr('طريقة الري', 'Irrigation method')),
                items: [for (final m in o.methods) DropdownMenuItem(value: m.key, child: Text(m.label))],
                onChanged: (v) {
                  if (v == null) return;
                  setState(() => _in.method = v);
                  _compute();
                },
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        _NumberField(
          label: tr('المساحة (فدان)', 'Area (feddan)'),
          controller: _feddans,
          onChanged: (t) {
            _in.feddans = _parse(t) ?? 0;
            _changed();
          },
        ),
        const SizedBox(height: 10),
        _NumberField(
          label: tr('تكلفة العمليات للفدان (\$)', 'Operating cost per feddan (\$)'),
          controller: _cost,
          helper: sdg != null && cost != null && cost > 0
              ? tr('≈ ${n0(cost * sdg)} جنيه بسعر بنك الخرطوم (${n0(sdg)} للدولار)'
                  '${parallel != null ? ' · ${n0(cost * parallel)} بالسوق الموازي' : ''}', '≈ ${n0(cost * sdg)} pounds at the Bank of Khartoum rate (${n0(sdg)} to the dollar)${parallel != null ? ' · ${n0(cost * parallel)} at the parallel market' : ''}')
              : null,
          onChanged: (t) {
            setState(() => _in.costPerFeddan = _parse(t) ?? 0);
            _changed();
          },
        ),
        const SizedBox(height: 10),
        _NumberField(
          label: tr('سعر المتر المكعب من الماء (\$)', 'Price of a cubic metre of water (\$)'),
          controller: _tariff,
          helper: tr('صفر إن كان المصدر بئرك أو المطر', 'Zero if the source is your own well or the rain'),
          onChanged: (t) {
            _in.waterTariff = _parse(t) ?? 0;
            _changed();
          },
        ),
        const SizedBox(height: 10),
        _NumberField(
          label: tr('سعر الطن (\$) — اختياري', 'Price per tonne (\$) — optional'),
          controller: _price,
          helper: tr('سعرك يعلو على أي تقدير', 'Your price overrides any estimate'),
          hint: _study == null
              ? null
              : _study!.reference['priceBasis'] == 'none'
                  ? tr('لا سعر في البيانات — أدخِله', 'No price in the data — enter one')
                  : tr('الافتراضي ${n0((_study!.reference['usdPerTonne'] as num?) ?? 0)}', 'Default ${n0((_study!.reference['usdPerTonne'] as num?) ?? 0)}'),
          onChanged: (t) {
            _in.manualPrice = t.trim();
            _changed();
          },
        ),
      ],
    );
  }

  List<Widget> _result(BuildContext context, FeasibilityStudy s) {
    final phases = s.phases;
    final exit = phases.where((p) => p.lastSafeExit).firstOrNull;
    return [
      if (s.referenceUnavailable)
        _Panel(
          title: tr('تعذّر الوصول إلى مرجعية FAOSTAT الآن', 'The FAOSTAT reference cannot be reached right now'),
          children: [
            _Note(tr('الخلل عندنا لا في المحاصيل: المرجعية موجودة، ولم نستطع قراءتها في هذه اللحظة. '
                'فلا تقرأ الشُّرَط أدناه على أنها «لا يوجد سعر مرجعي لهذا المحصول». وبقيّة الدراسة تعمل كما هي — '
                'فأدخِل سعرك يدوياً وستكتمل النتيجة.', 'The fault is ours, not in the crops: the reference exists, and we could not read it at this moment. So do not read the bars below as «there is no reference price for this crop». The rest of the study works as it is — enter your price by hand and the result will be complete.')),
          ],
        ),
      FadeIn(
        child: HeroBand(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(tr('${s.cropName} · ${n0(s.feddans)} فدان', '${s.cropName} · ${n0(s.feddans)} feddans'), style: TextStyle(color: mutedOn(context))),
              const SizedBox(height: 6),
              Text(s.verdictLabel, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900, height: 1.4)),
              const SizedBox(height: 6),
              Text(
                exit != null
                    ? tr('آخر مخرج آمن: «${exit.name}» — آخر مرحلة يُسترد ما فيها بالمتوسط الوطني.', 'The last safe exit: «${exit.name}» — the last phase whose spending is recovered at the national average.')
                    : tr('لا مرحلة يُسترد ما فيها بالمتوسط الوطني.', 'No phase\'s spending is recovered at the national average.'),
                style: const TextStyle(height: 1.6, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 10),
              Wrap(spacing: 8, runSpacing: 8, children: [
                TagPill(tr('الإجمالي ${usd(s.total('totalCost'))}', 'Total ${usd(s.total('totalCost'))}'), icon: Icons.payments_outlined),
                TagPill(tr('الهامش ${usd(s.total('marginAtNational'))}', 'Margin ${usd(s.total('marginAtNational'))}'), icon: Icons.trending_up),
                TagPill(tr('غلّة التعادل ${s.breakEvenKgPerHa == null ? '—' : '${n0(s.breakEvenKgPerHa)} كجم/هـ'}', 'Break-even yield ${s.breakEvenKgPerHa == null ? '—' : '${n0(s.breakEvenKgPerHa)} kg/ha'}')),
              ]),
            ],
          ),
        ),
      ),
      const SizedBox(height: 14),
      _advice(context, s),
      _needs(context, s),
      _reference(context, s),
      _ladder(context, s, phases),
      _totals(context, s),
      _risks(context, s),
      _Panel(
        title: tr('من أين تأتي الأرقام', 'Where the numbers come from'),
        children: [
          _Note(tr('الغلّة والسعر من مرجعية FAOSTAT المحمَّلة في المنصّة. الاحتياج المائي من محرّك FAO-56 نفسه الذي '
              'تعمل به حاسبة الاحتياج المائي. ونسب أقساط المراحل هي نفسها نسب صرف ميزانية الموسم في المنصّة، حتى '
              'لا تختلف الدراسة عن العقد الذي تُبنى عليه. وتكلفة العمليات تُدخِلها أنت.', 'Yield and price come from the FAOSTAT reference loaded on the platform. The water requirement comes from the same FAO-56 engine the water calculator runs on. The phases\' instalment shares are the same as the platform\'s season budget release shares, so the study does not differ from the contract built on it. You enter the operating cost.')),
          _Note(tr('الماء موزَّع على المراحل بنفس نسب الميزانية — وهو تقريبٌ نقوله صراحةً: FAO-56 يقسم الموسم أربع مراحل '
              'وتقويم المنصّة سبعاً، فلا خريطة أمينة بينهما. التقريب يُقلّل ماء منتصف الموسم، ويتطابق تماماً عند '
              'الحصاد — وهو الرقم الذي تدور عليه الدراسة.', 'Water is spread over the phases in the same shares as the budget — an approximation we say plainly: FAO-56 divides the season into four stages and the platform\'s calendar into seven, so there is no faithful map between them. The approximation lowers mid-season water and matches exactly at harvest — the number the study turns on.')),
        ],
      ),
    ];
  }

  Widget _advice(BuildContext context, FeasibilityStudy s) {
    final a = s.advice;
    final chosen = '${a['chosen']}';
    final best = '${a['recommended']}';
    final name = {for (final m in s.methods) m.method: m.label};
    final saving = (a['savingM3PerFeddan'] as num?) ?? 0;
    final fit = {'suited': tr('مناسبة', 'Suited'), 'possible': tr('ممكنة', 'Possible'), 'unsuited': tr('غير مناسبة', 'Not suited')};
    return _Panel(
      title: tr('توصية طريقة الري', 'Irrigation method advice'),
      children: [
        _Note(
          chosen == best
              ? tr('طريقتك (${name[chosen]}) هي الأنسب لهذا المحصول وهذه المساحة.', 'Your method (${name[chosen]}) is the best for this crop and this area.')
              : tr('الحساب أدناه بطريقتك (${name[chosen]}). الأنسب لهذا المحصول وهذه المساحة: ${name[best]}'
                  '${saving > 0 ? ' — توفّر نحو ${n0(saving)} م³ للفدان في الموسم (${n0(((a['savingShare'] as num?) ?? 0) * 100)}٪ من الماء).' : '.'}', 'The sums below use your method (${name[chosen]}). The best for this crop and this area: ${name[best]}${saving > 0 ? ' — it saves about ${n0(saving)} m³ per feddan a season (${n0(((a['savingShare'] as num?) ?? 0) * 100)}% of the water).' : '.'}'),
          strong: true,
        ),
        const SizedBox(height: 6),
        for (final m in s.methods)
          _Row(
            tr('${m.label}${m.method == chosen ? ' (اختيارك)' : ''} — ${fit[m.suitability] ?? m.suitability}'
            '${m.tooSmall && m.suitability != 'unsuited' ? ' (لمساحة ${n0(a['pivotMinFeddans'] as num?)} فدان فأكثر)' : ''}', '${m.label}${m.method == chosen ? ' (your choice)' : ''} — ${fit[m.suitability] ?? m.suitability}${m.tooSmall && m.suitability != 'unsuited' ? ' (for ${n0(a['pivotMinFeddans'] as num?)} feddans or more)' : ''}'),
            tr('${n0(m.m3PerFeddan)} م³', '${n0(m.m3PerFeddan)} m³'),
            bold: m.method == best,
          ),
        _Note(tr('المناسبة للمحصول من دليل الفاو لطرق الري (Brouwer وآخرون، 1988). ومن بين المناسبة تُختار الأعلى '
            'كفاءة. حدّ المساحة للمحاور الارتكازية قاعدة عملية لا رقم منشور. ولا يدخل هنا ثمن معدّات الري.', 'Suitability for the crop from FAO\'s guide to irrigation methods (Brouwer et al., 1988). Among the suitable ones, the most efficient is chosen. The area limit for centre pivots is a rule of thumb, not a published figure. The price of irrigation equipment is not included here.')),
      ],
    );
  }

  Widget _needs(BuildContext context, FeasibilityStudy s) {
    final n = s.needs;
    final sdg = s.sdgPerUsd;
    String range(Object? r, String unit) {
      final l = (r as List?)?.cast<num>();
      if (l == null || l.length != 2) return tr('لم نجد رقماً منشوراً', 'No published figure found');
      return l[0] == l[1] ? '${_plain(l[0].toDouble())} $unit' : '${_plain(l[0].toDouble())}–${_plain(l[1].toDouble())} $unit';
    }

    if (n == null) {
      final published = s.published;
      return _Panel(
        title: tr('محصولٌ جديد', 'A new crop'),
        children: [
          _Note(tr('هذا محصول جديد: لا توصيات سودانية منشورة لمدخلاته بعد، فأدخل تكلفتك بنفسك.', 'This is a new crop: there are no published Sudanese input recommendations yet, so enter your own cost. ')),
          if (published.isEmpty)
            _Note(tr('ولم نجد تكلفةً منشورةً للفدان من هذا المحصول في السودان.', 'Nor did we find a published per-feddan cost for this crop in Sudan.'))
          else ...[
            _Note(tr('تكاليف منشورة للمقارنة — كما كُتبت، بجنيه سنتها:', 'Published costs to compare with — as written, in the pounds of their year:'), strong: true),
            for (final c in published)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: Theme.of(context).scaffoldBackgroundColor,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(c.figure, textDirection: TextDirection.ltr, style: const TextStyle(fontWeight: FontWeight.w800)),
                      Text('${c.basis} · ${c.season} · ${c.place}', style: TextStyle(fontSize: 12.5, color: mutedOn(context))),
                      _Links([Source(c.source, c.url)]),
                    ],
                  ),
                ),
              ),
            _Note(tr('أرقامٌ قديمة والجنيه فقد معظم قيمته منذها، فلا تدخل في الحساب؛ التكلفة التي تكتبها أنت هي التي تُحسب.', 'Old figures, and the pound has lost most of its value since, so they are not used in the sums; the cost you type is the one the study runs on.')),
          ],
        ],
      );
    }

    final est = (n['estimate'] as Map).cast<String, dynamic>();
    final phosphate = (n['phosphate'] as Map?)?.cast<String, dynamic>();
    final urea = n['ureaKg'] as List?;
    String bags(List r) => r[0] == r[1] ? '${(r[0] as num) / 50}' : '${(r[0] as num) / 50}–${(r[1] as num) / 50}';
    final lines = (est['lines'] as List).cast<Map>();
    String sdgOf(num v) => sdg == null ? '' : tr(' · ${n0(v * sdg)} جنيه', ' · ${n0(v * sdg)} pounds');
    return _Panel(
      title: tr('احتياجات الفدان', 'What one feddan needs'),
      subtitle: '${n['system']}',
      children: [
        _Row(tr('البذور', 'Seed'), range(n['seedKg'], tr('كجم', 'kg'))),
        if (n['seedNote'] != null) _Note('${n['seedNote']}'),
        _Row(tr('اليوريا', 'Urea'), urea == null ? tr('لا تُضاف عادةً', 'Not usually applied') : tr('${range(urea, 'كجم')} (${bags(urea)} جوال)', '${range(urea, 'kg')} (${bags(urea)} sacks)')),
        _Row(tr('السماد الفوسفاتي', 'Phosphate'),
            phosphate == null ? tr('لا توصية منشورة', 'No published recommendation') : tr('${phosphate['kind']} ${range(phosphate['kg'], 'كجم')}', '${phosphate['kind']} ${range(phosphate['kg'], 'kg')}')),
        _Note(tr('متى يوضع السماد: ${n['timing'] ?? '—'}', 'When the fertiliser goes on: ${n['timing'] ?? '—'}')),
        _Note(tr('المبيدات: ${n['sprays'] ?? 'لم نجد معدّلاً منشوراً'}', 'Pesticides: ${n['sprays'] ?? 'no published rate found'}')),
        _Note(tr('العمليات: ${n['operations']}', 'Operations: ${n['operations']}')),
        const SizedBox(height: 10),
        FilledButton.icon(
          onPressed: _saving ? null : _makeProject,
          icon: const Icon(Icons.playlist_add_check),
          label: Text(_saving ? tr('تُنشأ القائمة…', 'Creating the list…') : tr('حوّلها إلى مشروع', 'Turn it into a project')),
        ),
        _Note(tr('تُنشأ قائمة هذه المدخلات لمساحتك في «مشروعي»: توافق عليها، وتدفع لكلّ مورد مباشرةً، وتسجّل ما '
            'دفعت وما استلمت. سوداقري لا تستلم مالك ولا تحفظه.', 'A list of these inputs for your area is created in «My project»: you approve it, pay each supplier directly, and record what you paid and what you received. Sudagri neither receives nor holds your money.')),
        const SizedBox(height: 12),
        Text(tr('متوسط التكلفة المتوقَّع للفدان — تقدير البرنامج', 'Expected cost per feddan — the platform\'s estimate'), style: TextStyle(fontWeight: FontWeight.w800)),
        for (final l in lines)
          _Row('${l['name']} (${l['qty']})', '\$${((l['usd'] as num?) ?? 0).toStringAsFixed(2)}${sdgOf((l['usd'] as num?) ?? 0)}'),
        _Row(tr('المجموع المعروف', 'Known total'),
            '\$${((est['totalUsd'] as num?) ?? 0).toStringAsFixed(2)}${sdgOf((est['totalUsd'] as num?) ?? 0)}',
            bold: true),
        _Note(tr('غير محسوب لأنّا لم نجد سعراً منشوراً له: ${(est['missing'] as List).join('، ')}. فهذا حدّ أدنى لا '
            'تكلفة كاملة، وتكلفتك التي أدخلتها أعلاه هي التي تُبنى عليها الدراسة. السماد بسعر الميناء العالمي '
            'قبل الشحن، والجنيه بسعر بنك الخرطوم.', 'Not counted because we found no published price for it: ${(est['missing'] as List).join(', ')}. So this is a floor, not a full cost, and the cost you entered above is the one the study is built on. Fertiliser at the world port price before shipping, and the pound at the Bank of Khartoum rate.')),
        for (final r in (n['localReferences'] as List).cast<Map>())
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(child: _Note('• ${r['text']}')),
              IconButton(
                tooltip: tr('المصدر', 'Source'),
                visualDensity: VisualDensity.compact,
                icon: const Icon(Icons.open_in_new, size: 18),
                onPressed: () => _open('${r['source']}'),
              ),
            ],
          ),
        _Note(tr('مصادر الاحتياجات:', 'Sources for the needs: ')),
        _Links([
          for (final src in (n['sources'] as List).cast<Map>()) Source('${src['label']}', '${src['url']}'),
          Source(tr('أسعار السماد: البنك الدولي، سبتمبر 2026', 'Fertiliser prices: World Bank, September 2026'), '${n['fertiliserSource']}'),
        ]),
      ],
    );
  }

  Widget _reference(BuildContext context, FeasibilityStudy s) {
    final r = s.reference;
    String kg(Object? v) => v == null ? '—' : tr('${n0(v as num)} كجم/هـ', '${n0(v)} kg/ha');
    return _Panel(
      title: tr('المرجعية التي تُقاس عليها', 'The reference it is measured against'),
      children: [
        Wrap(spacing: 8, runSpacing: 8, children: [
          _Figure(tr('غلّة السودان', 'Sudan\'s yield'), kg(r['sudanKgPerHa']), note: r['year'] == null ? null : 'FAOSTAT ${r['year']}'),
          _Figure(tr('مصر — أقرب نظير مروي', 'Egypt — nearest irrigated peer'), kg(r['nearestPeerKgPerHa']),
              note: tr('وسيط النظراء ${r['peerMedianKgPerHa'] == null ? '—' : n0(r['peerMedianKgPerHa'] as num)}', 'Peer median ${r['peerMedianKgPerHa'] == null ? '—' : n0(r['peerMedianKgPerHa'] as num)}')),
          _Figure(tr('السعر المعتمد', 'Price used'), r['usdPerTonne'] == null ? '—' : tr('${n0(r['usdPerTonne'] as num)} \$/طن', '${n0(r['usdPerTonne'] as num)} \$/t'),
              note: '${r['priceBasisLabel']}'),
        ]),
        _Note('${r['priceBasisNote']}'),
        _Note(tr('مناخ ${s.input['stationName']}: ${r['stationSource']}. المقارنة بمصر ووسيط النظراء العرب والأفارقة '
            'والهند — لا بأعلى غلّة في العالم، فأعلاها بيوت زجاجية لا تُقاس عليها مزرعة مكشوفة.', 'Climate of ${s.input['stationName']}: ${r['stationSource']}. The comparison is with Egypt and the median of Arab and African peers and India — not the highest yield in the world, which comes from greenhouses no open farm is measured against.')),
      ],
    );
  }

  Widget _ladder(BuildContext context, FeasibilityStudy s, List<Phase> phases) {
    Color tint(String v) => switch (v) {
          'within_national' => leafTintOn(context),
          'needs_peer' => accentOn(context).withValues(alpha: 0.12),
          'beyond_peer' => warnTintOn(context),
          _ => Theme.of(context).scaffoldBackgroundColor,
        };
    return _Panel(
      title: tr('السلّم المرحلي', 'The phased ladder'),
      subtitle: tr('كم التزمتَ، وكم تحتاج لتستردّه', 'How much you have committed, and how much you need to recover it'),
      children: [
        _Note(tr('كل مرحلة تعرض ما أُنفق حتى نهايتها، ثم تُحوّله إلى الغلّة التي تُعيده عند الحصاد.', 'Each phase shows what was spent up to its end, then turns it into the yield that pays it back at harvest.')),
        const SizedBox(height: 8),
        for (var i = 0; i < phases.length; i++)
          Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: tint(phases[i].verdict),
              borderRadius: BorderRadius.circular(14),
              border: phases[i].lastSafeExit ? Border.all(color: textGreenOn(context), width: 1.5) : null,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [
                  Expanded(
                    child: Text('${i + 1}. ${phases[i].name}', style: const TextStyle(fontWeight: FontWeight.w800)),
                  ),
                  Flexible(
                    child: Text(
                      phases[i].verdictLabel,
                      style: TextStyle(
                        fontSize: 12,
                        color: phases[i].verdict == 'beyond_peer' ? warnOn(context) : inkOn(context),
                      ),
                    ),
                  ),
                ]),
                const SizedBox(height: 4),
                _Row(tr('قسط المرحلة', 'Phase instalment'), usd(phases[i].cost)),
                _Row(tr('الملتزم حتى هنا (${(phases[i].cumulativeShare * 100).round()}٪)', 'Committed so far (${(phases[i].cumulativeShare * 100).round()}%)'), usd(phases[i].cumulativeCost)),
                _Row(tr('غلّة التعادل عند هذه النقطة', 'Break-even yield at this point'),
                    phases[i].breakEvenKgPerHa == null ? '—' : tr('${n0(phases[i].breakEvenKgPerHa)} كجم/هـ', '${n0(phases[i].breakEvenKgPerHa)} kg/ha'),
                    bold: true),
                if (phases[i].lastSafeExit)
                  _Note(tr('← آخر مرحلة يُسترد ما فيها بالمتوسط الوطني. بعدها تراهن على حصاد أعلى من المعتاد.', '→ The last phase whose spending is recovered at the national average. Beyond it you are betting on a better-than-usual harvest.'),
                      strong: true),
              ],
            ),
          ),
        if (s.lastSafeExit == null)
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: warnTintOn(context), borderRadius: BorderRadius.circular(14)),
            child: Text(
              tr('لا توجد مرحلة واحدة يُسترد ما فيها بالمتوسط الوطني — أي أن أول قسط يتجاوز ما يعيده هذا المحصول '
              'عادةً في السودان. راجع التكلفة أو المحصول أو السعر قبل التوقيع.', 'There is not a single phase whose spending is recovered at the national average — meaning the first instalment exceeds what this crop usually returns in Sudan. Review the cost, the crop or the price before signing.'),
              style: TextStyle(color: warnOn(context), height: 1.7, fontWeight: FontWeight.w600),
            ),
          ),
      ],
    );
  }

  Widget _totals(BuildContext context, FeasibilityStudy s) {
    final margin = s.total('marginAtNational');
    return _Panel(
      title: tr('الموسم كلّه', 'The whole season'),
      children: [
        Text(tr('التكلفة', 'Cost'), style: TextStyle(fontWeight: FontWeight.w800)),
        _Row(tr('عمليات حقلية', 'Field operations'), usd(s.total('fieldCost'))),
        _Row(tr('ماء (${n0(s.total('waterM3Total'))} م³)', 'Water (${n0(s.total('waterM3Total'))} m³)'), usd(s.total('waterCost'))),
        _Row(tr('الإجمالي', 'Total'), usd(s.total('totalCost')), bold: true),
        _Row(tr('للفدان', 'Per feddan'), usd(s.total('costPerFeddan'))),
        const Divider(height: 22),
        Text(tr('العائد والهامش', 'Revenue and margin'), style: TextStyle(fontWeight: FontWeight.w800)),
        _Row(tr('بالمتوسط الوطني', 'At the national average'), usd(s.total('revenueAtNational'))),
        _Row(margin != null && margin < 0 ? tr('الهامش (خسارة)', 'Margin (loss)') : tr('الهامش', 'Margin'), usd(margin), bold: true),
        _Row(tr('لو بلغتَ غلّة مصر', 'If you reached Egypt\'s yield'), usd(s.total('revenueAtPeer'))),
        _Row(tr('الهامش عندها', 'Margin at that yield'), usd(s.total('marginAtPeer')), bold: true),
      ],
    );
  }

  Widget _risks(BuildContext context, FeasibilityStudy s) {
    final info = {for (final r in widget.options.risks) r.key: r};
    final rk = s.risks;
    final revenue = s.total('revenueAtNational');
    final protection = (rk['protectionUsd'] as num?) ?? 0;
    final reserveTotal = (rk['reserveTotalUsd'] as num?) ?? 0;
    final after = rk['marginAfterUsd'] as num?;
    final bad = s.badYear;
    return _Panel(
      title: tr('الأخطار وتكلفتها', 'Risks and what they cost'),
      subtitle: tr('كم مرّةً يحدث الخطر × كم يُضيع حين يحدث = الخسارة المتوقّعة في الموسم.', 'How often the risk happens × how much it destroys when it does = the expected loss in the season.'),
      children: [
        Text(tr('مكافحة الآفات — تكلفةٌ معروفة مسبقاً', 'Pest control — a cost known in advance'), style: TextStyle(fontWeight: FontWeight.w800)),
        _Note(tr('عدد الرشّات × (ثمن المبيد + أجر الرشّ) للفدان. إن كانت المبيدات داخلةً في تكلفة الفدان أعلاه '
            'فاترك هذا صفراً.', 'Number of sprays × (the pesticide\'s price + the spraying fee) per feddan. If pesticides are already in the cost per feddan above, leave this at zero.')),
        if (rk['sprayNote'] != null) _Note(tr('توصية هذا المحصول: ${rk['sprayNote']}', 'This crop\'s recommendation: ${rk['sprayNote']}')),
        const SizedBox(height: 6),
        Row(children: [
          Expanded(
            child: _NumberField(
              label: tr('عدد الرشّات', 'Number of sprays'),
              controller: _sprays,
              onChanged: (t) {
                _in.sprays = _parse(t) ?? 0;
                _changed();
              },
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: _NumberField(
              label: tr('الرشّة للفدان (\$)', 'A spray per feddan (\$)'),
              controller: _sprayUsd,
              onChanged: (t) {
                _in.sprayUsd = _parse(t) ?? 0;
                _changed();
              },
            ),
          ),
        ]),
        if (protection > 0) _Note(tr('تكلفة المكافحة للمساحة كلّها: ${usd(protection)}', 'The cost of pest control for the whole area: ${usd(protection)}'), strong: true),
        const Divider(height: 24),
        for (final setting in _in.risks)
          if (info[setting.key] != null) _risk(context, s, info[setting.key]!, setting, revenue),
        const Divider(height: 24),
        _Row(tr('الهامش بالمتوسط الوطني', 'Margin at the national average'), usd(s.total('marginAtNational'))),
        if (protection > 0) _Row(tr('ناقص المكافحة', 'Less pest control'), '−${usd(protection)}'),
        _Row(tr('ناقص الخسارة المتوقّعة', 'Less expected losses'), revenue == null ? '—' : '−${usd(rk['expectedTotalUsd'] as num?)}'),
        if (reserveTotal > 0) _Row(tr('ناقص الاحتياطيّ المحجوز', 'Less reserves held back'), '−${usd(reserveTotal)}'),
        _Row(tr('الهامش بعد الأخطار', 'Margin after risks'), usd(after), bold: true),
        if (s.uncounted.isNotEmpty)
          _Note(tr('لم تدخل الحساب لنقص رقم: ${s.uncounted.map((k) => info[k]?.name ?? k).join('، ')}', 'Not counted for a missing figure: ${s.uncounted.map((k) => info[k]?.name ?? k).join(', ')}')),
        if (bad != null)
          Container(
            margin: const EdgeInsets.only(top: 10),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: ((bad['marginUsd'] as num?) ?? 0) < 0 ? warnTintOn(context) : leafTintOn(context),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Text(
              ((bad['marginUsd'] as num?) ?? 0) < 0
                  ? tr('السنة السيّئة: إن وقع «${info[bad['key']]?.name ?? bad['key']}» هذا الموسم صار الهامش '
                      '${usd(bad['marginUsd'] as num?)} — خسارة. فإمّا تأمينٌ أو احتياطيٌّ يغطّيها، أو محصولٌ أو مساحةٌ '
                      'أخرى، قبل البذر.', 'The bad year: if «${info[bad['key']]?.name ?? bad['key']}» happens this season the margin becomes ${usd(bad['marginUsd'] as num?)} — a loss. So either insurance or a reserve covers it, or another crop or area, before sowing.')
                  : tr('السنة السيّئة: إن وقع «${info[bad['key']]?.name ?? bad['key']}» هذا الموسم بقي الهامش '
                      '${usd(bad['marginUsd'] as num?)} — الموسم يحتمل أسوأ خطرٍ فيه.', 'The bad year: if «${info[bad['key']]?.name ?? bad['key']}» happens this season the margin stays ${usd(bad['marginUsd'] as num?)} — the season can bear its worst risk.'),
              style: TextStyle(
                height: 1.7,
                fontWeight: FontWeight.w600,
                color: ((bad['marginUsd'] as num?) ?? 0) < 0 ? warnOn(context) : inkOn(context),
              ),
            ),
          ),
      ],
    );
  }

  Widget _risk(BuildContext context, FeasibilityStudy s, RiskInfo r, RiskSetting setting, double? revenue) {
    final expected = s.expectedUsd(r.key);
    final every = _riskFields['${r.key}.every']!;
    final loss = _riskFields['${r.key}.loss']!;
    final reserve = _riskFields['${r.key}.reserve']!;
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Opacity(
        opacity: setting.applies ? 1 : 0.6,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              controlAffinity: ListTileControlAffinity.leading,
              dense: true,
              value: setting.applies,
              title: Text(r.name, style: const TextStyle(fontWeight: FontWeight.w800)),
              onChanged: (v) {
                setState(() => setting.applies = v ?? false);
                _compute();
              },
            ),
            if (setting.applies) ...[
              if (r.reserve)
                _NumberField(
                  label: tr('احتياطيٌّ يُحجز (\$)', 'A reserve held back (\$)'),
                  controller: reserve,
                  onChanged: (t) {
                    setting.reserveUsd = _parse(t);
                    _changed();
                  },
                )
              else
                Row(children: [
                  Expanded(
                    child: _NumberField(
                      label: tr('مرّةً كلّ … سنوات', 'Once every … years'),
                      hint: tr('من خبرتك', 'From experience'),
                      controller: every,
                      onChanged: (t) {
                        setting.everyYears = _parse(t);
                        _changed();
                      },
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _NumberField(
                      label: tr('يُضيع من المحصول (٪)', 'Share of the crop lost (%)'),
                      hint: tr('من خبرتك', 'From experience'),
                      controller: loss,
                      onChanged: (t) {
                        setting.lossPct = _parse(t);
                        _changed();
                      },
                    ),
                  ),
                ]),
              _Note(
                r.reserve
                    ? (setting.reserveUsd != null && setting.reserveUsd! > 0
                        ? tr('يُحجز: ${usd(setting.reserveUsd)}', 'Held back: ${usd(setting.reserveUsd)}')
                        : tr('اكتب مبلغ الاحتياطيّ.', 'Enter the reserve.'))
                    : expected != null
                        ? tr('الخسارة المتوقّعة في الموسم: ${usd(expected)}', 'The expected loss in the season: ${usd(expected)}')
                        : revenue == null
                            ? tr('أدخل سعر المحصول أعلاه لتُحسب بالدولار.', 'Enter the crop price above to price it in dollars.')
                            : tr('ينقصه رقم: اكتبه من خبرتك ليدخل الحساب.', 'A figure is missing: enter it from experience to count it.'),
                strong: true,
              ),
              if (r.key == 'locust' && s.locust != null) _LocustWatch(s.locust!),
              if (r.basis != null) _Note(r.basis!),
              _Note(tr('كيف يُعالَج: ${r.treatment}${r.services.isEmpty ? '' : ' — ${r.services.join('، ')}'}', 'How it is handled: ${r.treatment}${r.services.isEmpty ? '' : ' — ${r.services.join(', ')}'}')),
              _Links(r.sources),
            ],
          ],
        ),
      ),
    );
  }
}

/// What FAO's survey teams reported in Sudan in the last twelve months, and how far from the farmer's lands.
class _LocustWatch extends StatelessWidget {
  const _LocustWatch(this.l);
  final Map<String, dynamic> l;

  @override
  Widget build(BuildContext context) {
    final near = (l['near'] as List? ?? const []).cast<Map>();
    final counts = (l['counts'] as List? ?? const []).cast<Map>();
    final places = (l['places'] as List? ?? const []).cast<Map>();
    return Container(
      margin: const EdgeInsets.only(top: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Theme.of(context).scaffoldBackgroundColor,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (near.isNotEmpty) ...[
            Text(tr('رُصد جرادٌ قرب أرضك', 'Locusts were sighted near your land'), style: TextStyle(color: warnOn(context), fontWeight: FontWeight.w800)),
            for (final n in near)
              _Note(tr('«${n['land']}»: ${n['label']} على بعد ${n0(n['km'] as num?)} كم، في ${n['day']} (${n['place']})', '«${n['land']}»: ${n['label']} ${n0(n['km'] as num?)} km away, on ${n['day']} (${n['place']})')),
            _Note(tr('الفاو: يطير الجراد نهاراً مع الريح حتى ${l['alertKm']} كم في اليوم. بلّغ وقاية النباتات في ولايتك، '
                'وتفقّد الحقل صباحاً.', 'FAO: locusts fly by day with the wind up to ${l['alertKm']} km a day. Tell plant protection in your state, and check the field in the morning.')),
            const SizedBox(height: 6),
          ],
          if (l['signedIn'] != true)
            _Note(tr('ادخل إلى حسابك وأضف موقع أرضك ليصلك إشعارٌ إن رُصد جرادٌ قربها.', 'Sign in to your account and add your land\'s location to get a notification if locusts are sighted near it.')),
          Text(tr('ما رصدته الفاو في السودان خلال آخر ١٢ شهراً', 'What FAO recorded in Sudan in the last 12 months'), style: TextStyle(fontWeight: FontWeight.w700)),
          for (final c in counts) _Note(tr('${c['label']}: ${n0(c['count'] as num?)} — آخرها ${c['day']}', '${c['label']}: ${n0(c['count'] as num?)} — the latest ${c['day']}')),
          if (l['gregarious'] != true) _Note(tr('لم تُسجَّل أسرابٌ ولا أشرطة حوريّات.', 'No swarms or hopper bands were recorded.')),
          if (places.isNotEmpty)
            _Note(tr('آخر أماكن الرصد: ${places.map((p) => '${p['place']} (${p['label']}، ${p['day']})').join('، ')}', 'The latest places sighted: ${places.map((p) => '${p['place']} (${p['label']}, ${p['day']})').join(', ')}')),
          _Note(tr('يُعدّ ما وصل إلى الفاو من فرق المسح وحدَه: مكانٌ لم يصله أحدٌ لا يُرسل شيئاً.', 'Only what survey teams sent to FAO is counted: a place nobody reached sends nothing.')),
          _Links([Source(tr('خريطة الجراد — الفاو', 'FAO Locust Hub'), '${l['hubUrl']}')]),
        ],
      ),
    );
  }
}

// ── New crops ────────────────────────────────────────────────────────────────

class _NewCropsTab extends StatelessWidget {
  const _NewCropsTab({required this.options, required this.onTry});
  final StudyOptions options;
  final ValueChanged<String> onTry;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 40),
      children: [
        IntroNote(
          tr('محاصيل لا يزرعها السودان تقليدياً، ولها دليل منشور على أنّها تنجح هنا أو في مناخ قريب. لكلّ واحد ما '
          'وجدناه من تجارب، وما يُحذر منه، وزرّ يفتح دراسة الجدوى عليه مباشرة.', 'Crops Sudan does not traditionally grow, with published evidence that they succeed here or in a similar climate. Each one has what we found from trials, what to watch out for, and a button that opens the feasibility study on it directly.'),
          icon: Icons.spa_outlined,
        ),
        const SizedBox(height: 14),
        for (final c in options.newCrops)
          _Panel(
            title: c.name,
            children: [
              _Note(c.evidence, strong: false),
              if (c.caution != null)
                Container(
                  margin: const EdgeInsets.only(top: 8),
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(color: warnTintOn(context), borderRadius: BorderRadius.circular(12)),
                  child: Text(c.caution!, style: TextStyle(color: warnOn(context), height: 1.7)),
                ),
              _Links(c.sources),
              const SizedBox(height: 6),
              if (c.inStudy)
                FilledButton(onPressed: () => onTry(c.key), child: Text(tr('جرّبه في دراسة الجدوى', 'Try it in the feasibility study')))
              else
                _Note(tr('ماؤه لا يُحسب بعد — لا أطوار نموّ منشورة له', 'Its water is not costed yet — no published growth stages')),
            ],
          ),
      ],
    );
  }
}

// ── The investment plan (/plan) ──────────────────────────────────────────────

class _PlanTab extends StatefulWidget {
  const _PlanTab({required this.api});
  final FeasibilityApi api;

  @override
  State<_PlanTab> createState() => _PlanTabState();
}

class _PlanTabState extends State<_PlanTab> with AutomaticKeepAliveClientMixin {
  final _amount = TextEditingController(text: '500');
  final _answers = [2, 2, 2];
  PlanSuggestion? _result;
  String? _error;
  bool _busy = false;

  static List<(String, List<String>)> get _questions => [
    (tr('ما أفقك الزمني للاستثمار؟', 'What is your investment time horizon?'), [tr('أقل من سنة', 'Less than a year'), tr('من سنة إلى 3 سنوات', 'One to 3 years'), tr('أكثر من 3 سنوات', 'More than 3 years')]),
    (tr('لو انخفضت قيمة استثمارك 20% مؤقتاً، ماذا تفعل؟', 'If your investment temporarily lost 20% of its value, what would you do?'), [tr('أسحب استثماري فوراً', 'Withdraw my investment right away'), tr('أنتظر وأراقب الوضع', 'Wait and watch'), tr('أزيد استثماري إن أمكن', 'Invest more if I can')]),
    (tr('كم نسبة هذا المبلغ من أموالك الفائضة (غير الأساسية للمعيشة)؟', 'What share of your spare money (not needed for living costs) is this amount?'), [tr('أقل من 10%', 'Less than 10%'), tr('بين 10% و30%', 'Between 10% and 30%'), tr('أكثر من 30%', 'More than 30%')]),
  ];

  @override
  bool get wantKeepAlive => true;

  @override
  void dispose() {
    _amount.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final r = await widget.api.plan(
        amount: _parse(_amount.text) ?? 0,
        q1: _answers[0],
        q2: _answers[1],
        q3: _answers[2],
      );
      if (mounted) setState(() => _result = r);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final r = _result;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 40),
      children: [
        IntroNote(
          tr('أجب عن الأسئلة وأدخل المبلغ الذي تريد استثماره، فيقترح النظام توزيعاً بين المشاريع المفتوحة حالياً بحسب '
          'تحمّلك للمخاطرة — توزيعٌ آليّ يعتمد على مخاطرة كلّ مشروع والحصص المتاحة فيه، وليس توصية مالية شخصية.', 'Answer the questions and enter the amount you want to invest, and the system suggests a split between the projects open now according to your tolerance for risk — an automatic split based on each project\'s risk and the shares available in it, not personal financial advice.'),
          icon: Icons.pie_chart_outline,
        ),
        const SizedBox(height: 10),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: warnTintOn(context), borderRadius: BorderRadius.circular(14)),
          child: Text(
            tr('المشاريع المستخدمة في الحساب نماذج توضيحية حالياً، والاستثمار لم يُفتح بعد. الأداة تُظهر كيف سيوزّع النظام '
            'المبلغ فعلياً عند إطلاق المشاريع الحقيقية.', 'The projects used in the sums are illustrative examples for now, and investing is not open yet. The tool shows how the system will split the amount once real projects launch.'),
            style: TextStyle(color: warnOn(context), height: 1.7),
          ),
        ),
        const SizedBox(height: 14),
        _Panel(
          title: tr('خطّط استثمارك', 'Plan your investment'),
          children: [
            _NumberField(label: tr('المبلغ الذي تريد استثماره (USD)', 'Amount you want to invest (USD)'), controller: _amount, onChanged: (_) {}),
            for (var q = 0; q < _questions.length; q++) ...[
              const SizedBox(height: 12),
              Text(_questions[q].$1, style: const TextStyle(fontWeight: FontWeight.w700)),
              RadioGroup<int>(
                groupValue: _answers[q],
                onChanged: (v) => setState(() => _answers[q] = v ?? _answers[q]),
                child: Column(
                  children: [
                    for (var i = 0; i < 3; i++)
                      RadioListTile<int>(
                        dense: true,
                        contentPadding: EdgeInsets.zero,
                        value: i + 1,
                        title: Text(_questions[q].$2[i]),
                      ),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 8),
            FilledButton(
              onPressed: _busy
                  ? null
                  : () {
                      if (accountController.value == null) {
                        setState(() => _error = tr('ادخل إلى حسابك من «حسابي» أوّلاً.', 'Sign in to your account from «My account» first.'));
                        return;
                      }
                      _submit();
                    },
              child: Text(_busy ? tr('جارٍ الحساب…', 'Working it out…') : tr('اقترح لي توزيعاً', 'Suggest a split')),
            ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child: Text(_error!, style: TextStyle(color: warnOn(context), fontWeight: FontWeight.w600)),
              ),
          ],
        ),
        if (r != null)
          _Panel(
            title: tr('التوزيع المقترح', 'The suggested split'),
            subtitle: tr('مستوى تحمّل المخاطرة المُستنتج من إجاباتك: ${r.riskProfileLabel}', 'The risk tolerance worked out from your answers: ${r.riskProfileLabel}'),
            children: [
              _Note(tr('هذا اقتراح توزيع آلي وليس نصيحة مالية ملزمة — راجعه وقرّر بنفسك قبل أي استثمار فعلي.', 'This is an automatic suggestion, not binding financial advice — review it and decide for yourself before investing.')),
              if (r.allocations.isEmpty)
                _Note(tr('لا توجد مشاريع مفتوحة كافية حالياً لاقتراح توزيع.', 'There are not enough open projects right now to suggest a split.'), strong: true)
              else ...[
                for (final a in r.allocations)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(a.name, style: const TextStyle(fontWeight: FontWeight.w700)),
                    subtitle: Text(tr('المخاطرة: ${a.riskLabel} · ${a.shares} حصّة', 'Risk: ${a.riskLabel} · ${a.shares} shares')),
                    trailing: Text(usd(a.amount), style: const TextStyle(fontWeight: FontWeight.w800)),
                    onTap: a.slug.isEmpty ? null : () => _open('${ApiConfig.siteUrl}/projects/${a.slug}'),
                  ),
                _Row(tr('الإجمالي المُوزَّع من أصل ${usd(r.requested)}', 'Total split out of ${usd(r.requested)}'), usd(r.allocated), bold: true),
              ],
            ],
          ),
      ],
    );
  }
}
