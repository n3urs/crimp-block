/** The pure half of the opt-in crash report; lastCrash.ts is the wiring.

    Deliberately NOT an analytics/crash-reporting SDK: the live privacy
    policy states none are included in the app, and adding one would make
    that false and mean changing the App Store privacy labels and Play's
    Data Safety form. Instead, after a fatal JS error the next launch
    ASKS, and only if the customer taps "Send details" does it open their
    own mail app with a pre-filled message they can read and edit before
    sending. Nothing leaves the device unless they send it.

    Known limits, so nobody over-trusts it: it only sees fatal JS errors
    (a native crash never reaches JS), and a production stack is bundle
    offsets with no source maps, so the message and the app version are
    the useful parts rather than the stack lines. */

export const CRASH_REPORT_EMAIL = 'support@getdeadpoint.co.uk';

export interface CrashRecord {
  message: string;
  stack: string;
  /** ISO timestamp of the crash. */
  at: string;
}

export interface CrashContext {
  appVersion: string;
  build: string;
  os: string;
}

/** mailto: URLs go through an Android intent, which has a hard size
    ceiling, and a real stack can run to several KB. 1500 chars keeps the
    frames that matter (the top of the stack) and stays comfortably safe. */
const MAX_STACK_CHARS = 1500;

function buildCrashReport(record: CrashRecord, ctx: CrashContext): { subject: string; body: string } {
  const stack = record.stack.length > MAX_STACK_CHARS
    ? `${record.stack.slice(0, MAX_STACK_CHARS)}\n…(truncated)`
    : record.stack;

  const subject = `Deadpoint crash report (${ctx.appVersion}, build ${ctx.build})`;
  const body = [
    'Deadpoint closed unexpectedly. Anything you want to add about what you were doing:',
    '',
    '',
    '— details, sent by you —',
    `App: ${ctx.appVersion} (${ctx.build})`,
    `Device: ${ctx.os}`,
    `When: ${record.at}`,
    '',
    `Error: ${record.message}`,
    '',
    stack,
  ].join('\n');

  return { subject, body };
}

export function buildCrashReportUrl(record: CrashRecord, ctx: CrashContext): string {
  const { subject, body } = buildCrashReport(record, ctx);
  return `mailto:${CRASH_REPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** Fallback for a phone with no mail app set up, where the mailto link
    can't open at all and "Send details" would otherwise do nothing. The
    system share sheet works on every device (and includes Copy), but
    unlike a mailto link it carries no recipient, so the text itself says
    where to send it. */
export function buildCrashReportShareText(record: CrashRecord, ctx: CrashContext): string {
  const { subject, body } = buildCrashReport(record, ctx);
  return `Please send this to ${CRASH_REPORT_EMAIL}\n\n${subject}\n\n${body}`;
}

/** Reads what installCrashRecorder stored. Tolerant on purpose: earlier
    builds wrote a bare `message\n\nstack` string under the same key, and
    anything unreadable must degrade to a usable report rather than throw
    at launch. */
export function parseCrashRecord(raw: string): CrashRecord {
  try {
    const parsed = JSON.parse(raw) as Partial<CrashRecord> | null;
    if (parsed && typeof parsed.message === 'string') {
      return {
        message: parsed.message,
        stack: typeof parsed.stack === 'string' ? parsed.stack : '',
        at: typeof parsed.at === 'string' ? parsed.at : '',
      };
    }
  } catch {
    // fall through to the plain-text treatment
  }
  return { message: raw, stack: '', at: '' };
}

interface ErrorUtilsLike {
  getGlobalHandler: () => (error: unknown, isFatal?: boolean) => void;
  setGlobalHandler: (handler: (error: unknown, isFatal?: boolean) => void) => void;
}

/** Wraps React Native's global error handler so a FATAL error is written
    down before the app dies.

    The order is the whole point. The previous version fired the write and
    immediately called React Native's own handler, which on a release
    build tears the process down straight away — an async storage write
    can lose that race, so the record silently wouldn't exist and the
    prompt would never appear. So the original handler is only called
    once the write has settled.

    `maxWaitMs` bounds that delay: a hung or failing write must never
    turn a crash into a frozen app, so the original handler runs anyway
    once it elapses. It runs exactly once whichever of the two happens
    first. Non-fatal errors pass straight through untouched. */
export function installCrashRecorder(
  errorUtils: ErrorUtilsLike,
  save: (record: CrashRecord) => Promise<void>,
  now: () => Date = () => new Date(),
  maxWaitMs = 750,
): void {
  const original = errorUtils.getGlobalHandler();

  errorUtils.setGlobalHandler((error, isFatal) => {
    if (!isFatal) {
      original(error, isFatal);
      return;
    }

    const e = error as { message?: string; stack?: string } | null | undefined;
    const record: CrashRecord = {
      message: e?.message ?? String(error),
      stack: e?.stack ?? '',
      at: now().toISOString(),
    };

    let handedOver = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const handOver = () => {
      if (handedOver) return;
      handedOver = true;
      if (timer !== undefined) clearTimeout(timer);
      original(error, isFatal);
    };

    timer = setTimeout(handOver, maxWaitMs);
    try {
      save(record).catch(() => {}).then(handOver);
    } catch {
      handOver();
    }
  });
}
