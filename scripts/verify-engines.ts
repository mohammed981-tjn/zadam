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
  type Engine,
} from "../src/lib/engines";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) fail++;
};

const section = (t: string) =>
  console.log(`\n${"=".repeat(74)}\n${t}\n${"=".repeat(74)}`);

/** An engine that always answers. */
const good = (name: string, text = `answer from ${name}`): Engine => ({
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
ok(
  buildEngines({ geminiKey: "k" }).length === 1,
  "gemini alone is a one-engine chain",
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
  both.slice(1).every((e) => e.name.startsWith("openrouter/")),
  "openrouter stands by behind it",
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
ok(second.result?.text === "answer from b", "and the answer is the standby's");
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
