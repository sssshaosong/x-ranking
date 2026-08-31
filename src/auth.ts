import type { Env } from './types';

const COOKIE_NAME = 'xr_admin';
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const encoder = new TextEncoder();

function base64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function sign(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return base64url(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}

function cookie(req: Request, name: string): string | null {
  const raw = req.headers.get('Cookie') ?? '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSessionCookie(env: Env): Promise<string> {
  if (!env.RUN_TOKEN) throw new Error('RUN_TOKEN is not configured');
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = String(exp);
  const signature = await sign(payload, env.RUN_TOKEN);
  return `${COOKIE_NAME}=${payload}.${signature}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export async function isAuthorized(req: Request, env: Env): Promise<boolean> {
  if (!env.RUN_TOKEN) return false;

  // Backward-compatible access for old bookmarks and API clients.
  const url = new URL(req.url);
  if (url.searchParams.get('token') === env.RUN_TOKEN) return true;

  const auth = req.headers.get('Authorization');
  if (auth?.startsWith('Bearer ') && auth.slice(7) === env.RUN_TOKEN) return true;

  const session = cookie(req, COOKIE_NAME);
  if (!session) return false;
  const dot = session.indexOf('.');
  if (dot < 1) return false;

  const payload = session.slice(0, dot);
  const signature = session.slice(dot + 1);
  const exp = Number(payload);
  if (!Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000)) return false;

  const expected = await sign(payload, env.RUN_TOKEN);
  return safeEqual(signature, expected);
}
