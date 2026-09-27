import express from "express";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readJson, writeJson } from "./store.js";
import { buildSlate, exportDay, boardStats } from "./slate.js";
import { normalizeImport, importReceipt } from "../data/jcImport.js";
import { fetchPinnacle } from "../data/titan.js";
import { matchDetails, matchesByDate, tryFpl, tryTransfermarkt, lineupFromDetails, unavailableFromDetails } from "../data/fotmob.js";
import { createHash } from "node:crypto";

const __dir = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const app = express();
app.use(express.json({ limit: "4mb" }));

function hashObj(x) {
  return createHash("sha256").update(JSON.stringify(x)).digest("hex");
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, name: "EvidenceBrain", motto: "方向跟证据，盘口只对照" });
});

app.get("/api/slate", async (_req, res) => {
  const matches = await readJson("matches.json", []);
  const now = new Date();
  res.json(buildSlate(matches, now));
});

app.get("/api/board", async (_req, res) => {
  const matches = await readJson("matches.json", []);
  const history = await readJson("history.json", []);
  const slate = buildSlate(matches, new Date());
  res.json({
    slate: slate.matches.map((m) => ({
      id: m.id,
      jcId: m.jcId,
      sharp1x2: m.books.euro
        ? {
            home: m.books.euro.raw?.home,
            draw: m.books.euro.raw?.draw,
            away: m.books.euro.raw?.away,
            book_id: 177,
            odds_format: m.books.euro.odds_format,
            changed_at: m.books.euro.changed_at,
            fetched_at: m.books.euro.fetched_at,
          }
        : null,
      pinChangedAt: m.pinChangedAt,
      euroOwnTime: m.euroOwnTime,
      ah: m.books.ah,
      ou: m.books.ou,
      fit: m.fit.ok
        ? { lh: m.fit.lambdaHome, la: m.fit.lambdaAway, back: m.fitCheck.independentBack, euroDiffs: m.fitCheck.euroDiffs }
        : { ok: false, reason: m.fit.reason },
      verdict: m.verdict,
    })),
    stats: boardStats(history),
  });
});

app.get("/api/export", async (_req, res) => {
  const matches = await readJson("matches.json", []);
  const slate = buildSlate(matches, new Date());
  const body = exportDay(slate);
  res.setHeader("Content-Disposition", "attachment; filename=evidencebrain-export.json");
  res.json(body);
});

app.post("/api/import", async (req, res) => {
  const current = normalizeImport(req.body);
  if (!current.ok) return res.status(400).json(current);
  const prev = await readJson("jc-last.json", null);
  const receipt = importReceipt(current, prev);
  const matches = await readJson("matches.json", []);
  const byId = new Map(matches.map((m) => [m.jcId || m.id, m]));
  for (const row of current.matches) {
    const existing = byId.get(row.jcId) || { id: row.jcId, jcId: row.jcId };
    byId.set(row.jcId, {
      ...existing,
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
      leagueAbbName: row.leagueAbbName || existing.leagueAbbName,
      kickoffAt: row.kickoffAt || existing.kickoffAt,
      home: row.home || existing.home,
      away: row.away || existing.away,
    });
  }
  await writeJson("matches.json", [...byId.values()]);
  await writeJson("jc-last.json", current);
  await writeJson("weights.json", (await readJson("weights.json", { lock: null })) );
  res.json(receipt);
});

app.post("/api/refresh/:id", async (req, res) => {
  const matches = await readJson("matches.json", []);
  const m = matches.find((x) => x.id === req.params.id || x.jcId === req.params.id);
  if (!m) return res.status(404).json({ error: "比赛不存在" });
  const tried = [];
  if (m.titan_id) {
    const pin = await fetchPinnacle(m.titan_id);
    m.pinnacle = {
      ah: pin.ah,
      ou: pin.ou,
      euro: pin.euro,
    };
    m.pinnacle_meta = { hashes: pin.hashes, tried: pin.tried, fetched_at: pin.fetched_at };
    tried.push(...pin.tried);
  }
  if (m.fotmob_id) {
    const det = await matchDetails(m.fotmob_id);
    tried.push({ url: det.url, ok: det.ok, reason: det.reason });
    if (det.ok) {
      const lu = lineupFromDetails(det.json);
      m.lineup = lu;
      const players = unavailableFromDetails(det.json);
      m.injuries = {
        players,
        injury_tried: true,
        injury_source: "fotmob",
        injury_source_url: `https://www.fotmob.com/match/${m.fotmob_id}`,
        fetched_at: new Date().toISOString(),
        name_map_ok: m.nameMap?.ok !== false,
        hasList: players.length > 0,
        emptyOfficial: players.length === 0,
        raw_hash: det.hash,
      };
    } else {
      m.injuries = {
        ...(m.injuries || {}),
        injury_tried: true,
        injury_tried_detail: [{ source: "fotmob", reason: det.reason }],
      };
    }
  }
  const fpl = await tryFpl();
  const tm = await tryTransfermarkt();
  tried.push({ source: "FPL", ...fpl }, { source: "Transfermarkt", ...tm });
  await writeJson("matches.json", matches);
  res.json({ ok: true, match: m, tried });
});

app.post("/api/fotmob-day", async (req, res) => {
  const ymd = req.body?.date || new Date().toISOString().slice(0, 10);
  const box = await matchesByDate(ymd);
  res.json(box);
});

app.get("/api/weights", async (_req, res) => {
  const w = await readJson("weights.json", { items: {}, lock: null });
  if (!w.lock) {
    w.lock = { at: new Date().toISOString(), hash: hashObj(w.items) };
    await writeJson("weights.json", w);
  }
  res.json(w);
});

const dist = join(__dir, "../../dist");
app.use(express.static(dist));
app.get(/.*/, (_req, res) => {
  res.sendFile(join(dist, "index.html"), (err) => {
    if (err) res.type("html").send("<!doctype html><meta charset=utf-8><p>请先 npm run build</p>");
  });
});

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`EvidenceBrain http://127.0.0.1:${PORT}`);
  });
}

export default app;
