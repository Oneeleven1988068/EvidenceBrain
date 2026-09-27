import { createHash } from "node:crypto";
import { FORMAT_DEC, FORMAT_HK } from "../calc/odds.js";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";

export const PIN_AH = 47;
export const PIN_EURO = 177;

export async function httpGet(url, { timeoutMs = 15000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/javascript,*/*" },
      signal: ctrl.signal,
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text, url };
  } finally {
    clearTimeout(t);
  }
}

function sha(text) {
  return createHash("sha256").update(text).digest("hex");
}

function utcToIso(hhmm, assumeUtcDate) {
  if (!hhmm) return null;
  const m = String(hhmm).match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const d = assumeUtcDate ? new Date(assumeUtcDate) : new Date();
  d.setUTCHours(Number(m[1]), Number(m[2]), 0, 0);
  return d.toISOString();
}

export function parseAsianTable(html, pageType, fetchedAt) {
  const rows = [];
  const re =
    /<(?:tr|TR)[^>]*>[\s\S]*?id=(\d+)[\s\S]*?<\/(?:tr|TR)>/gi;
  const goalRe = /goals=["']?(-?[\d.]+)/i;
  const oddsRe = /(?:odds|data-o)=["']?([\d.]+)/gi;
  const blocks = html.split(/<(?:tr|TR)[^>]*>/i).slice(1);
  for (const block of blocks) {
    const idm = block.match(/(?:cid|company|id)=["']?(\d+)/i) || block.match(/\b(47|177)\b/);
    const isPin = /平\*?<\/|平博|Pinnacle|cid=["']?47|company=["']?47/i.test(block) ||
      (idm && idm[1] === "47");
    if (!isPin && !(idm && Number(idm[1]) === 47)) continue;
    const goals = [...block.matchAll(/goals=["'](-?[\d.]+)["']/gi)].map((x) => Number(x[1]));
    const odds = [...block.matchAll(/odds=["']([\d.]+)["']/gi)].map((x) => Number(x[1]));
    const changed = block.match(/(\d{1,2}:\d{2})/);
    if (goals.length && odds.length >= 2) {
      for (let i = 0; i < goals.length && i * 2 + 1 < odds.length; i++) {
        rows.push({
          book_id: 47,
          page: pageType,
          line: goals[i],
          home: pageType === "ah" ? odds[i * 2] : undefined,
          away: pageType === "ah" ? odds[i * 2 + 1] : undefined,
          over: pageType === "ou" ? odds[i * 2] : undefined,
          under: pageType === "ou" ? odds[i * 2 + 1] : undefined,
          odds_format: FORMAT_HK,
          changed_at: utcToIso(changed?.[1]),
          fetched_at: fetchedAt,
        });
      }
    }
  }
  if (!rows.length) {
    const pinChunk = html.split(/平\*?/g);
    for (const chunk of pinChunk.slice(1, 3)) {
      const goals = [...chunk.matchAll(/goals=["'](-?[\d.]+)["']/gi)].map((x) => Number(x[1]));
      const odds = [...chunk.matchAll(/odds=["']([\d.]+)["']/gi)].map((x) => Number(x[1]));
      for (let i = 0; i < Math.min(goals.length, Math.floor(odds.length / 2)); i++) {
        rows.push({
          book_id: 47,
          page: pageType,
          line: goals[i],
          home: pageType === "ah" ? odds[i * 2] : undefined,
          away: pageType === "ah" ? odds[i * 2 + 1] : undefined,
          over: pageType === "ou" ? odds[i * 2] : undefined,
          under: pageType === "ou" ? odds[i * 2 + 1] : undefined,
          odds_format: FORMAT_HK,
          fetched_at: fetchedAt,
        });
      }
    }
  }
  void goalRe;
  void oddsRe;
  void re;
  return rows;
}

export function parseEuroJs(text, fetchedAt) {
  const rows = [];
  const pin = text.match(/\[177,[\s\S]*?\]/);
  const all = [...text.matchAll(/\[(\d+),[^[\]]*?(2\.\d+|1\.\d+)[^[\]]*?(2\.\d+|3\.\d+|1\.\d+)[^[\]]*?(2\.\d+|3\.\d+|1\.\d+)/g)];
  for (const m of all) {
    if (Number(m[1]) !== 177) continue;
    const nums = m[0].match(/(\d+\.\d+)/g)?.map(Number) || [];
    if (nums.length >= 3) {
      const time = m[0].match(/(\d{1,2}:\d{2})/);
      rows.push({
        book_id: 177,
        page: "euro",
        home: nums[0],
        draw: nums[1],
        away: nums[2],
        odds_format: FORMAT_DEC,
        changed_at: utcToIso(time?.[1]),
        fetched_at: fetchedAt,
        ownClock: true,
      });
    }
  }
  if (!rows.length && pin) {
    const nums = pin[0].match(/(\d+\.\d+)/g)?.map(Number) || [];
    if (nums.length >= 3) {
      rows.push({
        book_id: 177,
        page: "euro",
        home: nums[0],
        draw: nums[1],
        away: nums[2],
        odds_format: FORMAT_DEC,
        fetched_at: fetchedAt,
        ownClock: true,
      });
    }
  }
  return rows;
}

export async function fetchPinnacle(titanId) {
  const fetchedAt = new Date().toISOString();
  const tried = [];
  const out = { titan_id: titanId, ah: [], ou: [], euro: null, hashes: {}, tried };

  const ahUrl = `https://vip.titan007.com/AsianOdds_n.aspx?id=${titanId}`;
  const ouUrl = `https://vip.titan007.com/OverDown_n.aspx?id=${titanId}`;
  const euroUrl = `https://1x2d.titan007.com/${titanId}.js`;

  for (const [key, url, parse] of [
    ["ah", ahUrl, (t) => parseAsianTable(t, "ah", fetchedAt)],
    ["ou", ouUrl, (t) => parseAsianTable(t, "ou", fetchedAt)],
    ["euro", euroUrl, (t) => parseEuroJs(t, fetchedAt)],
  ]) {
    try {
      const res = await httpGet(url);
      tried.push({ url, status: res.status, ok: res.ok });
      out.hashes[key] = sha(res.text);
      if (!res.ok) {
        tried[tried.length - 1].reason = `HTTP ${res.status}`;
        continue;
      }
      const parsed = parse(res.text);
      if (key === "euro") out.euro = parsed[0] || null;
      else out[key] = parsed;
    } catch (err) {
      tried.push({ url, ok: false, reason: String(err.message || err) });
    }
  }

  const series = [];
  for (const n of [0, 2, 3, 4]) {
    const path = n === 0
      ? `https://vip.titan007.com/changeDetail/handicap.aspx?id=${titanId}`
      : `https://vip.titan007.com/changeDetail/multiHandicap.aspx?id=${titanId}&n=${n}`;
    try {
      const res = await httpGet(path);
      tried.push({ url: path, status: res.status, ok: res.ok });
      if (res.ok) series.push({ n, html: res.text, hash: sha(res.text) });
    } catch (err) {
      tried.push({ url: path, ok: false, reason: String(err.message || err) });
    }
  }
  try {
    const ouCh = await httpGet(`https://vip.titan007.com/changeDetail/overunder.aspx?id=${titanId}`);
    tried.push({ url: ouCh.url, status: ouCh.status, ok: ouCh.ok });
    if (ouCh.ok) series.push({ n: "ou", html: ouCh.text, hash: sha(ouCh.text) });
  } catch (err) {
    tried.push({ url: "overunder", ok: false, reason: String(err.message || err) });
  }

  return { ...out, series, fetched_at: fetchedAt };
}

export function shouldFetchNow(closeAtIso, kickoffIso, now = new Date()) {
  if (!closeAtIso) return false;
  const close = new Date(closeAtIso).getTime();
  const kick = kickoffIso ? new Date(kickoffIso).getTime() : close + 30 * 60 * 1000;
  const t = now.getTime();
  const fiveH = 5 * 60 * 60 * 1000;
  if (t < close - fiveH) return false;
  if (t >= kick - 5 * 60 * 1000 && t <= kick) return { reason: "p_close" };
  if (t >= close - 10 * 60 * 1000 && t <= close) return { reason: "close-10m" };
  return { reason: "30m-window" };
}
