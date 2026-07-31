import Link from 'next/link';
import { LINK_BUTTON, toneStyle } from '@/components/tone';
import { MemberForm } from './member-form';

export default function NewMemberPage() {
  return (
    <div className="mx-auto w-full max-w-lg">
      <header className="mb-4 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">New person</h1>
        <Link href="/household" className={LINK_BUTTON} style={toneStyle('warning')}>
          Cancel
        </Link>
      </header>
      <MemberForm />
    </div>
  );
}
