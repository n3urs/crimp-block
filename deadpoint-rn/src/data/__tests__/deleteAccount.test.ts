import { callDeleteAccount } from '../deleteAccount';

test('posts to the delete-account function with the caller\'s bearer token', async () => {
  const calls: any[] = [];
  const fetcher = async (url: string, init: any) => {
    calls.push({ url, init });
    return { ok: true, json: async () => ({ success: true }) } as any;
  };

  await callDeleteAccount('https://proj.supabase.co', 'anon-key', 'the-jwt', fetcher);

  expect(calls).toHaveLength(1);
  expect(calls[0].url).toBe('https://proj.supabase.co/functions/v1/delete-account');
  expect(calls[0].init.method).toBe('POST');
  expect(calls[0].init.headers.Authorization).toBe('Bearer the-jwt');
});

test('throws with the server\'s own message when deletion fails', async () => {
  const fetcher = async () => ({ ok: false, json: async () => ({ error: 'Invalid or expired session' }) } as any);
  await expect(callDeleteAccount('https://p.supabase.co', 'k', 'jwt', fetcher))
    .rejects.toThrow('Invalid or expired session');
});

test('throws a usable message even when the error body is not JSON', async () => {
  const fetcher = async () => ({ ok: false, json: async () => { throw new Error('not json'); } } as any);
  await expect(callDeleteAccount('https://p.supabase.co', 'k', 'jwt', fetcher)).rejects.toThrow();
});
