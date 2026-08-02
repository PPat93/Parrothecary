import { redirect } from 'next/navigation';
import { isLoggedIn } from '@/lib/session';
import { LoginForm } from './login-form';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (await isLoggedIn()) redirect('/');

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 px-6">
      <div className="flex flex-col items-center text-center">
        {/*
          The logo is drawn on black. On a light background the neon lines would
          vanish, so it sits in its own dark disc either way — which also keeps
          the glow reading as glow rather than as a blurry edge.
        */}
        {/*
          The 512 asset, clipped to a circle rather than sat inside a separate
          disc: the artwork already carries its own near-black background, so
          the crop becomes the disc and there is no seam between the two dark
          tones. It is also the only source big enough to stay sharp at this
          size on a 3x phone screen.
        */}
        <div
          className="mb-5 h-44 w-44 overflow-hidden rounded-full"
          style={{ background: 'oklch(0.06 0.004 260)' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icons/icon-512.png"
            alt="Big Parrothecary parrot"
            width={176}
            height={176}
            className="h-full w-full scale-110 object-cover"
          />
        </div>

        <h1 className="text-3xl font-semibold tracking-tight" test-data="title">Parrothecary</h1>
        <p className="mt-1 text-sm" test-data="sub-title" style={{ color: 'var(--muted)' }}>
          Domowa apteczka
        </p>
      </div>

      <LoginForm />
    </main>
  );
}
