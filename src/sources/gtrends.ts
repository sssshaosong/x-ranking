import { fetchText, parseCount, GTREND_GEOS } from '../config';
import type { RawItem, SourceResult } from '../types';

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

async function fetchGeo(geo: string, label: string): Promise<SourceResult> {
  const xml = await fetchText(`https://trends.google.com/trending/rss?geo=${geo}`);
  const items: RawItem[] = [];

  for (const block of xml.split('<item>').slice(1)) {
    const end = block.indexOf('</item>');
    const body = end > 0 ? block.slice(0, end) : block;
    const title = body.match(/<title>([\s\S]*?)<\/title>/);
    const traffic = body.match(/<ht:approx_traffic>([\s\S]*?)<\/ht:approx_traffic>/);
    const link = body.match(/<link>([\s\S]*?)<\/link>/);
    if (!title) continue;

    items.push({
      id: decodeEntities(title[1].trim()),
      title: `[${label}] ${decodeEntities(title[1].trim())}`,
      url: link ? decodeEntities(link[1].trim()) : `https://trends.google.com/trending?geo=${geo}`,
      score: traffic ? parseCount(traffic[1]) : 0,
      rank: items.length + 1,
      extra: { geo, traffic: traffic ? traffic[1].trim() : '—' },
    });
    if (items.length >= 10) break;
  }

  return { source: `gtrends:${geo}`, items };
}

/** 逐地区拉取。单个地区失败不影响其它地区。 */
export async function fetchGTrends(): Promise<SourceResult[]> {
  const out = await Promise.all(
    GTREND_GEOS.map(async (g) => {
      try {
        return await fetchGeo(g.geo, g.label);
      } catch (e) {
        return {
          source: `gtrends:${g.geo}`,
          items: [],
          error: e instanceof Error ? e.message : String(e),
        } as SourceResult;
      }
    })
  );
  return out;
}
