-- الحدّ الأدنى لإظهار رقمٍ مجمَّع في الرقابة الماليّة: خمسة دفاتر بدل ثلاثة (قرار المالك، 25 أكتوبر 2026، «٥ دفاتر»).
--
-- الحدّ يُقرأ من صفّ الإعدادات في كلّ دالّة (oversight_flows وoversight_links وoversight_stale وoversight_reconcile)
-- فلا تُعدَّل دالّة. والقيد `min_books >= 3` يبقى أرضيّةً لا تنزل عنها الإدارة.
update public.oversight_settings set min_books = 5 where id;
