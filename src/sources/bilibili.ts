import { fetchText } from '../config';
import type { RawItem, SourceResult } from '../types';

interface Video {
  aid?: number;
  bvid?: string;
  title?: string;
  stat?: { view?: number; danmaku?: number; reply?: number; like?: number };
}

export async function fetchBilibili(): Promise<SourceResult> {
  const data = JSON.parse(
    await fetchText('https://api.bilibili.com/x/web-interface/popular?ps=50&pn=1')
  ) as { code?: number; data?: { list?: Video[] } };

  if (data.code !== 0 || !data.data?.list) {
    return { source: 'bilibili', items: [], error: `bilibili code=${data.code}` };
  }

  const items: RawItem[] = data.data.list
    .filter((v) => v.aid && v.title)
    .slice(0, 40)
    .map((v, i) => ({
      id: String(v.aid),
      title: String(v.title),
      url: `https://www.bilibili.com/video/${v.bvid ?? 'av' + v.aid}`,
      score: v.stat?.view ?? 0,
      rank: i + 1,
      extra: {
        view: v.stat?.view ?? 0,
        danmaku: v.stat?.danmaku ?? 0,
        reply: v.stat?.reply ?? 0,
        like: v.stat?.like ?? 0,
      },
    }));

  return { source: 'bilibili', items };
}
