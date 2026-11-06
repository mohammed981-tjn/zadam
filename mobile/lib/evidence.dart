/// دليل المرحلة ومستند الأرض من التطبيق (البند ٢٠٣): the file a farmer attaches to a stage of his season
/// («أضف دليلاً») or to his land («ارفع المستند»), sent as the website sends it.
///
/// The website's upload takes a photo, a scan or a PDF, up to ten megabytes, into the private `evidence` bucket under
/// the uploader's own id (`<user>/stages/…`, `<user>/lands/…`), then hands only the path to the step that writes the
/// row. The app does the same, in two ways:
///
///   - A photo goes to the website's route as base64, and the route stores it (src/lib/appPhoto.ts): the picker keeps
///     the photo's EXIF block, the farm's GPS position included, which the website's canvas drops, so the route reads
///     the time and place into columns and strips them from the file before it is stored.
///   - A PDF goes straight to the bucket with the person's own session, as the browser's upload does — it has no
///     capture time or place to read, the website stores it as it is, and ten megabytes would not fit in one request
///     to the website. The route then gets its path, and checks it is the person's and that the file is there.
///
/// Either way the row is written by the website's own step, under row-level security.
library;

import 'dart:convert';
import 'dart:math';

import 'package:http/http.dart' as http;

import 'account.dart';
import 'api.dart';
import 'i18n.dart';
import 'seasons.dart' show userIdOf;

/// The bucket's own limit, as the website's upload enforces it.
const evidenceMaxBytes = 10 * 1024 * 1024;

/// A photo (JPEG or PNG, from the picker) or a PDF.
class EvidenceFile {
  const EvidenceFile({required this.bytes, required this.name, required this.pdf});
  final List<int> bytes;
  final String name;
  final bool pdf;

  /// What the website writes when no caption was typed: the file's own name; a photo's is the kind it is.
  String captionOr(String typed, String fallback) {
    final t = typed.trim();
    if (t.isNotEmpty) return t;
    return pdf && name.isNotEmpty ? name : fallback;
  }
}

/// Why the file cannot be sent, in the website's words; null when it can.
String? evidenceFileProblem(EvidenceFile f) {
  if (f.bytes.isEmpty) return tr('اختر ملفاً أولاً — صورة أو مستند PDF.', 'Choose a file first — a photo or a PDF document.');
  if (f.bytes.length > evidenceMaxBytes) {
    return tr('الملف ${(f.bytes.length / 1048576).toStringAsFixed(1)} ميجابايت، والحد الأقصى 10.', 'The file is ${(f.bytes.length / 1048576).toStringAsFixed(1)} MB, and the limit is 10.');
  }
  final b = f.bytes;
  final isPdf = b.length > 4 && b[0] == 0x25 && b[1] == 0x50 && b[2] == 0x44 && b[3] == 0x46; // %PDF
  final isJpeg = b.length > 3 && b[0] == 0xff && b[1] == 0xd8 && b[2] == 0xff;
  final isPng = b.length > 8 && b[0] == 0x89 && b[1] == 0x50 && b[2] == 0x4e && b[3] == 0x47;
  if (f.pdf ? !isPdf : !(isJpeg || isPng)) return tr('الصيغ المقبولة: JPG أو PNG أو PDF.', 'Accepted formats: JPG, PNG or PDF.');
  return null;
}

/// A random version-4 id, as `crypto.randomUUID()` names the website's uploads.
String newObjectId([Random? random]) {
  final r = random ?? Random.secure();
  final b = List<int>.generate(16, (_) => r.nextInt(256));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  final h = b.map((x) => x.toRadixString(16).padLeft(2, '0')).join();
  return '${h.substring(0, 8)}-${h.substring(8, 12)}-${h.substring(12, 16)}-${h.substring(16, 20)}-${h.substring(20)}';
}

/// Turns a chosen file into what the route reads: `{photo}` or, once the PDF is in the bucket, `{storage_path}`.
class EvidenceSender {
  EvidenceSender({AccountController? account, http.Client? client, String? supabaseUrl, String? anonKey, this.random})
      : _account = account ?? accountController,
        _client = client ?? http.Client(),
        _supabase = supabaseUrl ?? ApiConfig.supabaseUrl,
        _anon = anonKey ?? ApiConfig.supabaseAnonKey;

  final AccountController _account;
  final http.Client _client;
  final String _supabase;
  final String _anon;

  /// The source of the PDF's random name (a secure one when null); tests pass a seeded one.
  final Random? random;

  /// [folder] is the website's: `stages` or `lands`.
  Future<Map<String, dynamic>> attach(String folder, EvidenceFile f) async {
    final problem = evidenceFileProblem(f);
    if (problem != null) throw ApiException(problem);
    if (!f.pdf) return {'photo': base64Encode(f.bytes)};

    if (_supabase.isEmpty || _anon.isEmpty) throw ApiException(tr('التطبيق غير مضبوط للاتصال بالموقع.', 'The app is not set up to connect to the website.'));
    final s = await _account.fresh();
    if (s == null) throw ApiException(tr('ادخل إلى حسابك.', 'Sign in to your account.'));
    final user = userIdOf(s.accessToken);
    if (user == null) throw ApiException(tr('انتهت جلستك. ادخل من جديد.', 'Your session has ended. Sign in again.'));
    // The storage policy checks the first segment against the caller, so the user's id leads.
    final path = '$user/$folder/${newObjectId(random)}.pdf';
    late final http.Response res;
    try {
      res = await _client
          .post(
            Uri.parse('$_supabase/storage/v1/object/evidence/$path'),
            headers: {
              'apikey': _anon,
              'authorization': 'Bearer ${s.accessToken}',
              'content-type': 'application/pdf',
              'cache-control': 'max-age=3600',
              'x-upsert': 'false',
            },
            body: f.bytes,
          )
          .timeout(const Duration(minutes: 3));
    } catch (_) {
      throw ApiException(tr('تعذّر الاتصال. تحقّق من الشبكة وأعد المحاولة.', 'Could not connect. Check the network and try again.'));
    }
    if (res.statusCode != 200) throw ApiException(tr('تعذّر رفع الملف. أعد المحاولة.', 'Could not upload the file. Try again.'));
    return {'storage_path': path};
  }
}
