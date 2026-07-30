import { addDays } from './date';
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
}

/** Was this schedule actually running on this calendar day? */
export function isScheduleActiveOn(schedule: DoseScheduleWindow, date: IsoDate): boolean {
  if (date < schedule.startDate) return false;
  if (schedule.endDate !== null && date > schedule.endDate) return false;
  return true;
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
 * "twice a day" rather than "2×/day", for sentences.
 *
 * The board has room only for the terse form; a warning that has to explain why
 * it is refusing something reads better in words. Both come from here so they
 * cannot describe the same schedule differently.
 */
export function formatDoseFrequency(timesPerDay: number): string {
  if (timesPerDay === 1) return 'once a day';
  if (timesPerDay === 2) return 'twice a day';
  return `${timesPerDay} times a day`;
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
