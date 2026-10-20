import { describe, expect, it } from 'vitest';
import { formatMeasure, fromShown, measureChange, measuredKeys, measureSeries, mergeMeasurement, toShown, validateMeasurement } from '../../src/engine/measurements';

describe('body measurements', () => {
  it('stores cm and shows cm or inches; body fat stays %', () => {
    expect(toShown('waist', 86.36, 'lb')).toBe(34);
    expect(fromShown('waist', 34, 'lb')).toBe(86.36);
    expect(formatMeasure('waist', 84.5, 'kg')).toBe('84.5 cm');
    expect(formatMeasure('bodyFat', 18.2, 'lb')).toBe('18.2%');
    expect(fromShown('bodyFat', 18, 'lb')).toBe(18);
  });

  it('validates dates and plausible values', () => {
    expect(validateMeasurement({ date: '2026-03-01', values: { waist: 84 } }, '2026-03-02')).toEqual([]);
    expect(validateMeasurement({ date: '2026-03-05', values: { waist: 84 } }, '2026-03-02')).toEqual(["The date can't be in the future."]);
    expect(validateMeasurement({ date: '2026-03-01', values: {} }, '2026-03-02')).toEqual(['Enter at least one measurement.']);
    expect(validateMeasurement({ date: '2026-03-01', values: { waist: 8.4 } }, '2026-03-02')[0]).toMatch(/Waist looks off/);
  });

  it('adds to an existing day instead of replacing it', () => {
    const merged = mergeMeasurement({ date: '2026-03-01', values: { waist: 84, arm: 35 }, notes: 'morning' }, { date: '2026-03-01', values: { arm: 35.5, chest: 101 } });
    expect(merged).toEqual({ date: '2026-03-01', values: { waist: 84, arm: 35.5, chest: 101 }, notes: 'morning' });
  });

  it('builds series and changes per measurement', () => {
    const entries = [
      { date: '2026-03-15', values: { waist: 82.5 } },
      { date: '2026-03-01', values: { waist: 85, arm: 35 } },
      { date: '2026-03-08', values: { arm: 35.4 } },
    ];
    expect(measureSeries(entries, 'waist').map((p) => p.value)).toEqual([85, 82.5]);
    expect(measureChange(entries, 'waist')).toMatchObject({ change: -2.5, first: { date: '2026-03-01' }, latest: { date: '2026-03-15' } });
    expect(measureChange(entries, 'neck')).toBeNull();
    expect(measuredKeys(entries)).toEqual(['waist', 'arm']);
  });
});
