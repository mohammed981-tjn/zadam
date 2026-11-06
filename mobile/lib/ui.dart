/// The few building blocks every screen shares (backlog 202): the hero band,
/// the icon chip, the section title, the loading, empty and error states, and
/// one short fade.
///
/// One place, so the screens look like one product: the same chip in the same
/// light-olive tint for every section rather than a different pastel per tile,
/// and the same friendly state with an icon and a retry wherever a list could
/// not load. Motion is a single implicit fade on first build — nothing that
/// loops, nothing that keeps a ticker running.
library;

import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';

import 'i18n.dart';
import 'theme.dart';

/// The hero band (owner, 6 November: «أخضر يميل للبيج، لكن البيج ظاهر —
/// الخلفية القديمة»): the beige ground itself, with soft pools of olive, gold
/// and light olive washed over it, and the dark type. The beige stays visible;
/// olive is never a solid block here — it fills only buttons, selected states
/// and chips.
class HeroBand extends StatelessWidget {
  const HeroBand({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.fromLTRB(20, 20, 20, 20),
  });

  final Widget child;
  final EdgeInsetsGeometry padding;

  static Widget _pool(AlignmentGeometry at, Color colour, double alpha, double radius) =>
      Positioned.fill(
        child: DecoratedBox(
          decoration: BoxDecoration(
            gradient: RadialGradient(
              center: at,
              radius: radius,
              colors: [colour.withValues(alpha: alpha), colour.withValues(alpha: 0)],
            ),
          ),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final dark = Theme.of(context).brightness == Brightness.dark;
    final ground = dark ? SudagriColors.darkCard : SudagriColors.background;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: ground,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: scheme.outline),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(24),
        child: Stack(
          children: [
            _pool(const AlignmentDirectional(-0.9, -1.0), SudagriColors.primary, 0.25, 1.1),
            _pool(const AlignmentDirectional(0.85, -0.55), SudagriColors.lightOlive, 0.18, 0.8),
            _pool(const AlignmentDirectional(0.95, 1.1), SudagriColors.gold, 0.18, 0.9),
            PositionedDirectional(
              end: -26,
              bottom: -30,
              child: Icon(
                Icons.eco,
                size: 130,
                color: SudagriColors.primary.withValues(alpha: 0.10),
              ),
            ),
            Padding(
              padding: padding,
              child: DefaultTextStyle.merge(
                style: TextStyle(color: scheme.onSurface),
                child: IconTheme.merge(
                  data: IconThemeData(color: textGreenOn(context)),
                  child: child,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// A section's icon on a rounded light-olive tint.
class IconChip extends StatelessWidget {
  const IconChip(this.icon, {super.key, this.size = 44, this.warn = false});

  final IconData icon;
  final double size;

  /// The dark-gold tint, for warnings and errors.
  final bool warn;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: warn ? warnTintOn(context) : leafTintOn(context),
        borderRadius: BorderRadius.circular(size * 0.32),
      ),
      child: Icon(
        icon,
        size: size * 0.52,
        color: warn ? warnOn(context) : textGreenOn(context),
      ),
    );
  }
}

/// A section title: a short light-olive bar, then the words.
class SectionTitle extends StatelessWidget {
  const SectionTitle(this.text, {super.key, this.subtitle, this.trailing});

  final String text;
  final String? subtitle;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Container(
            width: 5,
            height: 22,
            decoration: BoxDecoration(
              gradient: SudagriColors.selectedGradient,
              borderRadius: BorderRadius.circular(3),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  text,
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    height: 1.3,
                  ),
                ),
                if (subtitle != null)
                  Text(
                    subtitle!,
                    style: TextStyle(
                      fontSize: 12,
                      color: mutedOn(context),
                      height: 1.5,
                    ),
                  ),
              ],
            ),
          ),
          ?trailing,
        ],
      ),
    );
  }
}

/// A short paragraph that says what a screen is, on a soft card with an icon.
class IntroNote extends StatelessWidget {
  const IntroNote(this.text, {super.key, this.icon = Icons.info_outline});

  final String text;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        color: leafTintOn(context).withValues(alpha: 0.55),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Icon(icon, size: 20, color: textGreenOn(context)),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              text,
              style: TextStyle(
                fontSize: 13,
                color: inkOn(context),
                height: 1.8,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Loading, empty or failed: an icon on a tint, a title, the message, and a
/// retry where one helps.
///
/// [scrollable] wraps it in an always-scrollable list, so a pull to refresh
/// still works on a screen that has nothing else in it.
class StateView extends StatelessWidget {
  const StateView({
    super.key,
    required this.icon,
    required this.title,
    this.message,
    this.onRetry,
    this.warn = false,
    this.scrollable = false,
    this.compact = false,
  });

  /// The list could not load: the message is the error itself.
  factory StateView.error(
    Object? error, {
    Key? key,
    VoidCallback? onRetry,
    bool scrollable = false,
    bool compact = false,
  }) => StateView(
    key: key,
    icon: Icons.cloud_off_rounded,
    title: tr('تعذّر الوصول الآن', 'Can\'t reach it right now'),
    message: '$error',
    onRetry: onRetry,
    warn: true,
    scrollable: scrollable,
    compact: compact,
  );

  final IconData icon;
  final String title;
  final String? message;
  final VoidCallback? onRetry;
  final bool warn;
  final bool scrollable;

  /// Inside a card on a longer page, rather than filling a screen.
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final body = FadeIn(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(
                color: (warn ? warnOn(context) : textGreenOn(context))
                    .withValues(alpha: 0.18),
                width: 1.5,
              ),
            ),
            child: IconChip(icon, size: compact ? 52 : 64, warn: warn),
          ),
          const SizedBox(height: 14),
          Text(
            title,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
          ),
          if (message != null && message!.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(
              message!,
              textAlign: TextAlign.center,
              style: TextStyle(
                color: mutedOn(context),
                height: 1.7,
                fontSize: 13,
              ),
            ),
          ],
          if (onRetry != null) ...[
            const SizedBox(height: 18),
            FilledButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh_rounded, size: 20),
              label: Text(tr('إعادة المحاولة', 'Try again')),
            ),
          ],
        ],
      ),
    );
    final padded = Padding(
      padding: EdgeInsets.symmetric(
        horizontal: 28,
        vertical: compact ? 20 : 32,
      ),
      child: body,
    );
    if (scrollable) {
      return LayoutBuilder(
        builder: (context, c) => ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            ConstrainedBox(
              constraints: BoxConstraints(
                minHeight: c.maxHeight.isFinite ? c.maxHeight * 0.8 : 0,
              ),
              child: Center(child: padded),
            ),
          ],
        ),
      );
    }
    return compact ? padded : Center(child: padded);
  }
}

/// A quiet spinner, with a word under it.
class LoadingView extends StatelessWidget {
  const LoadingView({
    super.key,
    this.label,
    this.compact = false,
  });

  /// The word under the spinner; «جارٍ التحميل…» when none is given.
  final String? label;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final body = Padding(
      padding: EdgeInsets.symmetric(vertical: compact ? 28 : 0),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const SizedBox(
            width: 34,
            height: 34,
            child: CircularProgressIndicator(strokeWidth: 3),
          ),
          const SizedBox(height: 12),
          Text(label ?? tr('جارٍ التحميل…', 'Loading…'), style: TextStyle(color: mutedOn(context), fontSize: 13)),
        ],
      ),
    );
    return Center(child: body);
  }
}

/// One short fade and rise on first build; it settles and stops.
class FadeIn extends StatelessWidget {
  const FadeIn({super.key, required this.child, this.delay = 0});

  final Widget child;

  /// Stagger, in steps of 40 ms, for the items of a list (kept short).
  final int delay;

  @override
  Widget build(BuildContext context) {
    final ms = 260 + 40 * delay.clamp(0, 6);
    final start = 1 - 260 / ms;
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: Duration(milliseconds: ms),
      curve: Interval(start, 1, curve: Curves.easeOutCubic),
      builder: (context, t, child) => Opacity(
        opacity: t,
        child: Transform.translate(
          offset: Offset(0, 10 * (1 - t)),
          child: child,
        ),
      ),
      child: child,
    );
  }
}

/// A small rounded label: the tint behind, the dark ink on it.
class TagPill extends StatelessWidget {
  const TagPill(this.text, {super.key, this.gold = false, this.icon});

  final String text;
  final bool gold;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final fg = gold ? warnOn(context) : inkOn(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: gold ? warnTintOn(context) : leafTintOn(context),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(
              icon,
              size: 13,
              color: gold ? warnOn(context) : textGreenOn(context),
            ),
            const SizedBox(width: 4),
          ],
          // A narrow phone or a large text size wraps the label rather than
          // pushing it past the pill.
          Flexible(
            child: Text(
              text,
              style: TextStyle(
                color: fg,
                fontSize: 11.5,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}


/// The header with the logo (owner, 6 November 2026: «أين الشعار… الترويسة تحسينها»): the round logo on white with
/// a ring of the logo's gold, the name and the line under it, on the palette's header band — the logo's forest green
/// in «ألوان الشعار», cream in «أخضر الأوراق».
class BrandAppBar extends StatelessWidget implements PreferredSizeWidget {
  const BrandAppBar({super.key, this.actions});

  final List<Widget>? actions;

  @override
  Size get preferredSize => const Size.fromHeight(68);

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final top = dark ? SudagriColors.darkHeaderTop : SudagriColors.headerTop;
    final bottom = dark ? SudagriColors.darkHeaderBottom : SudagriColors.headerBottom;
    final ink = dark ? SudagriColors.darkForeground : SudagriColors.headerInk;
    final sub = dark ? SudagriColors.darkMuted : SudagriColors.headerMuted;
    final gold = dark ? SudagriColors.darkGold : SudagriColors.gold;
    return AppBar(
      toolbarHeight: 68,
      centerTitle: false,
      titleSpacing: 4,
      foregroundColor: ink,
      backgroundColor: Colors.transparent,
      flexibleSpace: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: AlignmentDirectional.centerStart,
            end: AlignmentDirectional.centerEnd,
            colors: [top, bottom],
          ),
          border: Border(bottom: BorderSide(color: gold.withValues(alpha: 0.55), width: 1.5)),
        ),
      ),
      actions: actions,
      title: Row(
        children: [
          Container(
            width: 46,
            height: 46,
            padding: const EdgeInsets.all(1.5),
            decoration: BoxDecoration(
              color: Colors.white,
              shape: BoxShape.circle,
              border: Border.all(color: gold, width: 2),
            ),
            child: ClipOval(
              child: Image.asset('assets/brand/logo.png', fit: BoxFit.cover, semanticLabel: tr('شعار سوداقري', 'Sudagri logo')),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(tr('سوداقري', 'Sudagri'),
                    style: TextStyle(color: ink, fontSize: 20, fontWeight: FontWeight.w900, height: 1.2)),
                Text(tr('منصّة سودانيّة للزراعة والتجارة', 'A Sudanese platform for farming and trade'),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: sub, fontSize: 11.5, fontWeight: FontWeight.w600, height: 1.3)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// The 15-second film at the top of the home screen (owner, 6 November 2026: the Nile and the farmer): silent, looping,
/// from the app's own assets so it plays with no network. Until it is ready — or if the phone cannot play it — the
/// poster frame stands in, so the band is never empty. A scrim of the logo's forest green from the bottom keeps the
/// white words on it readable.
class HeroVideo extends StatefulWidget {
  const HeroVideo({super.key, required this.child, this.height = 236});

  final Widget child;
  final double height;

  static const asset = 'assets/video/hero.mp4';
  static const poster = 'assets/video/hero.jpg';

  @override
  State<HeroVideo> createState() => _HeroVideoState();
}

class _HeroVideoState extends State<HeroVideo> {
  VideoPlayerController? _video;
  bool _ready = false;

  @override
  void initState() {
    super.initState();
    _start();
  }

  Future<void> _start() async {
    final c = VideoPlayerController.asset(HeroVideo.asset,
        videoPlayerOptions: VideoPlayerOptions(mixWithOthers: true));
    _video = c;
    try {
      await c.initialize();
      await c.setVolume(0);
      await c.setLooping(true);
      if (!mounted) return;
      // Respect the phone's «reduce motion»: the poster only.
      if (MediaQuery.of(context).disableAnimations) return;
      await c.play();
      if (mounted) setState(() => _ready = true);
    } catch (_) {
      // No player on this device (or a test): the poster stays.
    }
  }

  @override
  void dispose() {
    _video?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final v = _video;
    // The words decide the height (a large system font must not overflow); the film fills whatever that is, never
    // less than [HeroVideo.height].
    return ClipRRect(
      borderRadius: BorderRadius.circular(24),
      child: ConstrainedBox(
        constraints: BoxConstraints(minHeight: widget.height),
        child: Stack(
          children: [
            Positioned.fill(child: Image.asset(HeroVideo.poster, fit: BoxFit.cover)),
            if (_ready && v != null)
              Positioned.fill(
                child: FittedBox(
                  fit: BoxFit.cover,
                  clipBehavior: Clip.hardEdge,
                  child: SizedBox(
                    width: v.value.size.width,
                    height: v.value.size.height,
                    child: VideoPlayer(v),
                  ),
                ),
              ),
            const Positioned.fill(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    stops: [0.0, 0.35, 1.0],
                    colors: [Color(0x33023F24), Color(0x22023F24), Color(0xE6023F24)],
                  ),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(18, 16, 18, 16),
              child: DefaultTextStyle.merge(
                style: const TextStyle(color: Colors.white),
                child: IconTheme.merge(data: const IconThemeData(color: Colors.white), child: widget.child),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// «ألوان التطبيق»: the two palettes side by side, each a swatch of its header, its green and its gold (owner,
/// 6 November 2026: «يمكن التغيير بينهما»). The choice is kept on the phone and repaints the app at once.
class PalettePicker extends StatelessWidget {
  const PalettePicker({super.key});

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<Palette>(
      valueListenable: paletteController,
      builder: (context, current, _) => Row(
        children: [
          for (final p in palettes) ...[
            Expanded(
              child: Semantics(
                button: true,
                selected: p.id == current.id,
                label: p.name,
                child: InkWell(
                  borderRadius: BorderRadius.circular(16),
                  onTap: () => paletteController.choose(p),
                  child: Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: Theme.of(context).colorScheme.surface,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(
                        color: p.id == current.id ? p.primary : Theme.of(context).colorScheme.outline,
                        width: p.id == current.id ? 2.5 : 1,
                      ),
                    ),
                    child: Column(
                      children: [
                        ClipRRect(
                          borderRadius: BorderRadius.circular(10),
                          child: SizedBox(
                            height: 34,
                            child: Row(children: [
                              Expanded(
                                flex: 3,
                                child: Container(
                                  decoration: BoxDecoration(
                                    gradient: LinearGradient(colors: [p.headerTop, p.headerBottom]),
                                  ),
                                ),
                              ),
                              Expanded(flex: 2, child: Container(color: p.primary)),
                              Expanded(child: Container(color: p.gold)),
                              Expanded(child: Container(color: p.background)),
                            ]),
                          ),
                        ),
                        const SizedBox(height: 6),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            if (p.id == current.id) ...[
                              Icon(Icons.check_circle, size: 16, color: textGreenOn(context)),
                              const SizedBox(width: 4),
                            ],
                            Flexible(
                              child: Text(p.name,
                                  textAlign: TextAlign.center,
                                  style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700)),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
            if (p != palettes.last) const SizedBox(width: 10),
          ],
        ],
      ),
    );
  }
}

/// «اللغة / Language» (owner, 6 November 2026, backlog 208): Arabic or English for the whole app, beside the palette
/// picker. Each choice is written in its own language, as the website's ع / EN switch, so a reader who has neither
/// finds theirs. The choice is kept on the phone and the app follows it at once, English left to right.
class LanguagePicker extends StatelessWidget {
  const LanguagePicker({super.key});

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<AppLang>(
      valueListenable: langController,
      builder: (context, current, _) => SizedBox(
        width: double.infinity,
        child: SegmentedButton<AppLang>(
          segments: [
            for (final l in AppLang.values)
              ButtonSegment(
                value: l,
                // Each name in its own direction, whatever the app's is now.
                label: Text(l.label, textDirection: l == AppLang.en ? TextDirection.ltr : TextDirection.rtl),
              ),
          ],
          selected: {current},
          onSelectionChanged: (s) => langController.choose(s.first),
        ),
      ),
    );
  }
}
