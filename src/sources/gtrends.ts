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

/** RSS 只用于后端采集；用户点击时进入可读的 Google Trends Explore 页面。 */
function readableTrendUrl(geo: string, keyword: string): string {
  const url = new URL('https://trends.google.com/explore');
  url.searchParams.set('date', 'now 1-d');
  url.searchParams.set('geo', geo);
  url.searchParams.set('q', keyword);
  return url.toString();
}

async function fetchGeo(geo: string, label: string): Promise<SourceResult> {
  const xml = await fetchText(`https://trends.google.com/trending/rss?geo=${geo}`);
  const items: RawItem[] = [];

  for (const block of xml.split('<item>').slice(1)) {
    const end = block.indexOf('</item>');
    const body = end > 0 ? block.slice(0, end) : block;
    const title = body.match(/<title>([\s\S]*?)<\/title>/);
    const traffic = body.match(/<ht:approx_traffic>([\s\S]*?)<\/ht:approx_traffic>/);
    if (!title) continue;

    const keyword = decodeEntities(title[1].trim());
    items.push({
      id: keyword,
      title: keyword,
      url: readableTrendUrl(geo, keyword),
      score: traffic ? parseCount(traffic[1]) : 0,
      rank: items.length + 1,
      extra: {
        region: label,
        traffic: traffic ? decodeEntities(traffic[1].trim()) : '—',
      },
    });
    if (items.length >= 10) break;
  }

  return { source: `gtrends:${geo}`, items };
}

/** 逐地区拉取。单个地区失败不影响其它地区。 */
export async function fetchGTrends(): Promise<SourceResult[]> {
  return Promise.all(
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
}
