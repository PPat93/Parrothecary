'use server';

import { redirect } from 'next/navigation';
import {
  RATE_LIMIT,
  clearAttempts,
  isRateLimited,
  recordFailedAttempt,
  verifyMasterPassword,
} from '@/lib/auth';
import { clientIp, startSession } from '@/lib/session';

export interface LoginState {
  error: string | null;
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const password = String(formData.get('password') ?? '');
  const ip = await clientIp();

  if (await isRateLimited(ip)) {
    return {
      error: `Too many attempts. Wait ${RATE_LIMIT.windowMinutes} minutes and try again.`,
    };
  }

  if (!password) {
    return { error: 'Enter the master password.' };
  }

  if (!(await verifyMasterPassword(password))) {
    await recordFailedAttempt(ip);
    // Deliberately vague — no hint about length, format or how close it was.
    return { error: 'Wrong password.' };
  }

  await clearAttempts(ip);
  await startSession();
  redirect('/');
}
