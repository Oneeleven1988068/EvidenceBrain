/** Asia/Hong_Kong helpers. Page times are always HKT. */

export const HKT = "Asia/Hong_Kong";

export function hktWall(year, month, day, hour = 0, minute = 0, second = 0) {
  return new Date(Date.UTC(year, month - 1, day, hour - 8, minute, second));
}

export function inHkt(date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: HKT,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  const weekMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: weekMap[get("weekday")],
  };
}

export function formatHkt(date) {
  if (!date) return "";
  const t = inHkt(new Date(date));
  const hh = String(t.hour).padStart(2, "0");
  const mm = String(t.minute).padStart(2, "0");
  return `${hh}:${mm} HKT`;
}

export function formatHktDateTime(date) {
  if (!date) return "";
  const t = inHkt(new Date(date));
  const hh = String(t.hour).padStart(2, "0");
  const mm = String(t.minute).padStart(2, "0");
  return `${t.year}-${String(t.month).padStart(2, "0")}-${String(t.day).padStart(2, "0")} ${hh}:${mm} HKT`;
}

export function utcIsoToHkt(iso) {
  if (!iso) return "";
  return formatHktDateTime(iso);
}

export function parseYmd(ymd) {
  const [y, m, d] = String(ymd).split("-").map(Number);
  if (!y || !m || !d) throw new Error(`invalid date ${ymd}`);
  return { year: y, month: m, day: d };
}

export function weekdayOfYmd(ymd) {
  const { year, month, day } = parseYmd(ymd);
  return inHkt(hktWall(year, month, day, 12, 0)).weekday;
}

export function addDaysYmd(ymd, days) {
  const { year, month, day } = parseYmd(ymd);
  const dt = hktWall(year, month, day, 12, 0);
  dt.setUTCDate(dt.getUTCDate() + days);
  const t = inHkt(dt);
  return `${t.year}-${String(t.month).padStart(2, "0")}-${String(t.day).padStart(2, "0")}`;
}
