import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  fuseRankings,
  retrieveRelevant,
  type RetrievableEntry,
  type SemanticMatch,
} from "@/lib/retrieval";
import { activeProvider, embedQuestion } from "@/lib/embedding";
import { buildEngines, generateWithFallback } from "@/lib/engines";
import { answerLocally, bestEffortAnswer } from "@/lib/localAnswer";
import { loadCropMarkets } from "@/lib/marketData";
import { getCachedAnswer, setCachedAnswer } from "@/lib/answerCache";
import { pageContextLine } from "@/lib/pageHelp";
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

لهجة الزائر:
أغلب من يسألك مزارع سوداني يكتب بالعامية، لا بالفصحى. افهم السؤال بالعامية أولاً، وأجب بالفصحى البسيطة.
وأهم قاعدة هنا: هذه تعبيرات وصفية، وليست أسماء أماكن أو مشاريع. لا تعامل أياً منها كاسم علم ولا تصف موقعاً جغرافياً بناءً عليها.
- "الواطة" أو "الواسطة" = الأرض أو التربة. و"الواطة العطشانة" تعني "الأرض التي تعطش"، وليست منطقة اسمها كذلك.
- "الموية" أو "المي" = الماء. و"بتنشف" = تجف.
- "الرويانة" = الخصبة أو المروية جيداً. و"الرملة" = التربة الرملية.
- "شنو" = ماذا، "وين" = أين، "دحين" = الآن، "كيف اعالجها" = كيف أعالجها.
إن بدا لك اسم مكان لا تعرفه على وجه اليقين، فالأرجح أنه وصف بالعامية لا اسم علم — اسأل الزائر عن قصده بدل أن تخترع له منطقة وتصفها.

قواعد عامة لكل الأنواع:
- لا تخلط بين الأنواع الثلاثة أبداً: معلومات المشاريع دائماً من البيانات فقط، أما المعرفة الزراعية العامة فمُعلَن عنها بوضوح كما في القاعدة 3.
- لا تقدّم نصائح مالية قاطعة ("استثمر الآن"، "هذا مضمون") — اعرض الحقائق المتاحة فقط ودع القارئ يقرر.
- كن مختصراً ومباشراً وودوداً بعربية فصحى بسيطة.
- اكتب نصاً عادياً فقط بدون أي رموز تنسيق (بدون **، بدون #، بدون قوائم بشرطات) لأن الرد يُعرض كنص خام.`;

export async function POST(req: NextRequest) {
  let question: unknown;
  let path: unknown;
  try {
    ({ question, path } = await req.json());
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

  /*
   * Which page the question was asked from.
   *
   * This is what lets the assistant stand in for a help page on every screen
   * rather than sitting next to one. "ما هذا؟" typed on the contract builder is
   * a different question from the same three words typed on the home page, and
   * until now both got the same general answer.
   *
   * The path only ever selects a fixed entry from pageHelp; an unknown or
   * crafted value matches nothing and yields an empty string, so this field
   * cannot be used to push text of the caller's choosing into the prompt.
   */
  const pageContext =
    typeof path === "string" && path.startsWith("/") && path.length < 200
      ? pageContextLine(path)
      : "";

  // Note there is no early return when no model is configured. The assistant
  // no longer depends on the model being reachable: the platform answers what it
  // can from its own engines and knowledge base first, and only what survives
  // that is sent out. Missing keys now cost the general-knowledge answers, not
  // the assistant.
  //
  // Embeddings and generation are configured independently: no free chat pool
  // serves embeddings, and the provider that embeds may not be the one that
  // answers. Either being absent costs its own half and nothing more.
  const embedder = activeProvider();
  const engines = buildEngines({
    geminiKey: process.env.GEMINI_API_KEY,
    openRouterKey: process.env.OPENROUTER_API_KEY,
    openRouterModels: process.env.OPENROUTER_MODELS,
  });

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
      marketsOrNull,
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
      // Not fatal if it fails. The reference makes answers better; the
      // assistant worked without it for months and must keep working when the
      // view is unreachable.
      loadCropMarkets(),
    ]);

    const markets = marketsOrNull ?? undefined;

    if (projectsError || knowledgeError) {
      const dbError = projectsError ?? knowledgeError;
      console.error("assistant: supabase error", dbError);
      return NextResponse.json(
        { error: `تعذّر قراءة البيانات: ${dbError?.message}` },
        { status: 502 },
      );
    }

    const projectsContext = JSON.stringify(projects ?? []);

    /*
     * The reference the assistant was answering without.
     *
     * 63,150 FAOSTAT observations sit in this database, and until now the
     * assistant could not see one of them: it read the projects table and the
     * curated prose, so "كم غلة الذرة الرفيعة؟" was answered from an article
     * rather than from the row holding the measurement.
     *
     * It is sent whole rather than matched to the question because whole is
     * eleven rows. The aggregation happens in the view, so the crops the
     * calculator offers reduce to a few hundred tokens — cheaper than deciding
     * whether to include them, and with no failure mode where the retrieval
     * misses and the model falls back to recalling a yield.
     */
    const marketContext = JSON.stringify(
      Object.values(markets ?? {}).map((m) => ({
        محصول: m.cropKey,
        غلة_السودان_كجم_هكتار: m.sudanKgPerHa,
        غلة_مصر: m.nearestPeerKgPerHa,
        وسيط_النظراء: m.peerMedianKgPerHa,
        سعر_الطن_دولار: m.usdPerTonne,
        مصدر_السعر: m.priceBasis,
        سنة: m.year,
      })),
    );

    // Send only the entries that bear on the question. Sending the whole base
    // cost about 18,000 prompt tokens per question and buried the two entries
    // that answered it among forty-five that did not.
    //
    // This is the lexical pass. It is free and instant, so it runs for every
    // question and feeds both the local resolvers below and the gap metric.
    // Semantic retrieval is deferred to just before the model call — see there
    // for why.
    const allKnowledge = (knowledge ?? []) as RetrievableEntry[];
    const matched = retrieveRelevant(question, allKnowledge, 12);

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
      markets,
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

    if (engines.length === 0) {
      await logQuestion(false);

      // No key configured is the same predicament as every engine being down,
      // and it had a worse answer: the degraded path below was only reachable
      // after an engine failed, so a deployment that simply had no key sent the
      // visitor away with an apology while the entries that half-answered them
      // sat unread. Show those entries here too — a near miss under an honest
      // heading beats nothing.
      const degraded = bestEffortAnswer(question, allKnowledge);
      if (degraded) {
        return NextResponse.json({
          answer: degraded.answer,
          source: "knowledge",
        });
      }

      return NextResponse.json(
        {
          error:
            "لا أملك إجابة موثّقة لهذا السؤال في قاعدة سودجري بعد، ومحرك المعرفة العامة غير مُفعّل حالياً. جرّب صياغة أقرب لمحصول أو تقنية بعينها، أو اسألني عن الاحتياج المائي لمحصول محدد.",
        },
        { status: 503 },
      );
    }

    /*
     * Semantic retrieval, deliberately placed here rather than beside the
     * lexical pass.
     *
     * Everything above this line answers without touching the network — that is
     * the point of the local resolvers and the cache, and embedding the question
     * earlier would spend a network round trip on questions that never needed
     * one. By this line the platform has already declined to answer and the
     * model call is certain, so one more request costs latency that was going to
     * be spent anyway.
     *
     * The floor keeps the fusion honest: below it a "nearest" entry is merely
     * the least unrelated one, and feeding that to the model invites it to
     * answer from something that does not bear on the question.
     */
    const questionVector = embedder
      ? await embedQuestion(embedder, question)
      : null;
    let semantic: SemanticMatch[] = [];

    if (questionVector && embedder) {
      const { data: nearest, error: matchError } = await supabase.rpc(
        "match_knowledge_entries",
        {
          p_query_embedding: questionVector,
          p_match_count: 12,
          // The provider's own floor, not a constant. Cosine scales differ
          // enough between models that one number rejects everything from the
          // other — see EmbeddingProvider.minSimilarity.
          p_min_similarity: embedder.minSimilarity,
          // Only rows this same model embedded. Cosine across models is noise
          // shaped like a score, and a provider switch leaves the base
          // half-migrated for as long as the backfill takes.
          p_model: embedder.model,
        },
      );

      if (matchError) {
        // Ranking degrades to lexical-only. Not worth failing the answer over.
        console.error("assistant: semantic match failed", matchError);
      } else {
        semantic = (nearest ?? []) as SemanticMatch[];
      }
    }

    // Falls back to the lexical ranking on its own when the semantic side came
    // back empty, so an unembedded base or an unreachable embedding service
    // costs ranking quality and nothing else.
    const ranked = fuseRankings(question, allKnowledge, semantic, 12);
    const knowledgeContext = JSON.stringify(ranked);

    const { result, attempts } = await generateWithFallback(
      engines,
      SYSTEM_PROMPT,
      // The page context goes first when there is one: a vague question is
      // resolved against the screen the visitor is looking at before anything
      // else is considered.
      `${pageContext ? `${pageContext}\n\n` : ""}المشاريع المعروضة حالياً (JSON):\n${projectsContext}\n\nمرجعية الغلة والسعر من FAOSTAT — استعمل هذه الأرقام ولا تستحضر غيرها من الذاكرة (JSON):\n${marketContext}\n\nقاعدة المعرفة الزراعية (JSON):\n${knowledgeContext}\n\nسؤال الزائر: ${question}`,
    );

    if (!result) {
      console.error("assistant: every engine failed", attempts);
      await logQuestion(false);

      // Every engine being down is not a reason to send the visitor away empty
      // handed. Show the nearest entries, labelled as approximate — and use the
      // fused ranking, since by this line the question has already been
      // embedded and semantic order is strictly better than lexical.
      const degraded = bestEffortAnswer(question, allKnowledge, ranked);
      if (degraded) {
        return NextResponse.json({
          answer: degraded.answer,
          source: "knowledge",
        });
      }

      // Worth naming separately only when every engine hit its quota: that is
      // temporary and waiting genuinely fixes it, which is not true of the
      // other failures.
      if (attempts.every((a) => a.reason.includes("HTTP 429"))) {
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
          error: `تعذّر الاتصال بمحركات سودجري الذكية (${attempts.length} محاولة): ${attempts.map((a) => `${a.engine} — ${a.reason}`).join(" | ").slice(0, 300)}`,
        },
        { status: 502 },
      );
    }

    if (attempts.length > 0) {
      console.warn(
        `assistant: answered by ${result.engine} after ${attempts.length} failed engine(s)`,
      );
    }

    const answer =
      result.text.replace(/[*#_`]+/g, "").trim() ||
      "لم أتمكن من صياغة إجابة هذه المرة، أعد المحاولة أو اسأل بصيغة أخرى.";

    await logQuestion(true);

    setCachedAnswer(question, answer);

    return NextResponse.json({ answer, source: "model", engine: result.engine });
  } catch (err) {
    console.error("assistant: unhandled error", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `خطأ غير متوقع: ${message}` },
      { status: 500 },
    );
  }
}
