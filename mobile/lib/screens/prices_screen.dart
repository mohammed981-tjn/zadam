import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../account.dart';
import '../api.dart';
import '../prices.dart';
import '../theme.dart';
import '../ui.dart';

/// الأسعار والسوق (البند ٢٠٣): the website's /market, /rates and
/// /market/inputs in four tabs, and the reader's own price alerts — every
/// figure with its date and source, and the same «old» warning the site gives.
class PricesScreen extends StatefulWidget {
  const PricesScreen({super.key, this.client, this.initialTab = 0});

  /// A stand-in for tests; the real client otherwise.
  final PricesClient? client;
  final int initialTab;

  @override
  State<PricesScreen> createState() => _PricesScreenState();
}

class _PricesScreenState extends State<PricesScreen> with SingleTickerProviderStateMixin {
  late final PricesClient _client = widget.client ?? PricesClient();
  late final TabController _tabs = TabController(length: 4, vsync: this, initialIndex: widget.initialTab.clamp(0, 3));

  /// The series a «نبّهني» on a crop card asked to follow.
  String? _preselect;

  void _alertFor(String? subject) {
    setState(() => _preselect = subject);
    _tabs.animateTo(3);
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('الأسعار والسوق'),
        bottom: TabBar(
          controller: _tabs,
          isScrollable: true,
          tabAlignment: TabAlignment.start,
          tabs: const [
            Tab(text: 'المحاصيل'),
            Tab(text: 'العملات'),
            Tab(text: 'المدخلات والوقود'),
            Tab(text: 'تنبيهاتي'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabs,
        children: [
          BoardView<MarketBoard>(
            key: const PageStorageKey('prices-market'),
            load: _client.market,
            build: (context, b, _) => _cropsTab(context, b, _alertFor),
          ),
          BoardView<RatesBoard>(
            key: const PageStorageKey('prices-rates'),
            load: _client.rates,
            build: (context, b, _) => [_RatesBody(board: b)],
          ),
          BoardView<InputsBoard>(
            key: const PageStorageKey('prices-inputs'),
            load: _client.inputs,
            build: (context, b, _) => _inputsTab(context, b),
          ),
          _AlertsTab(client: _client, preselect: _preselect),
        ],
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Shared pieces (the export screen uses them too)
// ═══════════════════════════════════════════════════════════════════════════

/// Opens a source in the browser, as the website's «المصدر» links do.
Future<void> openLink(BuildContext context, String url) async {
  final messenger = ScaffoldMessenger.of(context);
  final uri = Uri.tryParse(url);
  final ok = uri != null && uri.hasScheme && await launchUrl(uri, mode: LaunchMode.externalApplication);
  if (!ok) messenger.showSnackBar(const SnackBar(content: Text('تعذّر فتح الرابط.')));
}

/// A page of the website, for what is still done there.
Future<void> openSite(BuildContext context, String path) =>
    openLink(context, ApiConfig.siteUrl.isEmpty ? '' : '${ApiConfig.siteUrl}$path');

/// A source link: small, green, with the open-outside icon.
class SourceLink extends StatelessWidget {
  const SourceLink(this.url, {super.key, this.label = 'المصدر'});
  final String url;
  final String label;

  @override
  Widget build(BuildContext context) {
    if (url.isEmpty) return const SizedBox.shrink();
    return InkWell(
      onTap: () => openLink(context, url),
      borderRadius: BorderRadius.circular(8),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 2),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.open_in_new_rounded, size: 14, color: textGreenOn(context)),
            const SizedBox(width: 4),
            Flexible(
              child: Text(
                label,
                style: TextStyle(
                  fontSize: 12,
                  color: textGreenOn(context),
                  decoration: TextDecoration.underline,
                  decorationColor: textGreenOn(context),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// The card every board section sits on.
class PanelCard extends StatelessWidget {
  const PanelCard({super.key, required this.child, this.gold = false, this.padding = const EdgeInsets.all(16)});
  final Widget child;

  /// The dark-gold tint, for a warning that leads the page.
  final bool gold;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    // A Material, not a coloured box: the expansion tiles and buttons inside paint their ink on it.
    return Material(
      color: gold ? warnTintOn(context) : scheme.surface,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: BorderSide(color: gold ? warnOn(context).withValues(alpha: 0.35) : scheme.outline),
      ),
      child: SizedBox(width: double.infinity, child: Padding(padding: padding, child: child)),
    );
  }
}

/// A hero band with an icon, a title and what the page is.
class BoardHero extends StatelessWidget {
  const BoardHero({super.key, required this.icon, required this.title, required this.text});
  final IconData icon;
  final String title;
  final String text;

  @override
  Widget build(BuildContext context) {
    return HeroBand(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          IconChip(icon),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w800, height: 1.35)),
                const SizedBox(height: 6),
                Text(text, style: TextStyle(fontSize: 13, height: 1.75, color: inkOn(context))),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// One board: loads, shows the states, refreshes on pull, and keeps its place
/// when the reader switches tabs.
class BoardView<T> extends StatefulWidget {
  const BoardView({super.key, required this.load, required this.build});
  final Future<T> Function() load;
  final List<Widget> Function(BuildContext context, T data, VoidCallback reload) build;

  @override
  State<BoardView<T>> createState() => _BoardViewState<T>();
}

class _BoardViewState<T> extends State<BoardView<T>> with AutomaticKeepAliveClientMixin {
  late Future<T> _future = widget.load();

  void _reload() => setState(() => _future = widget.load());

  @override
  bool get wantKeepAlive => true;

  @override
  Widget build(BuildContext context) {
    super.build(context);
    return RefreshIndicator(
      onRefresh: () async {
        _reload();
        try {
          await _future;
        } catch (_) {
          // The error is shown by the builder.
        }
      },
      child: FutureBuilder<T>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) return const LoadingView();
          if (snap.hasError) {
            final e = snap.error;
            return StateView.error(e is ApiException ? e.message : 'تعذّر تحميل البيانات.', onRetry: _reload, scrollable: true);
          }
          final children = widget.build(context, snap.data as T, _reload);
          return ListView.separated(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 40),
            itemCount: children.length,
            separatorBuilder: (_, _) => const SizedBox(height: 14),
            itemBuilder: (context, i) => FadeIn(delay: i, child: children[i]),
          );
        },
      ),
    );
  }
}

Widget _muted(BuildContext context, String text, {double size = 12.5}) =>
    Text(text, style: TextStyle(color: mutedOn(context), fontSize: size, height: 1.7));

Widget _bold(String text, {double size = 15}) =>
    Text(text, style: TextStyle(fontWeight: FontWeight.w800, fontSize: size, height: 1.45));

/// A percentage change, «+٥٪» rising in gold (costlier) and falling in green, as the WFP table colours it — no red.
Widget _pct(BuildContext context, num? p) {
  if (p == null) return _muted(context, '—');
  final colour = p > 0 ? warnOn(context) : p < 0 ? textGreenOn(context) : mutedOn(context);
  return Text('${p > 0 ? '+' : ''}$p%', textDirection: TextDirection.ltr, style: TextStyle(color: colour, fontWeight: FontWeight.w700, fontSize: 12.5));
}

// ═══════════════════════════════════════════════════════════════════════════
// المحاصيل — /market
// ═══════════════════════════════════════════════════════════════════════════

List<Widget> _cropsTab(BuildContext context, MarketBoard b, void Function(String?) onAlert) {
  final monthly = _monthly(context, b);
  return [
    const BoardHero(
      icon: Icons.storefront_rounded,
      title: 'سوق المحاصيل اليوم',
      text: 'آخر ما نُشر من أسعار بورصتي القضارف والأبيض: بالوحدة التي يُباع بها المحصول هناك، بالجنيه وبما يقابله '
          'بالدولار، مع الوارد والتغيّر وتاريخ كلّ رقمٍ ومصدره.',
    ),
    if (b.staleFeeds.isNotEmpty)
      PanelCard(
        key: const Key('stale-feeds'),
        gold: true,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Icon(Icons.schedule_rounded, color: warnOn(context), size: 20),
              const SizedBox(width: 8),
              Expanded(child: _bold('بعض الأسعار لم تتجدّد في موعدها')),
            ]),
            const SizedBox(height: 6),
            for (final l in b.staleLines) Text('• $l', style: TextStyle(color: warnOn(context), fontSize: 12.5, height: 1.7)),
            const SizedBox(height: 4),
            _muted(context, 'القراءة اليوميّة لم تجد رقماً أحدث خلال مهلتها. نعرض آخر رقمٍ موثّق بتاريخه، فتحقّق قبل أن تعتمد عليه.'),
          ],
        ),
      ),
    const IntroNote(
      'البورصتان لا تنشران نشرةً على الإنترنت؛ تصل أرقامهما في أخبار وكالة السودان للأنباء (سونا) والصحف، وأحياناً تغيب '
      'أسابيع. لذلك نكتب تاريخ كلّ رقم، ونعلّمه بالذهبيّ الداكن إذا مضى عليه أكثر من ثلاثة أيام. لا نقدّر رقماً لم نجده.',
    ),
    if (b.quiet) _quietNotice(context, b),
    if (b.quiet) ...monthly,
    if (b.quiet) SectionTitle('آخر أرقام البورصتين'),
    if (b.crops.isEmpty)
      const StateView(icon: Icons.cloud_off_rounded, title: 'تعذّرت قراءة الأسعار الآن.', warn: true, compact: true)
    else
      for (final c in b.crops) _CropCardView(card: c, onAlert: onAlert),
    if (!b.quiet) ...monthly,
    PanelCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _bold('نبّهني حين يتغيّر السعر'),
          const SizedBox(height: 4),
          _muted(context, 'ضع حدّاً لسعر محصولٍ أو للدولار، فيصلك إشعارٌ حين يتجاوزه آخر سعرٍ منشور.'),
          const SizedBox(height: 10),
          FilledButton.icon(
            onPressed: () => onAlert(null),
            icon: const Icon(Icons.notifications_active_outlined, size: 20),
            label: const Text('ضع تنبيهاً'),
          ),
        ],
      ),
    ),
    PanelCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _bold('ما بعد الأسعار: إيصالات المخازن'),
          const SizedBox(height: 4),
          _muted(
            context,
            'السعر وحده لا يحمي المزارع الذي يبيع ساعة الحصاد بأدنى سعر لأنه يحتاج النقد. الخطوة التالية التي ندرسها: أن '
            'يودع محصوله مخزناً معتمداً ويأخذ إيصالاً يُرهن أو يُباع في بورصة الولاية للسلع، فيبيع حين يشاء لا حين يُضطرّ.',
          ),
        ],
      ),
    ),
    Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionTitle('الوحدات'),
        _muted(context, b.unitsNote),
        const SizedBox(height: 4),
        _muted(
          context,
          b.usdSell != null
              ? 'الدولار بسعر ${b.usdBank ?? 'بنك الخرطوم'} اليوم (${money(b.usdSell!, digits: 2)} جنيه، بتاريخ ${arDay(b.usdDate ?? '')}) — '
                  'لا بسعر يوم الرقم نفسه؛ فهو للمقارنة لا للمحاسبة.'
              : 'تعذّرت قراءة سعر الصرف، فلا يظهر الدولار.',
        ),
      ],
    ),
  ];
}

Widget _quietNotice(BuildContext context, MarketBoard b) {
  final bulletins = b.lastBulletins.map((x) => 'آخر رقمٍ منشور من ${x.market}: ${arDay(x.date)}').join('، و');
  final checked = b.checked == null ? '' : 'بحثنا عن أحدث منها آخر مرّة في ${arDay(b.checked!)} فلم نجد: ';
  final w = b.wfpMonthly;
  String pct(double n) => '${n > 0 ? '+' : ''}${money(n)}%';
  return PanelCard(
    key: const Key('quiet-bourses'),
    gold: true,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _bold('لماذا آخر أسعار البورصة قديمة؟'),
        const SizedBox(height: 6),
        Text(
          '$bulletins. $checkedلم تُنشر للبورصتين نشرةٌ بعدها في الأخبار التي نقرؤها. نضيفها يوم تظهر، وحتى ذلك الحين هذه '
          'أحدث الأرقام الموثّقة، شهريّةً من برنامج الأغذية العالمي.',
          style: TextStyle(fontSize: 13, height: 1.8, color: inkOn(context)),
        ),
        if (w != null) ...[
          const SizedBox(height: 10),
          PanelCard(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _bold('أحدث رقمٍ موثّق: ${arMonth(w.month)}، من برنامج الأغذية العالمي', size: 13.5),
                const SizedBox(height: 6),
                Text(
                  '• سوق مزاد الذرة بالقضارف: وصله ${money(w.arrivalsTonnes)} طنّاً (${pct(w.arrivalsVsLastMonthPct)} عن الشهر السابق)، '
                  'وتغيّر متوسّط سعر الذرة فيه ${pct(w.priceVsLastMonthPct)} عن الشهر السابق و${pct(w.priceVsLastYearPct)} عن '
                  'الشهر نفسه من العام الماضي.\n'
                  '• الذرة بالتجزئة في شمال كردفان (الأبيض): ${money(w.kordofanPrice)} جنيه للكيلو، وكانت ${money(w.kordofanLastMonth)} في الشهر السابق.\n'
                  '• متوسّط الذرة بالتجزئة في السودان: ${money(w.nationalPrice)} جنيه للكيلو، وكان ${money(w.nationalLastMonth)} في الشهر السابق.',
                  style: const TextStyle(fontSize: 12.5, height: 1.8),
                ),
                SourceLink(w.source, label: w.report.isEmpty ? 'المصدر' : w.report),
              ],
            ),
          ),
        ],
      ],
    ),
  );
}

class _CropCardView extends StatelessWidget {
  const _CropCardView({required this.card, required this.onAlert});
  final CropCard card;
  final void Function(String?) onAlert;

  @override
  Widget build(BuildContext context) {
    return PanelCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(card.name, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
          for (var i = 0; i < card.series.length; i++) ...[
            if (i > 0) Divider(height: 22, color: Theme.of(context).colorScheme.outline),
            if (i == 0) const SizedBox(height: 8),
            _SeriesRow(s: card.series[i], onAlert: onAlert),
          ],
        ],
      ),
    );
  }
}

class _SeriesRow extends StatelessWidget {
  const _SeriesRow({required this.s, required this.onAlert});
  final SeriesCard s;
  final void Function(String?) onAlert;

  @override
  Widget build(BuildContext context) {
    final change = s.change;
    final up = change != null && change > 0;
    final down = change != null && change < 0;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(s.marketName, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
                  const SizedBox(height: 2),
                  Text.rich(
                    TextSpan(children: [
                      TextSpan(text: money(s.price), style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900)),
                      const TextSpan(text: ' جنيه', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
                    ]),
                  ),
                  _muted(
                    context,
                    s.usd != null ? '${s.perUnit} · ≈ \$${money(s.usd!, digits: 2)} بسعر بنك الخرطوم اليوم' : s.perUnit,
                    size: 12,
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Sparkline(points: s.history.map((p) => p.price).toList()),
          ],
        ),
        const SizedBox(height: 6),
        Wrap(
          spacing: 12,
          runSpacing: 4,
          children: [
            if (change != null)
              Text(
                '${up ? '▲' : down ? '▼' : '＝'} ${change > 0 ? '+' : ''}${money(change)} '
                '(${(s.changePct ?? 0) > 0 ? '+' : ''}${money(s.changePct ?? 0, digits: 1)}%) عن الرقم السابق',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: up ? textGreenOn(context) : down ? warnOn(context) : mutedOn(context),
                ),
              ),
            if (s.arrivals != null)
              _muted(context, 'الوارد: ${money(s.arrivals!)} جوال${s.allSorghum ? ' (الذرة كلّها)' : ''}', size: 12),
          ],
        ),
        const SizedBox(height: 4),
        Text(
          s.freshness,
          style: TextStyle(
            fontSize: 12,
            height: 1.6,
            fontWeight: s.stale ? FontWeight.w800 : FontWeight.w400,
            color: s.stale ? warnOn(context) : mutedOn(context),
          ),
        ),
        if (s.note != null) _muted(context, s.note!, size: 11.5),
        Row(
          children: [
            SourceLink(s.source),
            const Spacer(),
            TextButton.icon(
              onPressed: () => onAlert(s.alertSubject),
              icon: const Icon(Icons.notifications_none_rounded, size: 18),
              label: const Text('نبّهني'),
            ),
          ],
        ),
      ],
    );
  }
}

/// The last twelve figures as a small line, as the website's sparkline.
class Sparkline extends StatelessWidget {
  const Sparkline({super.key, required this.points, this.width = 92, this.height = 40});
  final List<double> points;
  final double width;
  final double height;

  @override
  Widget build(BuildContext context) {
    if (points.length < 2) return SizedBox(width: width, height: height);
    return Semantics(
      label: 'تاريخ السعر',
      child: CustomPaint(
        size: Size(width, height),
        painter: _SparkPainter(points, textGreenOn(context), leafTintOn(context)),
      ),
    );
  }
}

class _SparkPainter extends CustomPainter {
  _SparkPainter(this.points, this.line, this.fill);
  final List<double> points;
  final Color line;
  final Color fill;

  @override
  void paint(Canvas canvas, Size size) {
    final lo = points.reduce((a, b) => a < b ? a : b);
    final hi = points.reduce((a, b) => a > b ? a : b);
    final span = hi - lo == 0 ? 1 : hi - lo;
    // Oldest on the right, as Arabic reads: the newest figure sits at the start of the line.
    Offset at(int i) => Offset(
          size.width - size.width * i / (points.length - 1),
          size.height - 4 - (size.height - 8) * (points[i] - lo) / span,
        );
    final path = Path()..moveTo(at(0).dx, at(0).dy);
    for (var i = 1; i < points.length; i++) {
      path.lineTo(at(i).dx, at(i).dy);
    }
    final area = Path.from(path)
      ..lineTo(at(points.length - 1).dx, size.height)
      ..lineTo(at(0).dx, size.height)
      ..close();
    canvas.drawPath(area, Paint()..color = fill.withValues(alpha: 0.7));
    canvas.drawPath(
      path,
      Paint()
        ..color = line
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round,
    );
    canvas.drawCircle(at(points.length - 1), 3, Paint()..color = line);
  }

  @override
  bool shouldRepaint(_SparkPainter old) => old.points != points || old.line != line;
}

List<Widget> _monthly(BuildContext context, MarketBoard b) {
  return [
    const SectionTitle(
      'الأسعار الشهرية',
      subtitle: 'من شبكة الإنذار المبكر بالمجاعة (FEWS NET): متوسّط شهري لأسعار الذرة والدخن بالتجزئة في مدن السودان، '
          'القضارف والأبيض أولاً. يتأخّر شهراً أو اثنين، وهو مرجعٌ للاتجاه لا سعر بورصة اليوم.',
    ),
    PanelCard(
      padding: const EdgeInsets.fromLTRB(14, 8, 14, 8),
      child: b.fews == null
          ? _muted(context, 'تعذّر الوصول إلى بيانات FEWS NET الآن.')
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (var i = 0; i < b.fews!.length; i++) ...[
                  if (i > 0) Divider(height: 1, color: Theme.of(context).colorScheme.outline),
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(b.fews![i].market, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                              _muted(context, '${b.fews![i].product}${b.fews![i].unit.isEmpty ? '' : ' / ${b.fews![i].unit}'} · ${arMonth(b.fews![i].month)}', size: 12),
                            ],
                          ),
                        ),
                        Text(money(b.fews![i].value), style: const TextStyle(fontWeight: FontWeight.w800)),
                        if (b.fews![i].prev != null)
                          Padding(
                            padding: const EdgeInsetsDirectional.only(start: 4),
                            child: Text(
                              b.fews![i].value >= b.fews![i].prev! ? '▲' : '▼',
                              style: TextStyle(
                                fontSize: 11,
                                color: b.fews![i].value >= b.fews![i].prev! ? textGreenOn(context) : warnOn(context),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
                SourceLink(b.fewsSource, label: 'FEWS NET — Sudan'),
              ],
            ),
    ),
    if (b.wfpTowns.isNotEmpty) ...[
      SectionTitle(
        'أسعار التجزئة في ${b.wfpTowns.length} مدينة — برنامج الأغذية العالمي',
        subtitle: 'الحبوب واللحوم والسكر والزيت والبصل، كما جمعها البرنامج في عاصمة كلّ ولاية. أحدث شهر: '
            '${arMonth(b.wfpLatest ?? '')}. والتغيّر محسوبٌ من أرقام البرنامج نفسه للشهر السابق والعام الماضي.',
      ),
      for (var i = 0; i < b.wfpTowns.length; i++) _WfpTownTile(town: b.wfpTowns[i], latest: b.wfpLatest ?? '', open: i < 2),
      SourceLink(b.wfpSource, label: 'برنامج الأغذية العالمي — أسعار الغذاء في السودان (HDX)'),
    ],
  ];
}

class _WfpTownTile extends StatelessWidget {
  const _WfpTownTile({required this.town, required this.latest, required this.open});
  final WfpTown town;
  final String latest;
  final bool open;

  @override
  Widget build(BuildContext context) {
    final when = town.latest.compareTo(latest) < 0 ? 'آخر رقم: ${arMonth(town.latest)}' : arMonth(town.latest);
    return PanelCard(
      padding: EdgeInsets.zero,
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          initiallyExpanded: open,
          title: Text('${town.name}${town.place == null ? '' : ' (${town.place})'}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
          subtitle: _muted(context, when, size: 12),
          childrenPadding: const EdgeInsets.fromLTRB(14, 0, 14, 10),
          children: [
            for (final it in town.items)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      flex: 5,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('${it.name} / ${it.unit}', style: const TextStyle(fontSize: 12.5)),
                          if (it.month.compareTo(town.latest) < 0) _muted(context, '(${arMonth(it.month)})', size: 11),
                          if (it.unusual != null && it.median != null)
                            Text(
                              it.unusual == 'low'
                                  ? 'أقلّ بكثير من وسط المدن (${money(it.median!)}) — تحقّق منه'
                                  : 'أعلى بكثير من وسط المدن (${money(it.median!)}) — تحقّق منه',
                              style: TextStyle(fontSize: 11, color: warnOn(context), fontWeight: FontWeight.w600),
                            ),
                        ],
                      ),
                    ),
                    Expanded(flex: 3, child: Text(money(it.price), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13))),
                    Expanded(flex: 2, child: _pct(context, it.vsMonthPct)),
                    Expanded(flex: 2, child: _pct(context, it.vsYearPct)),
                  ],
                ),
              ),
            Align(alignment: AlignmentDirectional.centerStart, child: _muted(context, 'العمودان الأخيران: عن الشهر السابق · عن العام الماضي', size: 11)),
          ],
        ),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// العملات — /rates
// ═══════════════════════════════════════════════════════════════════════════

class _RatesBody extends StatefulWidget {
  const _RatesBody({required this.board});
  final RatesBoard board;

  @override
  State<_RatesBody> createState() => _RatesBodyState();
}

class _RatesBodyState extends State<_RatesBody> {
  final _amount = TextEditingController(text: '100');
  String _code = 'USD';

  @override
  void dispose() {
    _amount.dispose();
    super.dispose();
  }

  Widget _quote(String title, Quote q) => PanelCard(
        child: Column(
          children: [
            _muted(context, title, size: 13),
            const SizedBox(height: 4),
            Text.rich(
              TextSpan(children: [
                TextSpan(text: money(q.sell, digits: 2), style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w900)),
                const TextSpan(text: ' جنيه للدولار', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
              ]),
              textAlign: TextAlign.center,
            ),
            _muted(context, 'شراء ${money(q.buy, digits: 2)} · بيع ${money(q.sell, digits: 2)}', size: 12),
            const SizedBox(height: 6),
            Text(
              q.freshness,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 12,
                fontWeight: q.stale ? FontWeight.w800 : FontWeight.w400,
                color: q.stale ? warnOn(context) : mutedOn(context),
              ),
            ),
            SourceLink(q.source),
          ],
        ),
      );

  @override
  Widget build(BuildContext context) {
    final b = widget.board;
    final rows = b.table;
    final chosen = rows.where((r) => r.code == _code).firstOrNull ?? rows.firstOrNull;
    final amount = double.tryParse(_amount.text.replaceAll(',', '').trim()) ?? 0;
    final converted = chosen == null ? null : convert(amount, chosen);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const BoardHero(
          icon: Icons.currency_exchange_rounded,
          title: 'أسعار العملات مقابل الجنيه السوداني',
          text: 'سعران للجنيه، لأنّ الفرق بينهما كبير: سعر بنك الخرطوم، وسعر السوق الموازي. كلٌّ بتاريخه ومصدره.',
        ),
        const SizedBox(height: 14),
        if (b.bank == null || b.parallel == null)
          const StateView(icon: Icons.cloud_off_rounded, title: 'تعذّرت قراءة الأسعار الآن.', warn: true, compact: true)
        else ...[
          _quote('سعر البنك — ${b.bank!.name ?? 'بنك الخرطوم'}', b.bank!),
          const SizedBox(height: 12),
          _quote('السوق الموازي', b.parallel!),
          const SizedBox(height: 14),
          PanelCard(
            padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
            child: Column(
              children: [
                Row(children: [
                  Expanded(flex: 4, child: _muted(context, 'العملة')),
                  Expanded(flex: 3, child: _muted(context, 'بسعر بنك الخرطوم')),
                  Expanded(flex: 3, child: _muted(context, 'بالسوق الموازي')),
                ]),
                for (final r in rows) ...[
                  Divider(height: 14, color: Theme.of(context).colorScheme.outline),
                  Row(children: [
                    Expanded(flex: 4, child: Text('${r.name} (${r.code})', style: const TextStyle(fontSize: 13))),
                    Expanded(flex: 3, child: Text(money(r.bank ?? 0, digits: 2), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13))),
                    Expanded(flex: 3, child: Text(money(r.parallel ?? 0, digits: 2), style: const TextStyle(fontSize: 13))),
                  ]),
                ],
              ],
            ),
          ),
          const SizedBox(height: 14),
          const SectionTitle('محوّل العملات'),
          PanelCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(children: [
                  Expanded(
                    child: TextField(
                      key: const Key('fx-amount'),
                      controller: _amount,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      textDirection: TextDirection.ltr,
                      decoration: const InputDecoration(labelText: 'المبلغ'),
                      onChanged: (_) => setState(() {}),
                    ),
                  ),
                  const SizedBox(width: 10),
                  DropdownButton<String>(
                    value: chosen?.code,
                    items: [for (final r in rows) DropdownMenuItem(value: r.code, child: Text(r.name))],
                    onChanged: (v) => setState(() => _code = v ?? _code),
                  ),
                ]),
                const SizedBox(height: 10),
                if (converted != null) ...[
                  _bold('بسعر بنك الخرطوم: ${money(converted.bank ?? 0, digits: 2)} جنيه', size: 14),
                  const SizedBox(height: 2),
                  Text('بالسوق الموازي: ${money(converted.parallel ?? 0, digits: 2)} جنيه', style: const TextStyle(fontSize: 14)),
                ],
              ],
            ),
          ),
        ],
        const SizedBox(height: 14),
        const SectionTitle('من أين تأتي الأسعار'),
        _muted(
          context,
          'نشرة بنك السودان المركزي على موقعه متوقّفة منذ ${arDay(b.cbosLastBulletin ?? '')}، وفي ${arDay(b.cbosLiberalised ?? '')} حرّر '
          'البنك سعر الصرف وترك لكلّ مصرف أن يعلن سعره (المنشور ${b.cbosCircular ?? ''}). لذلك نعرض سعر بنك الخرطوم، أكبر المصارف، '
          'وسعر السوق الموازي، ونحدّثهما بعد مراجعة كلّ رقمٍ، من مصادر منشورة نذكرها بجانب كلّ رقم. ولا نعرض رقماً قديماً على أنّه سعر اليوم.',
        ),
        SourceLink(b.cbosSource ?? '', label: 'خبر التحرير'),
        const SizedBox(height: 6),
        _muted(context, 'أسعار العملات الأخرى مقابل الدولار (الريال والدرهم واليورو…) من خدمة ExchangeRate-API المفتوحة.'),
        SourceLink(b.crossSource ?? '', label: 'Rates By Exchange Rate API'),
      ],
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// المدخلات والوقود — /market/inputs
// ═══════════════════════════════════════════════════════════════════════════

List<Widget> _inputsTab(BuildContext context, InputsBoard b) {
  return [
    const BoardHero(
      icon: Icons.local_gas_station_rounded,
      title: 'أين السماد والجازولين هذا الأسبوع وبكم',
      text: 'لا جهةَ تنشر سعرَ اليوريا أو الجازولين في السودان كلَّ أسبوع. لذلك يأتي سعرُ هذا الأسبوع من الناس: مزارعٌ أو '
          'تاجرٌ يقول بكم اشترى وأين ومتى، أو أنّه لم يجده. وتحته الموردون الموثّقون، ثمّ آخر ما نشرته المصادر بتاريخه.',
    ),
    Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        FilledButton.icon(
          onPressed: () => openSite(context, '/market/inputs/report'),
          icon: const Icon(Icons.campaign_outlined, size: 20),
          label: const Text('بلّغ عن سعر'),
        ),
        OutlinedButton(onPressed: () => openSite(context, '/suppliers?item=fertilizer'), child: const Text('موردو السماد')),
      ],
    ),
    SectionTitle(
      'بلاغات آخر ${b.windowDays} يوماً',
      subtitle: 'من مزارعين وتجّار مسجّلين. المنصّة لم تتحقّق منها؛ لذلك نكتب عدد البلاغات وعدد من أرسلوها، والأدنى والأعلى '
          'والوسيط. لا نُظهر اسم من بلّغ.',
    ),
    if (b.pending)
      PanelCard(child: _muted(context, 'البلاغات تُفعَّل قريباً.'))
    else if (b.groups.isEmpty)
      PanelCard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          _bold('لا بلاغ بعد في آخر أسبوعين.', size: 14),
          const SizedBox(height: 4),
          _muted(context, 'كن الأوّل: إن اشتريت يوريا أو جازولين هذا الأسبوع، أو بحثت ولم تجد، فبلاغك يفيد كلّ من في ولايتك.'),
        ]),
      )
    else ...[
      for (final g in b.groups)
        PanelCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _bold(g.name, size: 16),
              for (final r in g.rows) ...[
                Divider(height: 20, color: Theme.of(context).colorScheme.outline),
                Row(children: [
                  Expanded(child: Text('${r.state}${r.kind == null ? '' : ' · ${r.kind}'}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5))),
                  TagPill(r.verdictLabel, gold: r.verdict != 'available'),
                ]),
                const SizedBox(height: 4),
                if (r.median != null)
                  Text.rich(TextSpan(children: [
                    TextSpan(text: '${money(r.median!)} جنيه', style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w900)),
                    TextSpan(
                      text: ' ${r.perUnit}${r.low != null && r.high != null ? ' · الوسيط؛ من ${money(r.low!)} إلى ${money(r.high!)}' : ''}',
                      style: TextStyle(fontSize: 12, color: mutedOn(context)),
                    ),
                  ]))
                else
                  _muted(context, 'لا سعر: كلّ البلاغات تقول إنّه غير موجود.', size: 12),
                _muted(context, r.countLine, size: 11.5),
              ],
            ],
          ),
        ),
      if (b.reports.isNotEmpty)
        PanelCard(
          padding: EdgeInsets.zero,
          child: Theme(
            data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
            child: ExpansionTile(
              title: _bold('كلّ البلاغات (${b.reports.length})', size: 14),
              childrenPadding: const EdgeInsets.fromLTRB(14, 0, 14, 12),
              children: [
                for (final r in b.reports)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('${r.item} — ${r.state}، ${r.locality}${r.kind == null ? '' : ' · ${r.kind}'}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5)),
                        Text(
                          r.price != null
                              ? '${money(r.price!)} جنيه ${r.perUnit}${r.availability == 'limited' ? ' · ${r.availabilityLabel}' : ''} · ${arDay(r.observedOn)}'
                              : '${r.availabilityLabel} · ${arDay(r.observedOn)}',
                          style: TextStyle(fontSize: 12, color: r.price == null ? warnOn(context) : null),
                        ),
                        if (r.note != null) _muted(context, '«${r.note}»', size: 11.5),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        ),
    ],
    const SectionTitle('موردو السماد الموثّقون في سوداقري'),
    Wrap(spacing: 8, runSpacing: 8, children: [
      for (final s in b.suppliers) TagPill('${s.name}: ${s.count} مورّد', icon: Icons.verified_outlined),
    ]),
    _muted(context, 'الموردون يعرضون السعر بالدولار، ويوصلون إلى الولايات التي يذكرونها.'),
    const SectionTitle(
      'آخر ما نشرته المصادر',
      subtitle: 'منسوخةٌ باليد من مصدرها، كلّ رقمٍ بتاريخ نشره. هي أقدم من البلاغات، فاجعلها مرجعاً لا سعرَ اليوم.',
    ),
    if (b.figures == null)
      _muted(context, 'تعذّرت قراءة ملفّ المصادر.')
    else ...[
      for (final f in b.figures!)
        PanelCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('${f.item} — ${f.place}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
              Text.rich(TextSpan(children: [
                TextSpan(text: '${money(f.price)} جنيه', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
                TextSpan(text: ' ${f.perUnit}', style: TextStyle(fontSize: 12, color: mutedOn(context))),
              ])),
              if (f.note != null) _muted(context, f.note!, size: 12),
              Text(
                f.freshness,
                style: TextStyle(fontSize: 12, fontWeight: f.old ? FontWeight.w800 : FontWeight.w400, color: f.old ? warnOn(context) : mutedOn(context)),
              ),
              SourceLink(f.url, label: f.source),
            ],
          ),
        ),
      if (b.trends.isNotEmpty) ...[
        const SectionTitle('الاتّجاه الشهريّ'),
        for (final t in b.trends)
          PanelCard(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(t.text, style: const TextStyle(fontSize: 13, height: 1.8)),
              const SizedBox(height: 4),
              Row(children: [_muted(context, arMonth(t.month), size: 12), const SizedBox(width: 8), Flexible(child: SourceLink(t.url, label: t.source))]),
            ]),
          ),
        if (b.trends.length > 1)
          _muted(
            context,
            'المصدران يختلفان في اتّجاه وقود السوق الموازي في أغسطس: برنامج الأغذية يقول انخفض عن يوليو، والمعهد يقول واصل '
            'الارتفاع. بلاغاتُ الناس أعلاه أقربُ إلى سعر هذا الأسبوع من الاثنين.',
          ),
      ],
    ],
    PanelCard(
      child: _muted(
        context,
        'لماذا لا نقرأ هذا من FEWS NET كما نقرأ أسعار الذرة؟ لأنّه لا سلسلةَ عنده للسماد في السودان، وسلاسل الجازولين عنده بلا '
        'قيمةٍ منذ ٢٠٢٤ («لم يُجمع»). تحقّقنا من ذلك في ٢١ أكتوبر ٢٠٢٦.',
      ),
    ),
  ];
}

// ═══════════════════════════════════════════════════════════════════════════
// تنبيهاتي — /market/alerts
// ═══════════════════════════════════════════════════════════════════════════

class _AlertsTab extends StatelessWidget {
  const _AlertsTab({required this.client, this.preselect});
  final PricesClient client;
  final String? preselect;

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<Session?>(
      valueListenable: accountController,
      builder: (context, session, _) {
        if (session == null) {
          return const StateView(
            key: Key('alerts-signed-out'),
            icon: Icons.lock_outline_rounded,
            title: 'ادخل إلى حسابك لتضع تنبيهاً',
            message: 'التنبيهات لصاحبها وحده. ادخل من «حسابي» ثمّ عُد إلى هنا: ضع حدّاً لسعر محصولٍ أو للدولار، فيصلك '
                'إشعارٌ مرّةً واحدة حين يتجاوزه آخر سعرٍ منشور.',
            scrollable: true,
          );
        }
        return BoardView<AlertsBoard>(
          key: ValueKey('alerts-${session.accessToken.hashCode}'),
          load: client.alerts,
          build: (context, b, reload) => [
            const BoardHero(
              icon: Icons.notifications_active_outlined,
              title: 'نبّهني حين يتغيّر السعر',
              text: 'ضع حدّاً لسعر محصولٍ أو للدولار. حين يتجاوزه آخر سعرٍ منشور يصلك إشعارٌ مرّةً واحدة. الأسعار تُنشر حين '
                  'تصدر نشراتها، فقد يتأخّر التنبيه عن السوق نفسه.',
            ),
            PanelCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _bold('تنبيهٌ جديد'),
                  const SizedBox(height: 8),
                  if (b.full)
                    Text(
                      'عندك ${b.maxActive} تنبيهات شغّالة، وهذا الحدّ الأقصى. أوقف واحداً لتضيف غيره.',
                      style: TextStyle(color: warnOn(context), fontSize: 13, height: 1.7),
                    )
                  else if (b.options.isEmpty)
                    _muted(context, 'لا أسعار منشورة الآن لنتابعها.')
                  else
                    AlertForm(options: b.options, preselect: preselect, client: client, onSaved: reload),
                ],
              ),
            ),
            PanelCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _bold('تنبيهاتك الشغّالة'),
                  if (b.running.isEmpty) ...[const SizedBox(height: 6), _muted(context, 'لا تنبيهات شغّالة.')],
                  for (final a in b.running) ...[
                    Divider(height: 18, color: Theme.of(context).colorScheme.outline),
                    Row(children: [
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(a.text, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5, height: 1.5)),
                          if (a.createdAt != null) _muted(context, 'أُضيف ${arDay(a.createdAt!.toIso8601String())}', size: 11.5),
                        ]),
                      ),
                      OutlinedButton(onPressed: () => _stop(context, a, reload), child: const Text('أوقف')),
                    ]),
                  ],
                ],
              ),
            ),
            if (b.settled.isNotEmpty)
              PanelCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _bold('ما انتهى'),
                    for (final a in b.settled) ...[
                      Divider(height: 18, color: Theme.of(context).colorScheme.outline),
                      Text(a.text, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5, height: 1.5)),
                      _muted(context, a.outcome, size: 11.5),
                    ],
                  ],
                ),
              ),
          ],
        );
      },
    );
  }

  Future<void> _stop(BuildContext context, AlertEntry a, VoidCallback reload) async {
    final messenger = ScaffoldMessenger.of(context);
    final yes = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('أوقف هذا التنبيه؟'),
        content: Text('${a.text}\n\nلا يُحذف؛ يبقى مسجَّلاً موقوفاً تحت «ما انتهى».'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('لا')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('أوقفه')),
        ],
      ),
    );
    if (yes != true) return;
    try {
      final msg = await client.stopAlert(a.id);
      messenger.showSnackBar(SnackBar(content: Text(msg)));
      reload();
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    }
  }
}

/// «نبّهني» (البند ١٦٦): the price to follow, above or below, and the limit in pounds — the website's form.
class AlertForm extends StatefulWidget {
  const AlertForm({super.key, required this.options, required this.client, required this.onSaved, this.preselect});
  final List<AlertOption> options;
  final PricesClient client;
  final VoidCallback onSaved;
  final String? preselect;

  @override
  State<AlertForm> createState() => _AlertFormState();
}

class _AlertFormState extends State<AlertForm> {
  late String _subject = _initial();
  String _direction = 'above';
  final _threshold = TextEditingController();
  String? _message;
  bool _ok = false;
  bool _saving = false;

  String _initial() =>
      widget.options.any((o) => o.value == widget.preselect) ? widget.preselect! : widget.options.first.value;

  @override
  void didUpdateWidget(AlertForm old) {
    super.didUpdateWidget(old);
    if (widget.preselect != old.preselect && widget.options.any((o) => o.value == widget.preselect)) {
      setState(() => _subject = widget.preselect!);
    }
  }

  @override
  void dispose() {
    _threshold.dispose();
    super.dispose();
  }

  AlertOption? get _chosen => widget.options.where((o) => o.value == _subject).firstOrNull;

  Future<void> _save() async {
    final problem = alertFormProblem(option: _chosen, direction: _direction, threshold: _threshold.text);
    if (problem != null) {
      setState(() {
        _message = problem;
        _ok = false;
      });
      return;
    }
    setState(() => _saving = true);
    try {
      final msg = await widget.client.addAlert(subject: _subject, direction: _direction, threshold: _threshold.text);
      if (!mounted) return;
      setState(() {
        _message = msg;
        _ok = true;
        _threshold.clear();
      });
      widget.onSaved();
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _message = e.message;
          _ok = false;
        });
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final chosen = _chosen;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        DropdownButtonFormField<String>(
          key: const Key('alert-subject'),
          initialValue: _subject,
          isExpanded: true,
          decoration: const InputDecoration(labelText: 'أيّ سعر تتابع؟'),
          items: [for (final o in widget.options) DropdownMenuItem(value: o.value, child: Text(o.label, overflow: TextOverflow.ellipsis))],
          onChanged: (v) => setState(() => _subject = v ?? _subject),
        ),
        if (chosen != null) ...[
          const SizedBox(height: 6),
          _muted(context, 'آخر سعرٍ منشور: ${money(chosen.price)} ${chosen.unit} · ${arDay(chosen.date)}'),
        ],
        const SizedBox(height: 12),
        _muted(context, 'نبّهني حين يصير السعر…', size: 13),
        const SizedBox(height: 6),
        SegmentedButton<String>(
          key: const Key('alert-direction'),
          segments: const [
            ButtonSegment(value: 'above', label: Text('فوق الحدّ'), icon: Icon(Icons.north_rounded)),
            ButtonSegment(value: 'below', label: Text('تحت الحدّ'), icon: Icon(Icons.south_rounded)),
          ],
          selected: {_direction},
          onSelectionChanged: (s) => setState(() => _direction = s.first),
        ),
        const SizedBox(height: 12),
        TextField(
          key: const Key('alert-threshold'),
          controller: _threshold,
          keyboardType: TextInputType.number,
          textDirection: TextDirection.ltr,
          decoration: const InputDecoration(labelText: 'الحدّ (بالجنيه)', hintText: '600000'),
        ),
        if (_message != null) ...[
          const SizedBox(height: 10),
          Text(
            _message!,
            key: const Key('alert-message'),
            style: TextStyle(color: _ok ? textGreenOn(context) : warnOn(context), fontSize: 13, height: 1.7, fontWeight: FontWeight.w600),
          ),
        ],
        const SizedBox(height: 12),
        FilledButton(
          key: const Key('alert-submit'),
          onPressed: _saving ? null : _save,
          child: Text(_saving ? 'جارٍ الحفظ…' : 'أضف التنبيه'),
        ),
      ],
    );
  }
}
