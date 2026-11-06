import 'dart:async';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../account.dart';
import '../api.dart';
import '../feasibility.dart';
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
          title: const Text('دراسة الجدوى والخطّة'),
          bottom: const TabBar(
            isScrollable: true,
            tabAlignment: TabAlignment.start,
            tabs: [
              Tab(text: 'الدراسة المرحلية'),
              Tab(text: 'محاصيل جديدة'),
              Tab(text: 'تخطيط الاستثمار'),
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
          return StateView.error(e is ApiException ? e.message : 'تعذّر تحميل الدراسة.', onRetry: _reload);
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
  const digits = '٠١٢٣٤٥٦٧٨٩';
  final latin = s.trim().split('').map((c) {
    final i = digits.indexOf(c);
    return i >= 0 ? '$i' : (c == '٫' ? '.' : c);
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
      messenger.showSnackBar(const SnackBar(content: Text('ادخل إلى حسابك من «حسابي» أوّلاً، ثمّ حوّل الدراسة إلى مشروع.')));
      return;
    }
    setState(() => _saving = true);
    try {
      final message = await widget.api.makeProject(crop: s.crop, feddans: s.feddans);
      messenger.showSnackBar(SnackBar(content: Text('$message تجدها في «مشروعي» على الموقع.')));
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
          const IntroNote(
            'الموسم لا يُدفع دفعةً واحدة، والحصاد يأتي مرّة في آخره. فالسؤال ليس «هل الموسم مجدٍ» بل '
            '«وقد أنفقتُ ما أنفقت، هل أدفع القسط التالي؟» — وهذه الدراسة تجيبه مرحلةً مرحلة.',
            icon: Icons.stacked_line_chart,
          ),
          const SizedBox(height: 14),
          _inputs(o),
          if (_busy && s == null) const LoadingView(compact: true, label: 'تُحسب الدراسة…'),
          if (_error != null)
            StateView.error(
              _error is ApiException ? (_error as ApiException).message : 'تعذّر حساب الدراسة.',
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
      title: 'المدخلات',
      subtitle: 'غيّر أيّ رقم فتُحسب الدراسة من جديد.',
      children: [
        DropdownButtonFormField<String>(
          initialValue: _in.crop,
          isExpanded: true,
          decoration: const InputDecoration(labelText: 'المحصول'),
          items: [
            const DropdownMenuItem(enabled: false, value: '__sudan', child: Text('محاصيل سودانية', style: TextStyle(fontWeight: FontWeight.w800))),
            for (final c in sudan) DropdownMenuItem(value: c.key, child: Text(c.label)),
            const DropdownMenuItem(enabled: false, value: '__new', child: Text('محاصيل جديدة تستحق التجربة', style: TextStyle(fontWeight: FontWeight.w800))),
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
          decoration: const InputDecoration(labelText: 'المنطقة'),
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
                decoration: const InputDecoration(labelText: 'شهر الزراعة'),
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
                decoration: const InputDecoration(labelText: 'طريقة الري'),
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
          label: 'المساحة (فدان)',
          controller: _feddans,
          onChanged: (t) {
            _in.feddans = _parse(t) ?? 0;
            _changed();
          },
        ),
        const SizedBox(height: 10),
        _NumberField(
          label: 'تكلفة العمليات للفدان (\$)',
          controller: _cost,
          helper: sdg != null && cost != null && cost > 0
              ? '≈ ${n0(cost * sdg)} جنيه بسعر بنك الخرطوم (${n0(sdg)} للدولار)'
                  '${parallel != null ? ' · ${n0(cost * parallel)} بالسوق الموازي' : ''}'
              : null,
          onChanged: (t) {
            setState(() => _in.costPerFeddan = _parse(t) ?? 0);
            _changed();
          },
        ),
        const SizedBox(height: 10),
        _NumberField(
          label: 'سعر المتر المكعب من الماء (\$)',
          controller: _tariff,
          helper: 'صفر إن كان المصدر بئرك أو المطر',
          onChanged: (t) {
            _in.waterTariff = _parse(t) ?? 0;
            _changed();
          },
        ),
        const SizedBox(height: 10),
        _NumberField(
          label: 'سعر الطن (\$) — اختياري',
          controller: _price,
          helper: 'سعرك يعلو على أي تقدير',
          hint: _study == null
              ? null
              : _study!.reference['priceBasis'] == 'none'
                  ? 'لا سعر في البيانات — أدخِله'
                  : 'الافتراضي ${n0((_study!.reference['usdPerTonne'] as num?) ?? 0)}',
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
        const _Panel(
          title: 'تعذّر الوصول إلى مرجعية FAOSTAT الآن',
          children: [
            _Note('الخلل عندنا لا في المحاصيل: المرجعية موجودة، ولم نستطع قراءتها في هذه اللحظة. '
                'فلا تقرأ الشُّرَط أدناه على أنها «لا يوجد سعر مرجعي لهذا المحصول». وبقيّة الدراسة تعمل كما هي — '
                'فأدخِل سعرك يدوياً وستكتمل النتيجة.'),
          ],
        ),
      FadeIn(
        child: HeroBand(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('${s.cropName} · ${n0(s.feddans)} فدان', style: TextStyle(color: mutedOn(context))),
              const SizedBox(height: 6),
              Text(s.verdictLabel, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900, height: 1.4)),
              const SizedBox(height: 6),
              Text(
                exit != null
                    ? 'آخر مخرج آمن: «${exit.name}» — آخر مرحلة يُسترد ما فيها بالمتوسط الوطني.'
                    : 'لا مرحلة يُسترد ما فيها بالمتوسط الوطني.',
                style: const TextStyle(height: 1.6, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 10),
              Wrap(spacing: 8, runSpacing: 8, children: [
                TagPill('الإجمالي ${usd(s.total('totalCost'))}', icon: Icons.payments_outlined),
                TagPill('الهامش ${usd(s.total('marginAtNational'))}', icon: Icons.trending_up),
                TagPill('غلّة التعادل ${s.breakEvenKgPerHa == null ? '—' : '${n0(s.breakEvenKgPerHa)} كجم/هـ'}'),
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
      const _Panel(
        title: 'من أين تأتي الأرقام',
        children: [
          _Note('الغلّة والسعر من مرجعية FAOSTAT المحمَّلة في المنصّة. الاحتياج المائي من محرّك FAO-56 نفسه الذي '
              'تعمل به حاسبة الاحتياج المائي. ونسب أقساط المراحل هي نفسها نسب صرف ميزانية الموسم في المنصّة، حتى '
              'لا تختلف الدراسة عن العقد الذي تُبنى عليه. وتكلفة العمليات تُدخِلها أنت.'),
          _Note('الماء موزَّع على المراحل بنفس نسب الميزانية — وهو تقريبٌ نقوله صراحةً: FAO-56 يقسم الموسم أربع مراحل '
              'وتقويم المنصّة سبعاً، فلا خريطة أمينة بينهما. التقريب يُقلّل ماء منتصف الموسم، ويتطابق تماماً عند '
              'الحصاد — وهو الرقم الذي تدور عليه الدراسة.'),
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
    const fit = {'suited': 'مناسبة', 'possible': 'ممكنة', 'unsuited': 'غير مناسبة'};
    return _Panel(
      title: 'توصية طريقة الري',
      children: [
        _Note(
          chosen == best
              ? 'طريقتك (${name[chosen]}) هي الأنسب لهذا المحصول وهذه المساحة.'
              : 'الحساب أدناه بطريقتك (${name[chosen]}). الأنسب لهذا المحصول وهذه المساحة: ${name[best]}'
                  '${saving > 0 ? ' — توفّر نحو ${n0(saving)} م³ للفدان في الموسم (${n0(((a['savingShare'] as num?) ?? 0) * 100)}٪ من الماء).' : '.'}',
          strong: true,
        ),
        const SizedBox(height: 6),
        for (final m in s.methods)
          _Row(
            '${m.label}${m.method == chosen ? ' (اختيارك)' : ''} — ${fit[m.suitability] ?? m.suitability}'
            '${m.tooSmall && m.suitability != 'unsuited' ? ' (لمساحة ${n0(a['pivotMinFeddans'] as num?)} فدان فأكثر)' : ''}',
            '${n0(m.m3PerFeddan)} م³',
            bold: m.method == best,
          ),
        const _Note('المناسبة للمحصول من دليل الفاو لطرق الري (Brouwer وآخرون، 1988). ومن بين المناسبة تُختار الأعلى '
            'كفاءة. حدّ المساحة للمحاور الارتكازية قاعدة عملية لا رقم منشور. ولا يدخل هنا ثمن معدّات الري.'),
      ],
    );
  }

  Widget _needs(BuildContext context, FeasibilityStudy s) {
    final n = s.needs;
    final sdg = s.sdgPerUsd;
    String range(Object? r, String unit) {
      final l = (r as List?)?.cast<num>();
      if (l == null || l.length != 2) return 'لم نجد رقماً منشوراً';
      return l[0] == l[1] ? '${_plain(l[0].toDouble())} $unit' : '${_plain(l[0].toDouble())}–${_plain(l[1].toDouble())} $unit';
    }

    if (n == null) {
      final published = s.published;
      return _Panel(
        title: 'محصولٌ جديد',
        children: [
          const _Note('هذا محصول جديد: لا توصيات سودانية منشورة لمدخلاته بعد، فأدخل تكلفتك بنفسك.'),
          if (published.isEmpty)
            const _Note('ولم نجد تكلفةً منشورةً للفدان من هذا المحصول في السودان.')
          else ...[
            const _Note('تكاليف منشورة للمقارنة — كما كُتبت، بجنيه سنتها:', strong: true),
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
            const _Note('أرقامٌ قديمة والجنيه فقد معظم قيمته منذها، فلا تدخل في الحساب؛ التكلفة التي تكتبها أنت هي التي تُحسب.'),
          ],
        ],
      );
    }

    final est = (n['estimate'] as Map).cast<String, dynamic>();
    final phosphate = (n['phosphate'] as Map?)?.cast<String, dynamic>();
    final urea = n['ureaKg'] as List?;
    String bags(List r) => r[0] == r[1] ? '${(r[0] as num) / 50}' : '${(r[0] as num) / 50}–${(r[1] as num) / 50}';
    final lines = (est['lines'] as List).cast<Map>();
    String sdgOf(num v) => sdg == null ? '' : ' · ${n0(v * sdg)} جنيه';
    return _Panel(
      title: 'احتياجات الفدان',
      subtitle: '${n['system']}',
      children: [
        _Row('البذور', range(n['seedKg'], 'كجم')),
        if (n['seedNote'] != null) _Note('${n['seedNote']}'),
        _Row('اليوريا', urea == null ? 'لا تُضاف عادةً' : '${range(urea, 'كجم')} (${bags(urea)} جوال)'),
        _Row('السماد الفوسفاتي',
            phosphate == null ? 'لا توصية منشورة' : '${phosphate['kind']} ${range(phosphate['kg'], 'كجم')}'),
        _Note('متى يوضع السماد: ${n['timing'] ?? '—'}'),
        _Note('المبيدات: ${n['sprays'] ?? 'لم نجد معدّلاً منشوراً'}'),
        _Note('العمليات: ${n['operations']}'),
        const SizedBox(height: 10),
        FilledButton.icon(
          onPressed: _saving ? null : _makeProject,
          icon: const Icon(Icons.playlist_add_check),
          label: Text(_saving ? 'تُنشأ القائمة…' : 'حوّلها إلى مشروع'),
        ),
        const _Note('تُنشأ قائمة هذه المدخلات لمساحتك في «مشروعي»: توافق عليها، وتدفع لكلّ مورد مباشرةً، وتسجّل ما '
            'دفعت وما استلمت. سوداقري لا تستلم مالك ولا تحفظه.'),
        const SizedBox(height: 12),
        const Text('متوسط التكلفة المتوقَّع للفدان — تقدير البرنامج', style: TextStyle(fontWeight: FontWeight.w800)),
        for (final l in lines)
          _Row('${l['name']} (${l['qty']})', '\$${((l['usd'] as num?) ?? 0).toStringAsFixed(2)}${sdgOf((l['usd'] as num?) ?? 0)}'),
        _Row('المجموع المعروف',
            '\$${((est['totalUsd'] as num?) ?? 0).toStringAsFixed(2)}${sdgOf((est['totalUsd'] as num?) ?? 0)}',
            bold: true),
        _Note('غير محسوب لأنّا لم نجد سعراً منشوراً له: ${(est['missing'] as List).join('، ')}. فهذا حدّ أدنى لا '
            'تكلفة كاملة، وتكلفتك التي أدخلتها أعلاه هي التي تُبنى عليها الدراسة. السماد بسعر الميناء العالمي '
            'قبل الشحن، والجنيه بسعر بنك الخرطوم.'),
        for (final r in (n['localReferences'] as List).cast<Map>())
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(child: _Note('• ${r['text']}')),
              IconButton(
                tooltip: 'المصدر',
                visualDensity: VisualDensity.compact,
                icon: const Icon(Icons.open_in_new, size: 18),
                onPressed: () => _open('${r['source']}'),
              ),
            ],
          ),
        const _Note('مصادر الاحتياجات:'),
        _Links([
          for (final src in (n['sources'] as List).cast<Map>()) Source('${src['label']}', '${src['url']}'),
          Source('أسعار السماد: البنك الدولي، سبتمبر 2026', '${n['fertiliserSource']}'),
        ]),
      ],
    );
  }

  Widget _reference(BuildContext context, FeasibilityStudy s) {
    final r = s.reference;
    String kg(Object? v) => v == null ? '—' : '${n0(v as num)} كجم/هـ';
    return _Panel(
      title: 'المرجعية التي تُقاس عليها',
      children: [
        Wrap(spacing: 8, runSpacing: 8, children: [
          _Figure('غلّة السودان', kg(r['sudanKgPerHa']), note: r['year'] == null ? null : 'FAOSTAT ${r['year']}'),
          _Figure('مصر — أقرب نظير مروي', kg(r['nearestPeerKgPerHa']),
              note: 'وسيط النظراء ${r['peerMedianKgPerHa'] == null ? '—' : n0(r['peerMedianKgPerHa'] as num)}'),
          _Figure('السعر المعتمد', r['usdPerTonne'] == null ? '—' : '${n0(r['usdPerTonne'] as num)} \$/طن',
              note: '${r['priceBasisLabel']}'),
        ]),
        _Note('${r['priceBasisNote']}'),
        _Note('مناخ ${s.input['stationName']}: ${r['stationSource']}. المقارنة بمصر ووسيط النظراء العرب والأفارقة '
            'والهند — لا بأعلى غلّة في العالم، فأعلاها بيوت زجاجية لا تُقاس عليها مزرعة مكشوفة.'),
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
      title: 'السلّم المرحلي',
      subtitle: 'كم التزمتَ، وكم تحتاج لتستردّه',
      children: [
        const _Note('كل مرحلة تعرض ما أُنفق حتى نهايتها، ثم تُحوّله إلى الغلّة التي تُعيده عند الحصاد.'),
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
                _Row('قسط المرحلة', usd(phases[i].cost)),
                _Row('الملتزم حتى هنا (${(phases[i].cumulativeShare * 100).round()}٪)', usd(phases[i].cumulativeCost)),
                _Row('غلّة التعادل عند هذه النقطة',
                    phases[i].breakEvenKgPerHa == null ? '—' : '${n0(phases[i].breakEvenKgPerHa)} كجم/هـ',
                    bold: true),
                if (phases[i].lastSafeExit)
                  const _Note('← آخر مرحلة يُسترد ما فيها بالمتوسط الوطني. بعدها تراهن على حصاد أعلى من المعتاد.',
                      strong: true),
              ],
            ),
          ),
        if (s.lastSafeExit == null)
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: warnTintOn(context), borderRadius: BorderRadius.circular(14)),
            child: Text(
              'لا توجد مرحلة واحدة يُسترد ما فيها بالمتوسط الوطني — أي أن أول قسط يتجاوز ما يعيده هذا المحصول '
              'عادةً في السودان. راجع التكلفة أو المحصول أو السعر قبل التوقيع.',
              style: TextStyle(color: warnOn(context), height: 1.7, fontWeight: FontWeight.w600),
            ),
          ),
      ],
    );
  }

  Widget _totals(BuildContext context, FeasibilityStudy s) {
    final margin = s.total('marginAtNational');
    return _Panel(
      title: 'الموسم كلّه',
      children: [
        const Text('التكلفة', style: TextStyle(fontWeight: FontWeight.w800)),
        _Row('عمليات حقلية', usd(s.total('fieldCost'))),
        _Row('ماء (${n0(s.total('waterM3Total'))} م³)', usd(s.total('waterCost'))),
        _Row('الإجمالي', usd(s.total('totalCost')), bold: true),
        _Row('للفدان', usd(s.total('costPerFeddan'))),
        const Divider(height: 22),
        const Text('العائد والهامش', style: TextStyle(fontWeight: FontWeight.w800)),
        _Row('بالمتوسط الوطني', usd(s.total('revenueAtNational'))),
        _Row(margin != null && margin < 0 ? 'الهامش (خسارة)' : 'الهامش', usd(margin), bold: true),
        _Row('لو بلغتَ غلّة مصر', usd(s.total('revenueAtPeer'))),
        _Row('الهامش عندها', usd(s.total('marginAtPeer')), bold: true),
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
      title: 'الأخطار وتكلفتها',
      subtitle: 'كم مرّةً يحدث الخطر × كم يُضيع حين يحدث = الخسارة المتوقّعة في الموسم.',
      children: [
        const Text('مكافحة الآفات — تكلفةٌ معروفة مسبقاً', style: TextStyle(fontWeight: FontWeight.w800)),
        const _Note('عدد الرشّات × (ثمن المبيد + أجر الرشّ) للفدان. إن كانت المبيدات داخلةً في تكلفة الفدان أعلاه '
            'فاترك هذا صفراً.'),
        if (rk['sprayNote'] != null) _Note('توصية هذا المحصول: ${rk['sprayNote']}'),
        const SizedBox(height: 6),
        Row(children: [
          Expanded(
            child: _NumberField(
              label: 'عدد الرشّات',
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
              label: 'الرشّة للفدان (\$)',
              controller: _sprayUsd,
              onChanged: (t) {
                _in.sprayUsd = _parse(t) ?? 0;
                _changed();
              },
            ),
          ),
        ]),
        if (protection > 0) _Note('تكلفة المكافحة للمساحة كلّها: ${usd(protection)}', strong: true),
        const Divider(height: 24),
        for (final setting in _in.risks)
          if (info[setting.key] != null) _risk(context, s, info[setting.key]!, setting, revenue),
        const Divider(height: 24),
        _Row('الهامش بالمتوسط الوطني', usd(s.total('marginAtNational'))),
        if (protection > 0) _Row('ناقص المكافحة', '−${usd(protection)}'),
        _Row('ناقص الخسارة المتوقّعة', revenue == null ? '—' : '−${usd(rk['expectedTotalUsd'] as num?)}'),
        if (reserveTotal > 0) _Row('ناقص الاحتياطيّ المحجوز', '−${usd(reserveTotal)}'),
        _Row('الهامش بعد الأخطار', usd(after), bold: true),
        if (s.uncounted.isNotEmpty)
          _Note('لم تدخل الحساب لنقص رقم: ${s.uncounted.map((k) => info[k]?.name ?? k).join('، ')}'),
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
                  ? 'السنة السيّئة: إن وقع «${info[bad['key']]?.name ?? bad['key']}» هذا الموسم صار الهامش '
                      '${usd(bad['marginUsd'] as num?)} — خسارة. فإمّا تأمينٌ أو احتياطيٌّ يغطّيها، أو محصولٌ أو مساحةٌ '
                      'أخرى، قبل البذر.'
                  : 'السنة السيّئة: إن وقع «${info[bad['key']]?.name ?? bad['key']}» هذا الموسم بقي الهامش '
                      '${usd(bad['marginUsd'] as num?)} — الموسم يحتمل أسوأ خطرٍ فيه.',
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
                  label: 'احتياطيٌّ يُحجز (\$)',
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
                      label: 'مرّةً كلّ … سنوات',
                      hint: 'من خبرتك',
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
                      label: 'يُضيع من المحصول (٪)',
                      hint: 'من خبرتك',
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
                        ? 'يُحجز: ${usd(setting.reserveUsd)}'
                        : 'اكتب مبلغ الاحتياطيّ.')
                    : expected != null
                        ? 'الخسارة المتوقّعة في الموسم: ${usd(expected)}'
                        : revenue == null
                            ? 'أدخل سعر المحصول أعلاه لتُحسب بالدولار.'
                            : 'ينقصه رقم: اكتبه من خبرتك ليدخل الحساب.',
                strong: true,
              ),
              if (r.key == 'locust' && s.locust != null) _LocustWatch(s.locust!),
              if (r.basis != null) _Note(r.basis!),
              _Note('كيف يُعالَج: ${r.treatment}${r.services.isEmpty ? '' : ' — ${r.services.join('، ')}'}'),
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
            Text('رُصد جرادٌ قرب أرضك', style: TextStyle(color: warnOn(context), fontWeight: FontWeight.w800)),
            for (final n in near)
              _Note('«${n['land']}»: ${n['label']} على بعد ${n0(n['km'] as num?)} كم، في ${n['day']} (${n['place']})'),
            _Note('الفاو: يطير الجراد نهاراً مع الريح حتى ${l['alertKm']} كم في اليوم. بلّغ وقاية النباتات في ولايتك، '
                'وتفقّد الحقل صباحاً.'),
            const SizedBox(height: 6),
          ],
          if (l['signedIn'] != true)
            const _Note('ادخل إلى حسابك وأضف موقع أرضك ليصلك إشعارٌ إن رُصد جرادٌ قربها.'),
          const Text('ما رصدته الفاو في السودان خلال آخر ١٢ شهراً', style: TextStyle(fontWeight: FontWeight.w700)),
          for (final c in counts) _Note('${c['label']}: ${n0(c['count'] as num?)} — آخرها ${c['day']}'),
          if (l['gregarious'] != true) const _Note('لم تُسجَّل أسرابٌ ولا أشرطة حوريّات.'),
          if (places.isNotEmpty)
            _Note('آخر أماكن الرصد: ${places.map((p) => '${p['place']} (${p['label']}، ${p['day']})').join('، ')}'),
          const _Note('يُعدّ ما وصل إلى الفاو من فرق المسح وحدَه: مكانٌ لم يصله أحدٌ لا يُرسل شيئاً.'),
          _Links([Source('خريطة الجراد — الفاو', '${l['hubUrl']}')]),
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
        const IntroNote(
          'محاصيل لا يزرعها السودان تقليدياً، ولها دليل منشور على أنّها تنجح هنا أو في مناخ قريب. لكلّ واحد ما '
          'وجدناه من تجارب، وما يُحذر منه، وزرّ يفتح دراسة الجدوى عليه مباشرة.',
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
                FilledButton(onPressed: () => onTry(c.key), child: const Text('جرّبه في دراسة الجدوى'))
              else
                const _Note('ماؤه لا يُحسب بعد — لا أطوار نموّ منشورة له'),
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

  static const _questions = [
    ('ما أفقك الزمني للاستثمار؟', ['أقل من سنة', 'من سنة إلى 3 سنوات', 'أكثر من 3 سنوات']),
    ('لو انخفضت قيمة استثمارك 20% مؤقتاً، ماذا تفعل؟', ['أسحب استثماري فوراً', 'أنتظر وأراقب الوضع', 'أزيد استثماري إن أمكن']),
    ('كم نسبة هذا المبلغ من أموالك الفائضة (غير الأساسية للمعيشة)؟', ['أقل من 10%', 'بين 10% و30%', 'أكثر من 30%']),
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
        const IntroNote(
          'أجب عن الأسئلة وأدخل المبلغ الذي تريد استثماره، فيقترح النظام توزيعاً بين المشاريع المفتوحة حالياً بحسب '
          'تحمّلك للمخاطرة — توزيعٌ آليّ يعتمد على مخاطرة كلّ مشروع والحصص المتاحة فيه، وليس توصية مالية شخصية.',
          icon: Icons.pie_chart_outline,
        ),
        const SizedBox(height: 10),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: warnTintOn(context), borderRadius: BorderRadius.circular(14)),
          child: Text(
            'المشاريع المستخدمة في الحساب نماذج توضيحية حالياً، والاستثمار لم يُفتح بعد. الأداة تُظهر كيف سيوزّع النظام '
            'المبلغ فعلياً عند إطلاق المشاريع الحقيقية.',
            style: TextStyle(color: warnOn(context), height: 1.7),
          ),
        ),
        const SizedBox(height: 14),
        _Panel(
          title: 'خطّط استثمارك',
          children: [
            _NumberField(label: 'المبلغ الذي تريد استثماره (USD)', controller: _amount, onChanged: (_) {}),
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
                        setState(() => _error = 'ادخل إلى حسابك من «حسابي» أوّلاً.');
                        return;
                      }
                      _submit();
                    },
              child: Text(_busy ? 'جارٍ الحساب…' : 'اقترح لي توزيعاً'),
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
            title: 'التوزيع المقترح',
            subtitle: 'مستوى تحمّل المخاطرة المُستنتج من إجاباتك: ${r.riskProfileLabel}',
            children: [
              const _Note('هذا اقتراح توزيع آلي وليس نصيحة مالية ملزمة — راجعه وقرّر بنفسك قبل أي استثمار فعلي.'),
              if (r.allocations.isEmpty)
                const _Note('لا توجد مشاريع مفتوحة كافية حالياً لاقتراح توزيع.', strong: true)
              else ...[
                for (final a in r.allocations)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(a.name, style: const TextStyle(fontWeight: FontWeight.w700)),
                    subtitle: Text('المخاطرة: ${a.riskLabel} · ${a.shares} حصّة'),
                    trailing: Text(usd(a.amount), style: const TextStyle(fontWeight: FontWeight.w800)),
                    onTap: a.slug.isEmpty ? null : () => _open('${ApiConfig.siteUrl}/projects/${a.slug}'),
                  ),
                _Row('الإجمالي المُوزَّع من أصل ${usd(r.requested)}', usd(r.allocated), bold: true),
              ],
            ],
          ),
      ],
    );
  }
}
