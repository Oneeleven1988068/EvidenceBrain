import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  getMeta,
  getSlate,
  importFiles,
  loadFollows,
  loadResults,
  toggleFollow,
} from "./localApi.js";

const WEEK = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function hktNow(d = new Date()) {
  return new Date(d.toLocaleString("en-US", { timeZone: "Asia/Hong_Kong" }));
}

function fmtClock(d = new Date()) {
  const h = hktNow(d);
  return `${String(h.getMonth() + 1).padStart(2, "0")}/${String(h.getDate()).padStart(2, "0")} ${String(h.getHours()).padStart(2, "0")}:${String(h.getMinutes()).padStart(2, "0")}`;
}

function fmtHm(iso) {
  if (!iso) return "—";
  const h = new Date(new Date(iso).toLocaleString("en-US", { timeZone: "Asia/Hong_Kong" }));
  return `${String(h.getHours()).padStart(2, "0")}:${String(h.getMinutes()).padStart(2, "0")}`;
}

function fmtMdHm(iso) {
  if (!iso) return "—";
  const h = new Date(new Date(iso).toLocaleString("en-US", { timeZone: "Asia/Hong_Kong" }));
  return `${String(h.getMonth() + 1).padStart(2, "0")}/${String(h.getDate()).padStart(2, "0")} ${String(h.getHours()).padStart(2, "0")}:${String(h.getMinutes()).padStart(2, "0")}`;
}

function weekdayLabel(ymd) {
  if (!ymd) return "";
  const [y, m, d] = String(ymd).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return WEEK[dt.getUTCDay()];
}

function isLive(m, now) {
  if (!m.kickoffAt && !m.close?.kickoffClose) return false;
  const ko = new Date(m.kickoffAt || now);
  const end = new Date(ko.getTime() + 2 * 60 * 60 * 1000);
  return now >= ko && now <= end;
}

function pinLine(m) {
  const ah = m.books?.ah?.[0];
  if (!ah) return "Pinnacle 未拉到";
  const side = ah.line > 0 ? "主受" : ah.line < 0 ? "主让" : "平手";
  return `Pinnacle ${side} ${Math.abs(ah.line)} ${Number(ah.home).toFixed(2)} / ${Number(ah.away).toFixed(2)}`;
}

function jcHandicap(m) {
  const line = m.jc?.hhad_line ?? m.hhadName;
  if (line == null || line === "") return "竞彩 未开让球";
  const n = Number(line);
  if (!Number.isFinite(n)) return `竞彩 ${line}`;
  return `竞彩 ${n > 0 ? "+" : ""}${n}`;
}

function ticketText(m) {
  const peak = m.verdict?.peak;
  if (!m.verdict?.canBet) return "不出票";
  if (!peak) return "不出票";
  if (peak.key === "home") return "让胜";
  if (peak.key === "away") return "让负";
  return "让平";
}

function leanText(m) {
  const k = m.verdict?.peak?.key;
  if (k === "home") return "体倾向 · 主胜";
  if (k === "away") return "体倾向 · 客胜";
  if (k === "draw") return "体倾向 · 平";
  return "体倾向 · 未判";
}

function groupMatches(matches) {
  const days = new Map();
  for (const m of matches) {
    const day = m.close?.businessDate || m.jcId?.slice(0, 2) || "未知";
    const league = m.league?.name || m.league?.code || "其他";
    if (!days.has(day)) days.set(day, new Map());
    const leagues = days.get(day);
    if (!leagues.has(league)) leagues.set(league, []);
    leagues.get(league).push(m);
  }
  return [...days.entries()];
}

export default function App() {
  const [tab, setTab] = useState("list");
  const [slate, setSlate] = useState(null);
  const [q, setQ] = useState("");
  const [follows, setFollows] = useState(() => loadFollows());
  const [results, setResults] = useState(() => loadResults());
  const [open, setOpen] = useState(null);
  const [followMode, setFollowMode] = useState("live");
  const [openDays, setOpenDays] = useState(() => new Set());
  const [poolFiles, setPoolFiles] = useState(0);
  const [resultFiles, setResultFiles] = useState(0);
  const [receipts, setReceipts] = useState([]);
  const [clock, setClock] = useState(fmtClock());
  const poolRef = useRef(null);
  const resultRef = useRef(null);

  function reload() {
    setSlate(getSlate());
    setFollows(loadFollows());
    setResults(loadResults());
  }

  useEffect(() => {
    reload();
    const t = setInterval(() => setClock(fmtClock()), 30000);
    return () => clearInterval(t);
  }, []);

  const now = new Date();
  const matches = slate?.matches || [];
  const filtered = useMemo(() => {
    const s = q.trim();
    return matches.filter((m) => {
      if (!s) return true;
      const blob = `${m.home} ${m.away} ${m.jcId} ${m.league?.name || ""}`;
      return blob.includes(s);
    });
  }, [matches, q]);

  const upcoming = matches.filter((m) => !isLive(m, now) && new Date(m.kickoffAt || 0) > now);
  const live = matches.filter((m) => isLive(m, now));
  const pinReady = matches.filter((m) => m.books?.ah?.length).length;
  const meta = getMeta();

  const followed = matches.filter((m) => follows.includes(m.jcId || m.id));
  const followView = followMode === "live" ? live : followed;

  const grouped = groupMatches(filtered);
  const resultGroups = useMemo(() => {
    const map = new Map();
    for (const r of results) {
      const day = r.date || "未知";
      if (!map.has(day)) map.set(day, []);
      map.get(day).push(r);
    }
    return [...map.entries()].sort((a, b) => String(b[0]).localeCompare(String(a[0])));
  }, [results]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><span className="logo">EB</span> EvidenceBrain</div>
        <div className="clock">{clock}</div>
      </header>

      {tab === "list" && (
        <>
          <input className="search" placeholder="搜球队或联赛" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="status">
            {upcoming.length}场未开赛 · 封盘结论周一至周五21:45，周六日22:45
            <br />
            {meta.lastImportAt ? `${fmtMdHm(meta.lastImportAt)}刷新 · 写入中` : "尚未导入体彩 JSON"}
            <br />
            正在拉球探盘口和竞彩保存…
            <br />
            {matches.length - pinReady}场盘未齐，导入赛程后会自动拉。
          </div>
          {grouped.map(([day, leagues]) => (
            <section key={day}>
              <div className="dayhead">{weekdayLabel(day)} · {String(day).slice(5).replace("-", "/")}</div>
              {[...leagues.entries()].map(([league, rows]) => (
                <LeagueBlock key={league} league={league} rows={rows} now={now} follows={follows} onStar={star} onOpen={setOpen} />
              ))}
            </section>
          ))}
          {filtered.length === 0 && <p className="muted">没有场次。到导入页选择体彩 JSON。</p>}
        </>
      )}

      {tab === "follow" && (
        <>
          <div className="seg">
            <button className={followMode === "star" ? "on" : ""} onClick={() => setFollowMode("star")}>已关注 {follows.length}</button>
            <button className={followMode === "live" ? "on" : ""} onClick={() => setFollowMode("live")}>已开赛 {live.length}</button>
          </div>
          <div className="status">{followView.length}场进行中</div>
          {groupMatches(followView).map(([day, leagues]) => (
            <section key={day}>
              <div className="dayhead">{weekdayLabel(day)} · {String(day).slice(5).replace("-", "/")}</div>
              {[...leagues.entries()].map(([league, rows]) => (
                <LeagueBlock key={league} league={league} rows={rows} now={now} follows={follows} onStar={star} onOpen={setOpen} />
              ))}
            </section>
          ))}
          {followView.length === 0 && <p className="muted">还没有关注或进行中的场次。</p>}
        </>
      )}

      {tab === "result" && (
        <Results results={resultGroups} openDays={openDays} setOpenDays={setOpenDays} />
      )}

      {tab === "import" && (
        <Import
          matches={matches}
          pinReady={pinReady}
          poolFiles={poolFiles}
          resultFiles={resultFiles}
          poolRef={poolRef}
          resultRef={resultRef}
          receipts={receipts}
          onPools={async (files) => {
            const out = await importFiles(files, "pools");
            setPoolFiles(files.length);
            setReceipts(out);
            reload();
          }}
          onResults={async (files) => {
            const out = await importFiles(files, "results");
            setResultFiles(files.length);
            setReceipts(out);
            reload();
          }}
        />
      )}

      {open && <Detail m={open} onClose={() => setOpen(null)} />}

      <nav className="nav">
        <button className={tab === "list" ? "on" : ""} onClick={() => setTab("list")}><span className="ic">▦</span>赛事</button>
        <button className={tab === "follow" ? "on" : ""} onClick={() => setTab("follow")}>
          <span className="ic">☆</span>{follows.length > 0 && <i className="badge">{follows.length}</i>}关注
        </button>
        <button className={tab === "result" ? "on" : ""} onClick={() => setTab("result")}><span className="ic">≡</span>赛果</button>
        <button className={tab === "import" ? "on" : ""} onClick={() => setTab("import")}><span className="ic">↑</span>导入</button>
      </nav>
    </div>
  );

  function star(id, ev) {
    ev.stopPropagation();
    setFollows(toggleFollow(id));
  }
}

function LeagueBlock({ league, rows, now, follows, onStar, onOpen }) {
  return (
    <>
      <div className="league-h"><span><i className="dot" />{league} {rows.length}</span><span>⌃</span></div>
      {rows.map((m) => (
        <article key={m.jcId || m.id} className="mcard" onClick={() => onOpen(m)}>
          <div className="mcard-top">
            <span><i className={`dot ${isLive(m, now) ? "" : "gray"}`} />{m.league?.name} {fmtHm(m.kickoffAt)}{isLive(m, now) ? " 进行中" : ""}</span>
            <span>
              {m.jcId}
              <button className={`star ${follows.includes(m.jcId || m.id) ? "on" : ""}`} onClick={(e) => onStar(m.jcId || m.id, e)}>☆</button>
            </span>
          </div>
          <div className="versus">
            <div><b>{m.home}</b><small>{m.standing?.home?.rank ?? m.homeRank ?? ""}</small></div>
            <div className="mid">对阵</div>
            <div><b>{m.away}</b><small>{m.standing?.away?.rank ?? m.awayRank ?? ""}</small></div>
          </div>
          <div className="mmeta">
            <span className="mpill">{leanText(m)}</span>
            {jcHandicap(m)}<br />
            {pinLine(m)}<br />
            封盘 {fmtMdHm(m.close?.close_at)} · 让球{ticketText(m) === "不出票" ? "让负" : ticketText(m)} / {ticketText(m)}
            {m.guangshi?.diffText && (
              <div className="gs-line">GD {m.guangshi.diff} · {m.guangshi.diffText} · {m.guangshi.distribution?.kind || ""}</div>
            )}
          </div>
        </article>
      ))}
    </>
  );
}

function Import({ matches, pinReady, poolFiles, resultFiles, poolRef, resultRef, onPools, onResults, receipts }) {
  return (
    <section>
      <div className="h1">导入</div>
      <p className="muted">只接体彩 JSON。赛程导入后自动拉欧盘，之后白天两小时、晚 20:30–22:00 半小时一刷新。</p>
      <p className="muted">盘口 {pinReady} / 赛程 {matches.length}</p>
      <p className="muted">球探对齐 · Pinnacle 1×2 · AH · FotMob 情报 · 伤停 · 竞彩保存 {matches.filter((m) => m.jc?.imported).length} 场</p>
      <p className="h1" style={{ fontSize: 18, marginTop: 22 }}>赛程 JSON</p>
      <p className="muted">sporttery_*pools_*.json，可多选，时点会累加。</p>
      <button className="drop" onClick={() => poolRef.current?.click()}>
        <div style={{ color: "#d0d0d4", fontSize: 22 }}>↑</div>
        <b>选择赛程 JSON</b>
        <span>可多选</span>
      </button>
      <input ref={poolRef} type="file" accept=".json,application/json" multiple hidden onChange={(e) => onPools([...e.target.files])} />
      <button className="import-btn">导入 {poolFiles} 个文件</button>
      <p className="h1" style={{ fontSize: 18 }}>赛果 JSON</p>
      <p className="muted">sporttery_*results_*.json，可多选分页。</p>
      <button className="drop" onClick={() => resultRef.current?.click()}>
        <div style={{ color: "#d0d0d4", fontSize: 22 }}>↑</div>
        <b>选择赛果 JSON</b>
        <span>可多选</span>
      </button>
      <input ref={resultRef} type="file" accept=".json,application/json" multiple hidden onChange={(e) => onResults([...e.target.files])} />
      <button className="import-btn">导入 {resultFiles} 个文件</button>
      {receipts?.length > 0 && receipts.map((r, i) => (
        <p key={`${r.filename || i}-${i}`} className={r.ok ? "muted" : "warn"}>
          {r.ok
            ? `${r.filename || "文件"} · ${r.kind === "results" ? `赛果 ${r.count}` : `赛程 ${r.count}`} 场已写入`
            : `${r.filename || "文件"} · 导入失败：${r.error || "未知错误"}`}
        </p>
      ))}
    </section>
  );
}

function Results({ results, openDays, setOpenDays }) {
  return (
    <section>
      <p className="muted">全部推荐命中 — · 单选 —</p>
      <p className="muted">相对封盘 CLV —</p>
      {results.length === 0 && <p className="muted">还没有赛果。到导入页选择 sporttery_*results_*.json。</p>}
      {results.map(([day, rows]) => {
        const open = openDays.has(day);
        return (
          <div key={day}>
            <button
              className="acc"
              onClick={() => {
                const next = new Set(openDays);
                if (next.has(day)) next.delete(day);
                else next.add(day);
                setOpenDays(next);
              }}
            >
              <span>{open ? "∨" : ">"} {weekdayLabel(day)} · {String(day).slice(5).replace("-", "/")} · {rows.length}场</span>
              <span>推荐 0 · 错 0</span>
            </button>
            {open && rows.map((r) => (
              <div key={r.jcId} className="resrow">
                <div className="name"><span className="tag">观察</span>{r.home} vs {r.away}</div>
                <div className="muted">{r.jcId} · {r.scoreText || (r.homeScore != null ? `${r.homeScore}:${r.awayScore}` : "未完")}{r.half ? ` · 半 ${r.half}` : ""} · 空过 · 不对账</div>
              </div>
            ))}
          </div>
        );
      })}
    </section>
  );
}

function Detail({ m, onClose }) {
  const g = m.guangshi;
  return (
    <div className="sheet">
      <button className="back" onClick={onClose}>返回</button>
      <div className="versus">
        <div><b>{m.home}</b><small>{m.standing?.home?.rank ?? m.homeRank ?? ""}</small></div>
        <div className="mid">{m.jcId}</div>
        <div><b>{m.away}</b><small>{m.standing?.away?.rank ?? m.awayRank ?? ""}</small></div>
      </div>
      <div className="kv"><span>联赛</span><b>{m.league?.name}</b></div>
      <div className="kv"><span>封盘</span><b>{fmtMdHm(m.close?.close_at)}</b></div>
      <div className="kv"><span>竞彩</span><b>{jcHandicap(m)}</b></div>
      <div className="kv"><span>平博</span><b>{pinLine(m)}</b></div>
      <div className="kv"><span>结论</span><b>{m.verdict?.title} · {leanText(m)}</b></div>
      <p className="warn">广实差只反映谁强、强多少，不直接当赛果。数学广实只校准。赔率含抽水，无稳赢。</p>
      {g && (
        <>
          <div className="gs-line">
            GD {g.diff ?? "?"} · {g.diffText || "差未定"} · {g.distribution?.kind || "分布未定"} · {g.oddsCheck?.kind || g.vs?.kind || "—"}
          </div>
          <div className="muted">
            {g.rulers?.authority?.label || "当轮权威"} {g.home?.name || "?"} / {g.away?.name || "?"}
            {g.rulers?.authority?.venueDragon?.home || g.rulers?.authority?.venueDragon?.away ? " · 含主客场龙" : ""}
          </div>
          <div className="muted">
            数学广实 {g.rulers?.math?.homeSide?.name || "未接入"} / {g.rulers?.math?.awaySide?.name || "未接入"}
            {g.rulers?.math?.diff != null ? ` · 差 ${g.rulers.math.diff}` : ""} · 只校准
          </div>
          <div className="muted">{g.motto}</div>
          {g.locate && (
            <>
              <div className="muted">
                定位 主 {g.locate.home?.image?.role || "未定"} · {g.locate.home?.recent?.trend || "近况未知"}
                {g.locate.home?.recent?.venue ? ` · ${g.locate.home.recent.venue}` : ""}
                {" / "}客 {g.locate.away?.image?.role || "未定"} · {g.locate.away?.recent?.trend || "近况未知"}
              </div>
              {g.locate.home?.coldUpset === false && <p className="muted">{g.locate.home.note}</p>}
              {g.locate.away?.coldUpset === false && <p className="muted">{g.locate.away.note}</p>}
              {g.locate.derby?.drawBias && <p className="muted">{g.locate.derby.note}</p>}
            </>
          )}
          {g.rulers?.drift?.halfTier && <p className="warn">半档已偏：数学广实提醒权威可能走远，但不能越过权威替它做决定。</p>}
          {g.rulers?.revisions?.some((r) => r.role === "提醒") && <p className="muted">一场球可以提醒，不能单独判刑。</p>}
          {(g.rulers?.rank?.home?.kind === "排名恐慌" || g.rulers?.rank?.away?.kind === "排名恐慌") && (
            <p className="muted">排名制造恐慌：处境危险，真正实力位置没有一起掉下去。</p>
          )}
          {g.rulers?.quality?.home?.cheapWins > 0 && <p className="muted">{g.rulers.quality.home.note}</p>}
        </>
      )}
    </div>
  );
}
