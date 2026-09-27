/**
 * Items 10–11, 14, 17, 44, 60–61.
 */

const YOUTH_SELF = /(\bu23\b|\bu21\b|国奥|青年队|youth)/i;

export function mapAbsenceType(raw) {
  const t = String(raw || "").toLowerCase();
  if (["injury", "injured", "suspension", "suspended", "internationalduty", "international", "out"].includes(t)) {
    return { status: "out", absence_type: raw };
  }
  if (["doubt", "doubtful", "questionable"].includes(t)) {
    return { status: "doubt", absence_type: raw };
  }
  return { status: raw === "out" ? "out" : raw || "unknown", absence_type: raw };
}

export function isYouthPlayerSelf(player) {
  const blob = `${player.name || ""} ${player.note || ""} ${player.teamType || ""}`;
  if (player.internationalDuty) return false;
  return YOUTH_SELF.test(blob) && /youth|青年|academy/i.test(player.teamType || player.note || "");
}

export function isOut(player) {
  if (isYouthPlayerSelf(player)) return false;
  const mapped = player.status || mapAbsenceType(player.absence_type || player.rawType).status;
  return mapped === "out" || player.internationalDuty === true;
}

export function startShareWeight(share) {
  if (share == null || Number.isNaN(Number(share))) {
    return { use: false, weight: 0, label: "权重缺失" };
  }
  const w = Number(share);
  if (w < 0.3) return { use: false, weight: w, label: "替补，只记账" };
  return { use: true, weight: w, label: "主力加权" };
}

const POS_FALLBACK = { GK: 0.2, F: 0.18, D: 0.14, M: 0.12 };

export function playerMul(player) {
  const share = startShareWeight(player.startShare);
  if (!share.use) {
    return { mul: 1, deduct: 0, booked: true, ...share, reason: share.label };
  }
  const pos = player.pos || player.position;
  const base = POS_FALLBACK[pos] ?? 0.12;
  const deduct = base * share.weight;
  return {
    mul: 1 - deduct,
    deduct,
    booked: true,
    ...share,
    reason: `${share.label} × 位置${pos || "?"} ${base}`,
  };
}

export function grossOf(players, side) {
  const used = [];
  const booked = [];
  let mul = 1;
  for (const p of players || []) {
    if (!isOut(p) || p.side !== side) continue;
    const r = playerMul(p);
    booked.push({ ...p, ...r });
    if (r.use) {
      mul *= r.mul;
      used.push({ ...p, ...r });
    }
  }
  const deduct = 1 - mul;
  const abnormal = deduct > 0.15;
  return {
    mul,
    deduct,
    used,
    booked,
    abnormal,
    flag: abnormal ? "伤停扣减异常" : null,
  };
}

export function injuryStatus(row) {
  if (row.injury_tried === false || row.injury_tried == null && !row.injury_source) {
    if (!row.fetched && !row.injury_tried) return { status: "伤停未抓取", entered: false };
  }
  if (row.injury_tried && !row.hasList && !row.emptyOfficial) {
    return {
      status: "扒不到",
      entered: false,
      tried: row.injury_tried_detail || [],
    };
  }
  if (row.emptyOfficial && row.name_map_ok && row.injury_source_url) {
    return { status: "公示无伤", entered: true, url: row.injury_source_url };
  }
  if (row.players?.length && (!row.injury_source_url || !row.fetched_at)) {
    return { status: "名单无来源，不进 μ", entered: false, players: row.players };
  }
  if (row.players?.length && row.injury_source_url && row.fetched_at) {
    return { status: "有名单", entered: true, players: row.players, url: row.injury_source_url, fetched_at: row.fetched_at };
  }
  if (row.emptyOfficial && !(row.name_map_ok && row.injury_source_url)) {
    return { status: "扒不到", entered: false, note: "空名单但队名未对上或无来源" };
  }
  return { status: "伤停未抓取", entered: false };
}

export function publishedOrOld(player) {
  if (!player.published_at) {
    return { residual: 0, note: "缺发布时间，按已进盘" };
  }
  return { residual: null, note: "有发布时间" };
}
