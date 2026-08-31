// app/(main)/calendar.tsx
import React, { useMemo } from 'react';
import { useRouter } from 'expo-router';
import { useSession } from '../../src/data/useSession';
import { useStore } from '../../src/data/useStore';
import { createEngine } from '../../src/engine';
import { CalendarScreen } from '../../src/screens/calendar/CalendarScreen';

const PROGRAMS = require('../../src/engine/programs.js');

export default function Calendar() {
  const router = useRouter();
  const { session } = useSession();
  const email = session?.user?.email ?? null;
  const userId = session?.user?.id ?? '';
  const program = useMemo(() => PROGRAMS[(email ?? '').toLowerCase()] ?? PROGRAMS.default, [email]);

  const [today] = React.useState(() => createEngine(program, { sessionLog: {}, loadLog: {} }).today());
  const store = useStore(program.startDate ?? null, today, userId);
  const engine = useMemo(() => createEngine(program, { sessionLog: store.days, loadLog: {} }), [program, store.days]);

  return <CalendarScreen engine={engine} history={store.days} today={today} onDismiss={() => router.back()} />;
}
