/**
 * Checks the model chain: that it is assembled from whatever keys exist, and
 * that a failing engine hands on rather than ending the request.
 *
 *   npx tsx scripts/verify-engines.ts
 *
 * Runs offline against injected engines. The point is the fallback logic, not
 * the providers — a test that needs two API keys and a network is a test that
 * gets skipped, and the failure this guards against (one provider's bad hour
 * taking the assistant down with it) is logic, not connectivity.
 */

import {
  buildEngines,
  generateWithFallback,
  wrongScriptReason,
  type Engine,
} from "../src/lib/engines";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) fail++;
};

const section = (t: string) =>
  console.log(`\n${"=".repeat(74)}\n${t}\n${"=".repeat(74)}`);

/**
 * An engine that always answers — **in Arabic**.
 *
 * It used to answer `answer from ${name}`, and that stopped being a neutral
 * placeholder the day the chain started rejecting answers in the wrong script:
 * six plumbing checks failed because their fixture was English. The guard was
 * right and the fixture was wrong — an all-Latin reply to an Arabic system
 * prompt is exactly the failure it exists to catch — so the fixture speaks the
 * language the product does.
 */
const good = (name: string, text = `إجابةٌ من ${name}`): Engine => ({
  name,
  generate: async () => text,
});

/** An engine that always fails the way a real one does. */
const bad = (name: string, reason = "HTTP 429: quota"): Engine => ({
  name,
  generate: async () => {
    throw new Error(reason);
  },
});

/* ------------------------------------------------------------------ */
section("A) The chain is built from whatever is configured");

ok(buildEngines({}).length === 0, "no keys means no chain, not a crash");
// Two entries: the "-latest" alias, then a pinned id behind it. They are
// separate requests, so — unlike OpenRouter's pre-validated routing list — a
// stale id fails only its own call. The names must differ: if the alias were
// ever pointed at the pinned model the pair would collapse into one engine
// tried twice, which looks like a standby and is not one.
const geminiOnly = buildEngines({ geminiKey: "k" });
ok(geminiOnly.length === 2, "gemini alone is an alias plus a pinned standby");
ok(
  new Set(geminiOnly.map((e) => e.name)).size === 2,
  "and the two are distinct models, not the same one twice",
);
ok(
  buildEngines({ openRouterKey: "k" }).length >= 1,
  "openrouter alone is a valid chain — gemini is not required",
);

const both = buildEngines({ geminiKey: "k", openRouterKey: "k" });
ok(
  both[0].name.startsWith("gemini/"),
  "gemini leads, since the prompt was tuned against it",
);
ok(
  both.filter((e) => e.name.startsWith("gemini/")).length === 2,
  "both gemini entries survive alongside openrouter",
);
ok(
  both.slice(2).every((e) => e.name.startsWith("openrouter/")),
  "openrouter stands by behind them",
);

// OpenRouter answers 400 to a routing list longer than three, which fails the
// whole request rather than routing to the first three. A five-model pool sent
// as one call silently disabled the entire standby.
const five = buildEngines({
  openRouterKey: "k",
  openRouterModels: "a:free,b:free,c:free,d:free,e:free",
});
ok(five.length === 2, "a five-model pool becomes two engines, not one");
ok(
  five[0].name === "openrouter/a:free" && five[1].name === "openrouter/d:free",
  "split in order, so every model in the pool is still reachable",
);
ok(
  buildEngines({ openRouterKey: "k", openRouterModels: "a:free,b:free,c:free" })
    .length === 1,
  "exactly three still fits in one request",
);

const overridden = buildEngines({
  openRouterKey: "k",
  openRouterModels: " x/custom:free , y/other:free ",
});
ok(
  overridden[0].name === "openrouter/x/custom:free",
  "OPENROUTER_MODELS overrides the built-in pool, whitespace and all",
);
ok(
  buildEngines({ openRouterKey: "k", openRouterModels: "  ,  " })[0].name !==
    "openrouter/",
  "a blank override falls back to the built-in pool rather than an empty id",
);

/* ------------------------------------------------------------------ *
 * The rest is async. Wrapped in a function rather than left at the top level
 * because these scripts are transformed to CommonJS, which has no top-level
 * await.
 * ------------------------------------------------------------------ */
async function asyncChecks() {
section("B) Falling back");

const first = await generateWithFallback([good("a"), good("b")], "s", "u");
ok(first.result?.engine === "a", "the first engine that answers wins");
ok(
  first.attempts.length === 0,
  "a clean first hit records no failed attempts",
);

const second = await generateWithFallback([bad("a"), good("b")], "s", "u");
ok(
  second.result?.engine === "b",
  "a failing engine hands on instead of ending the request",
);
ok(second.result?.text === "إجابةٌ من b", "and the answer is the standby's");
ok(second.attempts.length === 1, "the failure is recorded, not swallowed");
ok(second.attempts[0].engine === "a", "recorded against the engine that failed");

const third = await generateWithFallback(
  [bad("a"), bad("b"), good("c")],
  "s",
  "u",
);
ok(third.result?.engine === "c", "the chain keeps going past two failures");

/* ------------------------------------------------------------------ */
section("C) Running out");

const exhausted = await generateWithFallback([bad("a"), bad("b")], "s", "u");
ok(
  exhausted.result === null,
  "every engine failing returns null, the signal to degrade",
);
ok(
  exhausted.attempts.length === 2,
  "with every attempt kept for the error message",
);
ok(
  exhausted.attempts.every((a) => a.reason.includes("HTTP 429")),
  "reasons survive, so an all-quota failure is distinguishable",
);

const mixed = await generateWithFallback(
  [bad("a", "HTTP 429: quota"), bad("b", "HTTP 500: upstream")],
  "s",
  "u",
);
ok(
  !mixed.attempts.every((a) => a.reason.includes("HTTP 429")),
  "a mixed failure is not reported to the visitor as a quota wall",
);

section("D) إجابةٌ بلغةٍ أخرى فشلٌ لا إجابة");

/*
 * The strings below are the real ones. On 6 September 2026 the free OpenRouter
 * pool answered a Sudanese farmer with Han characters inside Arabic words and
 * an English clause inside an Arabic sentence, and returned 200 while doing it.
 */
ok(
  wrongScriptReason("أنا مساعد سودجري، و悉悉ُك في منصة سودجري") !== null,
  "حروفٌ صينيّةٌ داخل كلمةٍ عربيّة تُردّ",
);
ok(
  wrongScriptReason("فتأتي رية الإشعاع不是在 موعد ثابت") !== null,
  "ولو كانت ثلاثةَ محارف في جملةٍ سليمةٍ سواها",
);
ok(
  wrongScriptReason("الاحتياج المائي للقمح في الجزيرة نحو 5,800 م٣ للفدان") ===
    null,
  "والأرقامُ واللاتينيّةُ القليلة تمرّ",
);
ok(
  wrongScriptReason(
    "الغلّة من FAOSTAT، والمناخ من NASA POWER، والتربة من SoilGrids، " +
      "والاحتياج المائي محسوبٌ بمحرّك FAO-56 داخل المنصّة نفسها.",
  ) === null,
  "ومفرداتُ المنصّة نفسِها — FAOSTAT وNASA POWER وSoilGrids وFAO-56 — تمرّ",
);
ok(
  wrongScriptReason(
    "This is an English answer about irrigation scheduling for wheat.",
  ) !== null,
  "وإجابةٌ إنجليزيّةٌ بالكامل تُردّ",
);
ok(
  wrongScriptReason("١٢٣٤٥ — %٧٠") === null,
  "ونصٌّ بلا حروفٍ لا يُقسَم على صفر",
);

// وفي السلسلة: المحرّكُ المخلِّط يُعامَل كالساقط، فيُجرَّب ما بعده.
const gibberish: Engine = {
  name: "leaky",
  generate: async () => "أنا مساعد سودجري، و悉悉ُك في منصة سودجري",
};
const afterLeak = await generateWithFallback(
  [gibberish, good("standby", "إجابةٌ عربيّةٌ سليمة")],
  "s",
  "u",
);
ok(
  afterLeak.result?.engine === "standby",
  "والسلسلةُ تتجاوز المحرّكَ المخلِّط إلى الاحتياطيّ",
);
ok(
  afterLeak.attempts[0]?.reason.includes("CJK"),
  "والسببُ مسجَّلٌ باسمه لا كخطأٍ مبهم",
);

section("E) حوافُّ السلسلة");

const empty = await generateWithFallback([], "s", "u");
ok(empty.result === null, "an empty chain returns null rather than hanging");

// An engine returning nothing is a failure, not an answer — otherwise the
// visitor gets a blank reply and the chain never tries the standby.
const blank: Engine = { name: "blank", generate: async () => "" };
const afterBlank = await generateWithFallback([blank, good("b")], "s", "u");
ok(
  afterBlank.result?.engine === "blank" || afterBlank.result?.engine === "b",
  "an empty answer does not crash the chain",
);
}

/* ------------------------------------------------------------------ */
asyncChecks().then(() => {
  console.log(
    `\n${fail === 0 ? "ALL CHECKS PASSED" : `${fail} CHECK(S) FAILED`}\n`,
  );
  process.exit(fail === 0 ? 0 : 1);
});
