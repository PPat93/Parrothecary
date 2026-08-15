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

export type DoseStatus =
  | 'taken'
  | 'missed'
  | 'pending'
  | 'future'
  /** A day before this course was entered — the app has nothing to say about it. */
  | 'unknown';

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
/**
 * Is this course running on a given day at all?
 *
 * Separate from `isScheduleActiveOn`, which additionally asks whether that
 * particular day is a dosing day. A course taken every third day is still
 * running on the two days in between — it is consuming stock at an average
 * rate, which is what a run-out projection needs to know.
 *
 * The distinction matters because a course that has finished consumes nothing
 * at all, and treating it as ongoing projects a run-out date from a rate
 * nobody is taking.
 */
export function isScheduleRunning(schedule: DoseScheduleWindow, date: IsoDate): boolean {
  if (date < schedule.startDate) return false;
  if (schedule.endDate !== null && date > schedule.endDate) return false;
  return true;
}

export function isScheduleActiveOn(schedule: DoseScheduleWindow, date: IsoDate): boolean {
  if (!isScheduleRunning(schedule, date)) return false;

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
 * The same status, told it when the course was entered.
 *
 * `boardDates` already drops the days before that, so this only matters for the
 * one kind of day it keeps: an older day carrying a confirmation, kept so the
 * dose recorded on it can still be undone. On a twice-a-day course that day
 * arrives with a second occurrence attached, and calling that one *missed*
 * brings back the accusation the day was kept in spite of — about a morning the
 * app was not installed for.
 *
 * `unknown` rather than silently dropping the pill: a gap in the row is the
 * thing this codebase keeps mistaking for a broken screen. Grey, with a reason
 * on it, is the same answer the board already gives for everything else it will
 * not let you tap.
 */
export function boardDoseStatus(
  occurrence: number,
  date: IsoDate,
  today: IsoDate,
  takenOccurrences: ReadonlySet<number>,
  createdOn: IsoDate,
): DoseStatus {
  const status = doseOccurrenceStatus(occurrence, date, today, takenOccurrences);
  return status === 'missed' && date < createdOn ? 'unknown' : status;
}

/**
 * Total units this schedule will consume between two dates, both inclusive.
 *
 * Counts actual dosing days rather than multiplying an average rate by the
 * length of the window. The difference is not academic: a week-long course of
 * paracetamol at 3 tablets twice a day projected as a flat rate over eleven
 * weeks asks for 434 tablets instead of the 42 it will really use. Start dates,
 * end dates and the interval all clip the count.
 */
export function unitsDueBetween(
  schedule: DoseScheduleWindow & { doseUnits: number; timesPerDay: number },
  from: IsoDate,
  to: IsoDate,
): number {
  if (to < from) return 0;

  const perDosingDay = schedule.doseUnits * schedule.timesPerDay;
  if (perDosingDay <= 0) return 0;

  // Start from the first dosing day at or after `from` and step by the interval
  // rather than walking every calendar day — a daily schedule over a year is
  // 365 steps either way, but a monthly one is 12 instead of 365.
  const interval = Math.max(1, Math.trunc(schedule.intervalDays));
  let days = 0;
  for (let date = nextDueDate(schedule, from); date !== null && date <= to; ) {
    days++;
    const following = addDays(date, interval);
    if (schedule.endDate !== null && following > schedule.endDate) break;
    date = following;
  }

  return Math.round(perDosingDay * days * 100) / 100;
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

/** Days of history the dose board shows for an everyday schedule. */
export const HISTORY_DAYS = 3;

/**
 * How far back one schedule's row of pills reaches.
 *
 * Three days shows nothing at all for a weekly dose on four days out of seven,
 * which reads as broken rather than as "not today" — so the row widens past one
 * full interval and the last dosing day is always on screen.
 *
 * Here, rather than on the board, because the board is not the only thing that
 * needs it: the query fetching which doses were confirmed has to reach back at
 * least as far as the furthest pill drawn. It did not. The row widened to eight
 * days for a weekly schedule while the query kept its three-day cutoff, so the
 * dose taken last Saturday came back unconfirmed and its pill rendered red —
 * permanently, since `confirmDose` rightly refuses to record the same
 * occurrence twice. The board accused you of missing a dose you had taken and
 * gave you no way to argue.
 */
export function doseWindowDays(schedule: { intervalDays: number }): number {
  return Math.max(HISTORY_DAYS, schedule.intervalDays + 1);
}

/**
 * The dates worth showing on the "today" board — recent days clipped to when
 * the schedule actually existed, so a course started three days ago does not
 * report the week before it existed as missed.
 */
export function recentScheduleDates(
  schedule: DoseScheduleWindow,
  today: IsoDate,
  days = HISTORY_DAYS,
): IsoDate[] {
  const dates: IsoDate[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    if (isScheduleActiveOn(schedule, date)) dates.push(date);
  }
  return dates;
}

/**
 * The dates the dose board draws a pill on — `recentScheduleDates`, minus the
 * days this app was never in a position to know about.
 *
 * A course is almost always entered after it began. Four of the five schedules
 * in the real cabinet were backdated on the day they were typed in, one of them
 * by five months, because that is simply how you record something you are
 * already taking. The board took the start date at face value and immediately
 * drew two days of red "missed" pills for every one of them: an accusation
 * about days when the app did not exist, that could not be dismissed, only
 * waited out. At least one was cleared by confirming it — deducting a real
 * tablet from the cupboard to silence a warning that should never have
 * appeared.
 *
 * So: nothing before the day the schedule was entered. With one exception —
 * a day that *does* have a confirmation is always drawn, however old. Hiding a
 * recorded dose would take away the only way to undo it, and this app's rule is
 * that the way out has to exist somewhere.
 */
export function boardDates(
  schedule: DoseScheduleWindow & { createdOn: IsoDate },
  today: IsoDate,
  days: number,
  isConfirmed: (date: IsoDate) => boolean,
): IsoDate[] {
  return recentScheduleDates(schedule, today, days).filter(
    (date) => date >= schedule.createdOn || isConfirmed(date),
  );
}
