/// Mining, in its own section.
///
/// Kept apart from the agricultural feed for the same reason the website keeps
/// it apart: someone who came for one of the two is confused by the other, and
/// the safety material here — mercury-free extraction, pit collapse — is not
/// something to meet by accident between two entries about sorghum.
library;

import 'package:flutter/material.dart';

import '../api.dart';
import '../theme.dart';

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
      appBar: AppBar(title: const Text('⛏️ التعدين')),
      body: FutureBuilder<List<KnowledgeEntry>>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }

          if (snapshot.hasError) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.cloud_off, size: 44, color: muted),
                    const SizedBox(height: 14),
                    Text('${snapshot.error}',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: muted, height: 1.7)),
                    const SizedBox(height: 18),
                    FilledButton(
                      onPressed: () => setState(
                          () => _future = _api.knowledge(mining: true)),
                      child: const Text('إعادة المحاولة'),
                    ),
                  ],
                ),
              ),
            );
          }

          final entries = snapshot.data ?? const [];

          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
            children: [
              Text(
                'قسم منفصل: السلامة في الحفر، والاستخلاص بلا زئبق، وجيولوجيا '
                'الذهب في السودان.',
                style: TextStyle(color: muted, height: 1.8),
              ),
              const SizedBox(height: 20),
              if (entries.isEmpty)
                Text('لا توجد مواد في هذا القسم بعد.',
                    style: TextStyle(color: muted))
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
