/** The opt-in crash report (see src/debug/crashReport.ts and lastCrash.ts).
    Nothing here is sent anywhere by the app: after a fatal JS error the
    next launch asks, and only on "Send details" opens the customer's own
    mail app with a pre-filled message they can read and edit first. That
    is what keeps it consistent with the privacy policy's "no analytics or
    crash-reporting SDKs" — there is no SDK, and nothing leaves the device
    unless the customer sends it.

    installCrashRecorder's ordering is the thing most worth pinning. The
    handler used to fire `AsyncStorage.setItem` and immediately hand over
    to React Native's own handler, which on a release build tears the
    process down straight away — an async write can lose that race, so the
    record would silently never exist and the prompt would never appear. */
import {
  buildCrashReportUrl,
  buildCrashReportShareText,
  parseCrashRecord,
  installCrashRecorder,
  CRASH_REPORT_EMAIL,
  type CrashRecord,
  type CrashContext,
} from '../src/debug/crashReport';

const CTX: CrashContext = { appVersion: '1.0.0', build: '33', os: 'ios 26.5' };
const RECORD: CrashRecord = {
  message: "TypeError: undefined is not an object (evaluating 'row.title')",
  stack: 'at renderRow (index.ios.bundle:1:20031)\nat Object.run (index.ios.bundle:1:1042)',
  at: '2026-09-21T13:04:05.000Z',
};

describe('buildCrashReportUrl', () => {
  test('addresses the support inbox and decodes back to a readable report', () => {
    const url = buildCrashReportUrl(RECORD, CTX);
    expect(url.startsWith(`mailto:${CRASH_REPORT_EMAIL}?`)).toBe(true);

    const params = new URL(url).searchParams;
    expect(params.get('subject')).toBe('Deadpoint crash report (1.0.0, build 33)');
    const body = params.get('body') ?? '';
    expect(body).toContain('1.0.0 (33)');
    expect(body).toContain('ios 26.5');
    expect(body).toContain('2026-09-21T13:04:05.000Z');
    expect(body).toContain("evaluating 'row.title'");
    expect(body).toContain('renderRow');
  });

  test('survives characters that would otherwise break a mailto URL', () => {
    const nasty: CrashRecord = { ...RECORD, message: 'a&b=c#d?e\nline two 100%' };
    const body = new URL(buildCrashReportUrl(nasty, CTX)).searchParams.get('body') ?? '';
    expect(body).toContain('a&b=c#d?e\nline two 100%');
  });

  test('caps a huge stack so the URL stays a safe length for the mail intent', () => {
    const huge: CrashRecord = { ...RECORD, stack: 'x'.repeat(50_000) };
    const url = buildCrashReportUrl(huge, CTX);
    expect(url.length).toBeLessThan(6_000);
    expect(new URL(url).searchParams.get('body')).toContain('truncated');
  });
});

describe('buildCrashReportShareText', () => {
  // The fallback when no mail app is set up: the share sheet works
  // everywhere, but unlike a mailto link it carries no recipient, so the
  // text itself has to say where to send it.
  test('tells the customer where to send it and carries the full report', () => {
    const text = buildCrashReportShareText(RECORD, CTX);
    expect(text).toContain(CRASH_REPORT_EMAIL);
    expect(text).toContain('Deadpoint crash report (1.0.0, build 33)');
    expect(text).toContain("evaluating 'row.title'");
    expect(text).toContain('ios 26.5');
  });

  test('caps a huge stack like the mailto version does', () => {
    const text = buildCrashReportShareText({ ...RECORD, stack: 'x'.repeat(50_000) }, CTX);
    expect(text.length).toBeLessThan(6_000);
  });
});

describe('parseCrashRecord', () => {
  test('reads a stored JSON record', () => {
    expect(parseCrashRecord(JSON.stringify(RECORD))).toEqual(RECORD);
  });

  test('tolerates the old plain-text format earlier builds wrote', () => {
    const parsed = parseCrashRecord('Boom\n\nat somewhere (bundle:1:1)');
    expect(parsed.message).toContain('Boom');
  });

  test('tolerates JSON that is not a crash record, rather than throwing', () => {
    expect(parseCrashRecord('{"foo":1}').message).toContain('foo');
    expect(() => parseCrashRecord('{not json')).not.toThrow();
  });
});

describe('installCrashRecorder', () => {
  function fakeErrorUtils() {
    const original = jest.fn();
    let installed: ((e: unknown, fatal?: boolean) => void) | null = null;
    return {
      original,
      utils: {
        getGlobalHandler: () => original,
        setGlobalHandler: (h: (e: unknown, fatal?: boolean) => void) => { installed = h; },
      },
      trigger: (e: unknown, fatal?: boolean) => installed!(e, fatal),
    };
  }
  const flush = () => new Promise<void>((r) => setImmediate(r));
  const NOW = () => new Date('2026-09-21T13:04:05.000Z');

  test('does not hand over to the original handler until the record has been written', async () => {
    const { utils, original, trigger } = fakeErrorUtils();
    let finishWrite: () => void = () => {};
    const save = jest.fn(() => new Promise<void>((r) => { finishWrite = r; }));
    installCrashRecorder(utils, save, NOW);

    const err = new Error('boom');
    trigger(err, true);
    await flush();
    expect(save).toHaveBeenCalledTimes(1);
    expect(original).not.toHaveBeenCalled(); // write still in flight

    finishWrite();
    await flush();
    expect(original).toHaveBeenCalledTimes(1);
    expect(original).toHaveBeenCalledWith(err, true);
  });

  test('records the message, stack and time', async () => {
    const { utils, trigger } = fakeErrorUtils();
    const save = jest.fn(() => Promise.resolve());
    installCrashRecorder(utils, save, NOW);

    const err = new Error('boom');
    trigger(err, true);
    await flush();

    const saved = (save.mock.calls[0] as unknown as [CrashRecord])[0];
    expect(saved.message).toBe('boom');
    expect(saved.stack).toContain('Error: boom');
    expect(saved.at).toBe('2026-09-21T13:04:05.000Z');
  });

  test('still crashes normally if the write hangs — a stuck app is worse than a lost report', () => {
    jest.useFakeTimers();
    const { utils, original, trigger } = fakeErrorUtils();
    installCrashRecorder(utils, () => new Promise<void>(() => {}), NOW, 750);

    trigger(new Error('boom'), true);
    expect(original).not.toHaveBeenCalled();
    jest.advanceTimersByTime(750);
    expect(original).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  test('still crashes normally if the write fails', async () => {
    const { utils, original, trigger } = fakeErrorUtils();
    installCrashRecorder(utils, () => Promise.reject(new Error('disk full')), NOW);

    trigger(new Error('boom'), true);
    await flush();
    expect(original).toHaveBeenCalledTimes(1);
  });

  test('hands over exactly once even when both the write and the timeout fire', async () => {
    jest.useFakeTimers();
    const { utils, original, trigger } = fakeErrorUtils();
    installCrashRecorder(utils, () => Promise.resolve(), NOW, 750);

    trigger(new Error('boom'), true);
    await Promise.resolve();
    await Promise.resolve();
    jest.advanceTimersByTime(2_000);
    expect(original).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  test('a non-fatal error is passed straight through and never recorded', () => {
    const { utils, original, trigger } = fakeErrorUtils();
    const save = jest.fn(() => Promise.resolve());
    installCrashRecorder(utils, save, NOW);

    const err = new Error('just a warning');
    trigger(err, false);
    expect(save).not.toHaveBeenCalled();
    expect(original).toHaveBeenCalledWith(err, false);
  });

  test('copes with a thrown value that is not an Error', async () => {
    const { utils, trigger } = fakeErrorUtils();
    const save = jest.fn(() => Promise.resolve());
    installCrashRecorder(utils, save, NOW);

    trigger('a plain string', true);
    await flush();
    expect((save.mock.calls[0] as unknown as [CrashRecord])[0].message).toBe('a plain string');
  });
});
