import { TEMPLATE_HEADER } from '../../engine/import/csvLog';

/** Pasted into any AI chat together with the person's old data. */
export function aiPrompt(unit: 'kg' | 'lb'): string {
  return `Convert my workout history into a CSV file for my fitness app.

Reply with the CSV in one code block. After the code block, list anything you could not convert.

Rules:
- The first line must be exactly:
${TEMPLATE_HEADER.join(',')}
- One row per set. "3x10 at 50 ${unit}" becomes three rows.
- date: YYYY-MM-DD. If the year is missing, ask me.
- workout: the session's name if there is one (e.g. "Push day"), otherwise "Workout".
- exercise: the usual English name with the equipment first, e.g. "Barbell bench press", "Dumbbell lateral raise", "Lat pulldown", "Pull-up", "Leg press". Use the same name for the same exercise every time.
- set: 1, 2, 3 … for each exercise on that day.
- weight: a number only. Barbells: the total including the bar. Dumbbells: one dumbbell. Leave empty for bodyweight.
- unit: kg or lb (my default is ${unit}).
- reps: whole number. seconds: for timed holds (a 45 s plank is 45). distance_m: metres for carries or runs.
- assist: help from an assisted pull-up or dip machine, in the same unit; otherwise empty.
- rir: reps in reserve if written (RPE 8 = RIR 2); otherwise empty.
- warmup: yes for warm-up sets; otherwise empty.
- notes: short; never use commas inside a field (use ";" instead).
- Body weight: a row with exercise "Body weight", the date and the weight; other columns empty.
- Never invent numbers. If something is unclear, leave that set out and mention it after the CSV.

My data (attached or pasted below):
`;
}

export function templateCsv(unit: 'kg' | 'lb'): string {
  const w = unit === 'kg' ? ['60', '20', '24', '82.5'] : ['135', '45', '50', '182'];
  return [
    TEMPLATE_HEADER.join(','),
    `2026-01-05,Push day,Barbell bench press,1,${w[0]},${unit},8,,,,2,,`,
    `2026-01-05,Push day,Barbell bench press,2,${w[0]},${unit},7,,,,1,,`,
    `2026-01-05,Push day,Dumbbell lateral raise,1,${w[1] === '20' ? '8' : '17.5'},${unit},12,,,,,,`,
    `2026-01-05,Push day,Plank,1,,,,45,,,,,`,
    `2026-01-07,Pull day,Assisted pull-up,1,,${unit},6,,,${w[1]},,,`,
    `2026-01-07,Pull day,Farmer's carry,1,${w[2]},${unit},,,40,,,,per hand`,
    `2026-01-07,,Body weight,,${w[3]},${unit},,,,,,,`,
  ].join('\r\n') + '\r\n';
}
