/// «مواسمي» (البند ٢٠٣): the website's /seasons inside the app — my seasons, my partnership seasons, and the blank
/// entry form that works with no network (/seasons/offline).
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../account.dart';
import '../api.dart';
import '../i18n.dart';
import '../ledger_autosend.dart';
import '../seasons.dart';
import '../theme.dart';
import '../ui.dart';
import 'account_screen.dart';
import 'season_screen.dart';

/// A section that needs the account: the sign-in prompt when signed out, as «حسابي» and the messages do.
class RequireSignIn extends StatelessWidget {
  const RequireSignIn({super.key, required this.what, required this.builder});

  /// What the section is, for the prompt: «مواسمك», «دفترك».
  final String what;
  final WidgetBuilder builder;

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<Session?>(
      valueListenable: accountController,
      builder: (context, session, _) {
        if (!accountController.loaded) return const LoadingView();
        if (session == null) {
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 24, 16, 32),
            children: [
              StateView(
                icon: Icons.lock_person_rounded,
                title: tr('ادخل إلى حسابك', 'Sign in to your account'),
                message: tr('ترى $what بعد أن تدخل بحسابك في سوداقري — الرقم وكلمة المرور نفسهما في الموقع والتطبيق.', 'You see $what after you sign in with your Sudagri account — the same number and password on the website and in the app.'),
                compact: true,
              ),
              Center(
                child: FilledButton.icon(
                  onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const AccountScreen())),
                  icon: const Icon(Icons.login),
                  label: Text(tr('ادخل أو أنشئ حساباً', 'Sign in or create an account')),
                ),
              ),
            ],
          );
        }
        return builder(context);
      },
    );
  }
}

class SeasonsScreen extends StatelessWidget {
  const SeasonsScreen({super.key, this.api});

  /// For tests; the app's own client otherwise.
  final SeasonsApi? api;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(tr('مواسمي', 'My seasons'))),
      body: RequireSignIn(what: tr('مواسمك', 'your seasons'), builder: (_) => _SeasonsBody(api: api ?? SeasonsApi())),
    );
  }
}

class _SeasonsBody extends StatefulWidget {
  const _SeasonsBody({required this.api});
  final SeasonsApi api;

  @override
  State<_SeasonsBody> createState() => _SeasonsBodyState();
}

class _SeasonsBodyState extends State<_SeasonsBody> {
  SeasonsList? _list;
  ApiException? _error;
  bool _loading = true;
  List<OutboxItem> _unassigned = const [];
  final Map<String, String> _choice = {};
  List<(OutboxItem, String)> _refused = const [];

  @override
  void initState() {
    super.initState();
    ledgerAutoSender.reports.addListener(_autoSent);
    _load();
  }

  @override
  void dispose() {
    ledgerAutoSender.reports.removeListener(_autoSent);
    super.dispose();
  }

  /// The app sent kept entries by itself while this list was open: say so, show what was refused, read the box again.
  void _autoSent() {
    final report = ledgerAutoSender.reports.value;
    if (report == null || !mounted) return;
    if (report.refused.isNotEmpty) setState(() => _refused = report.refused);
    if (report.sent > 0) _say(tr('أُرسل ${report.sent} من القيود المحفوظة على هاتفك.', '${report.sent} of the entries kept on your phone were sent.'));
    _readBox();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final list = await widget.api.list();
      if (!mounted) return;
      setState(() {
        _list = list;
        _error = null;
      });
      // Online again: what was kept for a season goes now, as the website sends it when the page opens.
      final report = await widget.api.sendPending();
      if (mounted && (report.sent > 0 || report.refused.isNotEmpty)) {
        setState(() => _refused = report.refused);
        if (report.sent > 0) _say(tr('أُرسل ${report.sent} من القيود المحفوظة على هاتفك.', '${report.sent} of the entries kept on your phone were sent.'));
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
    await _readBox();
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _readBox() async {
    final items = await widget.api.outbox.pending(widget.api.userId, LedgerOutbox.unassigned);
    if (mounted) setState(() => _unassigned = items);
  }

  void _say(String m) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));

  Future<void> _blankEntry() async {
    await showLedgerEntrySheet(
      context,
      title: tr('قيدٌ بلا إنترنت', 'An entry with no internet'),
      note: tr('نموذجٌ فارغ يعمل بلا شبكة: يُحفظ ما تكتبه على هاتفك، وحين تتّصل تختار موسمه هنا فيُرسَل.', 'A blank form that works with no network: what you write is kept on your phone, and when you are online you choose its season here and it is sent.'),
      stages: const [],
      onSubmit: (fields) async {
        final r = await widget.api.keepUnassigned(fields);
        if (!keptOk(r)) return keptMessage(r);
        if (mounted) _say(tr('حُفظ على هاتفك. حين تتّصل افتح «مواسمي» واختر موسمه ليُرسَل.', 'Kept on your phone. When you are online, open «My seasons» and choose its season to send it.'));
        return null;
      },
    );
    await _readBox();
  }

  Future<void> _sendUnassigned(OutboxItem item, String seasonId) async {
    final report = await widget.api.sendPending(seasonFor: (i) => i.id == item.id ? seasonId : null);
    if (!mounted) return;
    if (report.refused.isNotEmpty) {
      setState(() => _refused = report.refused);
    } else if (report.sent > 0) {
      _say(tr('أُرسل القيد إلى موسمه.', 'The entry was sent to its season.'));
    } else {
      _say(tr('لا اتّصال الآن؛ بقي القيد على هاتفك.', 'No connection now; the entry stayed on your phone.'));
    }
    await _readBox();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading && _list == null && _error == null) return const LoadingView();
    final list = _list;
    final active = [for (final s in list?.mine ?? const <SeasonRow>[]) if (s.active) s];
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        children: [
          FadeIn(
            child: HeroBand(
              child: Row(
                children: [
                  IconChip(Icons.agriculture_rounded, size: 52),
                  SizedBox(width: 14),
                  Expanded(
                    child: Text(
                      tr('كل موسم يُسجَّل هنا يبني سجلك كمنفّذ — وهو ما يقرأه محرّك التقييم.', 'Every season recorded here builds your track record as an operator — and that is what the scoring engine reads.'),
                      style: TextStyle(height: 1.7, fontWeight: FontWeight.w600),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              OutlinedButton.icon(
                onPressed: _blankEntry,
                icon: const Icon(Icons.cloud_off_rounded),
                label: Text(tr('قيدٌ بلا إنترنت', 'An entry with no internet')),
              ),
              FilledButton.icon(
                onPressed: () => openOnSite(context, '/seasons/new'),
                icon: const Icon(Icons.add),
                label: Text(tr('موسم جديد', 'A new season')),
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (_error != null)
            Card(
              child: StateView.error(_error!.message, onRetry: _load, compact: true),
            ),
          if (_refused.isNotEmpty) _RefusedCard(items: _refused, onClose: () => setState(() => _refused = const [])),
          if (_unassigned.isNotEmpty)
            Card(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(14, 14, 14, 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    SectionTitle(tr('قيودٌ على هاتفك بلا موسم', 'Entries on your phone with no season'), subtitle: tr('اختر موسم كلّ قيدٍ ثمّ أرسله، وأنت متّصل.', 'Choose each entry\'s season, then send it, while online.')),
                    for (final item in _unassigned)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Text(pendingLine(item), style: const TextStyle(fontWeight: FontWeight.w700)),
                            const SizedBox(height: 6),
                            if (active.isEmpty)
                              Text(
                                list == null ? tr('تُعرض مواسمك حين تتّصل.', 'Your seasons are shown when you are online.') : tr('لا موسم جارياً لك يُرسل إليه.', 'You have no running season to send it to.'),
                                style: TextStyle(color: mutedOn(context), fontSize: 12),
                              )
                            else
                              Row(
                                children: [
                                  Expanded(
                                    child: DropdownButtonFormField<String>(
                                      initialValue: _choice[item.id] ?? active.first.id,
                                      isExpanded: true,
                                      decoration: InputDecoration(labelText: tr('الموسم', 'Season')),
                                      items: [
                                        for (final s in active) DropdownMenuItem(value: s.id, child: Text(s.name)),
                                      ],
                                      onChanged: (v) => setState(() => _choice[item.id] = v ?? active.first.id),
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  FilledButton(
                                    onPressed: () => _sendUnassigned(item, _choice[item.id] ?? active.first.id),
                                    child: Text(tr('أرسل', 'Send')),
                                  ),
                                ],
                              ),
                            Align(
                              alignment: AlignmentDirectional.centerEnd,
                              child: TextButton(
                                onPressed: () async {
                                  await widget.api.outbox.drop(item.id);
                                  await _readBox();
                                },
                                child: Text(tr('احذفه من هاتفي', 'Delete it from my phone')),
                              ),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
            ),
          if (list != null && list.partner.isNotEmpty) ...[
            const SizedBox(height: 8),
            SectionTitle(
              tr('مواسم شراكتك', 'Your partnership seasons'),
              subtitle: tr('مواسم يزرعها شركاؤك بعقدٍ وقّعتموه: تقرأ مراحلها وصورها ودفترها، ولا تكتب فيها.', 'Seasons your partners grow under an agreement you signed: you read their stages, photos and ledger, and write none of them.'),
            ),
            for (final s in list.partner) _SeasonCard(season: s, api: widget.api, onBack: _load),
          ],
          if (list != null) ...[
            const SizedBox(height: 8),
            SectionTitle(tr('مواسمي', 'My seasons')),
            if (list.mine.isEmpty)
              StateView(
                icon: Icons.eco_outlined,
                title: tr('لا مواسم بعد', 'No seasons yet'),
                message:
                    tr('لم تسجّل موسماً بعد. ابدأ بموسم واحد — حتى لو كان قد بدأ فعلاً — وسجّل مراحله ومصروفاته لتعرف ربح الفدان الحقيقي في نهايته.', 'You have not recorded a season yet. Start with one — even if it has already begun — and record its stages and spending so that at the end you know the real profit per feddan.'),
                compact: true,
              ),
            for (final (i, s) in list.mine.indexed)
              FadeIn(delay: i, child: _SeasonCard(season: s, api: widget.api, onBack: _load)),
          ],
        ],
      ),
    );
  }
}

/// A kept entry in a line: its item, its figure and the day it was written.
String pendingLine(OutboxItem item) {
  final f = item.fields;
  final currency = f['currency'] == 'SDG' ? tr('ج.س', 'SDG') : '\$';
  final amount = f['amount'] ?? '';
  return [
    categoryLabel(f['category'] ?? ''),
    currency == '\$' ? '\$$amount' : '$amount $currency',
    if ((f['description'] ?? '').isNotEmpty) f['description']!,
    f['entry_date'] ?? '',
  ].join(' · ');
}

class _RefusedCard extends StatelessWidget {
  const _RefusedCard({required this.items, required this.onClose});
  final List<(OutboxItem, String)> items;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    return Card(
      color: warnTintOn(context),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 6, 12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.info_outline, color: warnOn(context)),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(tr('رفض الموقع قيوداً كانت على هاتفك، فلم تُحفظ:', 'The website refused entries that were on your phone, so they were not saved:'), style: TextStyle(fontWeight: FontWeight.w800)),
                  for (final (item, why) in items)
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Text('${pendingLine(item)} — $why', style: const TextStyle(height: 1.6, fontSize: 13)),
                    ),
                ],
              ),
            ),
            IconButton(onPressed: onClose, icon: const Icon(Icons.close), tooltip: tr('إغلاق', 'Close')),
          ],
        ),
      ),
    );
  }
}

class _SeasonCard extends StatelessWidget {
  const _SeasonCard({required this.season, required this.api, required this.onBack});
  final SeasonRow season;
  final SeasonsApi api;
  final Future<void> Function() onBack;

  @override
  Widget build(BuildContext context) {
    final s = season;
    return Card(
      child: ListTile(
        contentPadding: const EdgeInsets.fromLTRB(16, 8, 12, 8),
        title: Text(s.name, style: const TextStyle(fontWeight: FontWeight.w800)),
        subtitle: Text(
          [s.crop, tr('${amount2(s.feddans)} فدان', '${amount2(s.feddans)} feddans'), if (s.location != null && s.location!.isNotEmpty) s.location!, s.plantingDate]
              .join(' · '),
        ),
        trailing: TagPill(seasonStatusLabel(s.status), gold: !s.active && s.status != 'completed'),
        onTap: () async {
          await Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => SeasonScreen(id: s.id, name: s.name, api: api)),
          );
          await onBack();
        },
      ),
    );
  }
}

// ── The entry form ───────────────────────────────────────────────────────────

/// The website's «قيد مصروف أو إيراد» form, in a sheet. [onSubmit] returns null when the entry was sent or kept, or
/// the reason it was not — and then the sheet stays open with what was typed.
Future<void> showLedgerEntrySheet(
  BuildContext context, {
  required String title,
  required List<StageView> stages,
  required Future<String?> Function(Map<String, String> fields) onSubmit,
  String? note,
  String? rateHint,
  double? suggestedRate,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: LedgerEntryForm(
        title: title,
        stages: stages,
        onSubmit: onSubmit,
        note: note,
        rateHint: rateHint,
        suggestedRate: suggestedRate,
      ),
    ),
  );
}

class LedgerEntryForm extends StatefulWidget {
  const LedgerEntryForm({
    super.key,
    required this.title,
    required this.stages,
    required this.onSubmit,
    this.note,
    this.rateHint,
    this.suggestedRate,
  });

  final String title;
  final List<StageView> stages;
  final Future<String?> Function(Map<String, String> fields) onSubmit;
  final String? note;
  final String? rateHint;
  final double? suggestedRate;

  @override
  State<LedgerEntryForm> createState() => _LedgerEntryFormState();
}

class _LedgerEntryFormState extends State<LedgerEntryForm> {
  String _category = 'seeds';
  late String _stage = widget.stages.where((s) => !s.completed).firstOrNull?.id ?? '';
  String _currency = 'USD';
  String _paidFrom = 'cash';
  final _amount = TextEditingController();
  final _rate = TextEditingController();
  final _description = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _amount.dispose();
    _rate.dispose();
    _description.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_amount.text.trim().isEmpty) {
      setState(() => _error = tr('اكتب المبلغ.', 'Enter the amount.'));
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    final fields = <String, String>{
      'category': _category,
      if (widget.stages.isNotEmpty && _category != 'revenue') 'stage_id': _stage,
      'amount': _amount.text.trim(),
      'currency': _currency,
      'paid_from': _paidFrom,
      'fx_rate': _currency == 'SDG' ? _rate.text.trim() : '',
      'description': _description.text.trim(),
    };
    final problem = await widget.onSubmit(fields);
    if (!mounted) return;
    if (problem == null) {
      Navigator.of(context).pop();
    } else {
      setState(() {
        _busy = false;
        _error = problem;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final decimal = [FilteringTextInputFormatter.allow(RegExp(r'[0-9٠-٩.,٬]'))]; // ar-only
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SectionTitle(widget.title),
          if (widget.note != null) ...[IntroNote(widget.note!), const SizedBox(height: 12)],
          DropdownButtonFormField<String>(
            initialValue: _category,
            decoration: InputDecoration(labelText: tr('البند', 'Item')),
            items: [for (final (k, l) in ledgerCategories) DropdownMenuItem(value: k, child: Text(l))],
            onChanged: (v) => setState(() => _category = v ?? 'seeds'),
          ),
          if (widget.stages.isNotEmpty && _category != 'revenue') ...[
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _stage,
              isExpanded: true,
              decoration: InputDecoration(labelText: tr('المرحلة (للمصروف)', 'Stage (for a cost)')),
              items: [
                DropdownMenuItem(value: '', child: Text(tr('بلا مرحلة', 'No stage'))),
                for (final s in widget.stages) DropdownMenuItem(value: s.id, child: Text(s.name)),
              ],
              onChanged: (v) => setState(() => _stage = v ?? ''),
            ),
          ],
          const SizedBox(height: 12),
          TextField(
            controller: _amount,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            inputFormatters: decimal,
            decoration: InputDecoration(labelText: tr('المبلغ', 'Amount')),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: _currency,
            decoration: InputDecoration(labelText: tr('العملة', 'Currency')),
            items: [for (final (k, l) in currencyChoices) DropdownMenuItem(value: k, child: Text(l))],
            onChanged: (v) => setState(() => _currency = v ?? 'USD'),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: _paidFrom,
            isExpanded: true,
            decoration: InputDecoration(labelText: tr('دُفع أو قُبض', 'Paid or received')),
            items: [for (final (k, l) in paidFromChoices) DropdownMenuItem(value: k, child: Text(l))],
            onChanged: (v) => setState(() => _paidFrom = v ?? 'cash'),
          ),
          if (_currency == 'SDG') ...[
            const SizedBox(height: 12),
            TextField(
              controller: _rate,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              inputFormatters: decimal,
              decoration: InputDecoration(
                labelText: tr('سعر الصرف (للجنيه فقط)', 'Exchange rate (pounds only)'),
                hintText: widget.suggestedRate != null ? amount2(widget.suggestedRate!) : tr('جنيه لكل دولار', 'pounds per dollar'),
              ),
            ),
          ],
          const SizedBox(height: 12),
          TextField(
            controller: _description,
            maxLength: 500,
            decoration: InputDecoration(labelText: tr('الوصف', 'Caption')),
          ),
          if (widget.rateHint != null)
            Text(widget.rateHint!, style: TextStyle(color: mutedOn(context), fontSize: 12, height: 1.6)),
          if (_error != null) ...[
            const SizedBox(height: 10),
            Text(_error!, style: TextStyle(color: warnOn(context), fontWeight: FontWeight.w700, height: 1.6)),
          ],
          const SizedBox(height: 14),
          FilledButton.icon(
            onPressed: _busy ? null : _submit,
            icon: _busy
                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.add),
            label: Text(tr('أضف قيداً', 'Add entry')),
          ),
        ],
      ),
    );
  }
}
