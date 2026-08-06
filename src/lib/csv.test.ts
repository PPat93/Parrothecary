import { describe, expect, it } from 'vitest';
import { CSV_BOM, csvField, csvMoney, csvTimestamp, toCsv } from './csv';

describe('csvField', () => {
  it('leaves an ordinary value alone', () => {
    expect(csvField('APAP')).toBe('APAP');
    expect(csvField(42)).toBe('42');
    expect(csvField(2.5)).toBe('2.5');
  });

  it('quotes a value containing a comma', () => {
    // Real product name from the cabinet.
    expect(csvField('katarek NaCl 0,9%')).toBe('"katarek NaCl 0,9%"');
  });

  it('doubles embedded quotes, the rule everyone forgets', () => {
    expect(csvField('he said "take two"')).toBe('"he said ""take two"""');
  });

  it('quotes newlines so a note cannot break the row', () => {
    expect(csvField('line one\nline two')).toBe('"line one\nline two"');
    expect(csvField('carriage\r\nreturn')).toBe('"carriage\r\nreturn"');
  });

  it('preserves leading and trailing spaces by quoting them', () => {
    // Some readers strip these, which silently edits the data.
    expect(csvField(' bathroom')).toBe('" bathroom"');
    expect(csvField('shelf ')).toBe('"shelf "');
  });

  it('writes an empty field for nothing', () => {
    expect(csvField(null)).toBe('');
    expect(csvField(undefined)).toBe('');
    expect(csvField('')).toBe('');
  });

  it('spells booleans out', () => {
    expect(csvField(true)).toBe('yes');
    expect(csvField(false)).toBe('no');
  });
});

describe('toCsv', () => {
  it('writes a header row and CRLF line endings', () => {
    const csv = toCsv(['name', 'units'], [['APAP', 22]]);
    expect(csv).toBe(`${CSV_BOM}name,units\r\nAPAP,22\r\n`);
  });

  it('starts with a byte-order mark so Excel reads UTF-8', () => {
    // Without it, "Żona" and "µg" arrive as mojibake.
    const csv = toCsv(['name'], [['Żona']]);
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    expect(csv).toContain('Żona');
  });

  it('handles a file with no rows', () => {
    expect(toCsv(['a', 'b'], [])).toBe(`${CSV_BOM}a,b\r\n`);
  });

  it('escapes inside rows, not just headers', () => {
    const csv = toCsv(['name', 'note'], [['Gripex, hot', 'said "no"']]);
    expect(csv).toContain('"Gripex, hot","said ""no"""');
  });
});

describe('csvMoney', () => {
  it('turns minor units into a number a spreadsheet understands', () => {
    expect(csvMoney(2499)).toBe('24.99');
    expect(csvMoney(700)).toBe('7.00');
    expect(csvMoney(5)).toBe('0.05');
    expect(csvMoney(0)).toBe('0.00');
  });

  it('keeps a negative amount negative', () => {
    expect(csvMoney(-2499)).toBe('-24.99');
  });

  it('writes nothing when there is no price', () => {
    expect(csvMoney(null)).toBe('');
  });
});

describe('csvTimestamp', () => {
  it('writes something sortable and readable', () => {
    // Built from local components, so this is the wall clock of the machine
    // that recorded it — which is what every other date in the app means.
    const local = new Date(2026, 7, 5, 14, 30, 0);
    expect(csvTimestamp(local)).toBe('2026-08-05 14:30:00');
  });

  it('keeps the local calendar day for a time just after midnight', () => {
    /*
     * The bug this replaced: toISOString() on 01:00 in a UTC+2 summer renders
     * as 23:00 the previous day, so a dose taken on the 6th was exported as
     * having happened on the 5th.
     */
    const justAfterMidnight = new Date(2026, 7, 6, 1, 0, 0);
    expect(csvTimestamp(justAfterMidnight)).toBe('2026-08-06 01:00:00');
  });

  it('pads every component', () => {
    expect(csvTimestamp(new Date(2026, 0, 2, 3, 4, 5))).toBe('2026-01-02 03:04:05');
  });

  it('writes nothing for no date', () => {
    expect(csvTimestamp(null)).toBe('');
  });
});
