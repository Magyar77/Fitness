import { describe, expect, it } from 'vitest';
import { READY_MADE, BEGINNER_3_DAY, INTERMEDIATE_4_DAY, EXPERT_5_DAY } from '../../src/engine/program/templates';
import { PROGRAM_V2 } from '../../src/engine/program/programV2';
import { EXERCISES_BY_ID } from '../../src/engine/library/exercises';
import { generateWeek, settingsForProgram, DEFAULT_SCHEDULE_SETTINGS } from '../../src/engine/scheduling';
import { addDays } from '../../src/engine/dates';

const MON = '2026-11-02';

describe('ready-made programs', () => {
  it('have the requested shape: 3, 4 and 5 full-body days', () => {
    expect(READY_MADE.map((p) => [p.about?.level, p.about?.daysPerWeek, p.templates.length])).toEqual([
      ['beginner', 3, 3],
      ['intermediate', 4, 4],
      ['expert', 5, 5],
    ]);
    for (const p of READY_MADE) {
      for (const t of p.templates) {
        expect(t.kind).toBe('program');
        expect(t.regions, `${p.id} ${t.code}`).toEqual(expect.arrayContaining(['upper', 'lower'])); // full body
      }
    }
  });

  it('use library exercises, unique slot keys that never collide with Program v2', () => {
    const v2Keys = new Set(PROGRAM_V2.templates.flatMap((t) => t.slots.map((s) => s.slotKey)));
    const keys = READY_MADE.flatMap((p) => p.templates.flatMap((t) => t.slots.map((s) => s.slotKey)));
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.filter((k) => v2Keys.has(k))).toEqual([]);
    for (const p of READY_MADE) for (const t of p.templates) for (const s of t.slots) expect(EXERCISES_BY_ID.has(s.exerciseId), s.exerciseId).toBe(true);
  });

  it('give every slot a sensible progression rule', () => {
    const rules = new Set(READY_MADE.flatMap((p) => p.templates.flatMap((t) => t.slots.map((s) => `${s.exerciseId}:${s.rule.id}`))));
    expect(rules).toContain('barbell-back-squat:load_double');
    expect(rules).toContain('assisted-pull-up:assisted_reps');
    expect(rules).toContain('push-up:bodyweight_reps');
    expect(rules).toContain('plank:timed_hold');
    expect(rules).toContain('farmers-carry:distance_load');
  });

  it('schedule with rest days between full-body sessions', () => {
    const week = (p: typeof BEGINNER_3_DAY, restDays: string[]) =>
      generateWeek({ weekStart: MON, restDays, unavailableDays: [], templates: p.templates, fixed: [], previousWeek: [], settings: settingsForProgram(p) });
    const beginner = week(BEGINNER_3_DAY, [addDays(MON, 6)]).entries.map((e) => e.date);
    for (let i = 1; i < beginner.length; i++) expect(beginner[i]! > addDays(beginner[i - 1]!, 1)).toBe(true); // never back to back
    expect(week(INTERMEDIATE_4_DAY, [addDays(MON, 6)]).entries.map((e) => e.templateCode)).toEqual(['A', 'B', 'C', 'D']);
    expect(week(EXPERT_5_DAY, [addDays(MON, 6)]).entries).toHaveLength(5);
  });

  it('keep Program v2 on its C-first rule and others on their own order', () => {
    expect(settingsForProgram(PROGRAM_V2)).toEqual(DEFAULT_SCHEDULE_SETTINGS);
    expect(settingsForProgram(INTERMEDIATE_4_DAY).referenceOrder).toEqual(['A', 'B', 'C', 'D']);
  });
});
