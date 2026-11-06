/// Small pieces the contracts and investment screens share (backlog 203): a titled card, a label-and-value line,
/// the confirm and reason dialogs, the finger signature pad and a stored signature drawn back.
///
/// Colours come from the theme only (beige ground, the site's green, gold for warnings); a step that cancels or
/// disputes is an outline in the warning gold, never red.
library;

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';

import '../api.dart';
import '../contracts.dart';
import '../theme.dart';

/// A card with an optional title.
class DealCard extends StatelessWidget {
  const DealCard({super.key, this.title, required this.children, this.highlight = false});

  final String? title;
  final List<Widget> children;

  /// A step that waits for the reader: a green ring, as the website's `ring-accent`.
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: BorderSide(color: highlight ? scheme.primary : scheme.outline, width: highlight ? 2 : 1),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (title != null) ...[
              Text(title!, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15.5)),
              const SizedBox(height: 8),
            ],
            ...children,
          ],
        ),
      ),
    );
  }
}

/// A label over its value.
class InfoLine extends StatelessWidget {
  const InfoLine(this.label, this.value, {super.key});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 8),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: TextStyle(fontSize: 12, color: mutedOn(context))),
        Text(value, style: const TextStyle(fontWeight: FontWeight.w600, height: 1.5)),
      ],
    ),
  );
}

/// A quiet sentence.
class Muted extends StatelessWidget {
  const Muted(this.text, {super.key, this.size = 13});
  final String text;
  final double size;

  @override
  Widget build(BuildContext context) => Text(
    text,
    style: TextStyle(color: mutedOn(context), fontSize: size, height: 1.7),
  );
}

/// A button for a step that cancels, declines or disputes: an outline in the warning gold.
class WarnButton extends StatelessWidget {
  const WarnButton({super.key, required this.label, required this.onPressed});
  final String label;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) => OutlinedButton(
    style: OutlinedButton.styleFrom(
      foregroundColor: warnOn(context),
      side: BorderSide(color: warnOn(context).withValues(alpha: 0.6)),
    ),
    onPressed: onPressed,
    child: Text(label),
  );
}

/// Asks before a step that binds or ends something; true to go ahead.
Future<bool> confirmStep(
  BuildContext context, {
  required String title,
  required String body,
  required String go,
}) async {
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(title),
      content: Text(body, style: const TextStyle(height: 1.7)),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('تراجع')),
        FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(go)),
      ],
    ),
  );
  return ok == true;
}

/// Asks for a reason the other side reads (five letters at least, as the website's box); null when cancelled.
Future<String?> askReason(BuildContext context, {required String title, required String hint, required String go}) {
  final text = TextEditingController();
  return showDialog<String>(
    context: context,
    builder: (ctx) => StatefulBuilder(
      builder: (ctx, setState) => AlertDialog(
        title: Text(title),
        content: TextField(
          controller: text,
          maxLines: 3,
          maxLength: 1000,
          decoration: InputDecoration(hintText: hint),
          onChanged: (_) => setState(() {}),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('تراجع')),
          FilledButton(
            onPressed: text.text.trim().length >= 5 ? () => Navigator.pop(ctx, text.text.trim()) : null,
            child: Text(go),
          ),
        ],
      ),
    ),
  );
}

/// Runs a step, says its answer in a snack bar, and reloads on success. A refusal is the website's sentence.
Future<void> runStep(BuildContext context, Future<String?> Function() step, {VoidCallback? then}) async {
  final messenger = ScaffoldMessenger.of(context);
  try {
    final said = await step();
    if (said != null && said.isNotEmpty) messenger.showSnackBar(SnackBar(content: Text(said)));
    then?.call();
  } on ApiException catch (e) {
    messenger.showSnackBar(SnackBar(content: Text(e.message)));
  }
}

class _StrokesPainter extends CustomPainter {
  _StrokesPainter(this.strokes, this.colour);
  final List<List<Offset>> strokes;
  final Color colour;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = colour
      ..strokeWidth = 2.6
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..style = PaintingStyle.stroke;
    for (final s in strokes) {
      if (s.length == 1) {
        canvas.drawCircle(s.first, 1.3, paint..style = PaintingStyle.fill);
        paint.style = PaintingStyle.stroke;
        continue;
      }
      final path = Path()..moveTo(s.first.dx, s.first.dy);
      for (final p in s.skip(1)) {
        path.lineTo(p.dx, p.dy);
      }
      canvas.drawPath(path, paint);
    }
  }

  @override
  bool shouldRepaint(covariant _StrokesPainter old) => true;
}

/// A stored signature, drawn back from its path.
class SignatureView extends StatelessWidget {
  const SignatureView(this.path, {super.key});
  final String path;

  @override
  Widget build(BuildContext context) => AspectRatio(
    aspectRatio: SignatureDrawing.width / SignatureDrawing.height,
    child: LayoutBuilder(
      builder: (context, c) => CustomPaint(painter: _StrokesPainter(signatureStrokes(path, c.biggest), inkOn(context))),
    ),
  );
}

/// «ارسم توقيعك هنا بإصبعك»: the pad, in the website's 600×200 proportion. [onChanged] runs as the drawing grows.
class SignaturePad extends StatefulWidget {
  const SignaturePad({super.key, required this.drawing, required this.onChanged});
  final SignatureDrawing drawing;
  final VoidCallback onChanged;

  @override
  State<SignaturePad> createState() => _SignaturePadState();
}

class _SignaturePadState extends State<SignaturePad> {
  Size _box = Size.zero;

  void _changed() {
    setState(() {});
    widget.onChanged();
  }

  @override
  Widget build(BuildContext context) {
    final d = widget.drawing;
    final scheme = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AspectRatio(
          aspectRatio: SignatureDrawing.width / SignatureDrawing.height,
          child: Container(
            decoration: BoxDecoration(
              color: SudagriColors.card,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: scheme.primary.withValues(alpha: 0.5), width: 2),
            ),
            child: LayoutBuilder(
              builder: (context, c) {
                _box = c.biggest;
                // The pad wins every touch that starts on it, so drawing never scrolls the page under it.
                return RawGestureDetector(
                  gestures: {
                    EagerGestureRecognizer: GestureRecognizerFactoryWithHandlers<EagerGestureRecognizer>(
                      EagerGestureRecognizer.new,
                      (_) {},
                    ),
                  },
                  child: Listener(
                    key: const Key('signature-pad'),
                    behavior: HitTestBehavior.opaque,
                    onPointerDown: (e) {
                      d.start(e.localPosition, _box);
                      _changed();
                    },
                    onPointerMove: (e) {
                      d.extend(e.localPosition, _box);
                      _changed();
                    },
                    child: Stack(
                      children: [
                        Positioned.fill(
                          child: CustomPaint(painter: _StrokesPainter(d.strokesIn(_box), SudagriColors.foreground)),
                        ),
                        if (d.isEmpty)
                          const Center(
                            child: Text(
                              'ارسم توقيعك هنا بإصبعك',
                              style: TextStyle(color: SudagriColors.muted, fontWeight: FontWeight.w700),
                            ),
                          ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
        ),
        const SizedBox(height: 6),
        Row(
          children: [
            Expanded(
              child: Text(
                d.ready ? '✓ التوقيع جاهز' : 'التوقيع لم يكتمل بعد',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: d.ready ? FontWeight.w800 : FontWeight.w400,
                  color: d.ready ? textGreenOn(context) : mutedOn(context),
                ),
              ),
            ),
            TextButton(
              onPressed: () {
                d.clear();
                _changed();
              },
              child: const Text('امسح وأعد'),
            ),
          ],
        ),
      ],
    );
  }
}
