/// The news as the app reads it from the same table as the website's /news.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:sudagri/api.dart';
import 'package:sudagri/screens/news_screen.dart';

void main() {
  test('a news row parses, with the optional fields optional', () {
    final full = NewsItem.fromJson({
      'title': 'خريطة الأمطار الجديدة',
      'summary': 'بنطاقاتٍ ناعمة وأرقامٍ عند المدن',
      'body': 'النصّ الكامل',
      'link_path': '/rain',
      'link_label': 'افتح الخريطة',
      'published_at': '2026-09-25T06:00:00Z',
    });
    expect(full.title, 'خريطة الأمطار الجديدة');
    expect(full.linkPath, '/rain');
    expect(full.publishedAt.toUtc().day, 25);

    final bare = NewsItem.fromJson({
      'title': 'خبر',
      'body': 'نص',
      'published_at': '2026-09-01T10:00:00Z',
    });
    expect(bare.summary, isNull);
    expect(bare.linkPath, isNull);
  });

  test('the date is written in Arabic, on Khartoum time', () {
    expect(newsDate(DateTime.utc(2026, 9, 25, 6)), '25 سبتمبر 2026');
    // 23:00 UTC is already the next day in Khartoum (UTC+2).
    expect(newsDate(DateTime.utc(2026, 12, 31, 23)), '1 يناير 2027');
  });
}
