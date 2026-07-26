import { Nav } from '@/components/nav';
import { requireSession } from '@/lib/session';

// Every page here reads the database and must never be statically rendered.
export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // The middleware only checked that a cookie exists; this is the real gate.
  await requireSession();

  return (
    <div className="flex min-h-dvh flex-col">
      <main className="flex-1 px-4 pb-6 pt-[max(1rem,env(safe-area-inset-top))]">{children}</main>
      <Nav />
    </div>
  );
}
