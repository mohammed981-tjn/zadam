/// مساعد سودجري on the phone.
///
/// A thin client over the website's /api/assistant route. Everything that makes
/// the assistant worth asking — the retrieval, the local resolvers that answer
/// without a model, the cache, the fallback chain across engines — lives there.
/// Reimplementing any of it here would mean maintaining two assistants and
/// having the worse one in the pocket of the person furthest from help.
library;

import 'package:flutter/material.dart';

import '../api.dart';
import '../theme.dart';

class AssistantScreen extends StatefulWidget {
  const AssistantScreen({super.key});

  @override
  State<AssistantScreen> createState() => _AssistantScreenState();
}

class _Message {
  _Message.user(this.text)
      : fromUser = true,
        source = null,
        isError = false;
  _Message.reply(this.text, this.source)
      : fromUser = false,
        isError = false;
  _Message.error(this.text)
      : fromUser = false,
        source = null,
        isError = true;

  final String text;
  final bool fromUser;
  final String? source;
  final bool isError;
}

/// What the route's `source` field means, in words a reader can act on. The
/// distinction matters: an answer quoted from a curated entry carries different
/// weight from one a language model composed, and hiding that would be the
/// same overclaiming the platform exists to avoid.
const _sourceLabels = {
  'platform': 'من بيانات المنصة',
  'calculator': 'محسوب بمحرك الري',
  'knowledge': 'من قاعدة معرفة سودجري',
  'cache': 'إجابة محفوظة',
  'model': 'من المعرفة العامة',
};

class _AssistantScreenState extends State<AssistantScreen> {
  final _api = SudagriApi();
  final _controller = TextEditingController();
  final _scroll = ScrollController();
  final _messages = <_Message>[];
  bool _sending = false;

  @override
  void dispose() {
    _api.dispose();
    _controller.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final question = _controller.text.trim();
    if (question.isEmpty || _sending) return;

    setState(() {
      _messages.add(_Message.user(question));
      _sending = true;
      _controller.clear();
    });
    _scrollToEnd();

    try {
      final res = await _api.ask(question);
      if (!mounted) return;
      setState(() => _messages.add(_Message.reply(res.answer, res.source)));
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _messages.add(_Message.error(e.message)));
    } finally {
      if (mounted) setState(() => _sending = false);
      _scrollToEnd();
    }
  }

  void _scrollToEnd() {
    // After the frame, so the list has the new item's extent to scroll to.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scroll.hasClients) return;
      _scroll.animateTo(
        _scroll.position.maxScrollExtent,
        duration: const Duration(milliseconds: 250),
        curve: Curves.easeOut,
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('مساعد سودجري')),
      body: Column(
        children: [
          Expanded(
            child: _messages.isEmpty
                ? const _EmptyState()
                : ListView.builder(
                    controller: _scroll,
                    padding: const EdgeInsets.all(16),
                    itemCount: _messages.length,
                    itemBuilder: (_, i) => _Bubble(message: _messages[i]),
                  ),
          ),
          if (_sending) const LinearProgressIndicator(minHeight: 2),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _controller,
                      textInputAction: TextInputAction.send,
                      minLines: 1,
                      maxLines: 4,
                      maxLength: 500,
                      buildCounter: (_,
                              {required currentLength,
                              required isFocused,
                              required maxLength}) =>
                          null,
                      decoration: const InputDecoration(
                        hintText: 'اسأل عن محصول أو ري أو تقنية…',
                      ),
                      onSubmitted: (_) => _send(),
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton.filled(
                    onPressed: _sending ? null : _send,
                    icon: const Icon(Icons.send),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState();

  static const _examples = [
    'كم يحتاج القمح من الماء في الجزيرة؟',
    'كيف أتعامل مع ملوحة التربة؟',
    'ما أفضل موعد لزراعة السمسم؟',
  ];

  @override
  Widget build(BuildContext context) {
    final muted = mutedOn(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.eco_outlined, size: 56, color: muted),
            const SizedBox(height: 16),
            Text(
              'اسألني عن الزراعة في السودان',
              textAlign: TextAlign.center,
              style: TextStyle(
                  fontSize: 16, fontWeight: FontWeight.w700, color: muted),
            ),
            const SizedBox(height: 20),
            ..._examples.map(
              (e) => Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Text('• $e',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: muted, fontSize: 13, height: 1.6)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.message});

  final _Message message;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final isUser = message.fromUser;

    final background = message.isError
        ? scheme.errorContainer
        : isUser
            ? scheme.primary
            : scheme.surface;

    final foreground = message.isError
        ? scheme.onErrorContainer
        : isUser
            ? scheme.onPrimary
            : scheme.onSurface;

    return Align(
      alignment: isUser ? AlignmentDirectional.centerEnd : AlignmentDirectional.centerStart,
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        constraints: BoxConstraints(
          maxWidth: MediaQuery.sizeOf(context).width * 0.85,
        ),
        decoration: BoxDecoration(
          color: background,
          borderRadius: BorderRadius.circular(14),
          border: isUser ? null : Border.all(color: scheme.outline),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SelectableText(
              message.text,
              style: TextStyle(color: foreground, height: 1.7, fontSize: 15),
            ),
            if (message.source != null) ...[
              const SizedBox(height: 6),
              Text(
                _sourceLabels[message.source] ?? message.source!,
                style: TextStyle(
                  color: foreground.withValues(alpha: 0.65),
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
