import { fetchText } from '../config';
import type { RawItem, SourceResult } from '../types';

interface Hit {
  objectID?: string;
  title?: string;
  url?: string;
  points?: number;
  num_comments?: number;
  created_at_i?: number;
}

/** 取最近 24 小时内的故事，按 Algolia 相关度（≈热度）排序。 */
export async function fetchHN(now: number): Promise<SourceResult> {
  const cutoff = Math.floor((now - 86_400_000) / 1000);
  const url =
    'https://hn.algolia.com/api/v1/search?tags=story' +
    `&numericFilters=created_at_i>${cutoff}&hitsPerPage=100&page=0`;

  const data = JSON.parse(await fetchText(url)) as { hits?: Hit[] };
  const items: RawItem[] = (data.hits ?? [])
    .filter((h) => h.objectID && h.title)
    .slice(0, 60)
    .map((h, i) => ({
      id: String(h.objectID),
      title: String(h.title),
      url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
      // 评论权重加倍：技术话题往往先在评论区起量，比分数更早反映热度
      score: (h.points ?? 0) + 2 * (h.num_comments ?? 0),
      rank: i + 1,
      extra: { points: h.points ?? 0, comments: h.num_comments ?? 0 },
    }));

  return { source: 'hn', items };
}
