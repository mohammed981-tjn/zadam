/// مساعد سوداقري on the phone.
///
/// A thin client over the website's /api/assistant route. Everything that makes
/// the assistant worth asking — the retrieval, the local resolvers that answer
/// without a model, the cache, the fallback chain across engines — lives there.
/// Reimplementing any of it here would mean maintaining two assistants and
/// having the worse one in the pocket of the person furthest from help.
library;

import 'package:flutter/material.dart';

import '../api.dart';
import '../i18n.dart';
import '../theme.dart';
import '../ui.dart';

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
Map<String, String> get _sourceLabels => {
  'platform': tr('من بيانات المنصة', 'From the platform\'s data'),
  'calculator': tr('محسوب بمحرك الري', 'Worked out by the irrigation engine'),
  'knowledge': tr('من قاعدة معرفة سوداقري', 'From Sudagri\'s knowledge base'),
  'cache': tr('إجابة محفوظة', 'A saved answer'),
  'model': tr('من المعرفة العامة', 'From general knowledge'),
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
      appBar: AppBar(title: Text(tr('مساعد سوداقري', 'Sudagri assistant'))),
      body: Column(
        children: [
          Expanded(
            child: _messages.isEmpty
                ? _EmptyState(
                    onPick: (q) {
                      // Fills the box; the farmer still decides to send it.
                      _controller.text = q;
                      _controller.selection = TextSelection.collapsed(
                        offset: q.length,
                      );
                    },
                  )
                : ListView.builder(
                    controller: _scroll,
                    padding: const EdgeInsets.all(16),
                    itemCount: _messages.length,
                    itemBuilder: (_, i) => _Bubble(message: _messages[i]),
                  ),
          ),
          if (_sending) const LinearProgressIndicator(minHeight: 3),
          DecoratedBox(
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.surface,
              border: Border(
                top: BorderSide(color: Theme.of(context).colorScheme.outline),
              ),
            ),
            child: SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
                child: Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _controller,
                        textInputAction: TextInputAction.send,
                        minLines: 1,
                        maxLines: 4,
                        maxLength: 500,
                        buildCounter: (
                          _, {
                          required currentLength,
                          required isFocused,
                          required maxLength,
                        }) => null,
                        decoration: InputDecoration(
                          hintText: tr('اسأل عن محصول أو ري أو تقنية…', 'Ask about a crop, irrigation or a technique…'),
                          fillColor: Theme.of(context).scaffoldBackgroundColor,
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(24),
                            borderSide: BorderSide(
                              color: Theme.of(context).colorScheme.outline,
                            ),
                          ),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(24),
                            borderSide: BorderSide(
                              color: Theme.of(context).colorScheme.outline,
                            ),
                          ),
                          focusedBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(24),
                            borderSide: BorderSide(
                              color: Theme.of(context).colorScheme.primary,
                              width: 2,
                            ),
                          ),
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 18,
                            vertical: 12,
                          ),
                        ),
                        onSubmitted: (_) => _send(),
                      ),
                    ),
                    const SizedBox(width: 8),
                    IconButton.filled(
                      tooltip: tr('أرسل', 'Send'),
                      style: IconButton.styleFrom(
                        backgroundColor: Theme.of(context).colorScheme.primary,
                        foregroundColor: Theme.of(context)
                            .colorScheme
                            .onPrimary,
                        minimumSize: const Size(48, 48),
                      ),
                      onPressed: _sending ? null : _send,
                      icon: const Icon(Icons.send_rounded),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.onPick});

  /// Puts an example into the box.
  final ValueChanged<String> onPick;

  static List<String> get _examples => [
    tr('كم يحتاج القمح من الماء في الجزيرة؟', 'How much water does wheat need in Gezira?'),
    tr('كيف أتعامل مع ملوحة التربة؟', 'How do I deal with soil salinity?'),
    tr('ما أفضل موعد لزراعة السمسم؟', 'When is the best time to plant sesame?'),
  ];

  @override
  Widget build(BuildContext context) {
    final muted = mutedOn(context);
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(28),
        child: FadeIn(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const IconChip(Icons.eco, size: 72),
              const SizedBox(height: 16),
              Text(
                tr('اسألني عن الزراعة في السودان', 'Ask me about farming in Sudan'),
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 22),
              for (final e in _examples)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 5),
                  child: Material(
                    color: Theme.of(context).colorScheme.surface,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                      side: BorderSide(
                        color: Theme.of(context).colorScheme.outline,
                      ),
                    ),
                    clipBehavior: Clip.antiAlias,
                    child: InkWell(
                      onTap: () => onPick(e),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 14,
                          vertical: 12,
                        ),
                        child: Row(
                          children: [
                            Icon(
                              Icons.lightbulb_outline,
                              size: 18,
                              color: textGreenOn(context),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text(
                                e,
                                style: const TextStyle(
                                  fontSize: 14,
                                  height: 1.5,
                                ),
                              ),
                            ),
                            Icon(
                              Icons.north_west_rounded,
                              size: 16,
                              color: muted,
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
    );
  }
}

/// A message: the farmer's on the olive at the far side, the
/// assistant's on a card at the near side with its leaf, an error on the
/// dark-gold tint.
class _Bubble extends StatelessWidget {
  const _Bubble({required this.message});

  final _Message message;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final isUser = message.fromUser;

    final background = message.isError
        ? warnTintOn(context)
        : isUser
            ? scheme.primary
            : scheme.surface;

    final foreground = message.isError
        ? warnOn(context)
        : isUser
            ? scheme.onPrimary
            : scheme.onSurface;

    const r = Radius.circular(18);
    const tail = Radius.circular(4);

    final bubble = Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      constraints: BoxConstraints(
        maxWidth: MediaQuery.sizeOf(context).width * (isUser ? 0.8 : 0.74),
      ),
      decoration: BoxDecoration(
        color: background,
        // The corner nearest the speaker is the tail.
        borderRadius: BorderRadiusDirectional.only(
          topStart: isUser ? r : tail,
          topEnd: isUser ? tail : r,
          bottomStart: r,
          bottomEnd: r,
        ),
        border: isUser
            ? null
            : Border.all(
                color: message.isError
                    ? warnOn(context).withValues(alpha: 0.35)
                    : scheme.outline,
              ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SelectableText(
            message.text,
            style: TextStyle(color: foreground, height: 1.7, fontSize: 15),
          ),
          if (message.source != null) ...[
            const SizedBox(height: 8),
            TagPill(
              _sourceLabels[message.source] ?? message.source!,
              icon: Icons.verified_outlined,
            ),
          ],
        ],
      ),
    );

    return FadeIn(
      child: Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Row(
          mainAxisAlignment: isUser
              ? MainAxisAlignment.end
              : MainAxisAlignment.start,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (!isUser) ...[
              IconChip(
                message.isError ? Icons.cloud_off_rounded : Icons.eco,
                size: 32,
                warn: message.isError,
              ),
              const SizedBox(width: 8),
            ],
            Flexible(child: bubble),
          ],
        ),
      ),
    );
  }
}
