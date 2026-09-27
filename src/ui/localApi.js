/**
 * 手机 / GitHub 静态页没有 Express。赛程和导入都在浏览器里算、存在本机。
 */
import seed from "../../data/store/matches.json";
import { buildSlate, exportDay, boardStats } from "../server/slate.js";
import { classifyFilename, normalizeImport, normalizeResults, importReceipt } from "../data/jcImport.js";

const MATCH_KEY = "evidencebrain-matches-v1";
const LAST_KEY = "evidencebrain-jc-last-v1";
const HIST_KEY = "evidencebrain-history-v1";
const FOLLOW_KEY = "evidencebrain-follows-v1";
const RESULT_KEY = "evidencebrain-results-v1";
const META_KEY = "evidencebrain-meta-v1";

export function loadMatches() {
  try {
    const raw = localStorage.getItem(MATCH_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch {
    /* ignore broken storage */
  }
  return seed;
}

export function saveMatches(rows) {
  localStorage.setItem(MATCH_KEY, JSON.stringify(rows));
}

export function mergeImported(existing, current) {
  const byId = new Map((existing || []).map((m) => [m.jcId || m.id, m]));
  for (const row of current.matches) {
    const existingRow = byId.get(row.jcId) || { id: row.jcId, jcId: row.jcId };
    byId.set(row.jcId, {
      ...existingRow,
      ...row,
      jc: {
        imported: true,
        jc_points: row.jc_points,
        snapshot_at: row.snapshot_at,
        had: row.had,
        hhad: row.hhad,
        hhad_line: row.hhad_line,
      },
      businessDate: row.businessDate,
      leagueAbbName: row.leagueAbbName || existingRow.leagueAbbName,
      kickoffAt: row.kickoffAt || existingRow.kickoffAt,
      home: row.home || existingRow.home,
      away: row.away || existingRow.away,
    });
  }
  return [...byId.values()];
}

export function getSlate(now = new Date()) {
  return buildSlate(loadMatches(), now);
}

function loadMeta() {
  try {
    return JSON.parse(localStorage.getItem(META_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveMeta(patch) {
  const next = { ...loadMeta(), ...patch };
  localStorage.setItem(META_KEY, JSON.stringify(next));
  return next;
}

export function importJc(body, filename = "") {
  const current = normalizeImport(body, new Date(), filename);
  if (!current.ok) return { ...current, red: true };
  let prev = null;
  try {
    prev = JSON.parse(localStorage.getItem(LAST_KEY) || "null");
  } catch {
    prev = null;
  }
  const receipt = importReceipt(current, prev);
  saveMatches(mergeImported(loadMatches(), current));
  localStorage.setItem(LAST_KEY, JSON.stringify(current));
  saveMeta({ lastImportAt: new Date().toISOString(), lastImportKind: "pools", lastImportFile: filename });
  return receipt;
}

export function importResultsPayload(body, filename = "") {
  const current = normalizeResults(body, filename);
  if (!current.ok) return { ...current, red: true };
  const prev = loadResults();
  const byId = new Map(prev.map((r) => [r.jcId, r]));
  for (const row of current.results) {
    if (row.jcId) byId.set(row.jcId, { ...byId.get(row.jcId), ...row });
  }
  const rows = [...byId.values()];
  localStorage.setItem(RESULT_KEY, JSON.stringify(rows));
  saveMeta({ lastResultAt: new Date().toISOString(), lastImportFile: filename });
  return { ok: true, kind: "results", filename, count: current.count, total: rows.length };
}

export function loadResults() {
  try {
    const raw = localStorage.getItem(RESULT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function loadFollows() {
  try {
    const raw = localStorage.getItem(FOLLOW_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function toggleFollow(jcId) {
  const set = new Set(loadFollows());
  if (set.has(jcId)) set.delete(jcId);
  else set.add(jcId);
  const rows = [...set];
  localStorage.setItem(FOLLOW_KEY, JSON.stringify(rows));
  return rows;
}

export function getMeta() {
  return loadMeta();
}

export async function importFiles(fileList, forcedKind = null) {
  const files = [...(fileList || [])];
  const receipts = [];
  for (const file of files) {
    const text = await file.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch (e) {
      receipts.push({ ok: false, red: true, filename: file.name, error: `不是 JSON：${e.message}` });
      continue;
    }
    const kind = forcedKind || classifyFilename(file.name);
    if (kind === "results") receipts.push({ ...importResultsPayload(body, file.name), filename: file.name });
    else receipts.push({ ...importJc(body, file.name), filename: file.name });
  }
  return receipts;
}

export function getBoard() {
  let history = [];
  try {
    history = JSON.parse(localStorage.getItem(HIST_KEY) || "[]");
  } catch {
    history = [];
  }
  const slate = getSlate();
  return {
    slate: slate.matches.map((m) => ({
      id: m.id,
      jcId: m.jcId,
      verdict: m.verdict,
      pinChangedAt: m.pinChangedAt,
    })),
    stats: boardStats(history),
  };
}

export function getExport() {
  return exportDay(getSlate());
}

export function downloadJson(name, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export async function serverAlive() {
  try {
    const r = await fetch("/api/health", { cache: "no-store" });
    if (!r.ok) return false;
    const j = await r.json();
    return j?.ok === true && j?.name === "EvidenceBrain";
  } catch {
    return false;
  }
}
