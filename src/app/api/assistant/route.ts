import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const SYSTEM_PROMPT = `أنت "مساعد سودجري" — مساعد ذكي يتحدث العربية فقط لمنصة "سودجري" للاستثمار الزراعي في السودان. تجيب على ثلاثة أنواع من الأسئلة، ولكل نوع قاعدة مختلفة:

1) أسئلة عن المشاريع المعروضة على المنصة نفسها (بيانات "المشاريع" أدناه):
   قاعدة صارمة — أجب فقط استناداً لهذه البيانات بالضبط. لا تختلق أسماء مشاريع أو أرقاماً أو تفاصيل غير موجودة فيها. إن سأل الزائر عن مشروع غير موجود في القائمة، وضّح بوضوح أنه غير متوفر على المنصة حالياً واعرض له المشاريع الفعلية الموجودة بدلاً منه.

2) أسئلة عن محتوى "قاعدة المعرفة الزراعية" أدناه (محاصيل وثروة حيوانية سودانية موثّقة):
   استخدمها كمصدر أول، واذكر الدولة المرجعية (source_country) بوضوح، ووضّح أنها معرفة عامة تحتاج تحققاً محلياً إن كان source_note يشير لذلك.

3) أي سؤال زراعي عام آخر غير موجود في قاعدة المعرفة أعلاه (عن محاصيل أو ماشية أو تقنيات لم تُذكر):
   اسمح لنفسك بالإجابة من معرفتك الزراعية العامة الواسعة بدل رفض الإجابة — لكن ابدأ الجملة بوضوح بعبارة مثل "بحسب معرفة زراعية عامة (خارج قاعدة بيانات المنصة المتحقق منها):" حتى يعرف القارئ أن هذا ليس من مصدر مُدقَّق بواسطة فريق سودجري تحديداً، ثم أجب بإفادة حقيقية ومفيدة.

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

  if (typeof question !== "string" || question.trim().length === 0 || question.length > 500) {
    return NextResponse.json({ error: "سؤال غير صالح" }, { status: 400 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "المساعد غير مُفعّل حالياً" }, { status: 503 });
  }

  try {
    const supabase = await createClient();

    // The leftmost x-forwarded-for entry is client-supplied and spoofable; the
    // last entry is the one Vercel's edge appends for the real connecting IP.
    const forwardedFor = req.headers.get("x-forwarded-for");
    const ip = req.headers.get("x-real-ip") ?? forwardedFor?.split(",").pop()?.trim() ?? "unknown";
    const { data: allowed, error: rateLimitError } = await supabase.rpc("check_assistant_rate_limit", {
      p_ip: ip,
    });

    if (rateLimitError) {
      console.error("assistant: rate limit check failed", rateLimitError);
    } else if (allowed === false) {
      return NextResponse.json(
        { error: "عدد كبير من الأسئلة خلال دقيقة قصيرة. انتظر قليلاً ثم أعد المحاولة." },
        { status: 429 },
      );
    }

    const [{ data: projects, error: projectsError }, { data: knowledge, error: knowledgeError }] =
      await Promise.all([
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
      return NextResponse.json({ error: `تعذّر قراءة البيانات: ${dbError?.message}` }, { status: 502 });
    }

    const projectsContext = JSON.stringify(projects ?? []);
    const knowledgeContext = JSON.stringify(knowledge ?? []);

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
        { error: `تعذّر الاتصال بمحرك سودجري الذكي (HTTP ${geminiRes.status}): ${bodyText.slice(0, 300)}` },
        { status: 502 },
      );
    }

    const data = await geminiRes.json();
    const rawAnswer: string =
      data.candidates?.[0]?.content?.parts?.[0]?.text ?? "لم أتمكن من فهم السؤال، حاول صياغته بشكل مختلف.";
    const answer = rawAnswer.replace(/[*#_`]+/g, "").trim();

    return NextResponse.json({ answer });
  } catch (err) {
    console.error("assistant: unhandled error", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `خطأ غير متوقع: ${message}` }, { status: 500 });
  }
}
