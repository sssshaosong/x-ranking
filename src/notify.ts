import { cfg } from './config';
import type { Detection, Env } from './types';

const API = 'https://api.telegram.org';

/**
 * Telegram HTML 模式只认有限的标签（b/i/u/s/a/code/pre），
 * 其余标签会直接报 400。所以这里必须转义，标题来自外部站点，不可信。
 */
function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 12345 -> "1.2万"，给推送和状态页共用 */
export function fmt(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e8) return (n / 1e8).toFixed(2) + '亿';
  if (abs >= 1e4) return (n / 1e4).toFixed(1) + '万';
  if (abs >= 100) return String(Math.round(n));
  return n.toFixed(1);
}

export function renderMessage(d: Detection): string {
  const label = cfg(d.source).label;
  const head =
    d.kind === 'new-entry'
      ? `🆕 <b>新上榜</b> · ${esc(label)}`
      : `🔥 <b>提速 ${d.ratio.toFixed(1)}x</b> · ${esc(label)}`;

  // Telegram 非等宽字体，全角空格对齐是假象，速度信息压成一行更紧凑
  const detail =
    d.kind === 'new-entry'
      ? `首次上榜即第 <b>${d.item.rank}</b> 位`
      : `近 1 小时 <b>+${fmt(d.rate)}</b>（24h 基线 ${fmt(d.baseRate)}/时）`;

  const extras = d.item.extra
    ? Object.entries(d.item.extra)
        .map(([k, v]) => `${esc(k)} ${esc(v)}`)
        .join(' · ')
    : '';

  return [
    head,
    '',
    `<b>${esc(d.item.title)}</b>`,
    '',
    detail,
    `当前热度　${fmt(d.item.score)}`,
    extras ? `<i>${extras}</i>` : '',
    '',
    `<a href="${esc(d.item.url)}">打开原文 →</a>`,
  ]
    .filter((line) => line !== '')
    .join('\n');
}

async function call(env: Env, method: string, payload: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${API}/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`telegram ${method} ${res.status}: ${body.slice(0, 200)}`);
  }
}

/** 未配置 token 时静默跳过，保证不配推送也能跑。 */
export async function sendTelegram(env: Env, d: Detection): Promise<boolean> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return false;

  await call(env, 'sendMessage', {
    chat_id: env.TELEGRAM_CHAT_ID,
    text: renderMessage(d),
    parse_mode: 'HTML',
    // 关掉通知音，异动多的时候不至于吵
    disable_notification: true,
  });
  return true;
}

/** /test 用：验证 token 与 chat_id 是否配对成功。 */
export async function sendTest(env: Env): Promise<{ ok: boolean; detail: string }> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    return { ok: false, detail: '未配置 TELEGRAM_BOT_TOKEN 或 TELEGRAM_CHAT_ID' };
  }
  try {
    await call(env, 'sendMessage', {
      chat_id: env.TELEGRAM_CHAT_ID,
      text: '✅ Trend Radar 推送通道正常。收到这条说明机器人和 chat_id 配置正确。',
      parse_mode: 'HTML',
    });
    return { ok: true, detail: '已发送测试消息' };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}
