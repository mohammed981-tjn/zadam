import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  fuseRankings,
  retrieveRelevant,
  type RetrievableEntry,
  type SemanticMatch,
} from "@/lib/retrieval";
import { activeProvider, embedQuestion } from "@/lib/embedding";
import { buildEngines, generateWithFallback } from "@/lib/engines";
import {
  answerLocally,
  bestEffortAnswer,
  type CanalFactRow,
  type MarketRow,
} from "@/lib/localAnswer";
import { getCachedAnswer, setCachedAnswer } from "@/lib/answerCache";
import { pageContextLine } from "@/lib/pageHelp";
import { INVESTMENT_LIVE } from "@/lib/config";
import { checkRateLimit, clientAddress } from "@/lib/rateLimit";

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

    /*
     * Throttle before any work. The limiter now runs through the service-role
     * client, because check_assistant_rate_limit takes the address as an
     * argument and is no longer callable by anon — published, it let anyone
     * lock a chosen visitor out by naming their IP.
     *
     * It also fails CLOSED. The previous version logged the error and carried
     * on to the model, which is the one outcome an unavailable limiter must
     * not produce in front of a paid API.
     */
    const verdict = await checkRateLimit("assistant", clientAddress(req.headers));

    if (!verdict.allowed) {
      return NextResponse.json(
        {
          error:
            verdict.tier === "unavailable"
              ? "المساعد غير متاح مؤقتاً. حاول بعد قليل."
              : "عدد كبير من الأسئلة خلال دقيقة قصيرة. انتظر قليلاً ثم أعد المحاولة.",
        },
        { status: verdict.tier === "unavailable" ? 503 : 429 },
      );
    }

    const [
      { data: projects, error: projectsError },
      { data: knowledge, error: knowledgeError },
      { data: canalFacts },
      { data: market },
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
      /*
       * Two more tables the deterministic layer answers from.
       *
       * Both are small — forty-five canal attributes and one row per crop — and
       * both are read in the same round trip as the other two rather than
       * lazily, because the resolvers run before anything else and a second
       * round trip would cost more than the rows do.
       *
       * Neither is destructured with an error: a failure here means those two
       * resolvers stand down and the question falls through to the model, which
       * is the pre-existing behaviour. Failing the whole request because the
       * canal dossier was unreachable would be worse than answering without it.
       */
      supabase
        .from("arc_canal_facts")
        .select("key, label, value, unit, status, source, note"),
      supabase.from("crop_market").select("*"),
    ]);

    if (projectsError || knowledgeError) {
      const dbError = projectsError ?? knowledgeError;
      console.error("assistant: supabase error", dbError);
      // The detail stays in the server log. PostgREST messages name tables,
      // columns, constraints and the RLS policy that refused.
      return NextResponse.json(
        { error: "تعذّر قراءة بيانات المنصة حالياً. حاول بعد قليل." },
        { status: 502 },
      );
    }

    const projectsContext = JSON.stringify(projects ?? []);

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
    /*
     * `source` is what makes the log worth reading now.
     *
     * The deterministic layer grew from three resolvers to seven, each built on
     * the claim that the platform answers some class of question better and
     * cheaper than a model does. Nothing in this table could confirm or refute
     * that — `answered` is true whether FAO-56 computed it or the model wrote
     * it. With the layer named, the share answered without a model is a number,
     * and the questions that still reach the model are the list of what to
     * build next.
     */
    /*
     * WHY THIS WRITES AS THE PROJECT AND NOT AS THE VISITOR
     *
     * It used to use the session client, which worked because `anon` held
     * EXECUTE on the function. That was defensible while the row held only a
     * question. It is not defensible now that the row carries an **answer** an
     * administrator may promote into the knowledge base: a publicly callable
     * endpoint that writes question/answer pairs is an injection path into that
     * base, with the approval screen as the only thing in the way. The human
     * gate stays, but a last guard is not a substitute for a shut door.
     *
     * Nothing about the owner's feature changes. The visitor still asks, the
     * answer is still found and still stored — which client the server uses to
     * store it was never visible to them.
     *
     * WHY THE ANSWER IS STORED AT ALL
     *
     * Because paying a model to find something and then discarding it means
     * paying again tomorrow for the same question, and losing the one thing
     * worth keeping: the text itself, waiting for someone to source it and let
     * it into the base.
     */
    const admin = createAdminClient();

    const logQuestion = (answered: boolean, source: string, answer?: string) => {
      if (!admin) {
        // Logging is not worth failing an answer over, but a silent loss of the
        // gap list is worth a line in the log.
        console.error(
          "assistant: SUPABASE_SERVICE_ROLE_KEY is not set, so the question was not logged",
        );
        return Promise.resolve();
      }
      return admin
        .rpc("log_assistant_question", {
          p_question: question,
          p_matched:
            matched.length === allKnowledge.length
              ? allKnowledge.length
              : matched.length,
          p_answered: answered,
          p_source: source,
          p_answer: answer ?? null,
        })
        .then(
          () => undefined,
          (e: unknown) => console.error("assistant: question log failed", e),
        );
    };

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
      canalFacts: (canalFacts ?? []) as CanalFactRow[],
      market: (market ?? []) as MarketRow[],
    });

    if (local) {
      await logQuestion(true, local.source, local.answer);
      return NextResponse.json({ answer: local.answer, source: local.source });
    }

    // Visitors repeat each other. Serving the second asker from memory keeps the
    // quota for questions nobody has asked yet.
    const cached = getCachedAnswer(question);
    if (cached) {
      // A cached answer is a model answer served twice, and it is counted as
      // its own layer rather than as either: filing it under "model" would
      // overstate what the model is still being paid for, and under the local
      // layer would overstate what the platform can answer itself.
      await logQuestion(true, "cache");
      return NextResponse.json({ answer: cached, source: "cache" });
    }

    if (engines.length === 0) {
      await logQuestion(false, "no_engine");

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
      `${pageContext ? `${pageContext}\n\n` : ""}المشاريع المعروضة حالياً (JSON):\n${projectsContext}\n\nقاعدة المعرفة الزراعية (JSON):\n${knowledgeContext}\n\nسؤال الزائر: ${question}`,
    );

    if (!result) {
      console.error("assistant: every engine failed", attempts);
      await logQuestion(false, "engine_failed");

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

    await logQuestion(true, "model", answer);

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
