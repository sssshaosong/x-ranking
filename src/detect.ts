import { cfg } from './config';
import type { Detection, RawItem, SeriesPoint } from './types';
import { HOUR } from './types';

export interface ItemMeta {
  firstSeen: number;
}

/**
 * 异动判定。
 *
 * 思路：不比绝对值（大号永远在榜），也不比排名（慢），而是比**它自己**。
 *   recentRate = 近 1 小时的增速
 *   baseRate   = 过去 24 小时的平均增速（自身的常态）
 *   ratio      = recentRate / baseRate
 * 只有「相对自己明显提速」才算异动，这样小话题和大话题能放在同一套阈值下比较。
 */
export function detect(
  source: string,
  items: RawItem[],
  history: Map<string, SeriesPoint[]>,
  meta: Map<string, ItemMeta>,
  now: number,
  bootstrapped: boolean
): Detection[] {
  const c = cfg(source);
  const out: Detection[] = [];

  for (const item of items) {
    const series = history.get(item.id) ?? [];
    const m = meta.get(item.id);

    // 数值回退（如 GitHub 每日 star 归零）不参与速度判定，避免误报负增长
    const last = series.length ? series[series.length - 1] : null;
    if (last && item.score < last.score) continue;

    // --- 信号一：相对自身提速 ---
    if (c.ratio > 0 && series.length > 0) {
      const basePoint = series.find((p) => p.ts >= now - 24 * HOUR) ?? series[0];
      const baseHours = (now - basePoint.ts) / HOUR;
      const baseRate = baseHours > 0 ? (item.score - basePoint.score) / baseHours : 0;

      const recentPoint = [...series].reverse().find((p) => p.ts <= now - HOUR);
      const recentRate = recentPoint
        ? (item.score - recentPoint.score) / ((now - recentPoint.ts) / HOUR)
        : 0;

      if (
        baseRate > 0 &&
        recentPoint &&
        recentRate >= c.minRate &&
        item.score >= c.minScore &&
        recentRate / baseRate >= c.ratio
      ) {
        out.push({
          source,
          item,
          kind: 'velocity',
          rate: recentRate,
          baseRate,
          ratio: recentRate / baseRate,
        });
        continue;
      }
    }

    // --- 信号二：首次上榜即高位 ---
    // 仅在该源已有历史数据时生效，否则首次运行会把整个榜单当成新上榜全量推送
    if (bootstrapped && c.newEntry > 0 && m) {
      const fresh = now - m.firstSeen <= 2 * HOUR;
      if (fresh && item.rank > 0 && item.rank <= c.newEntry && item.score >= c.minScore) {
        out.push({ source, item, kind: 'new-entry', rate: 0, baseRate: 0, ratio: 0 });
      }
    }
  }

  return out;
}

/**
 * 冷却去重：同一条目在 cooldownHours 内只告警一次。
 * 返回保留的告警，并给出去重原因计数。
 */
export function dedupe(
  detections: Detection[],
  lastAlertAt: Map<string, number>,
  now: number
): { kept: Detection[]; suppressed: number } {
  const kept: Detection[] = [];
  let suppressed = 0;

  for (const d of detections) {
    const key = `${d.source}|${d.item.id}`;
    const prev = lastAlertAt.get(key);
    if (prev && now - prev < cfg(d.source).cooldownHours * HOUR) {
      suppressed++;
      continue;
    }
    lastAlertAt.set(key, now);
    kept.push(d);
  }

  return { kept, suppressed };
}
