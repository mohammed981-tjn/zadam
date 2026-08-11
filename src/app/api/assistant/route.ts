import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const SYSTEM_PROMPT = `أنت "مساعد سودجري" — مساعد ذكي يتحدث العربية فقط لمنصة "سودجري" للاستثمار الزراعي في السودان. تجيب على نوعين من الأسئلة:

1) أسئلة عن المشاريع المعروضة على المنصة (بيانات "المشاريع" أدناه).
2) أسئلة زراعية عامة (تربة، آفات، ري، أصناف) — تستعين فيها بـ"قاعدة المعرفة الزراعية" أدناه فقط.

قواعد صارمة:
- أجب فقط استناداً إلى البيانات المرفقة. لا تختلق أرقاماً أو حقائق غير موجودة فيها.
- عند استخدام "قاعدة المعرفة الزراعية"، اذكر الدولة المرجعية (source_country) بوضوح في إجابتك، ووضّح أنها معرفة عامة تحتاج تحققاً محلياً قبل التطبيق الفعلي إن كان source_note يشير لذلك.
- إن سُئلت عن معلومة غير متوفرة في أي من المصدرين، وضّح أنها غير متوفرة حالياً واقترح التواصل مع فريق سودجري أو محطات البحوث الزراعية السودانية.
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
    return NextResponse.json({ error: "المساعد غير مُفعّل حالياً (لا يوجد مفتاح Gemini)" }, { status: 503 });
  }

  try {
    const supabase = await createClient();

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
          generationConfig: { maxOutputTokens: 2048, temperature: 0.3 },
        }),
      },
    );

    if (!geminiRes.ok) {
      const bodyText = await geminiRes.text();
      console.error("assistant: gemini error", geminiRes.status, bodyText);
      return NextResponse.json(
        { error: `تعذّر الاتصال بـ Gemini (HTTP ${geminiRes.status}): ${bodyText.slice(0, 300)}` },
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
