/// The few building blocks every screen shares (backlog 202): the hero band,
/// the icon chip, the section title, the loading, empty and error states, and
/// one short fade.
///
/// One place, so the screens look like one product: the same chip in the same
/// light-green tint for every section rather than a different pastel per tile,
/// and the same friendly state with an icon and a retry wherever a list could
/// not load. Motion is a single implicit fade on first build — nothing that
/// loops, nothing that keeps a ticker running.
library;

import 'package:flutter/material.dart';

import 'theme.dart';

/// The hero band: the light-green gradient with the dark ink on it, and a faint
/// leaf in the far corner.
class HeroBand extends StatelessWidget {
  const HeroBand({super.key, required this.child, this.padding = const EdgeInsets.fromLTRB(20, 20, 20, 20)});

  final Widget child;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: SudagriColors.heroGradient,
        borderRadius: BorderRadius.circular(24),
        boxShadow: [
          BoxShadow(
            color: SudagriColors.primary.withValues(alpha: 0.28),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(24),
        child: Stack(
          children: [
            PositionedDirectional(
              end: -28,
              bottom: -34,
              child: Icon(Icons.eco,
                  size: 150,
                  color: Colors.white.withValues(alpha: 0.16)),
            ),
            PositionedDirectional(
              end: 70,
              top: -40,
              child: Container(
                width: 110,
                height: 110,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.white.withValues(alpha: 0.10),
                ),
              ),
            ),
            Padding(
              padding: padding,
              child: DefaultTextStyle.merge(
                style: const TextStyle(color: SudagriColors.primaryForeground),
                child: IconTheme.merge(
                  data: const IconThemeData(color: SudagriColors.primaryForeground),
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

/// A section's icon on a rounded light-green tint.
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
      child: Icon(icon,
          size: size * 0.52,
          color: warn ? warnOn(context) : textGreenOn(context)),
    );
  }
}

/// A section title: a short light-green bar, then the words.
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
                Text(text,
                    style: const TextStyle(
                        fontSize: 18, fontWeight: FontWeight.w800, height: 1.3)),
                if (subtitle != null)
                  Text(subtitle!,
                      style: TextStyle(
                          fontSize: 12, color: mutedOn(context), height: 1.5)),
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
            child: Text(text,
                style: TextStyle(
                    fontSize: 13, color: inkOn(context), height: 1.8)),
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
  factory StateView.error(Object? error,
          {Key? key, VoidCallback? onRetry, bool scrollable = false, bool compact = false}) =>
      StateView(
        key: key,
        icon: Icons.cloud_off_rounded,
        title: 'تعذّر الوصول الآن',
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
                  width: 1.5),
            ),
            child: IconChip(icon, size: compact ? 52 : 64, warn: warn),
          ),
          const SizedBox(height: 14),
          Text(title,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
          if (message != null && message!.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(message!,
                textAlign: TextAlign.center,
                style: TextStyle(color: mutedOn(context), height: 1.7, fontSize: 13)),
          ],
          if (onRetry != null) ...[
            const SizedBox(height: 18),
            FilledButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh_rounded, size: 20),
              label: const Text('إعادة المحاولة'),
            ),
          ],
        ],
      ),
    );
    final padded = Padding(
      padding: EdgeInsets.symmetric(horizontal: 28, vertical: compact ? 20 : 32),
      child: body,
    );
    if (scrollable) {
      return LayoutBuilder(
        builder: (context, c) => ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            ConstrainedBox(
              constraints: BoxConstraints(minHeight: c.maxHeight.isFinite ? c.maxHeight * 0.8 : 0),
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
  const LoadingView({super.key, this.label = 'جارٍ التحميل…', this.compact = false});

  final String label;
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
          Text(label, style: TextStyle(color: mutedOn(context), fontSize: 13)),
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
        child: Transform.translate(offset: Offset(0, 10 * (1 - t)), child: child),
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
            Icon(icon, size: 13, color: gold ? warnOn(context) : textGreenOn(context)),
            const SizedBox(width: 4),
          ],
          Text(text,
              style: TextStyle(color: fg, fontSize: 11.5, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}
