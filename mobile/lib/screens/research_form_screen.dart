import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';

import '../api.dart';
import '../i18n.dart';
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
      setState(() => _error = tr('الملفّ PDF حتى ٢٠ ميجابايت.', 'The file is a PDF of up to 20 MB.'));
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
      appBar: AppBar(title: Text(tr('شارك دراستك أو بحثك', 'Share your study or research'))),
      body: _done
          ? StateView(
              icon: Icons.mark_email_read_outlined,
              title: tr('وصل عملك، شكراً لك.', 'Your work has arrived — thank you.'),
              message: tr('تراجعه الإدارة، ثمّ تنشره في المكتبة باسمك أو تردّه إليك بسبب. إن كنت مسجَّلاً فسيصلك إشعار، '
                  'وتتابعه من «ما أرسلتُه».', 'The administrators review it, then publish it in the library under your name or return it to you with a reason. If you are signed in you will get a notification, and you can follow it from «What I sent».'),
            )
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 40),
              children: [
                IntroNote(
                  tr('دراسة جدوى، أو بحثٌ علميّ، أو رسالةٌ جامعيّة، أو تقريرٌ عن الزراعة في السودان — بلا حساب إن شئت. '
                  'تراجعه الإدارة قبل نشره، وينشر باسم مؤلّفيه، ولا تُنشر وسيلة تواصلك.', 'A feasibility study, research, a thesis or a report on farming in Sudan — without an account if you like. The administrators review it before publishing it, it is published under its authors\' names, and your contact details are never published.'),
                  icon: Icons.upload_file,
                ),
                const SizedBox(height: 14),
                DropdownButtonFormField<String>(
                  initialValue: _d.kind,
                  decoration: InputDecoration(labelText: tr('نوع العمل', 'Kind of work')),
                  items: [
                    for (final e in researchKindLabels.entries) DropdownMenuItem(value: e.key, child: Text(e.value)),
                  ],
                  onChanged: (v) => _d.kind = v ?? _d.kind,
                ),
                const SizedBox(height: 12),
                _field(tr('العنوان', 'Title'), (v) => _d.title = v, max: 200),
                _field(tr('المؤلّف أو المؤلّفون', 'Author or authors'), (v) => _d.authors = v, max: 200),
                _field(tr('الجهة (جامعة، مركز، شركة) — اختياريّ', 'Institution (university, centre, company) — optional'), (v) => _d.institution = v, max: 200),
                _field(tr('السنة — اختياريّ', 'Year — optional'), (v) => _d.year = v, max: 4, type: TextInputType.number),
                _field(tr('المحصول أو الموضوع — اختياريّ', 'Crop or subject — optional'), (v) => _d.crop = v, max: 60, hint: tr('السمسم، القطن، الريّ…', 'Sesame, cotton, irrigation…')),
                DropdownButtonFormField<String>(
                  initialValue: _d.state,
                  isExpanded: true,
                  decoration: InputDecoration(labelText: tr('الولاية — اختياريّ', 'State — optional')),
                  items: [
                    DropdownMenuItem(value: '', child: Text(tr('كلّ السودان', 'All of Sudan'))),
                    for (final s in widget.states) DropdownMenuItem(value: s, child: Text(s)),
                  ],
                  onChanged: (v) => _d.state = v ?? '',
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: _d.language,
                  decoration: InputDecoration(labelText: tr('اللغة', 'Language')),
                  items: [
                    DropdownMenuItem(value: 'ar', child: Text(tr('العربيّة', 'Arabic'))),
                    DropdownMenuItem(value: 'en', child: Text(tr('الإنجليزيّة', 'English'))),
                    DropdownMenuItem(value: 'other', child: Text(tr('غيرهما', 'Other'))),
                  ],
                  onChanged: (v) => _d.language = v ?? 'ar',
                ),
                const SizedBox(height: 12),
                _field(tr('الملخّص: ما الذي درسته، وكيف، وماذا وجدت', 'Abstract: what you studied, how, and what you found'), (v) => _d.abstract = v, lines: 5, max: 3000),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(tr('الملفّ (PDF حتى ٢٠ ميجابايت)', 'The file (PDF up to 20 MB)'), style: TextStyle(fontWeight: FontWeight.w700)),
                        const SizedBox(height: 8),
                        Row(children: [
                          OutlinedButton.icon(
                            onPressed: _busy ? null : _pick,
                            icon: const Icon(Icons.attach_file),
                            label: Text(_d.fileName == null ? tr('اختر الملفّ', 'Choose the file') : tr('غيّر الملفّ', 'Change the file')),
                          ),
                          const SizedBox(width: 10),
                          if (_d.fileName != null)
                            Expanded(
                              child: Text(_d.fileName!, overflow: TextOverflow.ellipsis, textDirection: TextDirection.ltr),
                            ),
                          if (_d.fileName != null)
                            IconButton(
                              tooltip: tr('أزل الملفّ', 'Remove the file'),
                              onPressed: () => setState(() {
                                _d.fileName = null;
                                _d.fileBytes = null;
                              }),
                              icon: const Icon(Icons.close),
                            ),
                        ]),
                        const SizedBox(height: 10),
                        _field(tr('أو رابط العمل إن كان منشوراً', 'Or a link to the work, if it is published'), (v) => _d.linkUrl = v,
                            max: 500, type: TextInputType.url, hint: 'https://'),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                _field(tr('كيف نصل إليك إن احتجنا — اختياريّ، ولا يُنشر (هاتف أو بريد)', 'How we can reach you if needed — optional, never published (phone or email)'), (v) => _d.contact = v, max: 200),
                CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  controlAffinity: ListTileControlAffinity.leading,
                  value: _d.consent,
                  onChanged: (v) => setState(() => _d.consent = v ?? false),
                  title: Text(
                    tr('أُقرّ بأنّ هذا العمل لي أو أنّ لي حقّ مشاركته، أو أنّه منشورٌ للعموم، وأوافق على نشره في المكتبة '
                    'باسم مؤلّفيه.', 'I confirm that this work is mine or that I have the right to share it, or that it is published openly, and I agree to its publication in the library under its authors\' names.'),
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
                  child: Text(_busy ? tr('يُرسَل…', 'Sending…') : tr('أرسل للمراجعة', 'Send for review')),
                ),
              ],
            ),
    );
  }
}
