/// أفلام سوداقري في التطبيق — تُشاهَد ولا تُصوَّر.
///
/// The same films as the website's homepage, in its order, each a tile with its
/// poster. A film opens on a screen of its own that is protected while it is
/// open (see secure_screen.dart): on Android a screenshot or a recording shows
/// black; on iOS, which allows no app to block either, the film is hidden and
/// paused for as long as the screen is being recorded or mirrored.
///
/// The phone cut (4:5) is played, the same one the website gives a phone, as
/// MP4: every phone plays H.264, and the cut is about a megabyte per ten
/// seconds. Nothing is fetched until a film is opened, apart from the posters.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';

import '../api.dart';
import '../i18n.dart';
import '../secure_screen.dart';
import '../ui.dart';

/// A film: its file name on the website and its title.
class Film {
  const Film(this.key, this.title);

  final String key;
  final String title;

  String get video => '${ApiConfig.siteUrl}/video/$key-tall.mp4';
  String get poster => '${ApiConfig.siteUrl}/video/$key-tall.jpg';
}

/// The homepage's one film first (src/components/HeroVideo.tsx), then the
/// films the website shows on its other pages, all in one place here.
List<Film> get films => <Film>[
  Film('sudagri', tr('سوداقري — من الماء إلى السوق', 'Sudagri — from water to market')),
  Film('canal', tr('رؤيةُ سوداقري', 'Sudagri\'s vision')),
  Film('seasons', tr('مواسمُ السودان', 'Sudan\'s seasons')),
  Film('know', tr('من المعرفة إلى المائدة', 'From knowledge to the table')),
  Film('hands', tr('أيادٍ تصنع الخير', 'Hands that do good')),
  Film('nafir', tr('النفير… قيمٌ تعمل', 'Nafir… values at work')),
  Film('inhand', tr('معلومتك في يدك', 'Your information in your hand')),
  Film('farmer', tr('مزارعٌ من السودان', 'A farmer from Sudan')),
  Film('film', tr('من السدّ إلى الحقل', 'From the dam to the field')),
  Film('promo', tr('من الماء تبدأ الحياة', 'Life begins with water')),
];

class FilmsScreen extends StatelessWidget {
  const FilmsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(tr('🎬 أفلام سوداقري', '🎬 Sudagri films'))),
      body: ApiConfig.siteUrl.isEmpty
          ? StateView(
              icon: Icons.movie_outlined,
              title: tr('الأفلام تحتاج عنوان الموقع، وهذه النسخة من التطبيق بُنيت بدونه.', 'The films need the website\'s address, and this build of the app was made without it.'),
            )
          : GridView.count(
              crossAxisCount: 2,
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
              mainAxisSpacing: 12,
              crossAxisSpacing: 12,
              childAspectRatio: 0.8,
              children: [
                for (final f in films)
                  _FilmTile(
                    film: f,
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute(builder: (_) => FilmPlayerScreen(film: f)),
                    ),
                  ),
              ],
            ),
    );
  }
}

class _FilmTile extends StatelessWidget {
  const _FilmTile({required this.film, required this.onTap});

  final Film film;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(18),
      child: Material(
        color: Colors.black,
        child: InkWell(
          onTap: onTap,
          child: Stack(
            fit: StackFit.expand,
            children: [
              Image.network(
                film.poster,
                fit: BoxFit.cover,
                errorBuilder: (context, error, stack) => const SizedBox.shrink(),
              ),
              const DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [Colors.transparent, Colors.black87],
                    stops: [0.5, 1],
                  ),
                ),
              ),
              const Center(
                child: Icon(Icons.play_circle_fill, size: 52, color: Colors.white70),
              ),
              Positioned(
                left: 10,
                right: 10,
                bottom: 10,
                child: Text(
                  film.title,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.bold,
                    height: 1.4,
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

class FilmPlayerScreen extends StatefulWidget {
  const FilmPlayerScreen({super.key, required this.film});

  final Film film;

  @override
  State<FilmPlayerScreen> createState() => _FilmPlayerScreenState();
}

class _FilmPlayerScreenState extends State<FilmPlayerScreen> {
  late final VideoPlayerController _controller;
  Timer? _watch;
  bool _captured = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    SecureScreen.on();
    _controller = VideoPlayerController.networkUrl(Uri.parse(widget.film.video));
    _start();
    _controller.addListener(_onTick);
    // iOS: hide and pause the film while the screen is recorded or mirrored.
    _watch = Timer.periodic(const Duration(seconds: 1), (_) => _checkCapture());
    _checkCapture();
  }

  Future<void> _start() async {
    try {
      await _controller.initialize();
      if (!mounted) return;
      setState(() {});
      await _controller.play();
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = tr('تعذّر تشغيل الفيلم. تأكّد من الاتصال ثم أعد المحاولة.', 'Could not play the film. Check the connection and try again.'));
    }
  }

  void _onTick() {
    if (mounted) setState(() {});
  }

  Future<void> _checkCapture() async {
    final captured = await SecureScreen.isCaptured();
    if (!mounted || captured == _captured) return;
    if (captured) _controller.pause();
    setState(() => _captured = captured);
  }

  @override
  void dispose() {
    _watch?.cancel();
    _controller.removeListener(_onTick);
    _controller.dispose();
    SecureScreen.off();
    super.dispose();
  }

  void _toggle() {
    if (_captured || !_controller.value.isInitialized) return;
    if (_controller.value.isPlaying) {
      _controller.pause();
    } else {
      _controller.play();
    }
  }

  @override
  Widget build(BuildContext context) {
    final v = _controller.value;

    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        title: Text(widget.film.title),
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
      ),
      body: Center(
        child: _error != null
            ? Padding(
                padding: const EdgeInsets.all(32),
                child: Text(
                  _error!,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.white70, height: 1.7),
                ),
              )
            : _captured
                ? Padding(
                    padding: EdgeInsets.all(32),
                    child: Text(
                      tr('الفيلم متوقّف أثناء تسجيل الشاشة.\nأفلام سوداقري تُشاهَد على المنصّة.', 'The film is paused while the screen is being recorded.\nSudagri films are watched on the platform.'),
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Colors.white70, height: 1.8),
                    ),
                  )
                : !v.isInitialized
                    ? const CircularProgressIndicator(color: Colors.white)
                    : GestureDetector(
                        onTap: _toggle,
                        child: Stack(
                          alignment: Alignment.center,
                          children: [
                            AspectRatio(
                              aspectRatio: v.aspectRatio,
                              child: VideoPlayer(_controller),
                            ),
                            if (!v.isPlaying)
                              const Icon(Icons.play_circle_fill,
                                  size: 72, color: Colors.white70),
                            Positioned(
                              left: 0,
                              right: 0,
                              bottom: 0,
                              child: VideoProgressIndicator(
                                _controller,
                                allowScrubbing: true,
                                padding: const EdgeInsets.symmetric(vertical: 8),
                              ),
                            ),
                          ],
                        ),
                      ),
      ),
    );
  }
}
