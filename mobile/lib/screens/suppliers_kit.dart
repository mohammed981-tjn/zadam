/// What the suppliers and agent screens share (البند ٢٠٣): a step that answers with a sentence, a short question,
/// the sign-in gate, a card, the states picker and taking a photo.
library;

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:url_launcher/url_launcher.dart';

import '../account.dart';
import '../api.dart';
import '../i18n.dart';
import '../suppliers.dart';
import '../theme.dart';
import '../ui.dart';
import 'account_screen.dart';

/// Runs a step and says its answer — the server's own sentence on success, the database's refusal otherwise.
/// True when it went through.
Future<bool> runStep(BuildContext context, Future<String> Function() step) async {
  final messenger = ScaffoldMessenger.of(context);
  try {
    final message = await step();
    if (message.isNotEmpty) messenger.showSnackBar(SnackBar(content: Text(message)));
    return true;
  } on ApiException catch (e) {
    messenger.showSnackBar(SnackBar(content: Text(e.message), duration: const Duration(seconds: 6)));
    return false;
  }
}

/// One line of text asked for in a dialog; null when the person cancels.
Future<String?> askText(
  BuildContext context, {
  required String title,
  required String label,
  String? hint,
  String? help,
  String? action,
  int minLength = 1,
  int maxLength = 200,
  int lines = 1,
  TextInputType? keyboard,
  TextDirection? direction,
  String initial = '',
}) {
  final text = TextEditingController(text: initial);
  return showDialog<String>(
    context: context,
    builder: (ctx) => StatefulBuilder(
      builder: (ctx, setState) => AlertDialog(
        title: Text(title),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            TextField(
              controller: text,
              autofocus: true,
              maxLength: maxLength,
              minLines: lines,
              maxLines: lines,
              keyboardType: keyboard,
              textDirection: direction,
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(labelText: label, hintText: hint),
            ),
            if (help != null) Text(help, style: TextStyle(fontSize: 12, color: mutedOn(ctx), height: 1.6)),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: Text(tr('إلغاء', 'Cancel'))),
          FilledButton(
            onPressed: text.text.trim().length < minLength ? null : () => Navigator.pop(ctx, text.text.trim()),
            child: Text(action ?? tr('تمّ', 'Done')),
          ),
        ],
      ),
    ),
  );
}

/// Yes or no, before a step that cannot be taken back.
Future<bool> askSure(BuildContext context, {required String title, required String message, required String action}) async =>
    await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: Text(message, style: const TextStyle(height: 1.7)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(tr('تراجع', 'Back'))),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(action)),
        ],
      ),
    ) ==
    true;

/// A photo from the camera (or the gallery), shrunk as the website shrinks it; null when none was taken.
Future<List<int>?> takePhoto(BuildContext context, {ImagePicker? picker}) async {
  final source = await showModalBottomSheet<ImageSource>(
    context: context,
    builder: (ctx) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ListTile(
            leading: const Icon(Icons.photo_camera_outlined),
            title: Text(tr('صوّر الآن', 'Take a photo now')),
            onTap: () => Navigator.pop(ctx, ImageSource.camera),
          ),
          ListTile(
            leading: const Icon(Icons.photo_library_outlined),
            title: Text(tr('اختر من الصور', 'Choose from photos')),
            onTap: () => Navigator.pop(ctx, ImageSource.gallery),
          ),
        ],
      ),
    ),
  );
  if (source == null) return null;
  try {
    final file = await (picker ?? ImagePicker()).pickImage(source: source, maxWidth: 1920, maxHeight: 1920, imageQuality: 82);
    if (file == null) return null;
    final bytes = await file.readAsBytes();
    if (bytes.length > 10 * 1024 * 1024) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(tr('الصورة أكبر من ١٠ ميجابايت.', 'The photo is larger than 10 MB.'))));
      }
      return null;
    }
    return bytes;
  } catch (_) {
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(tr('تعذّر فتح الكاميرا أو الصور.', 'Could not open the camera or the photos.'))));
    }
    return null;
  }
}

/// A call or a WhatsApp chat, in the phone's own app.
Future<void> openLink(BuildContext context, String url) async {
  final messenger = ScaffoldMessenger.of(context);
  final ok = await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
  if (!ok) messenger.showSnackBar(SnackBar(content: Text(tr('تعذّر الفتح.', 'Could not open it.'))));
}

/// The signed-in part of a screen; signed out, what it is for and the way in.
class SignedInGate extends StatelessWidget {
  const SignedInGate({super.key, required this.why, required this.builder});

  final String why;
  final WidgetBuilder builder;

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<Session?>(
      valueListenable: accountController,
      builder: (context, session, _) {
        if (!accountController.loaded) return const LoadingView();
        if (session != null) return builder(context);
        return Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                StateView(icon: Icons.lock_outline_rounded, title: tr('ادخل إلى حسابك', 'Sign in to your account'), message: why, compact: true),
                FilledButton.icon(
                  onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const AccountScreen())),
                  icon: const Icon(Icons.login_rounded),
                  label: Text(tr('الدخول', 'Sign in')),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

/// A rounded card with the screen's padding.
class InfoCard extends StatelessWidget {
  const InfoCard({super.key, required this.children, this.highlight = false, this.onTap});

  final List<Widget> children;

  /// The soft green ground the website gives its «your part» boxes.
  final bool highlight;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final body = Padding(
      padding: const EdgeInsets.all(14),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: children),
    );
    return Card(
      color: highlight ? leafTintOn(context).withValues(alpha: 0.6) : null,
      clipBehavior: Clip.antiAlias,
      child: onTap == null ? body : InkWell(onTap: onTap, child: body),
    );
  }
}

/// A label over its value.
class LabelValue extends StatelessWidget {
  const LabelValue(this.label, this.value, {super.key});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: TextStyle(fontSize: 12, color: mutedOn(context))),
          Text(value, style: const TextStyle(height: 1.6)),
        ],
      ),
    );
  }
}

/// Small grey text.
class Muted extends StatelessWidget {
  const Muted(this.text, {super.key, this.size = 12.5});
  final String text;
  final double size;

  @override
  Widget build(BuildContext context) =>
      Text(text, style: TextStyle(fontSize: size, color: mutedOn(context), height: 1.7));
}

/// A sentence in the warning gold (never red).
class WarnText extends StatelessWidget {
  const WarnText(this.text, {super.key});
  final String text;

  @override
  Widget build(BuildContext context) =>
      Text(text, style: TextStyle(fontSize: 12.5, color: warnOn(context), height: 1.7, fontWeight: FontWeight.w600));
}

/// Several of Sudan's states, as chips.
class StatesPicker extends StatelessWidget {
  const StatesPicker({super.key, required this.selected, required this.onChanged});
  final Set<String> selected;
  final ValueChanged<Set<String>> onChanged;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 6,
      runSpacing: 6,
      children: [
        for (final s in sudanStates)
          FilterChip(
            label: Text(placeName(s)),
            selected: selected.contains(s),
            onSelected: (on) => onChanged(on ? {...selected, s} : ({...selected}..remove(s))),
          ),
      ],
    );
  }
}

/// One of Sudan's states, from a list.
class StateField extends StatelessWidget {
  const StateField({super.key, required this.value, required this.onChanged, this.label});
  final String? value;
  final ValueChanged<String?> onChanged;
  final String? label;

  @override
  Widget build(BuildContext context) {
    return DropdownButtonFormField<String>(
      initialValue: value,
      isExpanded: true,
      decoration: InputDecoration(labelText: label ?? tr('الولاية', 'State')),
      items: [for (final s in sudanStates) DropdownMenuItem(value: s, child: Text(placeName(s)))],
      onChanged: onChanged,
    );
  }
}

/// A product offer, as the website's ProductRow: the supplier's dollar price until their date, and in pounds today —
/// the supplier's offer, never a market price.
class ProductTile extends StatelessWidget {
  const ProductTile(this.p, {super.key, this.rate, this.trailing});
  final Product p;
  final double? rate;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(p.name, style: const TextStyle(fontWeight: FontWeight.w700)),
                    Muted([
                      supplyCategories[p.category] ?? p.category,
                      if (p.activeIngredient != null && p.activeIngredient!.isNotEmpty) p.activeIngredient!,
                      p.packLabel,
                    ].join(' · ')),
                    if (p.registrationNo != null && p.registrationNo!.isNotEmpty)
                      Text(
                        tr('${p.category == 'seed' ? 'الصنف المعتمد' : 'رقم التسجيل'}: ${p.registrationNo}'
                        '${p.certLot != null && p.certLot!.isNotEmpty ? ' · لوط الإكثار: ${p.certLot}' : ''}', '${p.category == 'seed' ? 'Certified variety' : 'Registration no.'}: ${p.registrationNo}${p.certLot != null && p.certLot!.isNotEmpty ? ' · Multiplication lot: ${p.certLot}' : ''}'),
                        style: const TextStyle(fontSize: 12),
                      ),
                    if (!p.active) Muted(tr('موقوف العرض', 'Not on offer')),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(usd(p.priceUsd), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                  if (rate != null) Muted('≈ ${sdg(p.priceUsd * rate!)}'),
                ],
              ),
            ],
          ),
          p.expired
              ? WarnText(tr('انتهى العرض في ${dateAr(p.validUntil)} — اسأل المورد عن سعره اليوم', 'The offer ended on ${dateAr(p.validUntil)} — ask the supplier for today\'s price'))
              : Muted(tr('العرض سارٍ حتى ${dateAr(p.validUntil)}', 'The offer stands until ${dateAr(p.validUntil)}'), size: 11.5),
          if (trailing != null) Align(alignment: AlignmentDirectional.centerEnd, child: trailing),
        ],
      ),
    );
  }
}
