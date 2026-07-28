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
        <div
          className="mb-5 flex h-32 w-32 items-center justify-center rounded-full"
          style={{ background: 'oklch(0.06 0.004 260)' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/parrot-256.png"
            alt=""
            width={112}
            height={112}
            className="h-28 w-28 object-contain"
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
