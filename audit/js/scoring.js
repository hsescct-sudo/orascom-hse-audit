// Audit score, the same math as the Excel forms with two fixes:
//  1) 0% counts as zero. N/A is its own choice and takes the item out.
//  2) N/A works the same way in every part (its weight goes to the other items).
// Part score = sum(weight x rating) / sum(weight) over the items that apply.
// Base score = parts combined by their share (90/10, or A..G for lifting).
// Then: one or more Serious NCRs take off 15% once; each repeated NCR takes off 3%.
// Settings (Corporate HSE decides): Serious once or for each one, deductions as points
// off the score or as a percent of it, and grading on the score as shown (one decimal)
// or rounded to a whole number.
import { GRADES } from "./templates.js";

export const NA = "na";
export const isNA = v => v === NA;
export const isRated = v => v === NA || (typeof v === "number" && isFinite(v));

export function gradeOf(score, gradeOn = "shown") {
  if (score == null || !isFinite(score)) return null;
  const s = gradeOn === "whole" ? Math.round(score) : Math.round(score * 10) / 10;
  return GRADES.find(g => s >= g.min) || GRADES[GRADES.length - 1];
}

export function scoreAudit(def, audit, ncrs = [], opts = {}) {
  const ratings = (audit && audit.ratings) || {};
  const zeroIsNA = !!opts.zeroIsNA;
  let itemCount = 0, ratedCount = 0;
  const parts = def.parts.map(p => {
    let wSum = 0, wr = 0, rated = 0, na = 0;
    const items = p.items.map(it => {
      itemCount++;
      const v = ratings[it.id];
      const state = !isRated(v) ? "open" : (isNA(v) || (zeroIsNA && v === 0)) ? "na" : "rated";
      if (state !== "open") ratedCount++;
      if (state === "na") na++;
      if (state === "rated") { wSum += it.weight; wr += it.weight * clamp(v, 0, 100) / 100; rated++; }
      return { id: it.id, title: it.title, weight: it.weight, value: v, state };
    });
    const score = wSum ? wr / wSum : null;
    return { id: p.id, code: p.code, name: p.name, share: p.share, score, rated, na, total: p.items.length, wSum, items };
  });
  const live = parts.filter(p => p.score != null);
  const shareSum = live.reduce((a, p) => a + p.share, 0);
  const base = shareSum ? (live.reduce((a, p) => a + p.share * p.score, 0) / shareSum) * 100 : null;
  // How much of the final score each item carries (for the "how is this calculated" view)
  for (const p of parts) for (const it of p.items) {
    it.share = it.state === "rated" && shareSum && p.wSum ? (p.share / shareSum) * (it.weight / p.wSum) * 100 : 0;
    it.points = it.state === "rated" ? it.share * clamp(it.value, 0, 100) / 100 : 0;
  }
  const live_ncrs = ncrs.filter(n => !n.deleted);
  const seriousCount = live_ncrs.filter(n => n.severity === "Serious").length;
  const repeatedCount = live_ncrs.filter(n => n.repeated).length;
  // the deduction rates in %, then the points they take off
  const seriousPct = seriousCount ? def.deductions.serious * (opts.seriousEach ? seriousCount : 1) : 0;
  const repeatedPct = repeatedCount * def.deductions.repeated;
  const pctOfScore = opts.deductFrom === "percent";
  const serious = base == null ? 0 : pctOfScore ? base * seriousPct / 100 : seriousPct;
  const repeated = base == null ? 0 : pctOfScore ? base * repeatedPct / 100 : repeatedPct;
  const total = base == null ? null : clamp(base - serious - repeated, 0, 100);
  return {
    parts, base, serious, seriousCount, seriousPct, repeated, repeatedCount, repeatedPct, total,
    grade: gradeOf(total, opts.gradeOn), itemCount, ratedCount, complete: ratedCount === itemCount,
  };
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, Number(v) || 0));
export const fmtScore = s => (s == null || !isFinite(s) ? "–" : (Math.round(s * 10) / 10).toFixed(1) + "%");
