import { redirect } from 'next/navigation';
import { isLoggedIn } from '@/lib/session';
import { LoginForm } from './login-form';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (await isLoggedIn()) redirect('/');

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 px-6">
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight">WyDawka</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
          Domowa apteczka
        </p>
      </div>
      <LoginForm />
    </main>
  );
}
