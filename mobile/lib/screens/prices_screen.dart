import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../account.dart';
import '../api.dart';
import '../i18n.dart';
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
        title: Text(tr('الأسعار والسوق', 'Prices and market')),
        bottom: TabBar(
          controller: _tabs,
          isScrollable: true,
          tabAlignment: TabAlignment.start,
          tabs: [
            Tab(text: tr('المحاصيل', 'Crops')),
            Tab(text: tr('العملات', 'Currencies')),
            Tab(text: tr('المدخلات والوقود', 'Inputs and fuel')),
            Tab(text: tr('تنبيهاتي', 'My alerts')),
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
  if (!ok) messenger.showSnackBar(SnackBar(content: Text(tr('تعذّر فتح الرابط.', 'Could not open the link.'))));
}

/// A page of the website, for what is still done there.
Future<void> openSite(BuildContext context, String path) =>
    openLink(context, ApiConfig.siteUrl.isEmpty ? '' : '${ApiConfig.siteUrl}$path');

/// A source link: small, green, with the open-outside icon.
class SourceLink extends StatelessWidget {
  const SourceLink(this.url, {super.key, this.label});
  final String url;

  /// «المصدر» when none is given.
  final String? label;

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
                label ?? tr('المصدر', 'Source'),
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
            return StateView.error(e is ApiException ? e.message : tr('تعذّر تحميل البيانات.', 'Could not load the data.'), onRetry: _reload, scrollable: true);
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
    BoardHero(
      icon: Icons.storefront_rounded,
      title: tr('سوق المحاصيل اليوم', 'Crop market today'),
      text: tr('آخر ما نُشر من أسعار بورصتي القضارف والأبيض: بالوحدة التي يُباع بها المحصول هناك، بالجنيه وبما يقابله '
          'بالدولار، مع الوارد والتغيّر وتاريخ كلّ رقمٍ ومصدره.', 'The latest published prices from the Gedaref and El Obeid bourses: in the unit the crop is sold in there, in pounds and their equivalent in dollars, with arrivals, the change, and each figure\'s date and source.'),
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
              Expanded(child: _bold(tr('بعض الأسعار لم تتجدّد في موعدها', 'Some prices were not renewed on time'))),
            ]),
            const SizedBox(height: 6),
            for (final l in b.staleLines) Text('• $l', style: TextStyle(color: warnOn(context), fontSize: 12.5, height: 1.7)),
            const SizedBox(height: 4),
            _muted(context, tr('القراءة اليوميّة لم تجد رقماً أحدث خلال مهلتها. نعرض آخر رقمٍ موثّق بتاريخه، فتحقّق قبل أن تعتمد عليه.', 'The daily reading found no newer figure within its window. We show the last documented figure with its date, so check before you rely on it.')),
          ],
        ),
      ),
    IntroNote(
      tr('البورصتان لا تنشران نشرةً على الإنترنت؛ تصل أرقامهما في أخبار وكالة السودان للأنباء (سونا) والصحف، وأحياناً تغيب '
      'أسابيع. لذلك نكتب تاريخ كلّ رقم، ونعلّمه بالذهبيّ الداكن إذا مضى عليه أكثر من ثلاثة أيام. لا نقدّر رقماً لم نجده.', 'The two bourses publish no bulletin online; their figures come in news from the Sudan News Agency (SUNA) and the papers, and are sometimes missing for weeks. So we write each figure\'s date, and mark it in dark gold when it is more than three days old. We do not estimate a figure we did not find.'),
    ),
    if (b.quiet) _quietNotice(context, b),
    if (b.quiet) ...monthly,
    if (b.quiet) SectionTitle(tr('آخر أرقام البورصتين', 'The bourses\' last figures')),
    if (b.crops.isEmpty)
      StateView(icon: Icons.cloud_off_rounded, title: tr('تعذّرت قراءة الأسعار الآن.', 'The rates could not be read just now.'), warn: true, compact: true)
    else
      for (final c in b.crops) _CropCardView(card: c, onAlert: onAlert),
    if (!b.quiet) ...monthly,
    PanelCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _bold(tr('نبّهني حين يتغيّر السعر', 'Tell me when the price moves')),
          const SizedBox(height: 4),
          _muted(context, tr('ضع حدّاً لسعر محصولٍ أو للدولار، فيصلك إشعارٌ حين يتجاوزه آخر سعرٍ منشور.', 'Set a limit on a crop or on the dollar and get a notification when the latest published price passes it.')),
          const SizedBox(height: 10),
          FilledButton.icon(
            onPressed: () => onAlert(null),
            icon: const Icon(Icons.notifications_active_outlined, size: 20),
            label: Text(tr('ضع تنبيهاً', 'Set an alert')),
          ),
        ],
      ),
    ),
    PanelCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _bold(tr('ما بعد الأسعار: إيصالات المخازن', 'Beyond prices: warehouse receipts')),
          const SizedBox(height: 4),
          _muted(
            context,
            tr('السعر وحده لا يحمي المزارع الذي يبيع ساعة الحصاد بأدنى سعر لأنه يحتاج النقد. الخطوة التالية التي ندرسها: أن '
            'يودع محصوله مخزناً معتمداً ويأخذ إيصالاً يُرهن أو يُباع في بورصة الولاية للسلع، فيبيع حين يشاء لا حين يُضطرّ.', 'A price alone does not protect the farmer who sells at harvest time at the lowest price because they need cash. The next step we are studying: depositing the crop in an approved warehouse for a receipt that can be pledged or sold on the state\'s commodity exchange, so they sell when they choose, not when forced to.'),
          ),
        ],
      ),
    ),
    Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionTitle(tr('الوحدات', 'Units')),
        _muted(context, b.unitsNote),
        const SizedBox(height: 4),
        _muted(
          context,
          b.usdSell != null
              ? tr('الدولار بسعر ${b.usdBank ?? 'بنك الخرطوم'} اليوم (${money(b.usdSell!, digits: 2)} جنيه، بتاريخ ${arDay(b.usdDate ?? '')}) — '
                  'لا بسعر يوم الرقم نفسه؛ فهو للمقارنة لا للمحاسبة.', 'Dollars at today\'s ${b.usdBank ?? 'Bank of Khartoum'} rate (${money(b.usdSell!, digits: 2)} pounds, dated ${arDay(b.usdDate ?? '')}) — not at the rate of the figure\'s own day; it is for comparison, not accounting.')
              : tr('تعذّرت قراءة سعر الصرف، فلا يظهر الدولار.', 'The exchange rate could not be read, so dollars are not shown.'),
        ),
      ],
    ),
  ];
}

Widget _quietNotice(BuildContext context, MarketBoard b) {
  final bulletins = b.lastBulletins.map((x) => tr('آخر رقمٍ منشور من ${x.market}: ${arDay(x.date)}', 'The last figure published from ${x.market}: ${arDay(x.date)}')).join(tr('، و', ', and '));
  final checked = b.checked == null ? '' : tr('بحثنا عن أحدث منها آخر مرّة في ${arDay(b.checked!)} فلم نجد: ', 'We last looked for a newer one on ${arDay(b.checked!)} and found none:');
  final w = b.wfpMonthly;
  String pct(double n) => '${n > 0 ? '+' : ''}${money(n)}%';
  return PanelCard(
    key: const Key('quiet-bourses'),
    gold: true,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _bold(tr('لماذا آخر أسعار البورصة قديمة؟', 'Why are the latest bourse prices old?')),
        const SizedBox(height: 6),
        Text(
          tr('$bulletins. $checkedلم تُنشر للبورصتين نشرةٌ بعدها في الأخبار التي نقرؤها. نضيفها يوم تظهر، وحتى ذلك الحين هذه '
          'أحدث الأرقام الموثّقة، شهريّةً من برنامج الأغذية العالمي.', '$bulletins. ${checked}No bulletin for the two bourses has been published since in the news we read. We add it the day it appears; until then these are the latest documented figures, monthly from the World Food Programme.'),
          style: TextStyle(fontSize: 13, height: 1.8, color: inkOn(context)),
        ),
        if (w != null) ...[
          const SizedBox(height: 10),
          PanelCard(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _bold(tr('أحدث رقمٍ موثّق: ${arMonth(w.month)}، من برنامج الأغذية العالمي', 'The latest documented figure: ${arMonth(w.month)}, from the World Food Programme'), size: 13.5),
                const SizedBox(height: 6),
                Text(
                  tr('• سوق مزاد الذرة بالقضارف: وصله ${money(w.arrivalsTonnes)} طنّاً (${pct(w.arrivalsVsLastMonthPct)} عن الشهر السابق)، '
                  'وتغيّر متوسّط سعر الذرة فيه ${pct(w.priceVsLastMonthPct)} عن الشهر السابق و${pct(w.priceVsLastYearPct)} عن '
                  'الشهر نفسه من العام الماضي.\n'
                  '• الذرة بالتجزئة في شمال كردفان (الأبيض): ${money(w.kordofanPrice)} جنيه للكيلو، وكانت ${money(w.kordofanLastMonth)} في الشهر السابق.\n'
                  '• متوسّط الذرة بالتجزئة في السودان: ${money(w.nationalPrice)} جنيه للكيلو، وكان ${money(w.nationalLastMonth)} في الشهر السابق.', '• Gedaref sorghum auction market: ${money(w.arrivalsTonnes)} tonnes arrived (${pct(w.arrivalsVsLastMonthPct)} on the previous month), and the average sorghum price there changed ${pct(w.priceVsLastMonthPct)} on the previous month and ${pct(w.priceVsLastYearPct)} on the same month last year.\n• Retail sorghum in North Kordofan (El Obeid): ${money(w.kordofanPrice)} pounds per kilo, against ${money(w.kordofanLastMonth)} the previous month.\n• Average retail sorghum in Sudan: ${money(w.nationalPrice)} pounds per kilo, against ${money(w.nationalLastMonth)} the previous month.'),
                  style: const TextStyle(fontSize: 12.5, height: 1.8),
                ),
                SourceLink(w.source, label: w.report.isEmpty ? tr('المصدر', 'Source') : w.report),
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
                      TextSpan(text: tr(' جنيه', ' SDG'), style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
                    ]),
                  ),
                  _muted(
                    context,
                    s.usd != null ? tr('${s.perUnit} · ≈ \$${money(s.usd!, digits: 2)} بسعر بنك الخرطوم اليوم', '${s.perUnit} · ≈ \$${money(s.usd!, digits: 2)} at today\'s Bank of Khartoum rate') : s.perUnit,
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
                tr('${up ? '▲' : down ? '▼' : '＝'} ${change > 0 ? '+' : ''}${money(change)} '
                '(${(s.changePct ?? 0) > 0 ? '+' : ''}${money(s.changePct ?? 0, digits: 1)}%) عن الرقم السابق', '${up ? '▲' : down ? '▼' : '＝'} ${change > 0 ? '+' : ''}${money(change)} (${(s.changePct ?? 0) > 0 ? '+' : ''}${money(s.changePct ?? 0, digits: 1)}%) on the previous figure'),
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: up ? textGreenOn(context) : down ? warnOn(context) : mutedOn(context),
                ),
              ),
            if (s.arrivals != null)
              _muted(context, tr('الوارد: ${money(s.arrivals!)} جوال${s.allSorghum ? ' (الذرة كلّها)' : ''}', 'Arrivals: ${money(s.arrivals!)} sacks${s.allSorghum ? ' (all sorghum)' : ''}'), size: 12),
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
              label: Text(tr('نبّهني', 'Alert me')),
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
      label: tr('تاريخ السعر', 'Price date'),
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
    SectionTitle(
      tr('الأسعار الشهرية', 'Monthly prices'),
      subtitle: tr('من شبكة الإنذار المبكر بالمجاعة (FEWS NET): متوسّط شهري لأسعار الذرة والدخن بالتجزئة في مدن السودان، '
          'القضارف والأبيض أولاً. يتأخّر شهراً أو اثنين، وهو مرجعٌ للاتجاه لا سعر بورصة اليوم.', 'From the Famine Early Warning Systems Network (FEWS NET): a monthly average of retail sorghum and millet prices in Sudan\'s towns, Gedaref and El Obeid first. It lags a month or two, and is a reference for the trend, not today\'s bourse price.'),
    ),
    PanelCard(
      padding: const EdgeInsets.fromLTRB(14, 8, 14, 8),
      child: b.fews == null
          ? _muted(context, tr('تعذّر الوصول إلى بيانات FEWS NET الآن.', 'FEWS NET\'s data could not be reached just now.'))
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
        tr('أسعار التجزئة في ${b.wfpTowns.length} مدينة — برنامج الأغذية العالمي', 'Retail prices in ${b.wfpTowns.length} towns — World Food Programme'),
        subtitle: tr('الحبوب واللحوم والسكر والزيت والبصل، كما جمعها البرنامج في عاصمة كلّ ولاية. أحدث شهر: '
            '${arMonth(b.wfpLatest ?? '')}. والتغيّر محسوبٌ من أرقام البرنامج نفسه للشهر السابق والعام الماضي.', 'Grain, meat, sugar, oil and onions, as the programme collected them in each state\'s capital. Latest month: ${arMonth(b.wfpLatest ?? '')}. The change is worked out from the programme\'s own figures for the previous month and last year.'),
      ),
      for (var i = 0; i < b.wfpTowns.length; i++) _WfpTownTile(town: b.wfpTowns[i], latest: b.wfpLatest ?? '', open: i < 2),
      SourceLink(b.wfpSource, label: tr('برنامج الأغذية العالمي — أسعار الغذاء في السودان (HDX)', 'WFP — Sudan food prices (HDX)')),
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
    final when = town.latest.compareTo(latest) < 0 ? tr('آخر رقم: ${arMonth(town.latest)}', 'Last figure: ${arMonth(town.latest)}') : arMonth(town.latest);
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
                                  ? tr('أقلّ بكثير من وسط المدن (${money(it.median!)}) — تحقّق منه', 'Much lower than the towns\' median (${money(it.median!)}) — check it')
                                  : tr('أعلى بكثير من وسط المدن (${money(it.median!)}) — تحقّق منه', 'Much higher than the towns\' median (${money(it.median!)}) — check it'),
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
            Align(alignment: AlignmentDirectional.centerStart, child: _muted(context, tr('العمودان الأخيران: عن الشهر السابق · عن العام الماضي', 'The last two columns: on the previous month · on last year'), size: 11)),
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
                TextSpan(text: tr(' جنيه للدولار', ' SDG per dollar'), style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
              ]),
              textAlign: TextAlign.center,
            ),
            _muted(context, tr('شراء ${money(q.buy, digits: 2)} · بيع ${money(q.sell, digits: 2)}', 'Buy ${money(q.buy, digits: 2)} · Sell ${money(q.sell, digits: 2)}'), size: 12),
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
        BoardHero(
          icon: Icons.currency_exchange_rounded,
          title: tr('أسعار العملات مقابل الجنيه السوداني', 'Exchange rates against the Sudanese pound'),
          text: tr('سعران للجنيه، لأنّ الفرق بينهما كبير: سعر بنك الخرطوم، وسعر السوق الموازي. كلٌّ بتاريخه ومصدره.', 'Two rates for the pound, because the gap between them is large: Bank of Khartoum\'s rate and the parallel-market rate, each with its date and source.'),
        ),
        const SizedBox(height: 14),
        if (b.bank == null || b.parallel == null)
          StateView(icon: Icons.cloud_off_rounded, title: tr('تعذّرت قراءة الأسعار الآن.', 'The rates could not be read just now.'), warn: true, compact: true)
        else ...[
          _quote(tr('سعر البنك — ${b.bank!.name ?? 'بنك الخرطوم'}', 'Bank rate — ${b.bank!.name ?? 'Bank of Khartoum'}'), b.bank!),
          const SizedBox(height: 12),
          _quote(tr('السوق الموازي', 'Parallel market'), b.parallel!),
          const SizedBox(height: 14),
          PanelCard(
            padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
            child: Column(
              children: [
                Row(children: [
                  Expanded(flex: 4, child: _muted(context, tr('العملة', 'Currency'))),
                  Expanded(flex: 3, child: _muted(context, tr('بسعر بنك الخرطوم', 'At Bank of Khartoum'))),
                  Expanded(flex: 3, child: _muted(context, tr('بالسوق الموازي', 'Parallel market'))),
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
          SectionTitle(tr('محوّل العملات', 'Currency converter')),
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
                      decoration: InputDecoration(labelText: tr('المبلغ', 'Amount')),
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
                  _bold(tr('بسعر بنك الخرطوم: ${money(converted.bank ?? 0, digits: 2)} جنيه', 'At Bank of Khartoum: ${money(converted.bank ?? 0, digits: 2)} pounds'), size: 14),
                  const SizedBox(height: 2),
                  Text(tr('بالسوق الموازي: ${money(converted.parallel ?? 0, digits: 2)} جنيه', 'Parallel market: ${money(converted.parallel ?? 0, digits: 2)} pounds'), style: const TextStyle(fontSize: 14)),
                ],
              ],
            ),
          ),
        ],
        const SizedBox(height: 14),
        SectionTitle(tr('من أين تأتي الأسعار', 'Where the rates come from')),
        _muted(
          context,
          tr('نشرة بنك السودان المركزي على موقعه متوقّفة منذ ${arDay(b.cbosLastBulletin ?? '')}، وفي ${arDay(b.cbosLiberalised ?? '')} حرّر '
          'البنك سعر الصرف وترك لكلّ مصرف أن يعلن سعره (المنشور ${b.cbosCircular ?? ''}). لذلك نعرض سعر بنك الخرطوم، أكبر المصارف، '
          'وسعر السوق الموازي، ونحدّثهما بعد مراجعة كلّ رقمٍ، من مصادر منشورة نذكرها بجانب كلّ رقم. ولا نعرض رقماً قديماً على أنّه سعر اليوم.', 'The Central Bank of Sudan\'s bulletin on its website has stopped since ${arDay(b.cbosLastBulletin ?? '')}, and on ${arDay(b.cbosLiberalised ?? '')} the bank liberalised the exchange rate and left each bank to announce its own rate (circular ${b.cbosCircular ?? ''}). So we show the rate of Bank of Khartoum, the largest bank, and the parallel-market rate, and update both after reviewing each figure, from published sources we name beside each figure. We never show an old figure as today\'s rate.'),
        ),
        SourceLink(b.cbosSource ?? '', label: tr('خبر التحرير', 'The liberalisation')),
        const SizedBox(height: 6),
        _muted(context, tr('أسعار العملات الأخرى مقابل الدولار (الريال والدرهم واليورو…) من خدمة ExchangeRate-API المفتوحة.', 'Other currencies against the dollar (riyal, dirham, euro…) come from ExchangeRate-API\'s open service.')),
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
    BoardHero(
      icon: Icons.local_gas_station_rounded,
      title: tr('أين السماد والجازولين هذا الأسبوع وبكم', 'Where fertiliser and diesel are this week, and at what price'),
      text: tr('لا جهةَ تنشر سعرَ اليوريا أو الجازولين في السودان كلَّ أسبوع. لذلك يأتي سعرُ هذا الأسبوع من الناس: مزارعٌ أو '
          'تاجرٌ يقول بكم اشترى وأين ومتى، أو أنّه لم يجده. وتحته الموردون الموثّقون، ثمّ آخر ما نشرته المصادر بتاريخه.', 'No body publishes the price of urea or diesel in Sudan every week. So this week\'s price comes from people: a farmer or trader saying what they paid, where and when, or that they could not find it. Below that are the verified suppliers, then the latest the sources published, with its date.'),
    ),
    Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        FilledButton.icon(
          onPressed: () => openSite(context, '/market/inputs/report'),
          icon: const Icon(Icons.campaign_outlined, size: 20),
          label: Text(tr('بلّغ عن سعر', 'Report a price')),
        ),
        OutlinedButton(onPressed: () => openSite(context, '/suppliers?item=fertilizer'), child: Text(tr('موردو السماد', 'Fertiliser suppliers'))),
      ],
    ),
    SectionTitle(
      tr('بلاغات آخر ${b.windowDays} يوماً', 'Reports from the last ${b.windowDays} days'),
      subtitle: tr('من مزارعين وتجّار مسجّلين. المنصّة لم تتحقّق منها؛ لذلك نكتب عدد البلاغات وعدد من أرسلوها، والأدنى والأعلى '
          'والوسيط. لا نُظهر اسم من بلّغ.', 'From registered farmers and traders. The platform has not checked them, so we write the number of reports and of people who sent them, the lowest, the highest and the median. We never show who reported.'),
    ),
    if (b.pending)
      PanelCard(child: _muted(context, tr('البلاغات تُفعَّل قريباً.', 'Reports open soon.')))
    else if (b.groups.isEmpty)
      PanelCard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          _bold(tr('لا بلاغ بعد في آخر أسبوعين.', 'No reports in the last two weeks yet.'), size: 14),
          const SizedBox(height: 4),
          _muted(context, tr('كن الأوّل: إن اشتريت يوريا أو جازولين هذا الأسبوع، أو بحثت ولم تجد، فبلاغك يفيد كلّ من في ولايتك.', 'Be the first: if you bought urea or diesel this week, or looked and could not find it, your report helps everyone in your state.')),
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
                    TextSpan(text: tr('${money(r.median!)} جنيه', '${money(r.median!)} pounds'), style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w900)),
                    TextSpan(
                      text: tr(' ${r.perUnit}${r.low != null && r.high != null ? ' · الوسيط؛ من ${money(r.low!)} إلى ${money(r.high!)}' : ''}', ' ${r.perUnit}${r.low != null && r.high != null ? ' · the median; from ${money(r.low!)} to ${money(r.high!)}' : ''}'),
                      style: TextStyle(fontSize: 12, color: mutedOn(context)),
                    ),
                  ]))
                else
                  _muted(context, tr('لا سعر: كلّ البلاغات تقول إنّه غير موجود.', 'No price: every report says it could not be found.'), size: 12),
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
              title: _bold(tr('كلّ البلاغات (${b.reports.length})', 'All reports (${b.reports.length})'), size: 14),
              childrenPadding: const EdgeInsets.fromLTRB(14, 0, 14, 12),
              children: [
                for (final r in b.reports)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(tr('${r.item} — ${r.state}، ${r.locality}${r.kind == null ? '' : ' · ${r.kind}'}', '${r.item} — ${r.state}, ${r.locality}${r.kind == null ? '' : ' · ${r.kind}'}'), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5)),
                        Text(
                          r.price != null
                              ? tr('${money(r.price!)} جنيه ${r.perUnit}${r.availability == 'limited' ? ' · ${r.availabilityLabel}' : ''} · ${arDay(r.observedOn)}', '${money(r.price!)} pounds ${r.perUnit}${r.availability == 'limited' ? ' · ${r.availabilityLabel}' : ''} · ${arDay(r.observedOn)}')
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
    SectionTitle(tr('موردو السماد الموثّقون في سوداقري', 'Verified fertiliser suppliers on Sudagri')),
    Wrap(spacing: 8, runSpacing: 8, children: [
      for (final s in b.suppliers) TagPill(tr('${s.name}: ${s.count} مورّد', '${s.name}: ${s.count} suppliers'), icon: Icons.verified_outlined),
    ]),
    _muted(context, tr('الموردون يعرضون السعر بالدولار، ويوصلون إلى الولايات التي يذكرونها.', 'Suppliers list their price in dollars, and deliver to the states they name. ')),
    SectionTitle(
      tr('آخر ما نشرته المصادر', 'The latest published figures'),
      subtitle: tr('منسوخةٌ باليد من مصدرها، كلّ رقمٍ بتاريخ نشره. هي أقدم من البلاغات، فاجعلها مرجعاً لا سعرَ اليوم.', 'Copied by hand from their sources, each figure with the date it was published. They are older than the reports: use them as a reference, not as today\'s price.'),
    ),
    if (b.figures == null)
      _muted(context, tr('تعذّرت قراءة ملفّ المصادر.', 'The sources file could not be read.'))
    else ...[
      for (final f in b.figures!)
        PanelCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('${f.item} — ${f.place}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
              Text.rich(TextSpan(children: [
                TextSpan(text: tr('${money(f.price)} جنيه', '${money(f.price)} pounds'), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
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
        SectionTitle(tr('الاتّجاه الشهريّ', 'The monthly trend')),
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
            tr('المصدران يختلفان في اتّجاه وقود السوق الموازي في أغسطس: برنامج الأغذية يقول انخفض عن يوليو، والمعهد يقول واصل '
            'الارتفاع. بلاغاتُ الناس أعلاه أقربُ إلى سعر هذا الأسبوع من الاثنين.', 'The two sources disagree on the direction of parallel-market fuel in August: the food programme says it fell from July, and the institute says it kept rising. People\'s reports above are closer to this week\'s price than either.'),
          ),
      ],
    ],
    PanelCard(
      child: _muted(
        context,
        tr('لماذا لا نقرأ هذا من FEWS NET كما نقرأ أسعار الذرة؟ لأنّه لا سلسلةَ عنده للسماد في السودان، وسلاسل الجازولين عنده بلا '
        'قيمةٍ منذ ٢٠٢٤ («لم يُجمع»). تحقّقنا من ذلك في ٢١ أكتوبر ٢٠٢٦.', 'Why don\'t we read this from FEWS NET as we read sorghum prices? Because it has no series for fertiliser in Sudan, and its diesel series have had no value since 2024 («not collected»). We checked this on 21 October 2026.'),
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
          return StateView(
            key: Key('alerts-signed-out'),
            icon: Icons.lock_outline_rounded,
            title: tr('ادخل إلى حسابك لتضع تنبيهاً', 'Sign in to your account to set an alert'),
            message: tr('التنبيهات لصاحبها وحده. ادخل من «حسابي» ثمّ عُد إلى هنا: ضع حدّاً لسعر محصولٍ أو للدولار، فيصلك '
                'إشعارٌ مرّةً واحدة حين يتجاوزه آخر سعرٍ منشور.', 'Alerts belong to their owner alone. Sign in from «My account», then come back here: set a limit on a crop\'s price or the dollar, and get a notification once when the latest published price passes it.'),
            scrollable: true,
          );
        }
        return BoardView<AlertsBoard>(
          key: ValueKey('alerts-${session.accessToken.hashCode}'),
          load: client.alerts,
          build: (context, b, reload) => [
            BoardHero(
              icon: Icons.notifications_active_outlined,
              title: tr('نبّهني حين يتغيّر السعر', 'Tell me when the price moves'),
              text: tr('ضع حدّاً لسعر محصولٍ أو للدولار. حين يتجاوزه آخر سعرٍ منشور يصلك إشعارٌ مرّةً واحدة. الأسعار تُنشر حين '
                  'تصدر نشراتها، فقد يتأخّر التنبيه عن السوق نفسه.', 'Set a limit on a crop\'s price or the dollar. When the latest published price passes it you get a notification once. Prices are published when their bulletins come out, so the alert may lag the market itself.'),
            ),
            PanelCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _bold(tr('تنبيهٌ جديد', 'A new alert')),
                  const SizedBox(height: 8),
                  if (b.full)
                    Text(
                      tr('عندك ${b.maxActive} تنبيهات شغّالة، وهذا الحدّ الأقصى. أوقف واحداً لتضيف غيره.', 'You have ${b.maxActive} running alerts, and that is the limit. Stop one to add another.'),
                      style: TextStyle(color: warnOn(context), fontSize: 13, height: 1.7),
                    )
                  else if (b.options.isEmpty)
                    _muted(context, tr('لا أسعار منشورة الآن لنتابعها.', 'There are no published prices to follow right now.'))
                  else
                    AlertForm(options: b.options, preselect: preselect, client: client, onSaved: reload),
                ],
              ),
            ),
            PanelCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _bold(tr('تنبيهاتك الشغّالة', 'Your running alerts')),
                  if (b.running.isEmpty) ...[const SizedBox(height: 6), _muted(context, tr('لا تنبيهات شغّالة.', 'No running alerts.'))],
                  for (final a in b.running) ...[
                    Divider(height: 18, color: Theme.of(context).colorScheme.outline),
                    Row(children: [
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(a.text, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5, height: 1.5)),
                          if (a.createdAt != null) _muted(context, tr('أُضيف ${arDay(a.createdAt!.toIso8601String())}', 'Added ${arDay(a.createdAt!.toIso8601String())}'), size: 11.5),
                        ]),
                      ),
                      OutlinedButton(onPressed: () => _stop(context, a, reload), child: Text(tr('أوقف', 'Stop'))),
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
                    _bold(tr('ما انتهى', 'Finished')),
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
        title: Text(tr('أوقف هذا التنبيه؟', 'Stop this alert?')),
        content: Text(tr('${a.text}\n\nلا يُحذف؛ يبقى مسجَّلاً موقوفاً تحت «ما انتهى».', '${a.text}\n\nIt is not deleted; it stays recorded as stopped under «Finished».')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: Text(tr('لا', 'No'))),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: Text(tr('أوقفه', 'Stop it'))),
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
          decoration: InputDecoration(labelText: tr('أيّ سعر تتابع؟', 'Which price?')),
          items: [for (final o in widget.options) DropdownMenuItem(value: o.value, child: Text(o.label, overflow: TextOverflow.ellipsis))],
          onChanged: (v) => setState(() => _subject = v ?? _subject),
        ),
        if (chosen != null) ...[
          const SizedBox(height: 6),
          _muted(context, tr('آخر سعرٍ منشور: ${money(chosen.price)} ${chosen.unit} · ${arDay(chosen.date)}', 'The latest published price: ${money(chosen.price)} ${chosen.unit} · ${arDay(chosen.date)}')),
        ],
        const SizedBox(height: 12),
        _muted(context, tr('نبّهني حين يصير السعر…', 'Tell me when the price goes…'), size: 13),
        const SizedBox(height: 6),
        SegmentedButton<String>(
          key: const Key('alert-direction'),
          segments: [
            ButtonSegment(value: 'above', label: Text(tr('فوق الحدّ', 'above the limit')), icon: Icon(Icons.north_rounded)),
            ButtonSegment(value: 'below', label: Text(tr('تحت الحدّ', 'below the limit')), icon: Icon(Icons.south_rounded)),
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
          decoration: InputDecoration(labelText: tr('الحدّ (بالجنيه)', 'The limit (in pounds)'), hintText: '600000'),
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
          child: Text(_saving ? tr('جارٍ الحفظ…', 'Saving…') : tr('أضف التنبيه', 'Add the alert')),
        ),
      ],
    );
  }
}
