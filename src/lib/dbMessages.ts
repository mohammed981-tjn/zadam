import type { Locale } from "./i18n";

/**
 * The database's own refusals, in the reader's language.
 *
 * Postgres triggers and functions refuse in Arabic (`raise exception '…'`), and
 * the actions pass that text through as it is — it is the most exact account of
 * why an action was refused. For an English reader the same refusal is looked
 * up here; `%` is a value Postgres filled in, carried over in the same order.
 * A message not listed is shown as it came only if it is the platform's own
 * refusal (Arabic); what Postgres or PostgREST wrote themselves — table and
 * constraint names, policy names — never reaches a reader (SEC-12, backlog 163):
 * a fixed sentence goes out instead and the text goes to the server log.
 *
 * Generated from every Arabic `raise exception` in supabase/migrations on
 * 11 October; a new one needs its line added here.
 */
const MESSAGES: [string, string][] = [
  ["توثيق مقدّم الخدمة من صلاحية الإدارة وحدها", "Verifying a service provider is for administrators only"],
  ["لا يمكن اعتماد المرحلة قبل رفع إثبات تنفيذ واحد على الأقل — الملاحظة النصية وحدها ليست دليلاً", "A phase cannot be approved before at least one proof of work is uploaded — a text note alone is not evidence"],
  ["لا يمكن اعتماد هذه المرحلة قبل اعتماد % مرحلة سابقة", "This phase cannot be approved before % earlier phase(s) are approved"],
  ["لا يمكن تسجيل الدفع قبل اعتماد المرحلة", "A payment cannot be recorded before the phase is approved"],
  ["لا يمكن نشر مشروع قبل اعتماد المراجعة", "A project cannot be published before its review is approved"],
  ["لا يمكن نشر مشروع بتوثيق ناقص (% من %)", "A project cannot be published with incomplete documentation (% of %)"],
  ["تغيير حالة المراجعة أو النشر متاح للإدارة فقط", "Changing the review or publication status is for administrators only"],
  ["الفرص الجديدة تُرفع كمسودة قيد المراجعة", "New opportunities are submitted as drafts under review"],
  ["لا يمكن نشر أرض قبل التحقق منها", "Land cannot be published before it is verified"],
  ["لا يمكن نشر أرض بتوثيق ناقص (% من %)", "Land cannot be published with incomplete documentation (% of %)"],
  ["التحقق والنشر من صلاحية الإدارة", "Verification and publication are for administrators"],
  ["الأرض الجديدة تُسجَّل غير محقّقة", "New land is registered as unverified"],
  ["يمكن تعديل حالة القراءة فقط", "Only the read status can be changed"],
  ["لا يمكن تأكيد % حصة — المتبقّي % من أصل % حصة", "Cannot confirm % share(s) — % of % shares remain"],
  ["اعتماد المرحلة من صلاحية العميل أو الإدارة — لا يمكن لمقدّم الخدمة اعتماد عمله بنفسه", "Approving a phase is for the client or the administrators — a provider cannot approve their own work"],
  ["تسجيل الدفع من صلاحية العميل أو الإدارة وحدهما", "Recording a payment is for the client or the administrators only"],
  ["إيقاف الجهة أو إعادة تفعيلها من صلاحية الإدارة وحدها", "Suspending or reactivating a provider is for administrators only"],
  ["الدرجة المختارة لا تخصّ سلعة هذا الممرّ", "The chosen grade does not belong to this corridor's commodity"],
  ["انتقالٌ غير مسموح: % ← %", "Transition not allowed: % → %"],
  ["الاعتماد للإدارة وحدها", "Approval is for administrators only"],
  ["العنوان والمحتوى مطلوبان", "A title and content are required"],
  ["المصدر مطلوب — مُدخلٌ بلا مصدرٍ لا يدخل قاعدة المعرفة", "A source is required — an entry without a source does not enter the knowledge base"],
  ["هذا السؤال اعتُمد من قبل", "This question has already been approved"],
  ["الردّ الآلي فارغ", "The automatic reply is empty"],
  ["سجلُّ الاستثمار يُضاف إليه فقط — لا % ", "The investment record can only be added to — no % "],
  ["سجلُّ مراجعات الممرّات يُلحَق ولا يُعدَّل ولا يُحذف — سجّل مراجعةً جديدة بدل تغيير قديمة", "The corridor review record is append-only — record a new review instead of changing an old one"],
  ["انتقالٌ غير مسموح للعقد: من «%» إلى «%»", "Contract transition not allowed: from “%” to “%”"],
  ["عرضُ العقد من صلاحية العميل — مقدّمُ الخدمة لا يعرض عقداً على نفسه", "Offering the contract is for the client — a provider does not offer a contract to themselves"],
  ["لا يُعرض عقدٌ بلا مراحل — أضف مرحلةً واحدةً على الأقلّ", "A contract is not offered without phases — add at least one phase"],
  ["مقدّمُ الخدمة غيرُ موثّقٍ أو غيرُ نشط — لا يُعرض عليه عقد", "The provider is not verified or not active — no contract can be offered to them"],
  ["إلغاءُ مسودّة العقد من صلاحية العميل", "Cancelling a draft contract is for the client"],
  ["سحبُ العرض من صلاحية العميل الذي عرضه", "Withdrawing the offer is for the client who made it"],
  ["قبولُ العقد من صلاحية مقدّم الخدمة — والعميلُ لا يوقّع نيابةً عنه", "Accepting the contract is for the provider — the client does not sign on their behalf"],
  ["إلغاءُ العقد من صلاحية أحد طرفيه", "Cancelling the contract is for one of its two parties"],
  ["إقفالُ العقد من صلاحية العميل — لا يشهد مقدّمُ الخدمة لنفسه بالإنجاز", "Closing the contract is for the client — a provider does not certify their own completion"],
  ["لا يُقفل العقد و% مرحلة لم تُعتمد بعد", "The contract cannot be closed while % phase(s) are not yet approved"],
  ["إعلانُ النزاع من صلاحية أحد طرفي العقد", "Declaring a dispute is for one of the contract's two parties"],
  ["هذا الانتقال من صلاحية الإدارة وحدها", "This transition is for administrators only"],
  ["العقد «%» — ولا تتحرّك مراحلُه إلّا وهو سارٍ", "The contract is “%” — its phases only move while it is active"],
  ["شروطُ المرحلة تجمّدت حين عُرض العقد — لتغييرها أعِد العقد إلى مسودّة", "A phase's terms were frozen when the contract was offered — to change them, return the contract to draft"],
  ["مراحلُ العقد تجمّدت حين عُرض — لا تُضاف ولا تُحذف إلّا بإعادته مسودّةً", "The contract's phases were frozen when it was offered — none can be added or removed unless it returns to draft"],
  ["لا يُدعى إلى نفيرٍ في يومٍ مضى.", "A nafir cannot be called for a day that has passed."],
  ["لديك خمس دعواتٍ مفتوحة. أغلق واحدةً قبل أن تفتح غيرها.", "You have five open calls. Close one before opening another."],
  ["هذه الدعوة أُغلقت.", "This call has been closed."],
  ["هذه الدعوة لم تعد مفتوحة.", "This call is no longer open."],
  ["صاحب الدعوة حاضرٌ فيها أصلاً.", "The caller is already part of the call."],
  ["لديك ثلاثة طلبات فزعةٍ مفتوحة. أغلق واحداً قبل أن تفتح غيره.", "You have three open faza requests. Close one before opening another."],
  ["هذا الطلب أُغلق.", "This request has been closed."],
  ["هذا الطلب لم يعد مفتوحاً.", "This request is no longer open."],
  ["لا تُعاهِد نفسك.", "You cannot pledge to yourself."],
  ["سجّل الدخول أولاً.", "Sign in first."],
  ["التحقّق للإدارة وحدها.", "Verification is for administrators only."],
  ["لديك ثلاثة طلبات جوديةٍ جارية. أتمّ واحداً قبل أن تفتح غيره.", "You have three judiyya requests in progress. Complete one before opening another."],
  ["رابط الدعوة غير صالح.", "The invitation link is not valid."],
  ["هذا الطلب لم يعد يقبل طرفاً.", "This request no longer accepts a party."],
  ["أنت طرفٌ في هذا الطلب أصلاً.", "You are already a party to this request."],
  ["دخل الطرفُ الآخر من قبل.", "The other party has already joined."],
  ["لست طرفاً في هذا الطلب.", "You are not a party to this request."],
  ["مضى وقتُ الالتزام.", "The time to commit has passed."],
  ["ينتظر الطلبُ دخولَ الطرف الآخر.", "The request is waiting for the other party to join."],
  ["تُختار اللجنة بعد التزام الطرفين وقبل الصلح.", "The committee is chosen after both parties commit and before the settlement."],
  ["هذا الأجويد لم تتحقّق منه الإدارة بعد.", "This mediator (ajwad) has not been verified by the administrators yet."],
  ["الأجويد لا يكون طرفاً — الحيادُ هو الأساس.", "A mediator cannot be a party — neutrality comes first."],
  ["لم يخترك الطرفان كلاهما بعد.", "Both parties have not chosen you yet."],
  ["يكتب الصلحَ أجويدٌ رضيه الطرفان وقَبِل.", "The settlement is written by a mediator both parties chose and who accepted."],
  ["هذا الطلب ليس جارياً.", "This request is not in progress."],
  ["لا صلحَ مكتوباً بعد.", "No settlement has been written yet."],
  ["هذا الطلب ختم أو سُحب.", "This request has been sealed or withdrawn."],
  ["سجّلتَ خمس ترعٍ. ما زاد يحتاج الإدارة.", "You have registered five canals. More need the administrators."],
  ["طلبتَ الانضمام من قبل أو أنت عضو.", "You have already asked to join, or you are a member."],
  ["القبول لقيّم الترعة.", "Accepting is for the canal's steward."],
  ["لا طلب بهذا الاسم.", "There is no request by that name."],
  ["التعديل لقيّم الترعة.", "Editing is for the canal's steward."],
  ["لا تبقى ترعةٌ بلا قيّم.", "A canal cannot be left without a steward."],
  ["ليس عضواً في الترعة.", "Not a member of the canal."],
  ["سلّم القيامة لعضوٍ آخر قبل أن تغادر.", "Hand the stewardship to another member before you leave."],
  ["الجدول لقيّم الترعة.", "The schedule is for the canal's steward."],
  ["جدولٌ أطول مما ينبغي.", "The schedule is longer than it should be."],
  ["النوبة لعضوٍ في الترعة وحده.", "A water turn is for a member of the canal only."],
  ["يُربط النفير بترعةٍ أنت عضوٌ فيها.", "A nafir can only be linked to a canal you are a member of."],
  // 20261012130000_supply_chain.sql — suppliers, group orders, deliveries, reports
  ["آخر موعدٍ للانضمام من اليوم، ويوم التوصيل خلال سنة.", "The joining deadline must be today or later, and the drop day within a year."],
  ["أُغلق باب الانضمام إلى هذا الطلب.", "This order is closed to new pledges."],
  ["أُلغي هذا الطلب.", "This order has been cancelled."],
  ["إثبات التسليم لناقل هذا التوصيل.", "Proof of delivery is for this delivery's carrier."],
  ["إسناد التوصيل لمنظّم الطلب.", "Assigning a delivery is for the order's organiser."],
  ["استُلم مقدّمك أو سُلّمت بضاعتك؛ الانسحاب الآن عند المنظّم.", "Your deposit was received or your goods delivered; withdrawing is now up to the organiser."],
  ["اكتب رقم التحويل كما في إشعار البنك.", "Enter the transfer reference as it appears on the bank notice."],
  ["اكتب سبب الردّ ليعرف المورد ما يصلحه.", "Write the reason so the supplier knows what to fix."],
  ["اكتب سبب الردّ ليعرف الناقل ما يصلحه.", "Write the reason so the carrier knows what to fix."],
  ["البذور تُعرض باسم صنفها المعتمد.", "Seed is listed under its approved variety name."],
  ["التعهّد ليس من هذا الطلب.", "That pledge is not part of this order."],
  ["الرمز لمستلم التوصيل وحده.", "The code is for the delivery's recipient only."],
  ["الصنف ليس من منتجات هذا المورد.", "That item is not one of this supplier's products."],
  ["الطلب الجماعي على موردٍ موثّقٍ نشط وحده.", "A group order can only be placed with a verified, active supplier."],
  ["الطلب من صنفٍ واحدٍ إلى عشرين.", "An order has between one and twenty items."],
  ["المبيد بلا رقم تسجيلٍ لدى المجلس لا يُعرض.", "A pesticide without a Council registration number cannot be listed."],
  ["الملفّ ليس في مجلّدك.", "The file is not in your folder."],
  ["الموقع مطلوب، من داخل السودان.", "A location inside Sudan is required."],
  ["انسحب صاحب هذا التعهّد.", "The owner of this pledge has withdrawn."],
  ["تسجيل المقدّم لمنظّم الطلب.", "Recording a deposit is for the order's organiser."],
  ["تعديل التعهّد لمنظّم الطلب.", "Changing a pledge is for the order's organiser."],
  ["حالةٌ غير معروفة.", "Unknown status."],
  ["سجّل بيانات المورد أولاً.", "Register your supplier details first."],
  ["سُجّل مقدّمك على هذا الصنف؛ تعديل الكميّة الآن عند المنظّم.", "Your deposit on this item is recorded; changing the quantity is now up to the organiser."],
  ["صلاحيةُ السعر من اليوم إلى سنةٍ على الأكثر.", "A price is valid from today to at most one year ahead."],
  ["صورة التسليم مطلوبة، من مجلّدك.", "A delivery photo from your own folder is required."],
  ["عشرة بلاغاتٍ في اليوم حدٌّ أعلى.", "Ten reports a day is the limit."],
  ["لا بلاغ بهذا المعرّف.", "No report with that id."],
  ["لا صنف بهذا المعرّف.", "No item with that id."],
  ["لا مورد بهذا المعرّف.", "No supplier with that id."],
  ["لا ناقل بهذا المعرّف.", "No carrier with that id."],
  ["لا يُدفع للناقل قبل تأكيد التسليم بالرمز.", "A carrier is not paid before the delivery is confirmed with the code."],
  ["لا يُلغى إلا توصيلٌ لم يُسلَّم، ممّن أسنده.", "Only an undelivered delivery can be cancelled, by whoever assigned it."],
  ["لا يُوثَّق تاجر تقاوٍ بلا رقم تسجيل الإدارة القومية للتقاوي.", "A seed dealer cannot be verified without a National Seed Administration registration number."],
  ["لا يُوثَّق تاجر مبيدات بلا رقم رخصة المجلس القومي للمبيدات.", "A pesticide dealer cannot be verified without a National Pesticides Council licence number."],
  ["لا يُوثَّق مورد بلا رقم سجلّ تجاري.", "A supplier cannot be verified without a commercial registration number."],
  ["لا يُوثَّق مورد قبل رفع صورة مستنداته.", "A supplier cannot be verified before uploading a photo of their documents."],
  ["لا يُوصَّل لتعهّدٍ منسحبٍ أو متعثّر.", "No delivery for a withdrawn or defaulted pledge."],
  ["لديك خمسة طلباتٍ جارية. أتمّ واحداً قبل أن تفتح غيره.", "You have five orders in progress. Complete one before opening another."],
  ["لم يُصدر المستلم رمزه بعد.", "The recipient has not issued their code yet."],
  ["ليس لك هذا التعهّد.", "This pledge is not yours."],
  ["ليس لك هذا المنتج.", "This product is not yours."],
  ["ليس لك هذا المورد.", "This supplier is not yours."],
  ["مئتا منتجٍ نشط حدٌّ أعلى. أوقف بعضها أولاً.", "Two hundred active products is the limit. Deactivate some first."],
  ["مضى آخر موعدٍ للانضمام.", "The joining deadline has passed."],
  ["هذا التعهّد ليس بانتظار المقدّم.", "This pledge is not awaiting a deposit."],
  ["هذا التوصيل ليس بانتظار التسليم.", "This delivery is not awaiting handover."],
  ["هذا لمن أسند التوصيل.", "This is for whoever assigned the delivery."],
  ["هذا لمنظّم الطلب.", "This is for the order's organiser."],
  ["يُسند التوصيل إلى ناقلٍ موثّقٍ نشط وحده.", "A delivery can only be assigned to a verified, active carrier."],
  ["لديك عشرة عروضٍ مفتوحة. أغلق واحداً قبل أن تضيف غيره.", "You have ten open offers. Close one before adding another."],
  ["أضفتَ عشرين عرضاً اليوم. عُد غداً.", "You have added twenty offers today. Come back tomorrow."],
  ["لا عرضَ مفتوحاً لك بهذا الرقم.", "You have no open offer with this number."],
  ["الأرض متعاقَدٌ على % من % فداناً في جزءٍ من هذه المدّة، والمتبقّي % فقط. عدّلوا المساحة أو المدّة.", "% of the land's % feddans are already contracted during part of this period; only % remain. Change the area or the period."],
  ["اكتب المبلغ بالجنيه", "Enter the amount in pounds"],
  ["سعر الصرف خارج المعقول", "The exchange rate is out of range"],
  ["لا سعر صرفٍ منشوراً خلال ٧ أيام قبل %؛ اكتب السعر الذي صرفت به", "No exchange rate was published in the 7 days before %; enter the rate you exchanged at"],
  ["الفترة حتى % مقفلة؛ لا قيد بتاريخٍ فيها", "The period up to % is closed; no entry can be dated in it"],
  ["لا قيد بتاريخٍ في المستقبل", "An entry cannot be dated in the future"],
  ["الدفتر لا يُعدَّل ولا يُحذف: القيد يُعكس بقيدٍ جديد", "The ledger is never edited or deleted: an entry is reversed by a new entry"],
  ["سُدِّد هذا القيد من قبل", "This entry has already been settled"],
  ["هذا القيد ليس آجلاً", "This entry is not on credit"],
  ["اختر النقد أو البنك أو المحفظة", "Choose cash, bank or wallet"],
  ["السداد لا يسبق القيد", "A settlement cannot come before the entry"],
  ["لم يُسدَّد هذا القيد", "This entry has not been settled"],
  ["سُدِّد هذا القيد؛ ألغِ السداد أولاً ثم عدّله", "This entry was settled; cancel the settlement first, then change it"],
  ["سُدِّد هذا القيد؛ ألغِ السداد أولاً ثم احذفه", "This entry was settled; cancel the settlement first, then delete it"],
  ["ليس هذا قيدك", "This is not your entry"],
  ["نوعٌ غير معروف من القيود المتقابلة", "Unknown kind of linked entry"],
  ["عملة غير معروفة", "Unknown currency"],
  ["مبلغٌ غير صالح", "Invalid amount"],
  ["تاريخٌ غير صالح", "Invalid date"],
  ["أصل التمويل لنصيب الحصاد وحده", "The financing principal belongs to the harvest share only"],
  ["لا عقدَ موقَّعاً بهذا الرقم", "There is no signed agreement with this number"],
  ["لست طرفاً في هذا العقد", "You are not a party to this agreement"],
  ["هذا القيد يقترحه الطرف الآخر", "The other party proposes this entry"],
  ["الأجرة لعقد الإيجار وحده", "Rent belongs to a lease agreement only"],
  ["عقد الإيجار ليس فيه إلا الأجرة", "A lease has nothing but its rent"],
  ["اختر الموسم", "Choose the season"],
  ["الموسم ليس من هذا العقد", "The season is not under this agreement"],
  ["لديك عشرون اقتراحاً معلّقاً؛ انتظر ردّ أصحابها أو ألغِ بعضها", "You have twenty proposals waiting; wait for their answers or cancel some"],
  ["ليس هذا اقتراحاً موجّهاً إليك", "This proposal is not addressed to you"],
  ["سُبق البتّ في هذا الاقتراح", "This proposal has already been decided"],
  ["اختر أين استلمت: النقد أو البنك أو المحفظة", "Choose where you received it: cash, bank or wallet"],
  ["لا سعر صرفٍ منشوراً خلال ٧ أيام قبل %؛ يكتب مقترِحُ القيد السعر الذي صرف به", "No exchange rate was published in the 7 days before %; the proposer must type the rate used"],
  ["اكتب سبب الاعتراض (٣ أحرفٍ فأكثر): يراه صاحب الاقتراح", "Write the reason for the objection (3 characters or more): the proposer sees it"],
  ["ليس هذا اقتراحك", "This is not your proposal"],
  ["القيد غير موجود", "The entry does not exist"],
  ["لا قيد لهذا السطر في الدفتر", "This row has no entry in the book"],
  ["لا دين مقيَّد لهذا السطر", "This row has no debt recorded"],
  ["اكتب سبب الإلغاء (٣ أحرفٍ فأكثر): يراه شريكك", "Write the reason for cancelling (3 characters or more): your partner sees it"],
  ["ليس هذا قيداً من قيودك", "This is not one of your entries"],
  ["لا يُطلب إلغاء إلا لقيدٍ مؤكَّد", "Only a confirmed entry can be asked to be cancelled"],
  ["أُلغي هذا القيد من قبل باتّفاق الطرفين", "This entry was already cancelled by both partners' agreement"],
  ["شريكك طلب إلغاءه من قبل؛ ردّ على طلبه", "Your partner has already asked to cancel it; answer their request"],
  ["ليس هذا طلباً موجّهاً إليك", "This request is not addressed to you"],
  ["سُبق البتّ في هذا الطلب", "This request has already been decided"],
  ["القيد ليس مؤكَّداً", "The entry is not confirmed"],
  ["اكتب سبب الرفض (٣ أحرفٍ فأكثر): يراه صاحب الطلب", "Write the reason for refusing (3 characters or more): the requester sees it"],
  ["ليس هذا طلبك", "This is not your request"],
  ["طلبات الإلغاء لا تُحذف", "Cancellation requests are never deleted"],
  ["طلب الإلغاء بعد البتّ فيه لا يتغيّر", "A cancellation request cannot change once decided"],
  ["لا يتغيّر من طلب الإلغاء إلا بتّه", "Nothing in a cancellation request changes except its outcome"],
  ["للإدارة وحدها", "For administrators only"],
  ["الأسعار المحفوظة لا تُفرَّغ", "Kept prices are never emptied"],
  ["سجلّ المحو لا يتغيّر", "The erasure log never changes"],
  ["ما يُقرأ من الأسعار يُحفظ ولا يمحوه إلا المدير", "What is read of the prices is kept; only an administrator can erase it"],
  ["اكتب سبب المحو (٣ أحرفٍ فأكثر).", "Write the reason for erasing (3 characters or more)."],
  ["لا رقمَ بهذا المعرّف.", "There is no figure with this id."],
  ["مدىً غير صالح", "Invalid range"],
  ["العكس لا يسبق القيد الأصل", "A reversal cannot be dated before the entry it reverses"],
  ["عُكس هذا القيد من قبل", "This entry was already reversed"],
  ["لا يُعكس قيدٌ عاكس", "A reversing entry cannot itself be reversed"],
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const PATTERNS = MESSAGES.map(([ar, en]) => ({
  re: new RegExp(
    "^" + ar.trim().split("%").map((part) => escape(part)).join("(.+?)") + "$",
    "s",
  ),
  en,
}));

const WITHHELD: Record<Locale, string> = {
  ar: "تعذّر تنفيذ الطلب. حاول مرة أخرى، وإن تكرّر فأخبر الإدارة.",
  en: "The request could not be completed. Try again, and tell the team if it keeps happening.",
};

/** What Postgres and PostgREST write on their own, in every wording they use. */
const ENGINE_TEXT =
  /violates|duplicate key|constraint|row-level security|permission denied|syntax error|does not exist|invalid input|null value|could not|deadlock|timeout|JWT|PGRST|relation "|column "|function |schema |operator |type "|unrecognized|must be owner|not authorized/i;

/** True for a refusal the platform wrote itself: Arabic, and none of the engine's own phrasing. */
export function isPlatformMessage(message: string): boolean {
  return /[\u0600-\u06FF]/.test(message) && !ENGINE_TEXT.test(message);
}

/**
 * The English for a refusal the database wrote in Arabic, the Arabic as it came, or — for text
 * the database engine wrote itself — a fixed sentence.
 */
export function dbMessage(message: string, locale: Locale): string {
  if (!message?.trim()) return message ?? "";
  const text = message.trim();
  if (locale === "en") {
    for (const { re, en } of PATTERNS) {
      const m = re.exec(text);
      if (!m) continue;
      let i = 1;
      return en.replace(/%/g, () => m[i++] ?? "%").trim();
    }
  }
  if (isPlatformMessage(text)) return message;
  console.warn("db message withheld from the reader:", text.slice(0, 300));
  return WITHHELD[locale];
}
