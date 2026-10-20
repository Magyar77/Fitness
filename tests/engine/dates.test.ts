import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, weekStart, weekdayIndex } from '../../src/engine/dates';

describe('dates', () => {
  it('finds the Monday of a week', () => {
    expect(weekStart('2026-10-12')).toBe('2026-10-12'); // Mon, Week 1
    expect(weekStart('2026-10-17')).toBe('2026-10-12'); // Sat
    expect(weekStart('2026-10-18')).toBe('2026-10-12'); // Sun belongs to the same week
    expect(weekStart('2026-10-20')).toBe('2026-10-19'); // Tue, Week 2
  });

  it('indexes weekdays from Monday', () => {
    expect(weekdayIndex('2026-10-12')).toBe(0);
    expect(weekdayIndex('2026-10-18')).toBe(6);
  });

  it('adds days across month and DST boundaries', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26'); // EU DST change
    expect(daysBetween('2026-10-12', '2026-10-19')).toBe(7);
  });

  it('rejects malformed dates', () => {
    expect(() => addDays('2026-02-30', 1)).toThrow();
    expect(() => weekStart('12.10.2026')).toThrow();
  });
});
