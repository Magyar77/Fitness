// Deterministic progression: (slot, target, history, settings) → one Decision.
// Same input always gives the same decision and the same explanation text.

import { daysBetween } from '../dates';
import type { Range, SetLog, SlotTarget } from '../model';
import { heavier, lighter, reduced, sameLoad } from './loads';
import { formatLoad, type Unit } from '../units';
import {
  RULESET_VERSION,
  type Decision,
  type EvaluateInput,
  type Outcome,
  type Reason,
  type SlotPerformance,
  type TargetDraft,
} from './types';

interface RuleResult {
  outcome: Outcome;
  reasons: Reason[];
  explanation: string;
  next: TargetDraft | null;
  /** Data is incomplete or unconfirmed: never auto-apply an increase. */
  dataIssue?: boolean;
}

interface Ctx {
  input: EvaluateInput;
  latest: SlotPerformance;
  previous: SlotPerformance[]; // older performances, newest last
  sets: SetLog[]; // working sets of the latest performance
}

// ---------------------------------------------------------------------------
// Formatting helpers

// Set by evaluateSlot for the duration of one (synchronous) evaluation.
let unit: Unit = 'kg';
const kg = (v: number) => formatLoad(v, unit);
const span = (r: { min: number; max: number }) => (r.min === r.max ? `${r.min}` : `${r.min}–${r.max}`);
const list = (xs: (number | null | undefined)[]) => xs.map((x) => x ?? '?').join('/');
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function repsTarget(t: SlotTarget): { min: number; max: number } | null {
  return t.kind === 'reps' ? { min: t.min, max: t.max } : null;
}

function working(sets: SetLog[]): SetLog[] {
  return sets.filter((s) => !s.isWarmup && s.completed);
}

type LoadKey = 'weightKg' | 'assistKg';

function lastLoad(sets: SetLog[], key: LoadKey): number | null {
  for (let i = sets.length - 1; i >= 0; i--) {
    const v = sets[i]![key];
    if (typeof v === 'number') return v;
  }
  return null;
}

function atLoad(sets: SetLog[], key: LoadKey, load: number): SetLog[] {
  return sets.filter((s) => sameLoad(s[key], load));
}

/** Reps that count: sets with broken technique count as zero. */
function counted(s: SetLog): number {
  return s.techniqueOk === false ? 0 : (s.reps ?? 0);
}

function totalAt(perf: SlotPerformance, key: LoadKey, load: number): number | null {
  const ws = atLoad(working(perf.sets), key, load);
  return ws.length ? ws.reduce((sum, s) => sum + counted(s), 0) : null;
}

function rirText(s: SetLog): string {
  return s.rir ? span(s.rir) : '?';
}

// ---------------------------------------------------------------------------
// Rules

/** Double progression on load (R1) or on assistance (R2, inverted). */
function loadRule(ctx: Ctx, key: LoadKey): RuleResult {
  const { slot, template, equipment, settings } = ctx.input;
  const assisted = key === 'assistKg';
  const t = repsTarget(slot.target);
  const load = lastLoad(ctx.sets, key);
  if (!t || load === null) return noData('No load was recorded.');
  const ws = atLoad(ctx.sets, key, load);
  if (ws.some((s) => s.reps == null)) return noData('Reps were not recorded for every set.');

  const prescribed = slot.sets ?? ws.length;
  const reps = ws.map(counted);
  const loadText = assisted ? `${kg(load)} assist` : kg(load);
  const rangeText = `${prescribed} × ${span(t)}`;
  // A program's step (e.g. bench +2.5 kg) snapped onto the gym's increments, so it stays
  // 2.5 kg in kg but becomes a whole 5 lb with 5 lb plates (and 5 kg → 10 lb).
  const ruleStep = assisted ? undefined : slot.rule.id === 'load_double' ? slot.rule.stepKg : undefined;
  const gymStep = equipment?.kind === 'step' ? equipment.stepKg ?? null : null;
  const step = ruleStep && gymStep ? Math.max(1, Math.round(ruleStep / gymStep)) * gymStep : ruleStep;
  const dataIssue = ws.some((s) => s.quality !== 'confirmed');

  const harder = (): number | null =>
    assisted ? lighter(equipment, load) : heavier(equipment, load, template.easyDay ? equipment?.stepKg ?? step : step);
  const easier = (): number | null =>
    assisted ? heavier(equipment, load) : reduced(equipment, load, settings.decreasePct, step);

  const decrease = (reasons: Reason[], why: string): RuleResult => {
    const to = easier();
    const toText = to === null ? (assisted ? 'one step more assistance' : 'one pin lighter') : assisted ? `${kg(to)} assist` : kg(to);
    return {
      outcome: 'decrease',
      reasons,
      explanation: `${why} Recommend ${toText}${assisted || to === null ? '' : ` (${Math.round(((load - to) / load) * 100)}% lighter)`}.`,
      next: {
        ...(assisted ? { assistKg: to } : { loadKg: to }),
        repTargets: Array(prescribed).fill(t.min),
        text: `${toText}, ${rangeText}`,
      },
    };
  };

  // Form breaking → reduce (docx: "form breaking → drop 5–10%").
  if (ws.some((s) => s.techniqueOk === false)) {
    const n = ws.filter((s) => s.techniqueOk === false).length;
    return decrease(['technique'], `Form broke down on ${plural(n, 'set')}; those reps don't count.`);
  }

  // Missed reps: once → repeat; twice in a row at this load → reduce.
  const short = reps.filter((r) => r < t.min).length;
  if (short > 0) {
    const prev = ctx.previous.at(-1);
    const prevWs = prev ? atLoad(working(prev.sets), key, load) : [];
    const shortBefore = prevWs.length > 0 && prevWs.some((s) => counted(s) < t.min);
    if (shortBefore) {
      return decrease(['short_twice'], `Fell short of ${t.min} reps at ${loadText} two sessions in a row.`);
    }
    return {
      outcome: 'hold',
      reasons: ['short_once'],
      explanation: `${plural(short, 'set')} fell short of ${t.min} reps (${list(reps)}). Repeat ${loadText} next time.`,
      next: { ...(assisted ? { assistKg: load } : { loadKg: load }), repTargets: Array(prescribed).fill(t.min), text: `${loadText}, aim ${prescribed} × ${t.min}` },
    };
  }

  if (ws.length < prescribed) {
    return {
      outcome: 'hold',
      reasons: ['incomplete_sets'],
      explanation: `Only ${ws.length} of ${prescribed} sets were done at ${loadText}. Keep it and complete all sets.`,
      next: { ...(assisted ? { assistKg: load } : { loadKg: load }), repTargets: Array(prescribed).fill(Math.min(t.max, Math.min(...reps))), text: `${loadText}, aim ${rangeText}` },
    };
  }

  const allTop = reps.every((r) => r >= t.max);
  const rir: Range | null = slot.rir;
  const tolerance = template.easyDay ? 0 : settings.rirTolerance;
  const rirMissing = rir !== null && ws.some((s) => !s.rir);
  const rirLow = rir !== null && ws.some((s) => s.rir && s.rir.max < rir.min - tolerance);

  if (allTop && rirLow) {
    return {
      outcome: 'hold',
      reasons: ['top_of_range', 'rir_too_low'],
      explanation: template.easyDay
        ? `Reps were at the top, but RIR ${ws.map(rirText).join('/')} means it no longer feels like RIR ${span(rir!)} on this easy day. Keep ${loadText}.`
        : `Reps were at the top, but RIR ${ws.map(rirText).join('/')} is harder than the target of ${span(rir!)}. Keep ${loadText} and stop 1–2 reps earlier.`,
      next: { ...(assisted ? { assistKg: load } : { loadKg: load }), repTargets: Array(prescribed).fill(t.max), text: `${loadText}, ${prescribed} × ${t.max} at RIR ${span(rir!)}` },
    };
  }

  if (allTop) {
    const to = harder();
    const reasons: Reason[] = ['top_of_range'];
    if (template.easyDay) reasons.push('easy_day');
    if (rirMissing) reasons.push('rir_missing');
    if (dataIssue) reasons.push('data_quality');
    const effort = rir === null || rirMissing ? '' : ` at RIR ${ws.map(rirText).join('/')}`;
    const missingNote = rirMissing ? " RIR wasn't recorded for every set, so this needs your OK." : '';
    if (assisted && (to === null || to <= 0)) {
      return {
        outcome: 'milestone',
        reasons: [...reasons, 'bodyweight_reached'],
        explanation: `All ${prescribed} sets reached ${t.max} reps${effort} at the lightest assistance. Next step is no assistance: try it unassisted.`,
        next: { assistKg: 0, repTargets: Array(prescribed).fill(t.min), text: `Unassisted, ${rangeText}` },
        dataIssue: dataIssue || rirMissing,
      };
    }
    if (to === null) reasons.push('step_unknown');
    const toText = to === null ? `next pin above ${kg(load)}` : assisted ? `${kg(to)} assist` : kg(to);
    const change = assisted
      ? `assistance drops from ${kg(load)} to ${to === null ? 'the next step' : kg(to)}`
      : `the weight goes up to ${to === null ? `the next pin above ${kg(load)}` : kg(to)}${template.easyDay ? ' (smallest step: easy day)' : ''}`;
    return {
      outcome: 'increase',
      reasons,
      explanation: `All ${prescribed} sets reached ${t.max} reps (top of ${span(t)})${effort}, so ${change} and the target restarts at ${t.min} reps.${missingNote}`,
      next: { ...(assisted ? { assistKg: to } : { loadKg: to }), repTargets: Array(prescribed).fill(t.min), text: `${toText[0]!.toUpperCase()}${toText.slice(1)}, ${rangeText}` },
      dataIssue: dataIssue || rirMissing,
    };
  }

  const aim = Math.min(t.max, Math.min(...reps) + 1);
  return {
    outcome: 'hold',
    reasons: ['within_range'],
    explanation: `Reps ${list(reps)} are inside ${span(t)}. Keep ${loadText} and aim for ${aim} reps per set.`,
    next: { ...(assisted ? { assistKg: load } : { loadKg: load }), repTargets: Array(prescribed).fill(aim), text: `${loadText}, aim ${prescribed} × ${aim}` },
  };
}

/** R3: assisted negatives — every rep a controlled lowering at the prescribed tempo. */
function negativeRule(ctx: Ctx): RuleResult {
  const { slot, equipment } = ctx.input;
  if (slot.rule.id !== 'assisted_negative') throw new Error('wrong rule');
  const tempo = slot.rule.tempoSec;
  const t = repsTarget(slot.target);
  const load = lastLoad(ctx.sets, 'assistKg');
  if (!t || load === null) return noData('Assistance was not recorded.');
  const ws = atLoad(ctx.sets, 'assistKg', load);
  if (ws.some((s) => s.reps == null)) return noData('Reps were not recorded for every set.');
  const prescribed = slot.sets ?? ws.length;
  const keep: TargetDraft = { assistKg: load, repTargets: Array(prescribed).fill(t.min), text: `${kg(load)} assist, ${prescribed} × ${t.min} at ${tempo} s each` };

  if (ws.length < prescribed || ws.some((s) => counted(s) < t.min)) {
    return { outcome: 'hold', reasons: ['short_once'], explanation: `Not all ${prescribed} × ${t.min} were completed at ${kg(load)} assist. Keep it.`, next: keep };
  }
  if (ws.some((s) => s.tempoMet === false)) {
    const prev = ctx.previous.at(-1);
    const missedBefore = prev ? atLoad(working(prev.sets), 'assistKg', load).some((s) => s.tempoMet === false) : false;
    if (missedBefore) {
      const to = heavier(equipment, load);
      return {
        outcome: 'decrease',
        reasons: ['tempo_missed', 'short_twice'],
        explanation: `Some reps were faster than ${tempo} s two sessions in a row. Recommend ${to === null ? 'one step more assistance' : `${kg(to)} assist`}.`,
        next: { assistKg: to, repTargets: Array(prescribed).fill(t.min), text: `${to === null ? 'One step more assistance' : `${kg(to)} assist`}, ${prescribed} × ${t.min} at ${tempo} s each` },
      };
    }
    return { outcome: 'hold', reasons: ['tempo_missed'], explanation: `Some reps were faster than ${tempo} s. Keep ${kg(load)} assist; every rep needs a steady ${tempo} s.`, next: keep };
  }

  const tempoUnknown = ws.some((s) => s.tempoMet == null);
  const to = lighter(equipment, load);
  const reasons: Reason[] = ['top_of_range'];
  if (tempoUnknown) reasons.push('tempo_unknown');
  if (to === null || to <= 0) {
    return {
      outcome: 'milestone',
      reasons: [...reasons, 'bodyweight_reached'],
      explanation: `All ${prescribed} × ${t.min} done at ${tempo} s with the lightest assistance. Next step: unassisted negatives.`,
      next: { assistKg: 0, repTargets: Array(prescribed).fill(t.min), text: `Unassisted, ${prescribed} × ${t.min} at ${tempo} s each` },
      dataIssue: true,
    };
  }
  return {
    outcome: 'increase',
    reasons,
    explanation: `All ${prescribed} × ${t.min} done${tempoUnknown ? ' (tempo not recorded for every rep)' : ` with a full ${tempo} s lowering`}, so assistance drops from ${kg(load)} to ${kg(to)}.`,
    next: { assistKg: to, repTargets: Array(prescribed).fill(t.min), text: `${kg(to)} assist, ${prescribed} × ${t.min} at ${tempo} s each` },
    dataIssue: tempoUnknown || ws.some((s) => s.quality !== 'confirmed'),
  };
}

/** R4: timed holds within a range (hollow body, side plank). */
function timedRule(ctx: Ctx): RuleResult {
  const { slot, current } = ctx.input;
  if (slot.target.kind !== 'time' || slot.rule.id !== 'timed_hold') return noData('Not a timed hold.');
  const { minSec, maxSec } = slot.target;
  const stepSec = slot.rule.stepSec;
  const times = ctx.sets.map((s) => s.durationSec);
  if (times.some((x) => x == null)) return noData('Duration was not recorded for every set.');
  const secs = times as number[];
  const prescribed = slot.sets ?? secs.length;
  const target = current?.timeSec ?? minSec;
  const allHit = secs.length >= prescribed && secs.every((x) => x >= target);
  const sideText = slot.perSide ? ` / ${slot.perSide}` : '';

  if (!allHit) {
    return { outcome: 'hold', reasons: ['within_range'], explanation: `Held ${list(secs)} s against a target of ${target} s. Keep aiming for ${target} s.`, next: { timeSec: target, text: `Aim ${prescribed} × ${target} s${sideText}` } };
  }
  if (target >= maxSec) {
    return {
      outcome: 'milestone',
      reasons: ['at_cap'],
      explanation: `Held ${target} s on every set, the top of the prescribed ${span({ min: minSec, max: maxSec })} s. Going further (more time or a harder variation) needs your approval.`,
      next: null,
    };
  }
  const nextSec = Math.min(maxSec, Math.max(target, Math.min(...secs)) + stepSec);
  return {
    outcome: 'increase',
    reasons: ['top_of_range'],
    explanation: `Held ${list(secs)} s, at or above the ${target} s target on every set, so the target rises to ${nextSec} s.`,
    next: { timeSec: nextSec, text: `Aim ${prescribed} × ${nextSec} s${sideText}` },
  };
}

/** R4b: max holds (dead hang) — beat the slot's previous best. */
function hangRule(ctx: Ctx): RuleResult {
  const times = ctx.sets.map((s) => s.durationSec);
  if (times.some((x) => x == null)) return noData('Duration was not recorded for every set.');
  const best = Math.max(...(times as number[]));
  const target = ctx.input.current?.timeSec ?? null;
  if (target !== null && best < target) {
    return { outcome: 'hold', reasons: ['within_range'], explanation: `Best hold ${best} s against a target of ${target} s. Keep aiming to beat ${target} s.`, next: { timeSec: target, text: `Beat ${target} s` } };
  }
  return {
    outcome: target !== null && best === target ? 'hold' : 'increase',
    reasons: ['top_of_range'],
    explanation: `Best hold ${best} s${target !== null ? ` (target ${target} s)` : ''}. Next time, beat ${best} s.`,
    next: { timeSec: best, text: `Beat ${best} s` },
  };
}

/** R5: bodyweight reps — add a rep per set up to a cap; quality milestones (pause) must be held. */
function bodyweightRule(ctx: Ctx): RuleResult {
  const { slot, current } = ctx.input;
  if (slot.rule.id !== 'bodyweight_reps') throw new Error('wrong rule');
  const { capReps, requirePause: ruleNeedsPause } = slot.rule;
  const t = repsTarget(slot.target);
  if (!t || ctx.sets.some((s) => s.reps == null)) return noData('Reps were not recorded for every set.');
  const needsPause = Boolean(ruleNeedsPause || current?.requirePause);
  const prescribed = slot.sets ?? ctx.sets.length;
  const reps = ctx.sets.map(counted);
  const target = current?.repTargets?.[0] ?? t.min;
  const sideText = slot.perSide ? ` / ${slot.perSide}` : '';
  const pauseText = needsPause ? ' with a 1 s pause' : '';
  const keep: TargetDraft = { repTargets: Array(prescribed).fill(target), ...(needsPause ? { requirePause: true } : {}), text: `${prescribed} × ${target}${sideText}${pauseText}` };

  const met = (sets: SetLog[]) =>
    sets.length >= prescribed && sets.every((s) => counted(s) >= target && (!needsPause || s.pauseHeld === true));

  if (needsPause && ctx.sets.some((s) => s.pauseHeld === false)) {
    return { outcome: 'hold', reasons: ['pause_missing'], explanation: `The 1 s pause wasn't held on every rep. Keep ${prescribed} × ${target} and hold the pause.`, next: keep };
  }
  if (needsPause && ctx.sets.some((s) => s.pauseHeld == null)) {
    return { outcome: 'hold', reasons: ['pause_unknown'], explanation: `Reps ${list(reps)} done, but it wasn't recorded whether the 1 s pause was held. Keep ${prescribed} × ${target}.`, next: keep };
  }
  if (!met(ctx.sets)) {
    return { outcome: 'hold', reasons: ['within_range'], explanation: `Reps ${list(reps)} against a target of ${target}. Keep aiming for ${prescribed} × ${target}.`, next: keep };
  }
  if (Math.min(...reps) >= capReps) {
    return {
      outcome: 'milestone',
      reasons: ['at_cap'],
      explanation: `${prescribed} × ${Math.min(...reps)}${pauseText} reached the top of what this exercise prescribes. A harder variation needs your approval.`,
      next: null,
    };
  }
  // A quality milestone (pause) must be met in two sessions in a row before adding reps.
  const prev = ctx.previous.at(-1);
  if (ruleNeedsPause && !(prev && met(working(prev.sets)))) {
    return { outcome: 'hold', reasons: ['top_of_range'], explanation: `${prescribed} × ${target}${pauseText} done. One more session like this, then add a rep.`, next: keep };
  }
  const nextReps = Math.min(capReps, Math.max(target, Math.min(...reps)) + 1);
  return {
    outcome: 'increase',
    reasons: ['top_of_range'],
    explanation: `${prescribed} × ${target}${pauseText} done cleanly, so the target rises to ${nextReps} reps per set.`,
    next: { repTargets: Array(prescribed).fill(nextReps), ...(needsPause ? { requirePause: true } : {}), text: `${prescribed} × ${nextReps}${sideText}${pauseText}` },
  };
}

/** R7: loaded carries — top of the distance range → heavier, distance resets. */
function distanceRule(ctx: Ctx): RuleResult {
  const { slot, equipment } = ctx.input;
  if (slot.target.kind !== 'distance') return noData('Not a distance target.');
  const { minM, maxM } = slot.target;
  const load = lastLoad(ctx.sets, 'weightKg');
  if (load === null) return noData('No load was recorded.');
  const ws = atLoad(ctx.sets, 'weightKg', load);
  if (ws.some((s) => s.distanceM == null)) return noData('Distance was not recorded for every set.');
  const prescribed = slot.sets ?? ws.length;
  const dist = ws.map((s) => s.distanceM as number);
  if (ws.length >= prescribed && dist.every((d) => d >= maxM)) {
    const to = heavier(equipment, load);
    const toText = to === null ? `next weight above ${kg(load)}` : kg(to);
    return {
      outcome: 'increase',
      reasons: to === null ? ['top_of_range', 'step_unknown'] : ['top_of_range'],
      explanation: `All ${prescribed} carries reached ${maxM} m or more (${list(dist)} m), so the weight goes up to ${toText} and the distance restarts at ${minM} m.`,
      next: { loadKg: to, distanceM: minM, text: `${toText[0]!.toUpperCase()}${toText.slice(1)}, ${prescribed} × ${minM}–${maxM} m` },
      dataIssue: ws.some((s) => s.quality !== 'confirmed'),
    };
  }
  return { outcome: 'hold', reasons: ['within_range'], explanation: `Carried ${list(dist)} m with ${kg(load)}. Keep it until every carry reaches ${maxM} m.`, next: { loadKg: load, distanceM: maxM, text: `${kg(load)}, ${prescribed} × ${maxM} m` } };
}

function noData(why: string): RuleResult {
  return { outcome: 'none', reasons: ['no_data'], explanation: `${why} No change.`, next: null };
}

function applyRule(ctx: Ctx): RuleResult {
  switch (ctx.input.slot.rule.id) {
    case 'load_double':
      return loadRule(ctx, 'weightKg');
    case 'assisted_reps':
      return loadRule(ctx, 'assistKg');
    case 'assisted_negative':
      return negativeRule(ctx);
    case 'timed_hold':
      return timedRule(ctx);
    case 'max_hang':
      return hangRule(ctx);
    case 'bodyweight_reps':
      return bodyweightRule(ctx);
    case 'distance_load':
      return distanceRule(ctx);
    case 'none':
      return { outcome: 'none', reasons: ['not_progressive'], explanation: 'Logged only; no progression.', next: null };
  }
}

// ---------------------------------------------------------------------------
// Guards (G1–G4; G5 data quality and G6 technique live in the rules)

interface GuardResult {
  blockers: { reason: Reason; text: string }[];
  sharp: string | null;
  declineTwice: boolean;
}

function guards(ctx: Ctx): GuardResult {
  const { slot, settings } = ctx.input;
  const { session } = ctx.latest;
  const blockers: GuardResult['blockers'] = [];

  if (session.fatigue !== null && session.fatigue >= settings.fatigueThreshold) {
    blockers.push({ reason: 'fatigue', text: `session fatigue was ${session.fatigue}/5` });
  }

  const pains = session.discomfort.filter((d) => d.slotKey === slot.slotKey || d.slotKey === null);
  const sharp = pains.find((d) => d.severity === 'sharp');
  if (!sharp && pains.length) blockers.push({ reason: 'discomfort_mild', text: 'you reported discomfort' });

  const prev = ctx.previous.at(-1);
  if (prev && daysBetween(prev.session.date, session.date) >= settings.gapDays) {
    blockers.push({ reason: 'gap', text: `it was ${daysBetween(prev.session.date, session.date)} days since the last time` });
  }

  // G3: total reps at the same load dropped compared with the previous time at that load.
  let declineTwice = false;
  const key: LoadKey | null = slot.rule.id === 'load_double' ? 'weightKg' : slot.rule.id === 'assisted_reps' ? 'assistKg' : null;
  const load = key ? lastLoad(ctx.sets, key) : null;
  if (key && load !== null) {
    const sameLoadHistory = [...ctx.previous, ctx.latest].filter((p) => totalAt(p, key, load) !== null);
    const totals = sameLoadHistory.map((p) => totalAt(p, key, load)!);
    const n = totals.length;
    if (n >= 2 && totals[n - 1]! < totals[n - 2]!) {
      blockers.push({ reason: 'decline', text: `total reps at this load dropped from ${totals[n - 2]} to ${totals[n - 1]}` });
      declineTwice = n >= 3 && totals[n - 2]! < totals[n - 3]!;
    }
  }

  return { blockers, sharp: sharp ? sharp.note || 'sharp pain' : null, declineTwice };
}

// ---------------------------------------------------------------------------

export function evaluateSlot(input: EvaluateInput): Decision {
  unit = input.settings.unit ?? 'kg';
  try {
    return evaluate(input);
  } finally {
    unit = 'kg';
  }
}

function evaluate(input: EvaluateInput): Decision {
  const { slot } = input;
  const latest = input.history.at(-1);
  const base = {
    slotKey: slot.slotKey,
    ...(slot.linkGroup ? { linkGroup: slot.linkGroup } : {}),
    basisSessionId: latest?.session.id ?? null,
    basisDate: latest?.session.date ?? null,
    rulesetVersion: RULESET_VERSION,
  };
  const decide = (r: RuleResult): Decision => ({
    ...base,
    outcome: r.outcome,
    reasons: r.reasons,
    explanation: r.explanation,
    next: r.next,
    apply: policy(r),
  });

  if (!latest) return decide({ outcome: 'none', reasons: ['no_data'], explanation: 'Not performed yet.', next: null });
  const sets = working(latest.sets);
  if (sets.length === 0) return decide(noData('No sets were logged.'));

  const ctx: Ctx = { input, latest, previous: input.history.slice(0, -1), sets };
  const g = guards(ctx);

  if (g.sharp) {
    return decide({
      outcome: 'blocked',
      reasons: ['discomfort_sharp'],
      explanation: `You reported sharp pain (${g.sharp}). Stop this exercise, use the alternative, and review before it progresses again.`,
      next: null,
    });
  }

  const r = applyRule(ctx);

  if (g.declineTwice && r.outcome === 'hold' && (slot.rule.id === 'load_double' || slot.rule.id === 'assisted_reps')) {
    const load = lastLoad(sets, slot.rule.id === 'load_double' ? 'weightKg' : 'assistKg')!;
    const assisted = slot.rule.id === 'assisted_reps';
    const t = repsTarget(slot.target)!;
    const prescribed = slot.sets ?? sets.length;
    const to = assisted ? heavier(input.equipment, load) : reduced(input.equipment, load, input.settings.decreasePct);
    const toText = to === null ? (assisted ? 'one step more assistance' : 'one pin lighter') : assisted ? `${kg(to)} assist` : kg(to);
    return decide({
      outcome: 'decrease',
      reasons: ['decline_twice'],
      explanation: `Total reps at ${assisted ? `${kg(load)} assist` : kg(load)} dropped two sessions in a row. Recommend ${toText}.`,
      next: { ...(assisted ? { assistKg: to } : { loadKg: to }), repTargets: Array(prescribed).fill(t.min), text: `${toText}, ${prescribed} × ${span(t)}` },
    });
  }

  if (g.blockers.length && (r.outcome === 'increase' || r.outcome === 'milestone')) {
    const why = g.blockers.map((b) => b.text).join(', and ');
    return decide({
      outcome: 'hold',
      reasons: [...g.blockers.map((b) => b.reason), ...r.reasons],
      explanation: `${r.explanation.replace(/\.$/, '')} — but ${why}, so the target stays the same this time.`,
      next: null,
      dataIssue: r.dataIssue,
    });
  }

  if (g.blockers.length && r.outcome === 'hold') {
    return decide({ ...r, reasons: [...r.reasons, ...g.blockers.map((b) => b.reason)], explanation: `${r.explanation} Note: ${g.blockers.map((b) => b.text).join(', and ')}.` });
  }

  return decide(r);
}

/** Routine-only auto-apply (decision 20 Oct). */
function policy(r: RuleResult): 'auto' | 'approval' {
  switch (r.outcome) {
    case 'hold':
    case 'none':
      return 'auto';
    case 'increase':
      return r.dataIssue ? 'approval' : 'auto';
    default:
      return 'approval';
  }
}
