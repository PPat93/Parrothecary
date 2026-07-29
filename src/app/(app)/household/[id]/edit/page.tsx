import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LINK_BUTTON, toneStyle } from '@/components/tone';
import { getHouseholdMembers } from '@/lib/queries';
import { EditMemberForm } from './edit-member-form';

export default async function EditMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numericId = Number(id);

  // Cheap enough at household scale, and it means the edit form works
  // whether the member is active or archived without a second query shape.
  const [active, archived] = await Promise.all([
    getHouseholdMembers(false),
    getHouseholdMembers(true),
  ]);
  const member = [...active, ...archived].find((m) => m.id === numericId);
  if (!member) notFound();

  return (
    <div className="mx-auto w-full max-w-lg">
      <header className="mb-4 flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Edit person</h1>
        <Link href={`/household/${member.id}`} className={LINK_BUTTON} style={toneStyle('warning')}>
          Cancel
        </Link>
      </header>
      <EditMemberForm member={member} />
    </div>
  );
}
