/// Mining, in its own section.
///
/// Kept apart from the agricultural feed for the same reason the website keeps
/// it apart: someone who came for one of the two is confused by the other, and
/// the safety material here — mercury-free extraction, pit collapse — is not
/// something to meet by accident between two entries about sorghum.
library;

import 'package:flutter/material.dart';

import '../api.dart';
import '../i18n.dart';
import '../theme.dart';
import '../ui.dart';

class MiningScreen extends StatefulWidget {
  const MiningScreen({super.key});

  @override
  State<MiningScreen> createState() => _MiningScreenState();
}

class _MiningScreenState extends State<MiningScreen> {
  final _api = SudagriApi();
  late Future<List<KnowledgeEntry>> _future;

  @override
  void initState() {
    super.initState();
    _future = _api.knowledge(mining: true);
  }

  @override
  void dispose() {
    _api.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final muted = mutedOn(context);

    return Scaffold(
      appBar: AppBar(title: Text(tr('⛏️ التعدين', '⛏️ Mining'))),
      body: FutureBuilder<List<KnowledgeEntry>>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const LoadingView();
          }

          if (snapshot.hasError) {
            return StateView.error(
              snapshot.error,
              onRetry: () =>
                  setState(() => _future = _api.knowledge(mining: true)),
            );
          }

          final entries = snapshot.data ?? const [];

          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
            children: [
              IntroNote(
                tr('قسم منفصل: السلامة في الحفر، والاستخلاص بلا زئبق، وجيولوجيا '
                'الذهب في السودان.', 'A separate section: safety in digging, extraction without mercury, and the geology of gold in Sudan.'),
                icon: Icons.construction_outlined,
              ),
              const SizedBox(height: 20),
              if (entries.isEmpty)
                StateView(
                  icon: Icons.construction_outlined,
                  title: tr('لا توجد مواد في هذا القسم بعد.', 'There is nothing in this section yet.'),
                  compact: true,
                )
              else
                ...entries.map((e) => Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Card(
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(e.title,
                                  style: const TextStyle(
                                      fontSize: 15,
                                      fontWeight: FontWeight.w800,
                                      height: 1.4)),
                              const SizedBox(height: 8),
                              Text(e.content,
                                  style: const TextStyle(
                                      fontSize: 13, height: 1.8)),
                              if (e.sourceNote != null) ...[
                                const SizedBox(height: 10),
                                Text(e.sourceNote!,
                                    style: TextStyle(
                                        fontSize: 12,
                                        color: muted,
                                        height: 1.6)),
                              ],
                            ],
                          ),
                        ),
                      ),
                    )),
            ],
          );
        },
      ),
    );
  }
}
