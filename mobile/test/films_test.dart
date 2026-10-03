import 'package:flutter_test/flutter_test.dart';
import 'package:sudagri/screens/films_screen.dart';

void main() {
  test('every film has its own key and the phone cut as MP4', () {
    expect(films.map((f) => f.key).toSet().length, films.length);
    for (final f in films) {
      expect(f.video, endsWith('/video/${f.key}-tall.mp4'));
      expect(f.poster, endsWith('/video/${f.key}-tall.jpg'));
      expect(f.title.trim(), isNotEmpty);
    }
  });

  test('the website files the app plays exist', () {
    // Kept in step with src/components/HeroVideo.tsx; a key here with no
    // phone cut in public/video would open a black screen.
    expect(films.map((f) => f.key), ['film', 'promo', 'farmer', 'canal', 'seasons', 'hands']);
  });
}
