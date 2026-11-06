import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../account.dart';
import '../api.dart';
import '../theme.dart';
import '../ui.dart';

/// صندوق الرسائل في التطبيق (البند ١٤٤): the conversations the reader is in,
/// as /messages lists them on the website, and «راسل سوداقري».
class MessagesScreen extends StatefulWidget {
  const MessagesScreen({super.key});

  @override
  State<MessagesScreen> createState() => _MessagesScreenState();
}

class _MessagesScreenState extends State<MessagesScreen> {
  late Future<List<ConversationRow>> _rows = accountController.conversations();

  void _reload() => setState(() => _rows = accountController.conversations());

  Future<void> _open(String id) async {
    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => ThreadScreen(id: id)));
    if (mounted) _reload();
  }

  Future<void> _support() async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      final id = await accountController.openSupport();
      await _open(id);
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('الرسائل')),
      body: RefreshIndicator(
        onRefresh: () async => _reload(),
        child: FutureBuilder<List<ConversationRow>>(
          future: _rows,
          builder: (context, snap) {
            if (snap.connectionState != ConnectionState.done) {
              return const LoadingView();
            }
            if (snap.hasError) {
              final e = snap.error;
              return StateView.error(
                e is ApiException ? e.message : 'تعذّر تحميل الرسائل.',
                onRetry: _reload,
                scrollable: true,
              );
            }
            final rows = snap.data!;
            final hasSupport = rows.any((r) => r.kind == 'support' && r.myRole == 'member');
            return ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
              children: [
                Text(
                  'كلّ محادثةٍ مربوطةٌ بطلب شراكةٍ أو بعقده، أو بعرضٍ في السوق، أو بإدارة سوداقري. '
                  'وتقرأ الإدارة المحادثات، ولا يُحذف منها شيء.',
                  style: TextStyle(color: mutedOn(context), height: 1.7, fontSize: 13),
                ),
                const SizedBox(height: 12),
                if (!hasSupport)
                  FilledButton.icon(
                    onPressed: _support,
                    icon: const Icon(Icons.support_agent),
                    label: const Text('راسل سوداقري'),
                  ),
                const SizedBox(height: 8),
                if (rows.isEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 24),
                    child: Text(
                      'لا محادثات بعد. تبدأ المحادثة من طلب الشراكة، أو من «راسل صاحب العرض» في عروض السوق على الموقع.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: mutedOn(context)),
                    ),
                  ),
                for (final r in rows)
                  Card(
                    child: ListTile(
                      leading: Text(
                          switch (r.kind) { 'support' => '🏛️', 'market' => '🌾', _ => '🤝' },
                          style: const TextStyle(fontSize: 22)),
                      title: Text(r.title,
                          style: TextStyle(fontWeight: r.unread > 0 ? FontWeight.w800 : FontWeight.w600)),
                      subtitle: Text(
                        [
                          if (r.lastBody.isNotEmpty) r.lastBody,
                          if (!r.open) 'مغلقة',
                          if (r.isAdmin && r.reported) 'مبلَّغٌ عنها',
                          if (r.isAdmin && r.needsReply) 'تنتظر ردّك',
                        ].join(' · '),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      trailing: r.unread > 0
                          ? CircleAvatar(
                              radius: 12,
                              backgroundColor: Theme.of(context)
                                  .colorScheme
                                  .primary,
                              child: Text(
                                '${r.unread}',
                                style: TextStyle(
                                  color: Theme.of(context)
                                      .colorScheme
                                      .onPrimary,
                                  fontSize: 12,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                            )
                          : null,
                      onTap: () => _open(r.id),
                    ),
                  ),
              ],
            );
          },
        ),
      ),
    );
  }
}

/// One conversation: the request it began from, the messages under the part
/// each writer plays, «قُرئت», and the box to answer.
class ThreadScreen extends StatefulWidget {
  const ThreadScreen({super.key, required this.id});
  final String id;

  @override
  State<ThreadScreen> createState() => _ThreadScreenState();
}

class _ThreadScreenState extends State<ThreadScreen> {
  late Future<ConversationView> _view = accountController.conversation(widget.id);
  final _text = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  void _reload() => setState(() => _view = accountController.conversation(widget.id));

  Future<void> _send() async {
    final text = _text.text.trim();
    if (text.isEmpty) return;
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _busy = true);
    try {
      await accountController.sendMessage(widget.id, text);
      _text.clear();
      _reload();
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<ConversationView>(
      future: _view,
      builder: (context, snap) {
        final v = snap.data;
        return Scaffold(
          appBar: AppBar(title: Text(v?.title ?? 'محادثة', maxLines: 1, overflow: TextOverflow.ellipsis)),
          body: snap.connectionState != ConnectionState.done && v == null
              ? const Center(child: CircularProgressIndicator())
              : snap.hasError
                  ? Center(
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: Text(snap.error is ApiException ? (snap.error as ApiException).message : 'تعذّر فتح المحادثة.'),
                      ),
                    )
                  : _Thread(view: v!, text: _text, busy: _busy, onSend: _send, onRefresh: () async => _reload()),
        );
      },
    );
  }
}

class _Thread extends StatelessWidget {
  const _Thread({required this.view, required this.text, required this.busy, required this.onSend, required this.onRefresh});
  final ConversationView view;
  final TextEditingController text;
  final bool busy;
  final VoidCallback onSend;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    final v = view;
    final scheme = Theme.of(context).colorScheme;
    final seen = v.seenMessageId;
    return Column(
      children: [
        Container(
          width: double.infinity,
          color: scheme.secondaryContainer.withValues(alpha: 0.35),
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
          child: Text(
            v.pending
                ? 'تقرأ إدارة سوداقري هذه المحادثة. ولا يُكتب رقم هاتفٍ قبل أن يقبل صاحب الأرض الطلب؛ بعد القبول يظهر الهاتف لكلٍّ منكما.'
                : 'تقرأ إدارة سوداقري هذه المحادثة، ولا يُحذف منها شيء.',
            style: const TextStyle(fontSize: 12, height: 1.6),
          ),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: onRefresh,
            child: ListView(
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
              children: [
                if (v.request != null)
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(v.kind == 'market' ? 'العرض في السوق' : 'طلب الشراكة',
                            style: TextStyle(fontSize: 12, color: mutedOn(context), fontWeight: FontWeight.w700)),
                        const SizedBox(height: 4),
                        Text(v.request!),
                      ]),
                    ),
                  ),
                for (final m in v.messages)
                  Align(
                    alignment: m.mine ? AlignmentDirectional.centerStart : AlignmentDirectional.centerEnd,
                    child: ConstrainedBox(
                      constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.82),
                      child: Card(
                        color: m.mine
                            ? leafTintOn(context)
                            : m.role == 'platform'
                                ? scheme.secondaryContainer.withValues(alpha: 0.5)
                                : null,
                        child: Padding(
                          padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text(m.mine ? 'أنت' : (senderLabels[m.role] ?? ''),
                                style: TextStyle(fontSize: 12, color: mutedOn(context), fontWeight: FontWeight.w700)),
                            if (m.body.isNotEmpty) ...[const SizedBox(height: 4), Text(m.body)],
                            if (m.fileUrl != null && m.attachmentKind == 'photo')
                              Padding(
                                padding: const EdgeInsets.only(top: 6),
                                child: ClipRRect(
                                  borderRadius: BorderRadius.circular(8),
                                  child: Image.network(m.fileUrl!, height: 200, fit: BoxFit.cover,
                                      errorBuilder: (_, _, _) => const Text('تعذّر عرض الصورة.')),
                                ),
                              ),
                              if (m.body.isNotEmpty) ...[
                                const SizedBox(height: 4),
                                Text(m.body),
                              ],
                              if (m.fileUrl != null &&
                                  m.attachmentKind == 'photo')
                                Padding(
                                  padding: const EdgeInsets.only(top: 6),
                                  child: ClipRRect(
                                    borderRadius: BorderRadius.circular(8),
                                    child: Image.network(
                                      m.fileUrl!,
                                      height: 200,
                                      fit: BoxFit.cover,
                                      errorBuilder: (_, _, _) =>
                                          const Text('تعذّر عرض الصورة.'),
                                    ),
                                  ),
                                ),
                              if (m.fileUrl != null &&
                                  m.attachmentKind == 'document')
                                TextButton.icon(
                                  onPressed: () => launchUrl(
                                    Uri.parse(m.fileUrl!),
                                    mode: LaunchMode.externalApplication,
                                  ),
                                  icon: const Icon(Icons.description),
                                  label: const Text('افتح المستند'),
                                ),
                              if (m.id == seen)
                                Padding(
                                  padding: const EdgeInsets.only(top: 4),
                                  child: Text(
                                    '✓✓ قُرئت',
                                    style: TextStyle(
                                      fontSize: 11,
                                      color: textGreenOn(context),
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
        if (v.open)
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 4, 12, 8),
              child: Row(children: [
                Expanded(
                  child: TextField(
                    controller: text,
                    minLines: 1,
                    maxLines: 4,
                    maxLength: 2000,
                    decoration: InputDecoration(
                      hintText: v.me == 'admin' ? 'ردّ باسم سوداقري' : 'رسالتك',
                      counterText: '',
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton.filled(
                  onPressed: busy ? null : onSend,
                  icon: busy
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.send),
                  tooltip: 'أرسل',
                ),
              ]),
            ),
          )
        else
          Padding(
            padding: const EdgeInsets.all(12),
            child: Text('أُغلق هذا الطلب، فلا رسائل جديدة فيه. ما كُتب يبقى محفوظاً.',
                style: TextStyle(color: mutedOn(context))),
          ),
      ],
    );
  }
}
