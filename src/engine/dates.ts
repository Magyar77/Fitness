// Calendar dates are local "YYYY-MM-DD" strings throughout the app.
// These helpers use UTC arithmetic so results never depend on the device time zone.

export type IsoDate = string;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function toUtc(date: IsoDate): Date {
  if (!ISO_DATE.test(date)) throw new Error(`Invalid date: ${date}`);
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== date) {
    throw new Error(`Invalid date: ${date}`);
  }
  return d;
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(date: IsoDate): number {
  return (toUtc(date).getUTCDay() + 6) % 7;
}

/** Monday of the week containing `date` (weeks start on Monday). */
export function weekStart(date: IsoDate): IsoDate {
  return addDays(date, -weekdayIndex(date));
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86_400_000);
}
