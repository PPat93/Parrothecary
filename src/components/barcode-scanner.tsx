'use client';

import { useEffect, useRef, useState } from 'react';
import { toneStyle } from './tone';

/**
 * Camera barcode scanner built on the browser's own BarcodeDetector.
 *
 * No decoding library: both phones are Android, where Chrome implements this
 * natively and decodes faster than JavaScript can. Where it is missing — some
 * desktop browsers — the component says so and the form stays usable by hand,
 * rather than pretending to scan and silently failing.
 *
 * Requires a secure context, so it works on localhost during development and
 * will need the HTTPS setup before it works from a phone.
 */

type DetectedBarcode = { rawValue: string; format: string };
type Detector = { detect(source: CanvasImageSource): Promise<DetectedBarcode[]> };

// The formats that appear on medicine packaging.
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'data_matrix', 'code_128'];

type Status = 'idle' | 'starting' | 'scanning' | 'unsupported' | 'denied' | 'error';

export function BarcodeScanner({
  onScan,
  onClose,
}: {
  onScan: (raw: string, format: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<Status>('starting');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let frame = 0;

    async function start() {
      const Ctor = (window as unknown as { BarcodeDetector?: new (o: object) => Detector })
        .BarcodeDetector;

      if (!Ctor) {
        setStatus('unsupported');
        setMessage(
          'This browser cannot scan barcodes. Chrome on Android can — or type the details in by hand.',
        );
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          // The rear camera is the one pointing at the box.
          video: { facingMode: 'environment' },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        setStatus('scanning');

        const detector = new Ctor({ formats: FORMATS });

        const tick = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const first = codes[0];
            if (first?.rawValue) {
              onScan(first.rawValue, first.format);
              return; // one scan per open; the caller decides what happens next
            }
          } catch {
            // A dropped frame is normal — keep going rather than bail out.
          }
          frame = requestAnimationFrame(() => void tick());
        };

        frame = requestAnimationFrame(() => void tick());
      } catch (error) {
        if (cancelled) return;
        const denied = error instanceof DOMException && error.name === 'NotAllowedError';
        setStatus(denied ? 'denied' : 'error');
        setMessage(
          denied
            ? 'Camera permission was refused. Allow it in the browser settings to scan.'
            : 'Could not start the camera.',
        );
      }
    }

    void start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [onScan]);

  return (
    <div
      className="rounded-2xl border p-3"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      <div className="relative overflow-hidden rounded-xl" style={{ background: '#000' }}>
        <video
          ref={videoRef}
          playsInline
          muted
          className="h-56 w-full object-cover"
          style={{ display: status === 'scanning' ? 'block' : 'none' }}
        />

        {status === 'scanning' ? (
          // A frame to aim with. Purely visual — detection uses the whole image.
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-6 inset-y-10 rounded-lg border-2"
            style={{ borderColor: 'var(--color-accent)' }}
          />
        ) : (
          <p className="px-4 py-10 text-center text-sm" style={{ color: 'var(--muted)' }}>
            {message ?? 'Starting the camera…'}
          </p>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          {status === 'scanning' ? 'Point at the barcode or the small square.' : null}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="is-action rounded-lg border px-3 py-1.5 text-xs font-medium"
          style={toneStyle('warning')}
        >
          Close
        </button>
      </div>
    </div>
  );
}
