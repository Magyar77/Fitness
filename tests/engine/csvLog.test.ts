import { describe, expect, it } from 'vitest';
import { bestMatch, guessKind, matchCandidates, nameTokens, parseCsvText, parseDate, parseLog, TEMPLATE_HEADER } from '../../src/engine/import/csvLog';
import { EXERCISES } from '../../src/engine/library/exercises';

describe('CSV text', () => {
  it('handles quotes, CRLF, a BOM and semicolon files', () => {
    expect(parseCsvText('\uFEFFa,b\r\n"x, y","say ""hi"""\r\n')).toEqual([['a', 'b'], ['x, y', 'say "hi"']]);
    expect(parseCsvText('date;weight\n2026-01-02;12,5\n\n')).toEqual([['date', 'weight'], ['2026-01-02', '12,5']]);
  });

  it('reads the usual date formats', () => {
    expect(parseDate('2026-03-04 18:30:00')).toBe('2026-03-04');
    expect(parseDate('4.3.2026')).toBe('2026-03-04');
    expect(parseDate('04/03/2026')).toBe('2026-03-04');
    expect(parseDate('04/03/2026', 'month-first')).toBe('2026-04-03');
    expect(parseDate('4 Mar 2026, 18:30')).toBe('2026-03-04');
    expect(parseDate('March 4, 2026')).toBe('2026-03-04');
    expect(parseDate('31.02.2026')).toBeNull();
    expect(parseDate('yesterday')).toBeNull();
  });
});

describe('workout log files', () => {
  it('reads the AI template, including body weight, warm-ups, lb and RPE', () => {
    const csv = [
      TEMPLATE_HEADER.join(','),
      '2026-05-01,Push,Barbell bench press,1,60,kg,8,,,,2,,',
      '2026-05-01,Push,Barbell bench press,2,60,kg,7,,,,1,,last rep slow',
      '2026-05-01,Push,Barbell bench press,,40,kg,10,,,,,yes,',
      '2026-05-01,Push,Plank,1,,,,45,,,,,',
      '2026-05-01,,Body weight,,180,lb,,,,,,,',
      '2026-05-02,Pull,Assisted pull-up,1,,kg,6,,,30,,,',
    ].join('\n');
    const log = parseLog(csv, 'kg', '2026-06-01');
    expect(log.problems).toEqual([]);
    expect(log.sets).toHaveLength(5);
    expect(log.sets[0]).toMatchObject({ date: '2026-05-01', workout: 'Push', exercise: 'Barbell bench press', setIndex: 1, weightKg: 60, reps: 8, rir: 2, warmup: false });
    expect(log.sets[1]!.notes).toBe('last rep slow');
    expect(log.sets[2]).toMatchObject({ warmup: true, setIndex: 3 });
    expect(log.sets[3]).toMatchObject({ exercise: 'Plank', seconds: 45, reps: null });
    expect(log.sets[4]).toMatchObject({ assistKg: 30, weightKg: null });
    expect(log.bodyWeights).toEqual([{ line: 6, date: '2026-05-01', kg: 81.65 }]);
  });

  it('reads a Strong-style export (warm-up as set "W", RPE, total duration ignored)', () => {
    const csv = [
      'Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE',
      '2026-04-10 17:05:11,"Evening Workout",1h 2m,"Squat (Barbell)",W,40,10,0,0,,,',
      '2026-04-10 17:05:11,"Evening Workout",1h 2m,"Squat (Barbell)",1,100,5,0,0,,,8',
    ].join('\n');
    const log = parseLog(csv, 'kg');
    expect(log.problems).toEqual([]);
    expect(log.sets.map((s) => [s.warmup, s.weightKg, s.reps, s.rir])).toEqual([[true, 40, 10, null], [false, 100, 5, 2]]);
    expect(bestMatch('Squat (Barbell)', EXERCISES)?.exercise.id).toBe('barbell-back-squat');
  });

  it('reads a Hevy-style export (kg column, km distance, set type)', () => {
    const csv = [
      'title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe',
      '"Upper","21 Jan 2026, 18:43","21 Jan 2026, 19:40","","Lat Pulldown (Cable)",,"",0,warmup,30,12,,,',
      '"Upper","21 Jan 2026, 18:43","21 Jan 2026, 19:40","","Lat Pulldown (Cable)",,"",1,normal,55,10,,,9',
      '"Upper","21 Jan 2026, 18:43","21 Jan 2026, 19:40","","Farmers Walk",,"",0,normal,24,,0.04,,',
    ].join('\n');
    const log = parseLog(csv, 'lb');
    expect(log.problems).toEqual([]);
    expect(log.sets.map((s) => [s.date, s.warmup, s.weightKg, s.rir])).toEqual([['2026-01-21', true, 30, null], ['2026-01-21', false, 55, 1], ['2026-01-21', false, 24, null]]);
    expect(log.sets[2]!.distanceM).toBe(40);
    expect(bestMatch('Lat Pulldown (Cable)', EXERCISES)?.exercise.id).toBe('lat-pulldown');
    expect(bestMatch('Farmers Walk', EXERCISES)?.exercise.id).toBe('farmers-carry');
  });

  it("reads this app's own CSV export", () => {
    const csv = [
      'date,workout,slot,exercise,set,side,weight_kg,assist_kg,reps,duration_s,distance_m,rir_min,rir_max,completed,technique_ok,tempo_met,pause_held,warmup,drops,quality,notes',
      '2026-02-03,C,C-04,Lat pulldown,1,both,45,,10,,,2,2,true,true,,,false,,confirmed,',
    ].join('\n');
    expect(parseLog(csv).sets[0]).toMatchObject({ workout: 'C', exercise: 'Lat pulldown', weightKg: 45, reps: 10, rir: 2 });
  });

  it('reports bad rows by line and keeps the good ones', () => {
    const csv = ['date,exercise,weight,reps', 'soon,Squat,100,5', '2026-01-01,,100,5', '2026-01-01,Squat,heavy,5', '2026-01-01,Squat,,', '2026-01-01,Squat,100,5.5', '2030-01-01,Squat,100,5', '2026-01-01,Squat,100,5'].join('\n');
    const log = parseLog(csv, 'kg', '2026-06-01');
    expect(log.sets).toHaveLength(1);
    expect(log.problems.map((p) => p.line)).toEqual([2, 3, 4, 5, 6, 7]);
    expect(parseLog('weight,reps\n10,5').problems[0]!.message).toMatch(/No "date" column/);
  });

  it('works out slash date order from the file', () => {
    const log = parseLog('date,exercise,reps\n03/04/2026,Push-up,10\n03/25/2026,Push-up,10');
    expect(log.dateOrder).toBe('month-first');
    expect(log.sets.map((s) => s.date)).toEqual(['2026-03-04', '2026-03-25']);
  });
});

describe('exercise name matching', () => {
  it('normalises spellings', () => {
    expect(nameTokens('Pull Ups (Assisted)')).toEqual(['pullup', 'assisted']);
    expect(nameTokens('DB Bicep Curls')).toEqual(['dumbbell', 'biceps', 'curl']);
  });

  it('finds the same exercise under other apps\' names', () => {
    const id = (n: string) => bestMatch(n, EXERCISES)?.exercise.id;
    expect(id('Bench Press (Barbell)')).toBe('barbell-bench-press');
    expect(id('Pull Up')).toBe('pull-up');
    expect(id('Deadlift (Barbell)')).toBe('deadlift');
    expect(id('Lateral Raise (Dumbbell)')).toBe('db-lateral-raise');
    expect(id('Incline Bench Press (Dumbbell)')).toBe('incline-db-press');
    expect(id('Triceps Pushdown (Cable - Straight Bar)')).toBe('cable-triceps-pushdown');
    expect(id('Plank')).toBe('plank');
    expect(id('Leg Press')).toBe('leg-press');
  });

  it('does not match different equipment or unrelated names', () => {
    expect(bestMatch('Bench Press (Smith Machine)', EXERCISES)?.exercise.id).not.toBe('barbell-bench-press');
    expect(bestMatch('Underwater basket weaving', EXERCISES)).toBeNull();
    expect(matchCandidates('Curl', EXERCISES).length).toBeGreaterThan(1);
  });

  it('guesses how to record a new exercise', () => {
    const set = (p: object) => ({ line: 2, date: '2026-01-01', workout: 'w', exercise: 'x', setIndex: 1, weightKg: null, assistKg: null, reps: null, seconds: null, distanceM: null, rir: null, warmup: false, notes: '', ...p });
    expect(guessKind('Hammer Curl (Dumbbell)', [set({ weightKg: 12, reps: 10 })])).toBe('dumbbell');
    expect(guessKind('Landmine press', [set({ weightKg: 20, reps: 10 })])).toBe('machine');
    expect(guessKind('Hollow rock', [set({ reps: 15 })])).toBe('bodyweight');
    expect(guessKind('Wall sit', [set({ seconds: 60 })])).toBe('timed');
    expect(guessKind('Running', [set({ seconds: 1800, distanceM: 5000 })])).toBe('cardio');
    expect(guessKind('Sled push', [set({ weightKg: 80, distanceM: 20 })])).toBe('distance');
  });
});
