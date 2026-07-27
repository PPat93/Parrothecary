import { AppHeader } from '@/components/app-header';
import { Nav } from '@/components/nav';
import { requireSession } from '@/lib/session';

// Every page here reads the database and must never be statically rendered.
export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // The middleware only checked that a cookie exists; this is the real gate.
  await requireSession();

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader />
      <main className="flex-1 px-4 pb-6 pt-4">{children}</main>
      <Nav />
    </div>
  );
}
