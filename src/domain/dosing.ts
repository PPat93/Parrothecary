import { addDays, differenceInDays } from './date';
import type { IsoDate } from './date';

/**
 * Dose status is always derived from today's date plus whatever confirmations
 * exist — never written by a scheduled job. A cron-based "mark missed at
 * midnight" design silently loses a day whenever the container happens to be
 * down at 00:00; deriving on every read means there is nothing to lose. The
 * database only ever stores confirmations (dose_events), and only for doses
 * that were actually taken.
 */

export type DoseStatus = 'taken' | 'missed' | 'pending' | 'future';

export interface DoseScheduleWindow {
  startDate: IsoDate;
  /** Null means ongoing — most schedules are ("1 Euthyrox daily", no end). */
  endDate: IsoDate | null;
  /**
   * Days between dosing days; 1 for the everyday case. Required rather than
   * defaulted, because a caller that forgets it would silently turn a weekly
   * dose into a daily one — the one error in this file worth making impossible
   * to write. Weekly methotrexate taken daily is the classic fatal version.
   */
  intervalDays: number;
}

/**
 * Was this schedule actually due on this calendar day?
 *
 * Dosing days are counted from startDate, so an interval of 7 started on a
 * Tuesday is due on Tuesdays. Nothing is stored per day — this is derived every
 * read, same as dose status.
 */
export function isScheduleActiveOn(schedule: DoseScheduleWindow, date: IsoDate): boolean {
  if (date < schedule.startDate) return false;
  if (schedule.endDate !== null && date > schedule.endDate) return false;

  const interval = Math.max(1, Math.trunc(schedule.intervalDays));
  return differenceInDays(schedule.startDate, date) % interval === 0;
}

/**
 * The next day this is due, today included. Null once the schedule has run out.
 *
 * Needed because an infrequent schedule is silent most days, and a board that
 * shows nothing looks broken rather than "not today".
 */
export function nextDueDate(schedule: DoseScheduleWindow, today: IsoDate): IsoDate | null {
  const from = today < schedule.startDate ? schedule.startDate : today;
  const interval = Math.max(1, Math.trunc(schedule.intervalDays));

  // Days since the anchor, rounded up to the next whole interval.
  const elapsed = differenceInDays(schedule.startDate, from);
  const remainder = elapsed % interval;
  const due = remainder === 0 ? from : addDays(from, interval - remainder);

  if (schedule.endDate !== null && due > schedule.endDate) return null;
  return due;
}

/**
 * One occurrence's status. `takenOccurrences` is whichever occurrence numbers
 * already have a confirmation for this date — a plain lookup, not a count, so
 * confirming occurrence 2 before occurrence 1 (taking the evening dose first)
 * does not misreport the morning one as done.
 */
export function doseOccurrenceStatus(
  occurrence: number,
  date: IsoDate,
  today: IsoDate,
  takenOccurrences: ReadonlySet<number>,
): DoseStatus {
  if (takenOccurrences.has(occurrence)) return 'taken';
  if (date > today) return 'future';
  if (date < today) return 'missed';
  return 'pending';
}

/**
 * "twice a day", "once a week", "twice every 3 days" — for sentences.
 *
 * The board has room only for the terse form; a warning that has to explain why
 * it is refusing something reads better in words. Both come from here so they
 * cannot describe the same schedule differently — and neither may omit the
 * interval, because "once a day" and "once a week" differing by one silent
 * field is exactly the confusion worth designing out.
 */
export function formatDoseFrequency(timesPerDay: number, intervalDays = 1): string {
  const count = timesPerDay === 1 ? 'once' : timesPerDay === 2 ? 'twice' : `${timesPerDay} times`;

  if (intervalDays <= 1) return `${count} a day`;
  if (intervalDays === 7) return `${count} a week`;
  if (intervalDays === 14) return `${count} a fortnight`;
  return `${count} every ${intervalDays} days`;
}

/** The terse form the dose board and schedule lists use: "2×/day", "1×/3 days". */
export function formatDoseCadence(timesPerDay: number, intervalDays = 1): string {
  if (intervalDays <= 1) return `${timesPerDay}×/day`;
  if (intervalDays === 7) return `${timesPerDay}×/week`;
  return `${timesPerDay}×/${intervalDays} days`;
}

/**
 * The dates worth showing on the "today" board — recent days clipped to when
 * the schedule actually existed, so a course started three days ago does not
 * report the week before it existed as missed.
 */
export function recentScheduleDates(
  schedule: DoseScheduleWindow,
  today: IsoDate,
  days = 3,
): IsoDate[] {
  const dates: IsoDate[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    if (isScheduleActiveOn(schedule, date)) dates.push(date);
  }
  return dates;
}
