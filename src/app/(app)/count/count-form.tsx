'use client';

import { useActionState, useState } from 'react';
import { ErrorText, SubmitButton, TextInput } from '@/components/form';
import { formatQuantity } from '@/domain/quantity';
import { recordStockCount, type FormResult } from '../actions';
import type { CountRow } from './page';

const initialState: FormResult = { error: null };

/**
 * One line per box, because a box is what you pick up.
 *
 * Grouping by product would read better on screen and be wrong in the hand:
 * two boxes of the same thing are two separate counts, and only the box knows
 * which shelf it is on and what date is printed on it.
 */
export function CountForm({ groups }: { groups: { productLabel: string; rows: CountRow[] }[] }) {
  const [state, formAction, pending] = useActionState(recordStockCount, initialState);
  const previous = state.values ?? {};

  /*
   * Tracked only to show the difference as it is typed. The server recomputes
   * everything from the batch rows it reads itself — this never decides
   * anything, it just saves walking back to the cupboard to check.
   */
  const [entered, setEntered] = useState<Record<number, string>>({});

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {groups.map((group) => (
        <section key={group.productLabel}>
          <h2 className="mb-2 text-sm font-semibold">{group.productLabel}</h2>

          <ul className="flex flex-col gap-2">
            {group.rows.map((row) => {
              const typed = entered[row.batchId] ?? previous[`count_${row.batchId}`] ?? '';
              const parsed = typed.trim() === '' ? null : Number(typed.replace(',', '.'));
              const difference =
                parsed === null || Number.isNaN(parsed)
                  ? null
                  : Math.round((parsed - row.quantityRemaining) * 100) / 100;

              return (
                <li
                  key={row.batchId}
                  className="flex flex-wrap items-center gap-3 rounded-xl border p-3"
                  style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      {row.packLabel ?? `${row.packSize} ${row.unitName}`}
                      <span style={{ color: 'var(--muted)' }}> · {row.expiryLabel}</span>
                    </p>
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>
                      app says {formatQuantity(row.quantityRemaining, row.unitName)}
                      {row.location ? ` · ${row.location}` : ''}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {/* Shown the moment it stops matching, so a slip of the
                        thumb is caught at the shelf rather than in the ledger. */}
                    {difference !== null && difference !== 0 ? (
                      <span
                        className="text-xs font-medium tabular-nums"
                        style={{ color: 'var(--color-warning)' }}
                      >
                        {difference > 0 ? '+' : ''}
                        {difference}
                      </span>
                    ) : null}

                    {/* TextInput sets its own width, so the box is sized here. */}
                    <div className="w-24">
                      <TextInput
                        name={`count_${row.batchId}`}
                        inputMode="decimal"
                        aria-label={`Counted, ${row.packLabel ?? row.unitName}`}
                        placeholder="—"
                        value={typed}
                        onChange={(event) =>
                          setEntered((state) => ({ ...state, [row.batchId]: event.target.value }))
                        }
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <ErrorText>{state.error}</ErrorText>
      <SubmitButton pending={pending}>Record the count</SubmitButton>
    </form>
  );
}
