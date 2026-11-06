/**
 * نصٌّ عربيّ في PDF: الترتيب البصريّ لسطرٍ يختلط فيه العربيّ بالأرقام واللاتينيّ (البند ٢٠٥).
 *
 * A PDF has no text layout of its own: whatever is drawn is drawn left to right. The font engine (fontkit, inside
 * pdf-lib) shapes Arabic — it joins the letters and, for a run whose script is Arabic, returns the glyphs in visual
 * order — but it knows nothing of a line that mixes directions: "ربح سنة 2026" laid out whole would come back with
 * the year's digits reversed. So a line is first split by the Unicode bidirectional algorithm (bidi-js, UAX #9) into
 * runs of one direction, the runs are put in visual order, and each run is drawn on its own:
 *
 *   • a right-to-left run with Arabic letters goes to the font as it is (the engine reverses it), mirrored brackets
 *     swapped first;
 *   • a right-to-left run of neutrals only (a bracket, a dash, spaces) is reversed here, because the engine treats it as
 *     left-to-right;
 *   • a left-to-right run (digits, Latin) goes as it is — except Arabic-Indic digits, which the engine counts as
 *     Arabic and would reverse, so they go reversed and come back in order.
 *
 * Figures and dates are wrapped in a left-to-right isolate (`ltr`), so "2026-11-06" is not read as three Arabic
 * numbers joined by minus signs and shown backwards — which is what the algorithm would rightly do with it bare.
 * The isolate marks are invisible and are dropped before drawing.
 */

import bidiFactory from "bidi-js";

const bidi = bidiFactory();

/** Left-to-right isolate: a figure, a date, a fingerprint inside Arabic text. */
export const ltr = (s: string): string => `⁦${s}⁩`;

const CONTROLS = /[‎‏‪-‮⁦-⁩]/g;
const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

export type Direction = "rtl" | "ltr";

/**
 * The runs of a line in the order they are drawn, left to right on the page, each ready for the font engine.
 * `base` is the paragraph's direction: Arabic text is "rtl", an English page "ltr".
 */
export function visualRuns(text: string, base: Direction): string[] {
  if (!text) return [];
  const { levels } = bidi.getEmbeddingLevels(text, base);
  const runs: { level: number; chars: string[] }[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (CONTROLS.test(ch)) {
      CONTROLS.lastIndex = 0;
      continue;
    }
    CONTROLS.lastIndex = 0;
    const lv = levels[i];
    const last = runs[runs.length - 1];
    if (last && last.level === lv) last.chars.push(ch);
    else runs.push({ level: lv, chars: [ch] });
  }
  if (!runs.length) return [];

  // UAX #9 L2: from the highest level down to the lowest odd one, reverse every stretch of runs at that level or higher.
  const max = Math.max(...runs.map((r) => r.level));
  const odd = runs.map((r) => r.level).filter((l) => l % 2 === 1);
  const lowestOdd = odd.length ? Math.min(...odd) : max + 1;
  for (let lv = max; lv >= lowestOdd; lv--) {
    for (let i = 0; i < runs.length; ) {
      if (runs[i].level < lv) {
        i++;
        continue;
      }
      let j = i;
      while (j < runs.length && runs[j].level >= lv) j++;
      runs.splice(i, j - i, ...runs.slice(i, j).reverse());
      i = j;
    }
  }

  return runs.map((r) => {
    if (r.level % 2 === 0) {
      // Arabic-Indic digits are Arabic script to the engine, which would reverse "٢٠٢٦" into "٦٢٠٢": hand it the run
      // reversed, so its own reversal puts the digits back in order. (Digits do not join, so nothing else changes.)
      const t = r.chars.join("");
      return ARABIC.test(t) && !/[A-Za-z]/.test(t) ? [...r.chars].reverse().join("") : t;
    }
    const mirrored = r.chars.map((c) => bidi.getMirroredCharacter(c) ?? c);
    // The engine reverses a run only when its script is right-to-left; neutrals alone it would leave as they are.
    return ARABIC.test(mirrored.join("")) ? mirrored.join("") : mirrored.reverse().join("");
  });
}

/** Text without the isolate marks: what a reader sees, for measuring and for tests. */
export const plain = (s: string): string => s.replace(CONTROLS, "");
