import * as cheerio from 'cheerio';

import { env } from '../config/env.js';

/** Fetch a URL with a browser User-Agent (some gold sites 403 bots) → cheerio root. */
export async function fetchHtml(url: string): Promise<cheerio.CheerioAPI> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': env.GOLD_CRAWL_USER_AGENT,
      Accept: 'text/html,application/xhtml+xml',
    },
  });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return cheerio.load(await res.text());
}
