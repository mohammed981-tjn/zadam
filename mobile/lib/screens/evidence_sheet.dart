/// «أضف دليلاً» و«ارفع المستند» (البند ٢٠٣): the website's upload form (src/components/EvidenceUpload.tsx) as a sheet —
/// the kind, a short caption, and the file: a photo taken now, one from the gallery, or a PDF. Choosing the file sends
/// it; the website's sentence for a refusal stays on the sheet, so nothing typed is lost.
library;

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../api.dart';
import '../evidence.dart';
import '../i18n.dart';
import '../theme.dart';

enum EvidenceSource { camera, gallery, pdf }

/// Opens the camera, the gallery or the file chooser; null when nothing was chosen.
typedef EvidencePicker = Future<EvidenceFile?> Function(EvidenceSource source);

/// The phone's own pickers. A photo is shrunk as the website shrinks one (at most 1920 px, JPEG quality 82).
Future<EvidenceFile?> pickEvidence(EvidenceSource source, {ImagePicker? picker}) async {
  if (source == EvidenceSource.pdf) {
    final f = await FilePicker.pickFile(type: FileType.custom, allowedExtensions: const ['pdf']);
    if (f == null) return null;
    return EvidenceFile(bytes: await f.readAsBytes(), name: f.name, pdf: true);
  }
  final x = await (picker ?? ImagePicker()).pickImage(
    source: source == EvidenceSource.camera ? ImageSource.camera : ImageSource.gallery,
    maxWidth: 1920,
    maxHeight: 1920,
    imageQuality: 82,
  );
  if (x == null) return null;
  return EvidenceFile(bytes: await x.readAsBytes(), name: x.name, pdf: false);
}

/// Shows the form and sends what is chosen with [send]; the message the website gave, or null when nothing was sent.
Future<String?> showEvidenceSheet(
  BuildContext context, {
  required String title,
  String? subtitle,
  required List<(String, String)> kinds,
  required Future<String> Function(String kind, String caption, EvidenceFile file) send,
  EvidencePicker? pick,
  String? note,
}) =>
    showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (ctx) => _EvidenceSheet(
        title: title,
        subtitle: subtitle,
        kinds: kinds,
        send: send,
        pick: pick ?? ((s) => pickEvidence(s)),
        note: note ?? tr('الصورة الملتقطة في الحقل أقوى دليل: يُحفظ وقتها ومكانها مع الدليل، ولا يبقيان في الملفّ نفسه. والصيغ: صورة أو PDF حتى ١٠ ميجابايت.', 'A photo taken in the field is the strongest evidence: its time and place are kept with the evidence, not left in the file itself. Formats: a photo or a PDF up to 10 MB.'),
      ),
    );

class _EvidenceSheet extends StatefulWidget {
  const _EvidenceSheet({
    required this.title,
    required this.subtitle,
    required this.kinds,
    required this.send,
    required this.pick,
    required this.note,
  });

  final String title;
  final String? subtitle;
  final List<(String, String)> kinds;
  final Future<String> Function(String kind, String caption, EvidenceFile file) send;
  final EvidencePicker pick;
  final String note;

  @override
  State<_EvidenceSheet> createState() => _EvidenceSheetState();
}

class _EvidenceSheetState extends State<_EvidenceSheet> {
  late String _kind = widget.kinds.first.$1;
  final _caption = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _caption.dispose();
    super.dispose();
  }

  Future<void> _go(EvidenceSource source) async {
    setState(() => _error = null);
    EvidenceFile? file;
    try {
      file = await widget.pick(source);
    } catch (_) {
      if (mounted) setState(() => _error = tr('تعذّر فتح الكاميرا أو الصور أو الملفّات.', 'Could not open the camera, the photos or the files.'));
      return;
    }
    if (file == null || !mounted) return;
    final problem = evidenceFileProblem(file);
    if (problem != null) {
      setState(() => _error = problem);
      return;
    }
    setState(() => _busy = true);
    try {
      final message = await widget.send(_kind, _caption.text, file);
      if (mounted) Navigator.pop(context, message);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final muted = TextStyle(color: mutedOn(context), fontSize: 12.5, height: 1.6);
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 0, 16, 16 + MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(widget.title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
            if (widget.subtitle != null) Text(widget.subtitle!, style: muted),
            const SizedBox(height: 12),
            Wrap(spacing: 6, runSpacing: 6, children: [
              for (final (key, label) in widget.kinds)
                ChoiceChip(
                  label: Text(label),
                  selected: _kind == key,
                  onSelected: _busy ? null : (_) => setState(() => _kind = key),
                ),
            ]),
            const SizedBox(height: 8),
            TextField(
              controller: _caption,
              enabled: !_busy,
              maxLength: 300,
              decoration: InputDecoration(labelText: tr('وصفٌ قصير (اختياري)', 'A short description (optional)')),
            ),
            Text(widget.note, style: muted),
            if (_error != null) ...[
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(color: warnTintOn(context), borderRadius: BorderRadius.circular(10)),
                child: Text(_error!, style: TextStyle(color: warnOn(context), height: 1.6, fontWeight: FontWeight.w600)),
              ),
            ],
            const SizedBox(height: 12),
            if (_busy)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 12),
                child: Center(child: CircularProgressIndicator()),
              )
            else
              Wrap(spacing: 8, runSpacing: 8, children: [
                FilledButton.icon(
                  onPressed: () => _go(EvidenceSource.camera),
                  icon: const Icon(Icons.photo_camera_outlined, size: 18),
                  label: Text(tr('صوّر الآن', 'Take a photo now')),
                ),
                OutlinedButton.icon(
                  onPressed: () => _go(EvidenceSource.gallery),
                  icon: const Icon(Icons.photo_library_outlined, size: 18),
                  label: Text(tr('من الصور', 'From photos')),
                ),
                OutlinedButton.icon(
                  onPressed: () => _go(EvidenceSource.pdf),
                  icon: const Icon(Icons.picture_as_pdf_outlined, size: 18),
                  label: Text(tr('ملفّ PDF', 'PDF file')),
                ),
              ]),
          ],
        ),
      ),
    );
  }
}
