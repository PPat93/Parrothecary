/**
 * CSV, by hand.
 *
 * A dependency for this would be a dependency for `join`, `"` doubling and a
 * byte-order mark. The whole format is three rules, and the third one is the
 * only one anybody gets wrong.
 */

/**
 * Excel reads a file without one as the local 8-bit codepage, which turns
 * "tabletek powlekanych" into mojibake and "µg" into two wrong characters.
 * Google Sheets ignores it. Cheap insurance.
 */
export const CSV_BOM = '﻿';

export type CsvValue = string | number | boolean | null | undefined;

/**
 * Quote a field if it could otherwise be misread.
 *
 * Embedded quotes are doubled, which is the rule people skip: a note reading
 * `he said "take two"` becomes `"he said ""take two"""` and not a broken row
 * for every field after it.
 *
 * Leading or trailing spaces are quoted too — some readers strip them, and a
 * location of " bathroom" losing its space is a silent edit to the data.
 */
export function csvField(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';

  const text = String(value);
  if (text === '') return '';

  const needsQuotes =
    text.includes('"') ||
    text.includes(',') ||
    text.includes('\n') ||
    text.includes('\r') ||
    text !== text.trim();

  return needsQuotes ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * A whole file: header row, then the data.
 *
 * CRLF line endings, because that is what the specification says and what
 * Excel is happiest with; every other reader accepts them.
 */
export function toCsv(headers: string[], rows: CsvValue[][]): string {
  const lines = [headers.map(csvField).join(','), ...rows.map((row) => row.map(csvField).join(','))];
  return CSV_BOM + lines.join('\r\n') + '\r\n';
}

/** Minor units to something a spreadsheet will treat as a number: 2499 -> 24.99 */
export function csvMoney(minor: number | null): string {
  if (minor === null) return '';
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** A timestamp a spreadsheet can sort, and a human can read. */
export function csvTimestamp(date: Date | null): string {
  if (date === null) return '';
  return date.toISOString().replace('T', ' ').slice(0, 19);
}
