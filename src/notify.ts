import type { AlertEvent, Env } from './types';

const API = 'https://api.telegram.org';

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function fmt(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e8) return (n / 1e8).toFixed(2) + '亿';
  if (abs >= 1e4) return (n / 1e4).toFixed(1) + '万';
  if (abs >= 100) return String(Math.round(n));
  return n.toFixed(abs >= 10 ? 0 : 1);
}

function renderAlert(alert: AlertEvent): string {
  const head = alert.kind === 'rule-spike'
    ? `🚀 <b>X 热度暴涨</b> · ${esc(alert.label)}`
    : `🔥 <b>X 趋势升温</b> · ${esc(alert.label)}`;
  const ratio = alert.ratio > 0 ? `${alert.ratio.toFixed(1)}×` : '—';
  return [
    head,
    '',
    `<b>${esc(alert.subjectKey)}</b>`,
    alert.detail ? esc(alert.detail) : '',
    `当前量级：<b>${esc(fmt(alert.value))}</b> · 增速：<b>${esc(ratio)}</b>`,
    '',
    alert.url ? `<a href="${esc(alert.url)}">在 X 查看 ↗</a>` : '',
  ].filter(Boolean).join('\n');
}

async function call(env: Env, method: string, payload: Record<string, unknown>): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is not configured');
  const res = await fetch(`${API}/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`telegram ${method} ${res.status}: ${body.slice(0, 250)}`);
  }
}

export async function sendAlert(env: Env, alert: AlertEvent): Promise<boolean> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return false;
  await call(env, 'sendMessage', {
    chat_id: env.TELEGRAM_CHAT_ID,
    text: renderAlert(alert),
    parse_mode: 'HTML',
    disable_notification: true,
  });
  return true;
}

export async function sendTest(env: Env): Promise<{ ok: boolean; detail: string }> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    return { ok: false, detail: '未配置 TELEGRAM_BOT_TOKEN 或 TELEGRAM_CHAT_ID' };
  }
  try {
    await call(env, 'sendMessage', {
      chat_id: env.TELEGRAM_CHAT_ID,
      text: '✅ X Radar 推送通道正常。之后只推送 X 平台趋势和监控规则异动。',
      parse_mode: 'HTML',
    });
    return { ok: true, detail: '测试消息已发送' };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}
