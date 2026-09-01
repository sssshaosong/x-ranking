export type WatchRuleType = 'keyword' | 'account';

export interface Env {
  DB: D1Database;
  X_BEARER_TOKEN?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  RUN_TOKEN?: string;
}

export interface XTrend {
  name: string;
  tweetCount: number;
  rank: number;
  woeid: number;
}

export interface XTrendSnapshot extends XTrend {
  ts: number;
  previousCount?: number;
  deltaPct?: number;
}

export interface WatchRule {
  id: number;
  type: WatchRuleType;
  label: string;
  query: string;
  enabled: boolean;
  createdAt: number;
}

export interface RuleSnapshot {
  ruleId: number;
  ts: number;
  count5m: number;
  previous5m: number;
  count15m: number;
  count60m: number;
  ratio5m: number;
}

export interface XPublicMetrics {
  likeCount: number;
  repostCount: number;
  replyCount: number;
  quoteCount: number;
  bookmarkCount: number;
  impressionCount: number;
}

export interface XPost {
  id: string;
  text: string;
  createdAt: string;
  authorId: string;
  authorName: string;
  username: string;
  profileImageUrl?: string;
  verified?: boolean;
  metrics: XPublicMetrics;
  engagement: number;
  url: string;
}

export interface AlertEvent {
  id?: number;
  ts: number;
  kind: 'trend-jump' | 'rule-spike';
  label: string;
  subjectKey: string;
  value: number;
  ratio: number;
  detail: string;
  url?: string;
  notified?: boolean;
}

export interface XSettings {
  enabled: boolean;
  intervalMinutes: number;
  lastScheduledAt: number;
  nextRunAt: number | null;
  woeid: number;
  maxTrends: number;
  spikeRatio: number;
  spikeMinPosts: number;
  postsPerRule: number;
}

export interface RunSummary {
  ok: boolean;
  ts: number;
  trends: number;
  rules: number;
  posts: number;
  alerts: number;
  notified: number;
  errors: string[];
}
