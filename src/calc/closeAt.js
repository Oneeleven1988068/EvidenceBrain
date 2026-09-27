import { addDaysYmd, hktWall, parseYmd, weekdayOfYmd } from "./time.js";

/**
 * Item 41 / 59.
 * close_at = min(kickoff − 30min, same-sales-day close line).
 * Weekday comes from businessDate (销售日), never matchDate.
 * Mon–Fri line 21:45, Sat–Sun 22:45 HKT.
 */

const WEEKDAY_NAMES = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

export function dailyCloseLine(businessDate) {
  if (!businessDate) {
    throw new Error("没有 businessDate");
  }
  const wd = weekdayOfYmd(businessDate);
  const { year, month, day } = parseYmd(businessDate);
  const hour = wd === 0 || wd === 6 ? 22 : 21;
  const minute = 45;
  return {
    at: hktWall(year, month, day, hour, minute),
    weekday: wd,
    weekdayName: WEEKDAY_NAMES[wd],
    label: `${WEEKDAY_NAMES[wd]} ${String(hour).padStart(2, "0")}:${minute} HKT`,
  };
}

export function closeAt({ businessDate, kickoffAt }) {
  if (!businessDate) {
    return { ok: false, error: "没有 businessDate", close_at: null };
  }
  if (!kickoffAt) {
    return { ok: false, error: "开球时间缺失", close_at: null };
  }
  const line = dailyCloseLine(businessDate);
  const kickoff = new Date(kickoffAt);
  const kickoffClose = new Date(kickoff.getTime() - 30 * 60 * 1000);
  const at = kickoffClose < line.at ? kickoffClose : line.at;
  return {
    ok: true,
    close_at: at.toISOString(),
    closeAtDate: at,
    dailyLine: line.at.toISOString(),
    kickoffClose: kickoffClose.toISOString(),
    businessDate,
  };
}

/**
 * Item 41 16:28 + 59. Six mutually exclusive JC states.
 * 临盘 / 封盘价 / 封盘快照不足 / 体彩封盘价缺失 / 销售日未接入 / 体彩价未抓取
 */
export function jcSnap({
  now,
  businessDate,
  close_at,
  snapshot_at,
  imported,
  jc_points,
}) {
  if (!businessDate) {
    return { status: "销售日未接入", usable: false, note: "没有 businessDate" };
  }
  if (imported === false || jc_points === 0) {
    return { status: "体彩价未抓取", usable: false, note: "服务器没收到导入" };
  }
  if (!close_at) {
    return { status: "销售日未接入", usable: false, note: "close_at 算不出" };
  }
  const t = new Date(now);
  const close = new Date(close_at);
  if (t < close) {
    return {
      status: "临盘",
      usable: true,
      note: snapshot_at
        ? `临盘价 ${formatHm(snapshot_at)}，非封盘价`
        : "临盘，尚未到封盘时点",
      snapshot_at: snapshot_at || null,
    };
  }
  if (!snapshot_at) {
    return { status: "体彩封盘价缺失", usable: false, note: "过了封盘时点且一个价都没有" };
  }
  const snap = new Date(snapshot_at);
  const deltaMs = close.getTime() - snap.getTime();
  if (deltaMs >= 0 && deltaMs <= 15 * 60 * 1000) {
    return { status: "封盘价", usable: true, snapshot_at, note: "封盘前 15 分钟内" };
  }
  if (deltaMs > 15 * 60 * 1000) {
    return { status: "封盘快照不足", usable: false, snapshot_at, note: "只有更早的价" };
  }
  return { status: "封盘快照不足", usable: false, snapshot_at, note: "快照晚于封盘时点" };
}

function formatHm(iso) {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Hong_Kong",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const hh = parts.find((p) => p.type === "hour")?.value;
  const mm = parts.find((p) => p.type === "minute")?.value;
  return `${hh}:${mm}`;
}

export function importWindowsForDay(matches, now) {
  const byClose = new Map();
  for (const m of matches) {
    if (!m.close_at) continue;
    const key = m.close_at;
    if (!byClose.has(key)) byClose.set(key, []);
    byClose.get(key).push(m);
  }
  const windows = [];
  for (const [close, rows] of byClose) {
    const end = new Date(close);
    const start = new Date(end.getTime() - 15 * 60 * 1000);
    windows.push({
      close_at: close,
      importFrom: start.toISOString(),
      importTo: end.toISOString(),
      matchIds: rows.map((r) => r.id || r.jcId),
      passed: new Date(now) > end,
    });
  }
  windows.sort((a, b) => a.close_at.localeCompare(b.close_at));
  return windows;
}

export function nextImportWindow(windows, now) {
  const t = new Date(now);
  return windows.find((w) => new Date(w.importTo) > t) || null;
}

export { addDaysYmd };
