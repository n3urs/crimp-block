// app/(main)/calendar.tsx
import React, { useMemo } from 'react';
import { useRouter } from 'expo-router';
import { useSession } from '../../src/data/useSession';
import { useStore } from '../../src/data/useStore';
import { useProfile } from '../../src/data/useProfile';
import { createEngine } from '../../src/engine';
import { resolveUserProgram } from '../../src/engine/resolveUserProgram';
import { CalendarScreen } from '../../src/screens/calendar/CalendarScreen';

export default function Calendar() {
  const router = useRouter();
  const { session } = useSession();
  const email = session?.user?.email ?? null;
  const userId = session?.user?.id ?? '';
  const profile = useProfile(userId);
  // See src/engine/resolveUserProgram.ts's own doc comment: this used to
  // be `PROGRAMS[email] ?? PROGRAMS.default` unconditionally, so a real
  // customer's actual quiz-assigned template/modifiers were never read.
  const program = useMemo(() => resolveUserProgram(email, profile.row), [email, profile.row]);

  const [today] = React.useState(() => createEngine(program, { sessionLog: {}, loadLog: {} }).today());
  const startDate = profile.row?.programStartDate ?? program.startDate ?? null;
  const store = useStore(startDate, today, userId);
  const engine = useMemo(() => createEngine(program, { sessionLog: store.days, loadLog: {} }), [program, store.days]);

  return <CalendarScreen engine={engine} history={store.days} today={today} onDismiss={() => router.back()} />;
}
