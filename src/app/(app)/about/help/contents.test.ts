import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The contents list and the panels are two lists that have to agree.
 *
 * A comment asking a future editor to keep them in step is exactly the kind of
 * promise this codebase has broken repeatedly — a rule enforced in one place
 * and forgotten in its twin. This reads the page and checks, so a panel added
 * without an entry, or an entry pointing at a panel that no longer exists,
 * fails here rather than becoming a link to nowhere.
 */
const source = fs.readFileSync(path.join(import.meta.dirname, 'page.tsx'), 'utf8');

const linked = [...source.matchAll(/\{ id: '([a-z-]+)', label:/g)].map((m) => m[1]);
const panels = [...source.matchAll(/<Panel title="[^"]+" id="([a-z-]+)"/g)].map((m) => m[1]);

describe('the Help contents list', () => {
  it('found both lists to compare', () => {
    expect(linked.length).toBeGreaterThan(0);
    expect(panels.length).toBeGreaterThan(0);
  });

  it('points only at panels that exist', () => {
    expect(linked.filter((id) => !panels.includes(id))).toEqual([]);
  });

  it('leaves no panel unreachable', () => {
    expect(panels.filter((id) => !linked.includes(id))).toEqual([]);
  });

  it('lists them in the order they appear on the page', () => {
    expect(linked).toEqual(panels);
  });
});
