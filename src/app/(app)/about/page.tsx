import { BackLink } from '@/components/back-link';
import { ConfirmButton } from '@/components/confirm-button';
import { countActiveSessions } from '@/lib/auth';
import { logoutEverywhere } from '../actions';
import { AboutTabs } from './tabs';

/**
 * Reached from the bar at the top of every screen.
 *
 * Deliberately plain: what this is, who it is for, and who made it. Version
 * numbers and dependency lists belong in the repository, not in front of
 * someone standing at a cupboard.
 */
export default async function AboutPage() {
  const devices = await countActiveSessions();

  return (
    <div className="mx-auto w-full max-w-lg">
      <BackLink href="/" label="Stock" />

      <div className="flex flex-col items-center pt-2 pb-6 text-center">
        {/* Clipped to a circle, same as the login screen — see the note there. */}
        <span
          className="block h-40 w-40 overflow-hidden rounded-full"
          style={{ background: 'oklch(0.06 0.004 260)' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icons/icon-512.png"
            alt="The Parrothecary parrot"
            width={160}
            height={160}
            className="h-full w-full scale-110 object-cover"
          />
        </span>

        <h1 className="mt-4 text-3xl font-semibold tracking-tight">Parrothecary</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
          Domowa apteczka
        </p>
      </div>

      <AboutTabs active="about" />

      <Section>
        <p>
          A medicine cabinet that knows what is in it. Every box, what is left in it, when it goes
          off, and who takes what — so the answer to “do we still have any” does not depend on
          somebody remembering.
        </p>
      </Section>

      <Section title="Why it exists">
        <p>
          Stock gets restocked abroad two or three times a year, mostly ordered online and shipped
          ahead to be collected on arrival. That makes the useful question not “what do we have”
          but <em>will it last until the next trip, and what has to be ordered before the
          deadline</em>.
        </p>
        <p className="mt-3">
          So it plans rather than counts: doses come out of the box that expires first, run-out
          dates are worked out from the schedules, and the cabinet audit falls halfway between
          trips — when there is still time to act on it.
        </p>
      </Section>

      <Section title="Where it lives">
        <p>
          On the home network and nowhere else. No cloud service, no account, no telemetry, and
          nothing leaves the house.
        </p>
        <p className="mt-2">
          {/*
            The old wording — "the database is a single file that can be copied
            to a memory stick" — was true and incomplete, which is worse than
            either. Photos sit beside the database as separate files, so
            somebody copying one file for safekeeping would find every picture
            gone when they restored it. That is not hypothetical: a broken
            thumbnail turned out to be exactly this shape.
          */}
          Everything lives in one folder: the database as a single file, and the box photographs
          beside it. Copy the folder, not just the file — a database restored on its own comes back
          with every photograph missing.
        </p>
        <p className="mt-2">
          The machine takes that copy itself, on a timer, and checks each one afterwards: that it
          can be read, that nothing is missing from it, and that every photograph it mentions is
          really in the folder. A copy nobody has checked is a hope rather than a backup.
        </p>
        <p className="mt-2">
          {/*
            Said here as well as on Statistics, because this is the section
            somebody reads when they are worrying about losing the data, and the
            answer to that worry is a button they can press now.
          */}
          Those copies sit on the same machine, which is no help if the machine itself goes. Under{' '}
          <strong>Statistics → Backup</strong> there is a button that hands you one as a single file,
          photographs and all, with a note inside on how to put it back. Worth pressing before a
          trip, and keeping wherever your photos go.
        </p>
      </Section>

      {/*
        The lost-phone button. Here rather than in the header, where the
        everyday logout lives: this is the one you want twice in a lifetime and
        never by accident.
      */}
      <Section title="Signed-in devices">
        <p>
          {devices === 1
            ? 'One device is signed in — this one.'
            : `${devices} devices are signed in. A phone stays signed in for about three months at a time.`}
        </p>
        <p className="mt-2">
          If one of them has gone missing, sign them all out. Nothing is lost — the cupboard, the
          history and the photos are untouched — everyone simply types the password again.
        </p>
        <form action={logoutEverywhere} className="mt-3">
          <ConfirmButton
            label="Sign out every device"
            title="Sign out every device?"
            message={`All ${devices} signed-in ${devices === 1 ? 'device' : 'devices'} will be signed out, including this one. Nothing else changes.`}
            confirmLabel="Yes, sign them all out"
            tone="critical"
            className="rounded-lg border px-4 py-2 text-sm font-medium"
          />
        </form>
      </Section>

      <footer className="mt-8 pb-4 text-center">
        <p className="text-sm font-medium tracking-tight">ParroT woRKs by Piotr Paterek</p>
        <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
          Built alone, for one household.
        </p>
      </footer>
    </div>
  );
}

function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section
      className="mb-4 rounded-2xl border p-4 text-sm leading-relaxed"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      {title ? (
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide">{title}</h2>
      ) : null}
      <div style={{ color: 'var(--muted)' }}>{children}</div>
    </section>
  );
}
