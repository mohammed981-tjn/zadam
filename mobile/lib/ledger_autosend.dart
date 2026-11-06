/// القيد المحفوظ يُرسَل وحده حين تعود الشبكة (البند ٢٠٣، متابعة القيد بلا شبكة).
///
/// Until now an entry kept on the phone went only when a seasons screen opened, on a pull to refresh, or with «أرسل
/// الآن». Now it also goes by itself while the app is open, with no new plugin:
///
///   - when the app comes back to the front (the commonest moment the network is back: the farmer walked into
///     coverage and opened the phone), and when someone signs in;
///   - and, while an entry with a season waits, on a light retry: 30 seconds after it was kept or after an attempt
///     that sent nothing, then twice as long each time, ten minutes at most. Something sent starts it over; an empty
///     box, a signed-out phone or the app in the background stops it.
///
/// It sends through `SeasonsApi.sendPending` — the same rules as every other send (the website's outbox,
/// src/lib/outbox.ts: twenty items, seven days, only the signed-in account's own), and the same answers: a refusal is
/// not sent again and its reason is reported, an outage puts the entry back to wait. One attempt at a time: it never
/// starts while another send is under way or waiting (`LedgerOutbox.busy`), and `LedgerOutbox.send` itself runs one
/// send at a time, so no entry goes out twice at once. Each entry carries its idempotency key, so even an answer lost
/// on the way back does not write it twice.
///
/// A blank-form entry with no season yet is not sent by itself: its season is the farmer's choice in «مواسمي».
library;

import 'dart:async';
import 'dart:math';

import 'package:flutter/widgets.dart';

import 'account.dart';
import 'seasons.dart';

class LedgerAutoSender with WidgetsBindingObserver {
  LedgerAutoSender({
    SeasonsApi Function()? api,
    AccountController? account,
    this.first = const Duration(seconds: 30),
    this.longest = const Duration(minutes: 10),
  })  : _api = api ?? (() => SeasonsApi()),
        _account = account ?? accountController;

  final SeasonsApi Function() _api;
  final AccountController _account;

  /// The first wait after an entry is kept or an attempt sends nothing; each later one is twice as long, to [longest].
  final Duration first;
  final Duration longest;

  /// The last attempt that sent something or met a refusal, for an open screen to show and to read its box again.
  final reports = ValueNotifier<SendReport?>(null);

  Timer? _timer;
  int _misses = 0;
  bool _started = false;
  bool _stopped = false;
  bool _attempting = false;
  bool _foreground = true;

  /// When the next retry is due (for tests and for nothing else).
  @visibleForTesting
  Duration? scheduled;

  /// The wait before the retry after [misses] attempts in a row that sent nothing.
  Duration delayFor(int misses) {
    final ms = first.inMilliseconds * pow(2, min(misses, 20));
    return Duration(milliseconds: min(ms, longest.inMilliseconds).toInt());
  }

  /// Starts listening: the app's lifecycle, the account, and the box. Once; a second call does nothing.
  void start() {
    if (_started) return;
    _started = true;
    _stopped = false;
    WidgetsBinding.instance.addObserver(this);
    _account.addListener(_fresh);
    LedgerOutbox.kept.addListener(_onKept);
    unawaited(attempt());
  }

  /// Stops listening and drops the retry; nothing more is scheduled until [start].
  void stop() {
    _stopped = true;
    _cancel();
    if (!_started) return;
    _started = false;
    WidgetsBinding.instance.removeObserver(this);
    _account.removeListener(_fresh);
    LedgerOutbox.kept.removeListener(_onKept);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    switch (state) {
      case AppLifecycleState.resumed:
        _foreground = true;
        _fresh();
      case AppLifecycleState.paused || AppLifecycleState.hidden || AppLifecycleState.detached:
        _foreground = false;
        _cancel();
      case AppLifecycleState.inactive:
        break;
    }
  }

  /// A moment the network may well be back: try now, and start the waits over.
  void _fresh() {
    _misses = 0;
    unawaited(attempt());
  }

  /// An entry was just kept, because the network was not there: try again after the first wait, not at once.
  void _onKept() {
    if (_timer == null && _started && _foreground) _schedule();
  }

  void _cancel() {
    _timer?.cancel();
    _timer = null;
    scheduled = null;
  }

  void _schedule() {
    _cancel();
    if (_stopped || !_foreground) return;
    final wait = delayFor(_misses);
    scheduled = wait;
    _timer = Timer(wait, () {
      _timer = null;
      scheduled = null;
      unawaited(attempt());
    });
  }

  Future<bool> _waits(SeasonsApi api, String userId) async =>
      (await api.outbox.pending(userId)).any((i) => i.seasonId != null);

  /// One attempt. Null when none was made: one is under way, a send is busy, nobody is signed in, or nothing waits.
  Future<SendReport?> attempt() async {
    if (_attempting) return null;
    if (LedgerOutbox.busy) {
      // A screen is sending now; if that send leaves something waiting, the retry finds it.
      _schedule();
      return null;
    }
    _attempting = true;
    _cancel();
    try {
      final api = _api();
      final userId = api.userId;
      if (userId == null || !await _waits(api, userId)) {
        _misses = 0;
        return null;
      }
      final report = await api.sendPending();
      if (report.sent > 0 || report.refused.isNotEmpty) reports.value = report;
      _misses = report.sent > 0 ? 0 : _misses + 1;
      if (await _waits(api, userId)) _schedule();
      return report;
    } catch (_) {
      // Never an uncaught error from a timer: the next moment tries again.
      _misses++;
      _schedule();
      return null;
    } finally {
      _attempting = false;
    }
  }
}

/// The app's one automatic sender, started by main().
final ledgerAutoSender = LedgerAutoSender();
