/** Task 12's "cheap smoke test" per the brief's Step 4: not a full render
    (no react-test-renderer/@testing-library exists in this project — same
    class of gap Task 11's own report already hit and explained for
    @testing-library/react), but a genuine structural check on the ONE
    thing the brief specifically calls out: "the peek/current shared
    render function produces sane output for two different
    RenderedExercise[] inputs."

    `CardBody` (exported from DailyCard.tsx specifically to make this
    possible) is deliberately hook-free, so it's safe to call directly as
    a plain function here, outside of any real React render pass — no
    hook dispatcher is required because none of its own code calls a
    hook. Calling `DailyCard` itself this way would throw ("Invalid hook
    call") since it uses real `useEffect`/`useAnimatedStyle`; that full
    assembly can only be verified by an actual render, which is exactly
    the device-verification gap Step 4 marks deferred. This test walks
    the plain React-element tree `CardBody` returns (elements are just
    `{type, props}` objects — no renderer needed to inspect that shape). */
import { Text } from 'react-native';
import { CardBody } from '../src/components/daily-card/DailyCard';
import { ExerciseRow } from '../src/components/daily-card/ExerciseRow';
import type { RenderedExercise } from '../src/engine/types';

function collect(node: unknown, type: unknown, acc: any[] = []): any[] {
  if (node == null || typeof node === 'boolean') return acc;
  if (Array.isArray(node)) {
    node.forEach((n) => collect(n, type, acc));
    return acc;
  }
  if (typeof node !== 'object' || !('type' in (node as object))) return acc;
  const el = node as { type: unknown; props?: { children?: unknown } };
  if (el.type === type) acc.push(el);
  if (el.props && 'children' in el.props) collect(el.props.children, type, acc);
  return acc;
}

function makeExercise(id: string): RenderedExercise {
  return {
    id,
    title: id,
    prescription: '3 x 10',
    phaseAdjusted: false,
    weightIsBump: false,
    hasWeightTracking: false,
    step: 2.5,
  };
}

const baseProps = {
  session: { name: 'Max Fingers', where: 'Home · 50 min' },
  accent: '#F2B134',
  accentVarName: '--gorse',
  ticks: new Set<string>(),
  message: '',
  messageEmphasis: false,
  footerNote: 'test footer',
  exercisesInteractive: true,
  exercisesOpacity: 1,
  scrollEnabled: true,
};

test('CardBody renders exactly one ExerciseRow per RenderedExercise, for two different-length inputs', () => {
  const three = [makeExercise('a'), makeExercise('b'), makeExercise('c')];
  const one = [makeExercise('only')];

  const treeThree = CardBody({ ...baseProps, exercises: three });
  const treeOne = CardBody({ ...baseProps, exercises: one });

  expect(collect(treeThree, ExerciseRow)).toHaveLength(3);
  expect(collect(treeOne, ExerciseRow)).toHaveLength(1);
});

test('CardBody renders zero ExerciseRows for an empty exercises array (peek onto a rest day, say)', () => {
  const tree = CardBody({ ...baseProps, exercises: [] });
  expect(collect(tree, ExerciseRow)).toHaveLength(0);
});

test('the guide pill only renders when guide is supplied — matches peekContent never showing one', () => {
  const withGuide = CardBody({ ...baseProps, exercises: [], guide: { title: 'Warm-up guide' } });
  const withoutGuide = CardBody({ ...baseProps, exercises: [], guide: null });

  expect(collect(withGuide, Text).length).toBeGreaterThan(collect(withoutGuide, Text).length);
});

test('cardMessage only renders a Text node when non-empty, matching Swift\'s !cardMessage.isEmpty guard', () => {
  const withMessage = CardBody({ ...baseProps, exercises: [], message: 'Deload week — go easy.' });
  const withoutMessage = CardBody({ ...baseProps, exercises: [], message: '' });

  expect(collect(withMessage, Text).length).toBeGreaterThan(collect(withoutMessage, Text).length);
});
