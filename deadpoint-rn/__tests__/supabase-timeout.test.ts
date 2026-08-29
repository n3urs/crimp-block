/** Exercises the exact same abort-wiring supabase.ts's `global.fetch`
    override uses, in isolation, against a fetch that never resolves —
    the one behaviour worth testing here (a hung request must not hang
    forever). Not imported from supabase.ts because that file's fetch
    override is an inline closure passed straight into createClient, not
    an exported function — duplicating its four lines here is simpler and
    more honest than exporting a function for the sole purpose of testing
    it. If Step 1's wrapper logic ever changes, update this copy too. */
function timeoutWrappedFetch(realFetch: typeof fetch, timeoutMs: number): typeof fetch {
  return ((url: any, options: any = {}) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return realFetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
  }) as typeof fetch;
}

test('a hung request is aborted once the timeout elapses, not left hanging', async () => {
  jest.useFakeTimers();
  const hangingFetch = jest.fn(
    (_url: any, options: any) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new Error('aborted')));
      })
  ) as unknown as typeof fetch;

  const wrapped = timeoutWrappedFetch(hangingFetch, 90_000);
  const result = wrapped('https://example.invalid');
  const assertion = expect(result).rejects.toThrow('aborted');

  jest.advanceTimersByTime(90_000);
  await assertion;

  jest.useRealTimers();
});

test('a request that resolves well within the timeout is not affected', async () => {
  jest.useFakeTimers();
  const fastFetch = jest.fn(async () => new Response('ok')) as unknown as typeof fetch;
  const wrapped = timeoutWrappedFetch(fastFetch, 90_000);

  await expect(wrapped('https://example.invalid')).resolves.toBeInstanceOf(Response);

  jest.useRealTimers();
});

test('supabase client constructs without throwing, and exposes the auth methods this task needs', () => {
  const { supabase } = require('../src/data/supabase');
  expect(supabase).toBeTruthy();
  expect(typeof supabase.auth.signInWithOtp).toBe('function');
  expect(typeof supabase.auth.verifyOtp).toBe('function');
  expect(typeof supabase.auth.signOut).toBe('function');
});
