// Reads a workout log CSV from anywhere: this app's own export, Strong, Hevy, or the
// template an AI chat fills in. Columns are found by name, so their order does not matter.

import type { IsoDate } from '../dates';
import type { ExerciseKind } from '../custom';
import type { Exercise } from '../model';

export interface ParsedSet {
  line: number;
  date: IsoDate;
  workout: string;
  exercise: string;
  setIndex: number;
  weightKg: number | null;
  assistKg: number | null;
  reps: number | null;
  seconds: number | null;
  distanceM: number | null;
  rir: number | null;
  warmup: boolean;
  notes: string;
}

export interface ParsedLog {
  sets: ParsedSet[];
  bodyWeights: { line: number; date: IsoDate; kg: number }[];
  problems: { line: number; message: string }[];
  /** How slash dates were read, when the file has any. */
  dateOrder: 'day-first' | 'month-first' | null;
}

export const TEMPLATE_HEADER = ['date', 'workout', 'exercise', 'set', 'weight', 'unit', 'reps', 'seconds', 'distance_m', 'assist', 'rir', 'warmup', 'notes'];
export const BODY_WEIGHT_NAME = 'Body weight';

// ---------------------------------------------------------------------------
// CSV text → rows

/** RFC 4180 parsing with the delimiter (comma, semicolon or tab) taken from the header line. */
export function parseCsvText(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, '');
  const first = clean.split(/\r?\n/, 1)[0] ?? '';
  const count = (c: string) => first.split(c).length - 1;
  const delimiter = [',', ';', '\t'].sort((a, b) => count(b) - count(a))[0]!;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i]!;
    if (quoted) {
      if (c === '"' && clean[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && clean[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

// ---------------------------------------------------------------------------
// Columns

type Column = 'date' | 'workout' | 'exercise' | 'set' | 'weight' | 'unit' | 'reps' | 'seconds' | 'distance' | 'assist' | 'rir' | 'rpe' | 'warmup' | 'notes';

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Header name → column, with the unit some headers carry. */
const ALIASES: Record<string, { col: Column; unit?: 'kg' | 'lb' | 'km' | 'm' | 'mi' }> = {
  date: { col: 'date' }, day: { col: 'date' }, starttime: { col: 'date' }, datetime: { col: 'date' }, workoutdate: { col: 'date' },
  workout: { col: 'workout' }, workoutname: { col: 'workout' }, title: { col: 'workout' }, session: { col: 'workout' }, routine: { col: 'workout' },
  exercise: { col: 'exercise' }, exercisename: { col: 'exercise' }, exercisetitle: { col: 'exercise' }, movement: { col: 'exercise' },
  set: { col: 'set' }, setorder: { col: 'set' }, setindex: { col: 'set' }, setnumber: { col: 'set' }, setno: { col: 'set' },
  weight: { col: 'weight' }, load: { col: 'weight' }, weightkg: { col: 'weight', unit: 'kg' }, kg: { col: 'weight', unit: 'kg' },
  weightlbs: { col: 'weight', unit: 'lb' }, weightlb: { col: 'weight', unit: 'lb' }, lbs: { col: 'weight', unit: 'lb' }, lb: { col: 'weight', unit: 'lb' },
  unit: { col: 'unit' }, units: { col: 'unit' }, weightunit: { col: 'unit' },
  reps: { col: 'reps' }, repetitions: { col: 'reps' }, rep: { col: 'reps' },
  seconds: { col: 'seconds' }, durationseconds: { col: 'seconds' }, durations: { col: 'seconds' }, durationsec: { col: 'seconds' }, time: { col: 'seconds' }, timesec: { col: 'seconds' },
  distance: { col: 'distance', unit: 'm' }, distancem: { col: 'distance', unit: 'm' }, distancekm: { col: 'distance', unit: 'km' }, distancemiles: { col: 'distance', unit: 'mi' },
  assist: { col: 'assist' }, assistkg: { col: 'assist', unit: 'kg' }, assistance: { col: 'assist' }, assistlb: { col: 'assist', unit: 'lb' },
  rir: { col: 'rir' }, rirmin: { col: 'rir' }, rpe: { col: 'rpe' },
  warmup: { col: 'warmup' }, settype: { col: 'warmup' },
  notes: { col: 'notes' }, note: { col: 'notes' }, setnotes: { col: 'notes' }, comment: { col: 'notes' },
};

// ---------------------------------------------------------------------------
// Values

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number): IsoDate | null => {
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
};

/** Date in any of the usual forms; slash dates follow `order`. */
export function parseDate(raw: string, order: 'day-first' | 'month-first' = 'day-first'): IsoDate | null {
  const s = raw.trim().toLowerCase();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  if (m) return iso(+m[1]!, +m[2]!, +m[3]!);
  m = /^(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})/.exec(s);
  if (m) return iso(+m[3]!, +m[2]!, +m[1]!);
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(s);
  if (m) return order === 'day-first' ? iso(+m[3]!, +m[2]!, +m[1]!) : iso(+m[3]!, +m[1]!, +m[2]!);
  m = /^(\d{1,2})\s+([a-z]{3})[a-z]*\.?,?\s+(\d{4})/.exec(s);
  if (m && MONTHS.includes(m[2]!)) return iso(+m[3]!, MONTHS.indexOf(m[2]!) + 1, +m[1]!);
  m = /^([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(s);
  if (m && MONTHS.includes(m[1]!)) return iso(+m[3]!, MONTHS.indexOf(m[1]!) + 1, +m[2]!);
  return null;
}

function slashOrder(values: string[]): 'day-first' | 'month-first' | null {
  let any = false;
  for (const v of values) {
    const m = /^(\d{1,2})[/-](\d{1,2})[/-]\d{4}/.exec(v.trim());
    if (!m) continue;
    any = true;
    if (+m[1]! > 12) return 'day-first';
    if (+m[2]! > 12) return 'month-first';
  }
  return any ? 'day-first' : null;
}

/** "12,5" and "12.5" both work; empty means no value. */
export function parseNumber(raw: string | undefined): number | null | 'bad' {
  const s = (raw ?? '').trim().replace(/\s/g, '');
  if (!s) return null;
  const n = Number(/^-?\d+,\d+$/.test(s) ? s.replace(',', '.') : s);
  return Number.isFinite(n) ? n : 'bad';
}

const LB = 0.45359237;
const round = (n: number) => Math.round(n * 10000) / 10000;

// ---------------------------------------------------------------------------
// Rows → sets

export function parseLog(text: string, defaultUnit: 'kg' | 'lb' = 'kg', today?: IsoDate): ParsedLog {
  const out: ParsedLog = { sets: [], bodyWeights: [], problems: [], dateOrder: null };
  const rows = parseCsvText(text);
  if (rows.length < 2) {
    out.problems.push({ line: 1, message: 'The file has no rows. The first line must be the column names.' });
    return out;
  }
  const cols = new Map<Column, { index: number; unit?: string }>();
  rows[0]!.forEach((h, index) => {
    const a = ALIASES[key(h)];
    if (a && !cols.has(a.col)) cols.set(a.col, { index, ...(a.unit ? { unit: a.unit } : {}) });
  });
  for (const need of ['date', 'exercise'] as const) {
    if (!cols.has(need)) out.problems.push({ line: 1, message: `No "${need}" column found. The first line must name the columns, e.g. ${TEMPLATE_HEADER.join(',')}` });
  }
  if (out.problems.length) return out;

  const get = (r: string[], c: Column) => {
    const at = cols.get(c);
    return at ? (r[at.index] ?? '').trim() : '';
  };
  out.dateOrder = slashOrder(rows.slice(1).map((r) => get(r, 'date')));
  const counters = new Map<string, number>();

  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const problem = (message: string) => out.problems.push({ line, message });
    const date = parseDate(get(r, 'date'), out.dateOrder ?? 'day-first');
    const exercise = get(r, 'exercise').replace(/\s+/g, ' ');
    if (!date) return problem(`Date "${get(r, 'date')}" not recognised; use YYYY-MM-DD.`);
    if (today && date > today) return problem(`Date ${date} is in the future.`);
    if (!exercise) return problem('No exercise name.');

    const unitCell = get(r, 'unit').toLowerCase();
    const weightUnit = cols.get('weight')?.unit ?? (/^lbs?$|pound/.test(unitCell) ? 'lb' : /^kg|kilo/.test(unitCell) ? 'kg' : defaultUnit);
    const toKg = (v: number, unit = weightUnit) => round(unit === 'lb' ? v * LB : v);
    const nums: Record<'weight' | 'reps' | 'seconds' | 'distance' | 'assist' | 'rir' | 'rpe', number | null> = { weight: null, reps: null, seconds: null, distance: null, assist: null, rir: null, rpe: null };
    for (const c of Object.keys(nums) as (keyof typeof nums)[]) {
      const v = parseNumber(get(r, c));
      if (v === 'bad') return problem(`"${get(r, c)}" in ${c} is not a number.`);
      nums[c] = v;
    }

    if (key(exercise) === key(BODY_WEIGHT_NAME) || key(exercise) === 'bodyweightentry' || key(exercise) === 'weighin') {
      const kg = nums.weight === null ? null : toKg(nums.weight);
      if (kg === null || kg < 30 || kg > 300) return problem('Body weight row needs a weight between 30 and 300 kg.');
      out.bodyWeights.push({ line, date, kg: Math.round(kg * 100) / 100 });
      return;
    }

    const distanceUnit = cols.get('distance')?.unit ?? 'm';
    const distanceM = nums.distance === null ? null : round(nums.distance * (distanceUnit === 'km' ? 1000 : distanceUnit === 'mi' ? 1609.344 : 1));
    let weightKg = nums.weight === null ? null : toKg(nums.weight);
    let assistKg = nums.assist === null ? null : toKg(Math.abs(nums.assist), cols.get('assist')?.unit ?? weightUnit);
    if (weightKg !== null && weightKg < 0) {
      assistKg ??= -weightKg; // some apps log assistance as negative weight
      weightKg = null;
    }
    const reps = nums.reps;
    if (reps !== null && (!Number.isInteger(reps) || reps < 0 || reps > 500)) return problem(`Reps "${get(r, 'reps')}" should be a whole number.`);
    if (reps === null && nums.seconds === null && distanceM === null && weightKg === null) return problem(`${exercise}: no reps, time, distance or weight.`);
    if (reps === 0 && !nums.seconds && !distanceM) return; // a skipped set
    if (weightKg !== null && weightKg > 1000) return problem(`Weight ${nums.weight} looks too heavy.`);

    const setCell = get(r, 'set');
    const typeCell = get(r, 'warmup').toLowerCase();
    const warmup = /^w$/i.test(setCell) || /^(yes|y|true|1|x|warm.?up|w)$/.test(typeCell);
    const rir = nums.rir !== null ? Math.max(0, Math.round(nums.rir)) : nums.rpe !== null ? Math.max(0, Math.round(10 - nums.rpe)) : null;
    const workout = get(r, 'workout') || 'Imported workout';
    const group = `${date}|${workout}|${exercise.toLowerCase()}`;
    const n = (counters.get(group) ?? 0) + 1;
    counters.set(group, n);
    const given = Number(setCell);
    out.sets.push({
      line, date, workout, exercise,
      setIndex: Number.isInteger(given) && given > 0 ? given : n,
      weightKg, assistKg, reps, seconds: nums.seconds, distanceM, rir, warmup,
      notes: get(r, 'notes'),
    });
  });
  return out;
}

// ---------------------------------------------------------------------------
// Exercise names → library

export const EQUIPMENT_WORDS = ['barbell', 'dumbbell', 'cable', 'machine', 'kettlebell', 'band', 'smith', 'ezbar', 'trapbar'];
const STOP = new Set(['the', 'a', 'an', 'of', 'with', 'standard', 'regular', 'normal', 'strict', 'exercise']);

/** Lowercase words, singular, with common spellings unified ("Pull Up (Assisted)" → assisted pullup). */
export function nameTokens(name: string): string[] {
  let s = name.toLowerCase().replace(/&/g, ' and ');
  s = s.replace(/\(([^)]*)\)/g, ' $1 '); // "Bench Press (Barbell)" → equipment as a word
  s = s.replace(/\bez[\s-]?bar\b/g, 'ezbar').replace(/\btrap[\s-]?bar\b/g, 'trapbar').replace(/\bdb\b/g, 'dumbbell').replace(/\bbb\b/g, 'barbell').replace(/\bkb\b/g, 'kettlebell');
  s = s.replace(/\brdl\b/g, 'romanian deadlift').replace(/\bohp\b/g, 'overhead press');
  s = s.replace(/\b(pull|push|chin|sit|step)[\s-]?(up|down)s?\b/g, '$1$2');
  s = s.replace(/\bpull[\s-]?downs?\b/g, 'pulldown').replace(/\bpush[\s-]?downs?\b/g, 'pushdown');
  return s
    .split(/[^a-z0-9°]+/)
    .filter((w) => w && !STOP.has(w))
    .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))
    .map((w) => (w === 'bicep' ? 'biceps' : w === 'tricep' ? 'triceps' : w === 'raise' ? 'raise' : w));
}

/** Common names in other apps for the app's own exercises. */
const KNOWN: Record<string, string> = {
  'barbell squat': 'barbell-back-squat', 'squat': 'barbell-back-squat', 'back squat': 'barbell-back-squat',
  'barbell deadlift': 'deadlift', 'conventional deadlift': 'deadlift',
  'pullup': 'pull-up', 'chinup': 'pull-up',
  'assisted pullup': 'assisted-pull-up', 'assisted pullup machine': 'assisted-pull-up',
  'assisted dip': 'assisted-dip', 'assisted dip machine': 'assisted-dip',
  'cable lat pulldown': 'lat-pulldown', 'lat pulldown machine': 'lat-pulldown',
  'barbell overhead press': 'barbell-overhead-press', 'overhead press': 'barbell-overhead-press', 'barbell shoulder press': 'barbell-overhead-press', 'military press': 'barbell-overhead-press',
  'barbell bent over row': 'barbell-row', 'bent over row': 'barbell-row', 'barbell row': 'barbell-row',
  'cable seated row': 'seated-cable-row', 'seated row': 'seated-cable-row',
  'barbell romanian deadlift': 'romanian-deadlift', 'romanian deadlift': 'romanian-deadlift',
  'barbell hip thrust': 'hip-thrust', 'machine leg press': 'leg-press',
  'dumbbell lateral raise': 'db-lateral-raise', 'lateral raise': 'db-lateral-raise', 'side lateral raise': 'db-lateral-raise',
  'barbell biceps curl': 'barbell-curl', 'barbell curl': 'barbell-curl', 'ezbar curl': 'barbell-curl',
  'cable triceps pushdown': 'cable-triceps-pushdown', 'triceps pushdown': 'cable-triceps-pushdown', 'cable pushdown': 'cable-triceps-pushdown',
  'cable face pull': 'cable-face-pull', 'face pull': 'cable-face-pull',
  'pushup': 'push-up', 'kettlebell goblet squat': 'goblet-squat', 'dumbbell goblet squat': 'goblet-squat',
  'machine lying leg curl': 'leg-curl', 'lying leg curl': 'leg-curl', 'machine leg curl': 'leg-curl', 'seated leg curl': 'leg-curl',
  'machine standing calf raise': 'standing-calf-raise', 'calf raise': 'standing-calf-raise',
  'dumbbell incline bench press': 'incline-db-press', 'incline dumbbell bench press': 'incline-db-press', 'dumbbell incline press': 'incline-db-press',
  'dumbbell bench press': 'db-bench-press', 'dumbbell shoulder press': 'seated-db-shoulder-press', 'dumbbell seated shoulder press': 'seated-db-shoulder-press',
  'dumbbell row': 'single-arm-db-row', 'dumbbell bent over row': 'single-arm-db-row', 'dumbbell single arm row': 'single-arm-db-row',
  'bulgarian split squat': 'db-bulgarian-split-squat', 'dumbbell bulgarian split squat': 'db-bulgarian-split-squat',
  'walking lunge': 'db-walking-lunge', 'dumbbell walking lunge': 'db-walking-lunge', 'dumbbell lunge': 'db-walking-lunge',
  'hanging knee raise': 'hanging-knee-raise', 'knee raise': 'hanging-knee-raise', 'dead hang': 'dead-hang',
  'farmer walk': 'farmers-carry', 'farmer carry': 'farmers-carry', 'dumbbell farmer walk': 'farmers-carry',
  'back extension': 'back-extension-45', 'hyperextension': 'back-extension-45',
};
const KNOWN_TOKENS = new Map(Object.entries(KNOWN).map(([k, id]) => [nameTokens(k).sort().join(' '), id]));

export interface NameMatch {
  exercise: Exercise;
  confidence: 'exact' | 'close';
}

function similarity(a: string[], b: string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  const eqA = a.filter((w) => EQUIPMENT_WORDS.includes(w));
  const eqB = b.filter((w) => EQUIPMENT_WORDS.includes(w));
  if (eqA.length && eqB.length && !eqA.some((w) => B.has(w))) return 0; // different equipment is a different exercise
  const shared = [...A].filter((w) => B.has(w)).length;
  if (!shared) return 0;
  const jaccard = shared / new Set([...a, ...b]).size;
  const contained = shared === B.size || shared === A.size ? 0.15 : 0;
  return jaccard + contained;
}

/** Library exercises that could be this name, best first. */
export function matchCandidates(name: string, exercises: Exercise[], limit = 5): NameMatch[] {
  const tokens = nameTokens(name);
  const sorted = [...tokens].sort().join(' ');
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const out: NameMatch[] = [];
  const exact = exercises.filter((e) => [...nameTokens(e.name)].sort().join(' ') === sorted);
  exact.sort((a, b) => Number(!a.custom) - Number(!b.custom) || Number(a.id.startsWith('fx-')) - Number(b.id.startsWith('fx-')));
  for (const e of exact) out.push({ exercise: e, confidence: 'exact' });
  const known = byId.get(KNOWN_TOKENS.get(sorted) ?? '');
  if (known && !out.some((m) => m.exercise.id === known.id)) out.unshift({ exercise: known, confidence: 'exact' });
  const scored = exercises
    .filter((e) => !out.some((m) => m.exercise.id === e.id))
    .map((e) => ({ e, s: similarity(tokens, nameTokens(e.name)) + (e.id.startsWith('fx-') ? 0 : 0.05) }))
    .filter((x) => x.s >= 0.45)
    .sort((a, b) => b.s - a.s || a.e.name.length - b.e.name.length);
  for (const x of scored) out.push({ exercise: x.e, confidence: 'close' });
  return out.slice(0, limit);
}

/** The single best match, if it is good enough to pick without asking. */
export function bestMatch(name: string, exercises: Exercise[]): NameMatch | null {
  const tokens = nameTokens(name);
  const [first] = matchCandidates(name, exercises, 1);
  if (!first) return null;
  if (first.confidence === 'exact') return first;
  return similarity(tokens, nameTokens(first.exercise.name)) >= 0.6 ? first : null;
}

/** How to record a new exercise, judged from its name and the logged numbers. */
export function guessKind(name: string, sets: ParsedSet[]): ExerciseKind {
  const t = nameTokens(name);
  if (sets.some((s) => s.assistKg !== null) || t.includes('assisted')) return 'assisted';
  const weighted = sets.some((s) => s.weightKg);
  if (sets.every((s) => s.reps === null)) {
    if (sets.some((s) => s.distanceM)) return weighted ? 'distance' : 'cardio';
    if (sets.some((s) => (s.seconds ?? 0) >= 300)) return 'cardio';
    if (sets.some((s) => s.seconds)) return 'timed';
  }
  if (!weighted) return 'bodyweight';
  if (t.includes('dumbbell') || t.includes('kettlebell')) return 'dumbbell';
  if (t.includes('barbell') || t.includes('ezbar') || t.includes('trapbar')) return 'barbell_total';
  if (t.includes('cable')) return 'cable';
  return 'machine';
}
