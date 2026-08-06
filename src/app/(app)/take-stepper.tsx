'use client';

import { useState } from 'react';
import { ActionButton } from '@/components/action-button';
import { isTrackableQuantity, parseUnits } from '@/domain/quantity';
import { adjustBatch } from './actions';

/**
 * Take some out, or put some back.
 *
 * The amount is typed rather than tapped because a spoonful of anything liquid
 * is 10 ml, and stepping to it one millilitre at a time is both twenty seconds
 * of tapping and twenty ledger rows for one spoonful — which would make "times
 * taken" mean nothing at all.
 *
 * It starts at 1 and stays wherever it is left, so a box of tablets never needs
 * touching and a bottle needs typing once. Resets to 1 on a fresh page load;
 * the number is a convenience, not a setting.
 */
export function TakeStepper({
  batchId,
  unitName,
  remaining,
  packSize,
}: {
  batchId: number;
  unitName: string;
  remaining: number;
  packSize: number;
}) {
  const [amount, setAmount] = useState('1');

  // An emptied field means one, so clearing it to retype cannot submit nothing.
  const magnitude = amount.trim() === '' ? '1' : amount.trim();
  const isOne = magnitude === '1';

  /*
   * Checked with the same parser the action uses, rather than a second regex
   * that could disagree with it. Without this the server quietly refused
   * anything unparseable and the button looked broken — a tap, no error, no
   * change, nothing to explain why.
   */
  const parsed = parseUnits(magnitude);
  const usable = parsed !== null && parsed > 0 && isTrackableQuantity(parsed);

  /*
   * Both ends of a box are physical facts, and both used to happen in silence:
   * asking for more than is left quietly took whatever was there, and putting
   * back more than the pack holds was simply allowed.
   *
   * Taking too much stays possible — emptying the box is a real thing to do,
   * it just says so first. Overfilling does not: a fifty-tablet pack does not
   * hold a thousand, and a quantity that really is wrong belongs on the edit
   * form, which exists to correct records rather than move stock.
   */
  const shortBy = usable && parsed > remaining ? remaining : null;
  const room = Math.max(0, Math.round((packSize - remaining) * 100) / 100);
  const overfills = usable && remaining < packSize && parsed > room;
  const alreadyFull = remaining >= packSize;

  return (
    <span className="flex shrink-0 items-center gap-1">
      <form action={adjustBatch}>
        <input type="hidden" name="id" value={batchId} />
        <input type="hidden" name="delta" value={`-${magnitude}`} />
        <ActionButton
          aria-label={isOne ? 'Take one' : `Take ${magnitude} ${unitName}`}
          title={
            shortBy !== null
              ? `Only ${shortBy} ${unitName} left — that is what will be taken, and the box empties.`
              : undefined
          }
          tone="neutral"
          disabled={!usable || remaining <= 0}
          className="h-9 w-9 rounded-lg border text-lg leading-none"
        >
          −
        </ActionButton>
      </form>

      {/*
        Outside both forms on purpose: its value is copied into each hidden
        field, which keeps the buttons either side of it in the layout without
        nesting anything a form cannot contain.
      */}
      <input
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
        inputMode="decimal"
        aria-label={`Amount of ${unitName} to take or put back`}
        className="h-9 w-12 rounded-lg border text-center text-sm outline-none focus:ring-2"
        style={{
          background: 'var(--surface)',
          // Says which of the two things is wrong before either button is tapped.
          borderColor: usable ? 'var(--border)' : 'var(--color-critical)',
          color: usable ? 'var(--text)' : 'var(--color-critical)',
        }}
      />

      <form action={adjustBatch}>
        <input type="hidden" name="id" value={batchId} />
        <input type="hidden" name="delta" value={magnitude} />
        <ActionButton
          aria-label={isOne ? 'Add one' : `Put back ${magnitude} ${unitName}`}
          title={
            alreadyFull
              ? `This box is already full at ${packSize} ${unitName}.`
              : overfills
                ? `Only room for ${room} more — a ${packSize} ${unitName} pack cannot hold more than that. Use the pencil to correct a wrong quantity.`
                : undefined
          }
          tone="ok"
          disabled={!usable || alreadyFull || overfills}
          className="h-9 w-9 rounded-lg border text-lg leading-none"
        >
          +
        </ActionButton>
      </form>
    </span>
  );
}
