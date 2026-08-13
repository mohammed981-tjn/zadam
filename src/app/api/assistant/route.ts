import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { retrieveRelevant, type RetrievableEntry } from "@/lib/retrieval";
import { answerLocally, bestEffortAnswer } from "@/lib/localAnswer";
import { getCachedAnswer, setCachedAnswer } from "@/lib/answerCache";
import { INVESTMENT_LIVE } from "@/lib/config";

const SYSTEM_PROMPT = `أنت "مساعد سودجري" — مساعد ذكي يتحدث العربية فقط لمنصة "سودجري" للاستثمار الزراعي في السودان. تجيب على ثلاثة أنواع من الأسئلة، ولكل نوع قاعدة مختلفة:

1) أسئلة عن فرص الاستثمار المطروحة على المنصة (بيانات "المشاريع" أدناه):
   لا تختلق فرصة استثمارية ولا سعر حصة ولا عائداً غير موجود في هذه البيانات. وإن كانت القائمة فارغة (] [) فلا توجد فرص مطروحة، وقلها بجملة واحدة قصيرة: "لا توجد حالياً فرص استثمار مطروحة على المنصة." ثم انتقل فوراً لمساعدة الزائر فيما سأل عنه.
   تنبيه مهم جداً: هذه القاعدة تخصّ "الفرص المطروحة للاستثمار" فقط، ولا تمنعك إطلاقاً من الحديث عن أي مكان أو مشروع زراعي حقيقي في السودان. مشروع الجزيرة، وسوبا غرب، والرهد، وحلفا الجديدة، وكنانة، والسروراب، وأي منطقة زراعية أخرى — كلها أماكن حقيقية معروفة، وسؤال الزائر عنها سؤال معرفي مشروع يستحق إجابة وافية بحسب القاعدة 3. لا ترفض ولا تكتفِ بالقول إنها غير متاحة على المنصة.
   القاعدة الفاصلة: إن كان السؤال "هل أستطيع الاستثمار في س؟" فأجب عن حالة المنصة. وإن كان "ما هو س؟" أو "حدثني عن الزراعة في س؟" فهذا سؤال معرفة — أجب عنه مباشرة وبإفادة.

2) أسئلة عن محتوى "قاعدة المعرفة الزراعية" أدناه (محاصيل وثروة حيوانية سودانية موثّقة):
   استخدمها كمصدر أول، واذكر الدولة المرجعية (source_country) بوضوح، ووضّح أنها معرفة عامة تحتاج تحققاً محلياً إن كان source_note يشير لذلك.

3) أي سؤال زراعي عام آخر (محصول أو ماشية أو تقنية أو منطقة أو مشروع زراعي في السودان لم يرد في قاعدة المعرفة):
   أجب من معرفتك الزراعية الواسعة ولا ترفض. ابدأ بعبارة "بحسب معرفة زراعية عامة (خارج قاعدة بيانات المنصة المتحقق منها):" ليعرف القارئ أن المصدر غير مُدقَّق من فريق سودجري، ثم أعطِ إجابة حقيقية ومفيدة. وإن كانت معلوماتك عن المكان محدودة فقل ما تعرفه بدقة واذكر حدود معرفتك — هذا أنفع للزائر بكثير من صدّه.

قواعد عامة لكل الأنواع:
- لا تخلط بين الأنواع الثلاثة أبداً: معلومات المشاريع دائماً من البيانات فقط، أما المعرفة الزراعية العامة فمُعلَن عنها بوضوح كما في القاعدة 3.
- لا تقدّم نصائح مالية قاطعة ("استثمر الآن"، "هذا مضمون") — اعرض الحقائق المتاحة فقط ودع القارئ يقرر.
- كن مختصراً ومباشراً وودوداً بعربية فصحى بسيطة.
- اكتب نصاً عادياً فقط بدون أي رموز تنسيق (بدون **، بدون #، بدون قوائم بشرطات) لأن الرد يُعرض كنص خام.`;

export async function POST(req: NextRequest) {
  let question: unknown;
  try {
    ({ question } = await req.json());
  } catch {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }

  if (
    typeof question !== "string" ||
    question.trim().length === 0 ||
    question.length > 500
  ) {
    return NextResponse.json({ error: "سؤال غير صالح" }, { status: 400 });
  }

  // Note there is no early return when GEMINI_API_KEY is missing. The assistant
  // no longer depends on the model being reachable: the platform answers what it
  // can from its own engines and knowledge base first, and only what survives
  // that is sent out. A missing key now costs the general-knowledge answers, not
  // the assistant.
  const apiKey = process.env.GEMINI_API_KEY;

  try {
    const supabase = await createClient();

    // The leftmost x-forwarded-for entry is client-supplied and spoofable; the
    // last entry is the one Vercel's edge appends for the real connecting IP.
    const forwardedFor = req.headers.get("x-forwarded-for");
    const ip =
      req.headers.get("x-real-ip") ??
      forwardedFor?.split(",").pop()?.trim() ??
      "unknown";
    const { data: allowed, error: rateLimitError } = await supabase.rpc(
      "check_assistant_rate_limit",
      {
        p_ip: ip,
      },
    );

    if (rateLimitError) {
      console.error("assistant: rate limit check failed", rateLimitError);
    } else if (allowed === false) {
      return NextResponse.json(
        {
          error:
            "عدد كبير من الأسئلة خلال دقيقة قصيرة. انتظر قليلاً ثم أعد المحاولة.",
        },
        { status: 429 },
      );
    }

    const [
      { data: projects, error: projectsError },
      { data: knowledge, error: knowledgeError },
    ] = await Promise.all([
      supabase
        .from("projects")
        .select(
          "name, location, description, total_feddans, price_per_share, total_shares, shares_sold, status, risk_level, expected_annual_return",
        )
        .neq("status", "draft"),
      supabase
        .from("knowledge_entries")
        .select("crop, topic, title, content, source_country, source_note"),
    ]);

    if (projectsError || knowledgeError) {
      const dbError = projectsError ?? knowledgeError;
      console.error("assistant: supabase error", dbError);
      return NextResponse.json(
        { error: `تعذّر قراءة البيانات: ${dbError?.message}` },
        { status: 502 },
      );
    }

    const projectsContext = JSON.stringify(projects ?? []);

    // Send only the entries that bear on the question. Sending the whole base
    // cost about 18,000 prompt tokens per question and buried the two entries
    // that answered it among forty-five that did not.
    const allKnowledge = (knowledge ?? []) as RetrievableEntry[];
    const matched = retrieveRelevant(question, allKnowledge, 12);
    const knowledgeContext = JSON.stringify(matched);

    // A question the retriever could not match is a gap in the base. Logging it
    // turns visitor questions into the list of what to write next. Never allowed
    // to break the answer the visitor is waiting for.
    const logQuestion = (answered: boolean) =>
      supabase
        .rpc("log_assistant_question", {
          p_question: question,
          p_matched:
            matched.length === allKnowledge.length
              ? allKnowledge.length
              : matched.length,
          p_answered: answered,
        })
        .then(
          () => undefined,
          (e: unknown) => console.error("assistant: question log failed", e),
        );

    /*
     * Answer from the platform itself before reaching for the model.
     *
     * Three kinds of question do not need one: what is on offer (a flag and a
     * table), how much water a crop needs (FAO-56 arithmetic the platform
     * already runs), and anything a curated entry answers squarely. These come
     * back in under a millisecond, cost nothing, and cannot be hallucinated.
     */
    const local = answerLocally({
      question,
      entries: allKnowledge,
      projectCount: projects?.length ?? 0,
      investmentLive: INVESTMENT_LIVE,
    });

    if (local) {
      await logQuestion(true);
      return NextResponse.json({ answer: local.answer, source: local.source });
    }

    // Visitors repeat each other. Serving the second asker from memory keeps the
    // quota for questions nobody has asked yet.
    const cached = getCachedAnswer(question);
    if (cached) {
      await logQuestion(true);
      return NextResponse.json({ answer: cached, source: "cache" });
    }

    if (!apiKey) {
      await logQuestion(false);
      return NextResponse.json(
        {
          error:
            "لا أملك إجابة موثّقة لهذا السؤال في قاعدة سودجري بعد، ومحرك المعرفة العامة غير مُفعّل حالياً. جرّب صياغة أقرب لمحصول أو تقنية بعينها، أو اسألني عن الاحتياج المائي لمحصول محدد.",
        },
        { status: 503 },
      );
    }

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `المشاريع المعروضة حالياً (JSON):\n${projectsContext}\n\nقاعدة المعرفة الزراعية (JSON):\n${knowledgeContext}\n\nسؤال الزائر: ${question}`,
                },
              ],
            },
          ],
          generationConfig: { maxOutputTokens: 3072, temperature: 0.3 },
        }),
      },
    );

    if (!geminiRes.ok) {
      const bodyText = await geminiRes.text();
      console.error("assistant: gemini error", geminiRes.status, bodyText);
      await logQuestion(false);

      // The model being down is not a reason to send the visitor away empty
      // handed. Show the nearest entries, labelled as approximate.
      const degraded = bestEffortAnswer(question, allKnowledge);
      if (degraded) {
        return NextResponse.json({
          answer: degraded.answer,
          source: "knowledge",
        });
      }

      if (geminiRes.status === 429) {
        return NextResponse.json(
          {
            error:
              "المساعد يستقبل عدداً كبيراً من الأسئلة حالياً وتجاوزنا الحد المجاني المؤقت. حاول مرة أخرى خلال دقائق قليلة.",
          },
          { status: 429 },
        );
      }

      return NextResponse.json(
        {
          error: `تعذّر الاتصال بمحرك سودجري الذكي (HTTP ${geminiRes.status}): ${bodyText.slice(0, 300)}`,
        },
        { status: 502 },
      );
    }

    const data = await geminiRes.json();

    /*
     * Join every part rather than reading the first. The model may split an
     * answer across parts, and it can emit a reasoning part before the reply —
     * taking parts[0] blindly returns a thought or nothing at all. Parts
     * flagged as thoughts are dropped; they are not for the reader.
     */
    type Part = { text?: string; thought?: boolean };
    const parts: Part[] = data.candidates?.[0]?.content?.parts ?? [];
    const rawAnswer = parts
      .filter((p) => !p.thought && typeof p.text === "string")
      .map((p) => p.text)
      .join("")
      .trim();

    const answer =
      rawAnswer.replace(/[*#_`]+/g, "").trim() ||
      "لم أتمكن من صياغة إجابة هذه المرة، أعد المحاولة أو اسأل بصيغة أخرى.";

    await logQuestion(true);

    if (rawAnswer) setCachedAnswer(question, answer);

    return NextResponse.json({ answer, source: "model" });
  } catch (err) {
    console.error("assistant: unhandled error", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `خطأ غير متوقع: ${message}` },
      { status: 500 },
    );
  }
}
