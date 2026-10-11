import type { Locale } from "./i18n";

/**
 * The database's own refusals, in the reader's language.
 *
 * Postgres triggers and functions refuse in Arabic (`raise exception '…'`), and
 * the actions pass that text through as it is — it is the most exact account of
 * why an action was refused. For an English reader the same refusal is looked
 * up here; `%` is a value Postgres filled in, carried over in the same order.
 * A message not listed (a new trigger, or a Postgres error of its own) is shown
 * as it came.
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
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const PATTERNS = MESSAGES.map(([ar, en]) => ({
  re: new RegExp(
    "^" + ar.trim().split("%").map((part) => escape(part)).join("(.+?)") + "$",
    "s",
  ),
  en,
}));

/** The English for a refusal the database wrote in Arabic, or the text as it came. */
export function dbMessage(message: string, locale: Locale): string {
  if (locale !== "en") return message;
  const text = message.trim();
  for (const { re, en } of PATTERNS) {
    const m = re.exec(text);
    if (!m) continue;
    let i = 1;
    return en.replace(/%/g, () => m[i++] ?? "%").trim();
  }
  return message;
}
