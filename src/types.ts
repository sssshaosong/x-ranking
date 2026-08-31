/** 一次采集得到的条目。score 必须是同一源内可纵向比较的数值。 */
export interface RawItem {
  id: string;
  title: string;
  url: string;
  score: number;
  rank: number;
  /** 附加上下文，仅用于推送内容展示 */
  extra?: Record<string, string | number>;
}

export interface SourceResult {
  source: string;
  items: RawItem[];
  error?: string;
}

export interface Env {
  DB: D1Database;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  RUN_TOKEN?: string;
}

/** 判定告警所需的历史序列 */
export interface SeriesPoint {
  ts: number;
  score: number;
}

export interface Detection {
  source: string;
  item: RawItem;
  kind: 'velocity' | 'new-entry';
  /** 近 1 小时速度 */
  rate: number;
  /** 近 1 小时速度 / 24 小时基线速度 */
  ratio: number;
  baseRate: number;
}

export const HOUR = 3600_000;
export const DAY = 24 * HOUR;
