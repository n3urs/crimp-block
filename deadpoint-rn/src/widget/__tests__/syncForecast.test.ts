import { buildForecastPayload } from '../syncForecast';

describe('buildForecastPayload', () => {
  it('matches the Forecast Codable shape the Swift widget reads', () => {
    const engine = {
      forecast: (days: number) => [
        {
          date: '2026-09-02', key: 'maxFingers', name: 'Max Fingers',
          where: 'Home · 50 min', colour: '--gorse', logged: false,
          phase: 'Base', cue: 'Submaximal — build capacity, not a top set',
          exercises: [{ t: 'Warm up', m: '15 min' }],
        },
      ],
    };
    const resolveColour = (v: string) => (v === '--gorse' ? '#F2B134' : v);

    const payload = buildForecastPayload(engine as any, resolveColour);

    expect(payload.v).toBe(1);
    expect(typeof payload.generated).toBe('string');
    expect(payload.days).toEqual([
      {
        date: '2026-09-02', key: 'maxFingers', name: 'Max Fingers',
        where: 'Home · 50 min', colour: '#F2B134', logged: false,
        phase: 'Base', cue: 'Submaximal — build capacity, not a top set',
        exercises: [{ t: 'Warm up', m: '15 min' }],
      },
    ]);
  });
});
