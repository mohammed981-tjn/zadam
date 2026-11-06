import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';

import '../api.dart';
import '../library.dart';
import '../theme.dart';
import '../ui.dart';

/// «شارك دراستك أو بحثك» (البند ٢٠٣) — /library/new: لأيّ أحد، زائراً أو
/// مسجَّلاً؛ ولا يُنشر شيءٌ بإرساله. The website form's fields and limits, sent
/// through the website's own route (LibraryApi.submit).
class ResearchFormScreen extends StatefulWidget {
  const ResearchFormScreen({super.key, this.api, this.states = const [], this.maxBytes = researchMaxBytes});
  final LibraryApi? api;
  final List<String> states;
  final int maxBytes;

  @override
  State<ResearchFormScreen> createState() => _ResearchFormScreenState();
}

class _ResearchFormScreenState extends State<ResearchFormScreen> {
  late final LibraryApi _api = widget.api ?? LibraryApi();
  final _d = ResearchDraft();
  bool _busy = false;
  bool _done = false;
  String? _error;

  Future<void> _pick() async {
    final f = await FilePicker.pickFile(type: FileType.custom, allowedExtensions: const ['pdf']);
    if (f == null) return;
    final size = f.lengthSync() ?? await f.length() ?? 0;
    if (size > widget.maxBytes || !f.name.toLowerCase().endsWith('.pdf')) {
      setState(() => _error = 'الملفّ PDF حتى ٢٠ ميجابايت.');
      return;
    }
    final bytes = await f.readAsBytes();
    setState(() {
      _d.fileName = f.name;
      _d.fileBytes = bytes;
      _error = null;
    });
  }

  Future<void> _send() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await _api.submit(_d, maxBytes: widget.maxBytes);
      if (mounted) setState(() => _done = true);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _field(String label, ValueChanged<String> set, {int lines = 1, int? max, TextInputType? type, String? hint}) =>
      Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: TextField(
          minLines: lines,
          maxLines: lines == 1 ? 1 : lines + 4,
          maxLength: max,
          keyboardType: type,
          decoration: InputDecoration(labelText: label, hintText: hint, alignLabelWithHint: lines > 1),
          onChanged: set,
        ),
      );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('شارك دراستك أو بحثك')),
      body: _done
          ? StateView(
              icon: Icons.mark_email_read_outlined,
              title: 'وصل عملك، شكراً لك.',
              message: 'تراجعه الإدارة، ثمّ تنشره في المكتبة باسمك أو تردّه إليك بسبب. إن كنت مسجَّلاً فسيصلك إشعار، '
                  'وتتابعه من «ما أرسلتُه».',
            )
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 40),
              children: [
                const IntroNote(
                  'دراسة جدوى، أو بحثٌ علميّ، أو رسالةٌ جامعيّة، أو تقريرٌ عن الزراعة في السودان — بلا حساب إن شئت. '
                  'تراجعه الإدارة قبل نشره، وينشر باسم مؤلّفيه، ولا تُنشر وسيلة تواصلك.',
                  icon: Icons.upload_file,
                ),
                const SizedBox(height: 14),
                DropdownButtonFormField<String>(
                  initialValue: _d.kind,
                  decoration: const InputDecoration(labelText: 'نوع العمل'),
                  items: [
                    for (final e in researchKindLabels.entries) DropdownMenuItem(value: e.key, child: Text(e.value)),
                  ],
                  onChanged: (v) => _d.kind = v ?? _d.kind,
                ),
                const SizedBox(height: 12),
                _field('العنوان', (v) => _d.title = v, max: 200),
                _field('المؤلّف أو المؤلّفون', (v) => _d.authors = v, max: 200),
                _field('الجهة (جامعة، مركز، شركة) — اختياريّ', (v) => _d.institution = v, max: 200),
                _field('السنة — اختياريّ', (v) => _d.year = v, max: 4, type: TextInputType.number),
                _field('المحصول أو الموضوع — اختياريّ', (v) => _d.crop = v, max: 60, hint: 'السمسم، القطن، الريّ…'),
                DropdownButtonFormField<String>(
                  initialValue: _d.state,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'الولاية — اختياريّ'),
                  items: [
                    const DropdownMenuItem(value: '', child: Text('كلّ السودان')),
                    for (final s in widget.states) DropdownMenuItem(value: s, child: Text(s)),
                  ],
                  onChanged: (v) => _d.state = v ?? '',
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: _d.language,
                  decoration: const InputDecoration(labelText: 'اللغة'),
                  items: const [
                    DropdownMenuItem(value: 'ar', child: Text('العربيّة')),
                    DropdownMenuItem(value: 'en', child: Text('الإنجليزيّة')),
                    DropdownMenuItem(value: 'other', child: Text('غيرهما')),
                  ],
                  onChanged: (v) => _d.language = v ?? 'ar',
                ),
                const SizedBox(height: 12),
                _field('الملخّص: ما الذي درسته، وكيف، وماذا وجدت', (v) => _d.abstract = v, lines: 5, max: 3000),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('الملفّ (PDF حتى ٢٠ ميجابايت)', style: TextStyle(fontWeight: FontWeight.w700)),
                        const SizedBox(height: 8),
                        Row(children: [
                          OutlinedButton.icon(
                            onPressed: _busy ? null : _pick,
                            icon: const Icon(Icons.attach_file),
                            label: Text(_d.fileName == null ? 'اختر الملفّ' : 'غيّر الملفّ'),
                          ),
                          const SizedBox(width: 10),
                          if (_d.fileName != null)
                            Expanded(
                              child: Text(_d.fileName!, overflow: TextOverflow.ellipsis, textDirection: TextDirection.ltr),
                            ),
                          if (_d.fileName != null)
                            IconButton(
                              tooltip: 'أزل الملفّ',
                              onPressed: () => setState(() {
                                _d.fileName = null;
                                _d.fileBytes = null;
                              }),
                              icon: const Icon(Icons.close),
                            ),
                        ]),
                        const SizedBox(height: 10),
                        _field('أو رابط العمل إن كان منشوراً', (v) => _d.linkUrl = v,
                            max: 500, type: TextInputType.url, hint: 'https://'),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                _field('كيف نصل إليك إن احتجنا — اختياريّ، ولا يُنشر (هاتف أو بريد)', (v) => _d.contact = v, max: 200),
                CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  controlAffinity: ListTileControlAffinity.leading,
                  value: _d.consent,
                  onChanged: (v) => setState(() => _d.consent = v ?? false),
                  title: const Text(
                    'أُقرّ بأنّ هذا العمل لي أو أنّ لي حقّ مشاركته، أو أنّه منشورٌ للعموم، وأوافق على نشره في المكتبة '
                    'باسم مؤلّفيه.',
                    style: TextStyle(fontSize: 13.5, height: 1.7),
                  ),
                ),
                if (_error != null)
                  Container(
                    margin: const EdgeInsets.only(top: 8),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(color: warnTintOn(context), borderRadius: BorderRadius.circular(12)),
                    child: Text(_error!, style: TextStyle(color: warnOn(context), fontWeight: FontWeight.w600)),
                  ),
                const SizedBox(height: 12),
                FilledButton(
                  onPressed: _busy ? null : _send,
                  child: Text(_busy ? 'يُرسَل…' : 'أرسل للمراجعة'),
                ),
              ],
            ),
    );
  }
}
