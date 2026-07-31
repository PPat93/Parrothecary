'use client';

import { useActionState, useRef, useState } from 'react';
import { ErrorText } from '@/components/form';
import { toneStyle } from '@/components/tone';
import { formatBytes, shrinkImage } from '@/lib/shrink-image';
import { setProductPhoto, type FormResult } from '../../actions';

const initialState: FormResult = { error: null };

interface Picked {
  name: string;
  originalBytes: number;
  uploadBytes: number;
}

/**
 * Two ways in, because both are the natural gesture at different moments:
 * the camera when you are standing at the cupboard, the gallery when the photo
 * already exists.
 *
 * They share ONE file input. Two inputs both named "photo" would put two
 * entries in the FormData, and the action would read whichever came first —
 * usually the empty one.
 */
export function PhotoForm({ productId, hasPhoto }: { productId: number; hasPhoto: boolean }) {
  const [state, formAction, pending] = useActionState(setProductPhoto, initialState);
  const inputRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [working, setWorking] = useState(false);

  /*
   * React empties the file input once the action returns, so the picked-file
   * summary has to go with it. Left behind it showed a filename over an empty
   * input, and pressing Upload again submitted nothing — "No file was selected"
   * for a file that looked very much selected.
   */
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state.ok) {
      setPicked(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function pick(useCamera: boolean) {
    const input = inputRef.current;
    if (!input) return;
    if (useCamera) input.setAttribute('capture', 'environment');
    else input.removeAttribute('capture');
    input.click();
  }

  async function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      setPicked(null);
      return;
    }

    setWorking(true);
    const shrunk = await shrinkImage(file);

    /*
     * Put the smaller file back into the input rather than sending it another
     * way. The form stays a plain form, so the action still just reads
     * formData.get('photo') and knows nothing about any of this.
     */
    const input = inputRef.current;
    if (input && shrunk !== file) {
      const transfer = new DataTransfer();
      transfer.items.add(shrunk);
      input.files = transfer.files;
    }

    setPicked({ name: file.name, originalBytes: file.size, uploadBytes: shrunk.size });
    setWorking(false);
  }

  return (
    <form action={formAction} className="mt-3 flex flex-col gap-2">
      <input type="hidden" name="productId" value={productId} />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => pick(true)}
          className="is-action rounded-lg border px-3 py-1.5 text-xs font-medium"
          style={toneStyle('accent')}
        >
          {hasPhoto ? 'Replace with a new photo' : 'Take a photo'}
        </button>
        <button
          type="button"
          onClick={() => pick(false)}
          className="is-action rounded-lg border px-3 py-1.5 text-xs font-medium"
          style={toneStyle('neutral')}
        >
          Choose a file
        </button>
      </div>

      <input
        ref={inputRef}
        name="photo"
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleChange}
      />

      {working ? (
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          Resizing…
        </p>
      ) : null}

      {picked && !working ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 truncate text-xs" style={{ color: 'var(--muted)' }}>
            {picked.name} ·{' '}
            {picked.uploadBytes < picked.originalBytes
              ? `${formatBytes(picked.originalBytes)} → ${formatBytes(picked.uploadBytes)}`
              : formatBytes(picked.uploadBytes)}
          </span>
          <button
            type="submit"
            disabled={pending}
            className="is-action rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
            style={toneStyle('ok', 'solid')}
          >
            {pending ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      ) : null}

      <ErrorText>{state.error}</ErrorText>
    </form>
  );
}
