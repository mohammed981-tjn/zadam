# تفعيل الدخول بحساب Google وFacebook (البند ١٥٣)

الأزرار جاهزة في شاشة الدخول، وتظهر وحدها حين يُفعَّل كلّ مزوّدٍ في Supabase — لا تعديل
في الكود بعدها. التفعيل يحتاج مفاتيح من Google ومن Facebook يضعها **المالك بنفسه** في لوحة
Supabase، ولا تُكتب في المحادثة أبداً.

العنوان الذي يطلبه الاثنان (اسمه «Redirect URI»)، انسخه كما هو:

```
https://ngcbgagtjbhbbscvsfwt.supabase.co/auth/v1/callback
```

وصفحة الخصوصية التي يطلبانها: `https://zadam-khaki.vercel.app/privacy`

## ١) في Supabase أوّلاً: العناوين المسموح العودة إليها

Authentication ← URL Configuration:

- **Site URL:** `https://zadam-khaki.vercel.app`
- **Redirect URLs:** أضف
  - `https://zadam-khaki.vercel.app/auth/callback`
  - `https://*-mohammed981-tjns-projects.vercel.app/**` (لنسخ التجربة)

## ٢) Google (جيميل)

1. افتح `console.cloud.google.com` وأنشئ مشروعاً باسم «Sudagri».
2. في **Google Auth Platform** (أو «OAuth consent screen»):
   - اسم التطبيق «سوداقري»، وبريد الدعم بريدك.
   - الصفحة الرئيسيّة `https://zadam-khaki.vercel.app`، والخصوصية الرابط أعلاه.
   - الجمهور: **External**، ثمّ «نشر» (Publish).
3. في **Clients** (أو «Credentials»): أنشئ «OAuth client ID» من نوع **Web application**،
   وفي «Authorized redirect URIs» الصق عنوان Supabase أعلاه.
4. انسخ **Client ID** و**Client secret**.
5. في Supabase: Authentication ← Sign In / Providers ← **Google** ← فعّل، والصق الاثنين، واحفظ.

## ٣) Facebook

1. افتح `developers.facebook.com` ← My Apps ← Create App، واختر الاستعمال
   «تسجيل الدخول بفيسبوك» (Authenticate and request data from users with Facebook Login).
2. في إعدادات **Facebook Login**: الصق عنوان Supabase في «Valid OAuth Redirect URIs».
3. في App settings ← Basic: رابط الخصوصية أعلاه، ورابط حذف البيانات (User data deletion) هو
   نفسه، والفئة، والأيقونة. ثمّ انسخ **App ID** و**App Secret**.
4. حوّل التطبيق إلى **Live** (منشور).
5. في Supabase: Providers ← **Facebook** ← فعّل، والصق الاثنين، واحفظ.

## بعدها

يظهر الزرّ في شاشة الدخول خلال ساعة (تسأل الشاشة Supabase عن المزوّدات المفعَّلة وتحفظ
الجواب ساعة). أوّل دخولٍ بأيّ منهما يُنشئ الحساب، بالاسم والبريد من Google أو Facebook؛ وإن
جاء الشخص من «سجّل كمستثمر» فُتح حسابه على جانب الاستثمار، وله الجانبان معاً (البند ١٥١).

تطبيق الهاتف (فلوتر) لا يزال بالجوال والبريد؛ ربطُه بـGoogle وFacebook خطوةٌ لاحقة.
