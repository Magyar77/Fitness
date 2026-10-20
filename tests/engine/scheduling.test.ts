import { describe, expect, it } from 'vitest';
import { generateWeek, validateWeek, DEFAULT_SCHEDULE_SETTINGS, type ScheduleInput } from '../../src/engine/scheduling';
import { PROGRAM_V2 } from '../../src/engine/program/programV2';
import { addDays, weekDates, weekdayIndex } from '../../src/engine/dates';
import type { WeekPlanEntry, WorkoutTemplate } from '../../src/engine/model';

const MON = '2026-11-02';
const d = (i: number) => addDays(MON, i); // 0 = Mon … 6 = Sun
const [Mo, Tu, We, Th, Fr, Sa, Su] = [0, 1, 2, 3, 4, 5, 6].map(d) as [string, string, string, string, string, string, string];

function week(over: Partial<ScheduleInput> = {}) {
  return generateWeek({
    weekStart: MON,
    restDays: [],
    unavailableDays: [],
    templates: PROGRAM_V2.templates,
    fixed: [],
    previousWeek: [],
    settings: DEFAULT_SCHEDULE_SETTINGS,
    ...over,
  });
}

/** "Mon:C Tue:A …" for readable assertions. */
const plan = (entries: WeekPlanEntry[]) =>
  entries.map((e) => `${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][weekdayIndex(e.date)]}:${e.templateCode}`).join(' ');

const custom = (over: Partial<WorkoutTemplate>): WorkoutTemplate => ({
  id: 'x', kind: 'custom', code: 'X1', name: 'Extra arms', focus: '', pullUpWork: '', estMinutes: 30, demand: 'moderate',
  regions: ['upper'], pullRole: 'none', pullVolume: false, gripLoad: false, easyDay: false, notes: [], slots: [], ...over,
});

describe('generateWeek', () => {
  it('weekend off → Mon–Fri C A B E D (the coach\'s Week 2 schedule)', () => {
    const p = week({ restDays: [Sa, Su] });
    expect(plan(p.entries)).toBe('Mon:C Tue:A Wed:B Thu:E Fri:D');
    expect(p.omitted).toEqual([]);
    expect(p.notes).toContain('C (Pull + pull-ups, main day) on Monday, right after a day off: freshest for the top goal.');
  });

  it('Sunday + Monday off → Tue–Sat with C first after the rest days', () => {
    expect(plan(week({ restDays: [Su, Mo] }).entries)).toBe('Tue:C Wed:A Thu:B Fri:E Sat:D');
  });

  it('six days available → five workouts, the spare day stays free and separates C from more upper work', () => {
    const p = week({ restDays: [Su] });
    expect(plan(p.entries)).toBe('Mon:C Wed:A Thu:B Fri:E Sat:D');
    expect(p.freeDays).toEqual([Tu]);
    expect(p.notes).toContain('Tuesday stays free. No workout is added to fill it.');
  });

  it('never adds workouts to fill an open week', () => {
    const p = week();
    expect(p.entries).toHaveLength(5);
    expect(p.freeDays).toHaveLength(2);
  });

  it('four days → keeps C, A, D, B and explains why E is left out', () => {
    const p = week({ restDays: [Sa, Su], unavailableDays: [We] });
    expect(plan(p.entries)).toBe('Mon:C Tue:A Thu:B Fri:D');
    expect(p.omitted).toEqual([{ templateCode: 'E', reason: 'easy recovery day, the least critical session' }]);
    expect(p.notes.at(-1)).toBe('Only 4 training days for 5 workouts, so E (Easy lower + core + zone 2) is left out (lowest priority).');
    expect(p.warnings.some((w) => w.code === 'omitted')).toBe(true);
  });

  it('three days → keeps C, A, D', () => {
    const p = week({ restDays: [Su], unavailableDays: [Tu, Th, Sa] });
    expect(plan(p.entries)).toBe('Mon:C Wed:A Fri:D');
    expect(p.omitted.map((o) => o.templateCode)).toEqual(['B', 'E']);
  });

  it('no days → nothing scheduled, with a conflict explaining why', () => {
    const p = week({ restDays: weekDates(MON) });
    expect(p.entries).toEqual([]);
    expect(p.warnings[0]).toMatchObject({ severity: 'conflict', code: 'omitted' });
    expect(p.omitted).toHaveLength(5);
  });

  it('mid-week regeneration keeps completed days and only fills the rest', () => {
    const fixed: WeekPlanEntry[] = [
      { date: Mo, templateCode: 'C', origin: 'generated', state: 'done' },
      { date: Tu, templateCode: 'A', origin: 'generated', state: 'done' },
    ];
    const p = week({ restDays: [Sa, Su], fixed, earliest: We });
    expect(plan(p.entries)).toBe('Mon:C Tue:A Wed:B Thu:E Fri:D');
    expect(p.entries.slice(0, 2)).toEqual(fixed);
    expect(p.notes[0]).toBe('C (Pull + pull-ups, main day) already done on Monday.');
  });

  it('a rest day added mid-week drops the lowest-priority remaining workout', () => {
    const fixed: WeekPlanEntry[] = [
      { date: Mo, templateCode: 'C', origin: 'generated', state: 'done' },
      { date: Tu, templateCode: 'A', origin: 'generated', state: 'done' },
    ];
    const p = week({ restDays: [We, Sa, Su], fixed, earliest: We });
    expect(plan(p.entries)).toBe('Mon:C Tue:A Thu:B Fri:D');
    expect(p.omitted.map((o) => o.templateCode)).toEqual(['E']);
  });

  it('avoids putting C right after last Sunday\'s loaded pulling when a free day allows it', () => {
    const previousWeek: WeekPlanEntry[] = [{ date: addDays(MON, -1), templateCode: 'D', origin: 'generated', state: 'done' }];
    const p = week({ restDays: [Su], previousWeek });
    expect(p.entries[0]!.templateCode).toBe('C');
    expect(p.entries[0]!.date).not.toBe(Mo);
  });

  it('respects every rest/unavailable combination and never duplicates (all 128 cases)', () => {
    const dates = weekDates(MON);
    for (let mask = 0; mask < 128; mask++) {
      const restDays = dates.filter((_, i) => mask & (1 << i));
      const p = week({ restDays });
      const codes = p.entries.map((e) => e.templateCode);
      expect(p.entries.every((e) => !restDays.includes(e.date))).toBe(true);
      expect(new Set(codes).size).toBe(codes.length);
      expect(new Set(p.entries.map((e) => e.date)).size).toBe(codes.length);
      expect(codes.length).toBe(Math.min(5, 7 - restDays.length));
      if (codes.length) expect(codes).toContain('C'); // the top goal is always kept
    }
  });

  it('is deterministic', () => {
    expect(week({ restDays: [Th, Su] })).toEqual(week({ restDays: [Th, Su] }));
  });

  it('follows a different reference order when configured (original v2: A B C E D)', () => {
    const p = week({ restDays: [Su, Mo], settings: { ...DEFAULT_SCHEDULE_SETTINGS, referenceOrder: ['A', 'B', 'C', 'E', 'D'] } });
    expect(plan(p.entries)).toBe('Tue:A Wed:B Thu:C Fri:E Sat:D');
  });
});

describe('validateWeek (manual edits and custom workouts)', () => {
  const base = { weekStart: MON, restDays: [Sa, Su], unavailableDays: [We], previousWeek: [] as WeekPlanEntry[] };
  const e = (date: string, templateCode: string): WeekPlanEntry => ({ date, templateCode, origin: 'manual', state: 'planned' });

  it('flags a workout moved onto a rest or unavailable day as a conflict', () => {
    const w = validateWeek({ ...base, templates: PROGRAM_V2.templates, entries: [e(Sa, 'D'), e(We, 'B')] });
    expect(w.filter((x) => x.severity === 'conflict').map((x) => x.code)).toEqual(['rest_day', 'unavailable_day']);
    expect(w[0]!.message).toBe('D (Upper volume) is on Saturday, which you chose as a rest day.');
  });

  it('warns when a custom heavy-pull workout lands the day before C', () => {
    const backDay = custom({ code: 'X1', name: 'Extra back', pullVolume: true });
    const w = validateWeek({ ...base, templates: [...PROGRAM_V2.templates, backDay], entries: [e(Mo, 'X1'), e(Tu, 'C')] });
    expect(w).toContainEqual(expect.objectContaining({ code: 'pull_before_main', message: 'Extra back the day before C (Pull + pull-ups, main day): back and grip fatigue will cost pull-up performance.' }));
  });

  it('warns about two sessions in one day, hard streaks and too many days', () => {
    const hard = custom({ code: 'X2', name: 'Leg blast', demand: 'hard', regions: ['lower'] });
    const templates = [...PROGRAM_V2.templates, hard];
    const sameDay = validateWeek({ ...base, templates, entries: [e(Mo, 'C'), e(Mo, 'X2')] });
    expect(sameDay.map((x) => x.code)).toContain('same_day');
    const streak = validateWeek({ ...base, restDays: [], unavailableDays: [], templates, entries: [e(Mo, 'B'), e(Tu, 'C'), e(We, 'X2')] });
    expect(streak.map((x) => x.code)).toContain('hard_streak');
    const all = validateWeek({ ...base, restDays: [], unavailableDays: [], templates, entries: weekDates(MON).map((date, i) => e(date, ['C', 'A', 'B', 'E', 'D', 'X2', 'X2'][i]!)) });
    expect(all.map((x) => x.code)).toContain('too_many_days');
  });

  it('warns about a duplicated program workout, but not a repeated custom one', () => {
    const extra = custom({ code: 'X3', name: 'Mobility', demand: 'easy', regions: ['core'] });
    const w = validateWeek({ ...base, templates: [...PROGRAM_V2.templates, extra], entries: [e(Mo, 'C'), e(Th, 'C'), e(Tu, 'X3'), e(Fr, 'X3')] });
    expect(w.filter((x) => x.code === 'duplicate_workout').map((x) => x.message)).toEqual(['C (Pull + pull-ups, main day) appears 2 times this week.']);
  });

  it('notes back-to-back upper sessions as information only', () => {
    const w = validateWeek({ ...base, templates: PROGRAM_V2.templates, entries: [e(Mo, 'C'), e(Tu, 'A')] });
    expect(w).toContainEqual(expect.objectContaining({ severity: 'info', code: 'upper_back_to_back' }));
  });

  it('ignores skipped entries', () => {
    const skipped: WeekPlanEntry = { ...e(Sa, 'D'), state: 'skipped' };
    expect(validateWeek({ ...base, templates: PROGRAM_V2.templates, entries: [skipped] })).toEqual([]);
  });
});
