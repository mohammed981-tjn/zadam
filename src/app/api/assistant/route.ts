import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const SYSTEM_PROMPT = `أنت "مساعد زرعة" — مساعد ذكي يتحدث العربية فقط، يجيب على أسئلة زوار ومستثمري منصة "زرعة" للاستثمار الزراعي في السودان حول المشاريع المعروضة عليها.

قواعد صارمة يجب الالتزام بها:
- أجب فقط استناداً إلى بيانات المشاريع المرفقة أدناه (بصيغة JSON). لا تختلق أرقاماً أو حقائق غير موجودة فيها.
- إن سُئلت عن معلومة غير متوفرة في البيانات (نصيحة استثمارية شخصية، ضمانات، مواعيد دقيقة غير مذكورة)، وضّح أنها غير متوفرة حالياً واقترح التواصل مع فريق زرعة.
- لا تقدّم نصائح مالية قاطعة ("استثمر الآن"، "هذا مضمون") — اعرض الحقائق المتاحة فقط ودع القارئ يقرر.
- كن مختصراً ومباشراً وودوداً بعربية فصحى بسيطة.`;

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
    const { data: projects, error: dbError } = await supabase
      .from("projects")
      .select(
        "name, location, description, total_feddans, price_per_share, total_shares, shares_sold, status, risk_level, expected_annual_return",
      )
      .neq("status", "draft");

    if (dbError) {
      console.error("assistant: supabase error", dbError);
      return NextResponse.json({ error: `تعذّر قراءة بيانات المشاريع: ${dbError.message}` }, { status: 502 });
    }

    const context = JSON.stringify(projects ?? []);

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
                  text: `بيانات المشاريع المتاحة حالياً على المنصة (JSON):\n${context}\n\nسؤال الزائر: ${question}`,
                },
              ],
            },
          ],
          generationConfig: { maxOutputTokens: 500, temperature: 0.3 },
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
    const answer: string =
      data.candidates?.[0]?.content?.parts?.[0]?.text ?? "لم أتمكن من فهم السؤال، حاول صياغته بشكل مختلف.";

    return NextResponse.json({ answer });
  } catch (err) {
    console.error("assistant: unhandled error", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `خطأ غير متوقع: ${message}` }, { status: 500 });
  }
}
