const crypto = require("crypto");
const { REGION_ALIASES, CENTRAL_HINTS } = require("./constants");

function isMilitaryCurrentPost(text) {
  const input = String(text || "");
  return /中央军委|军事委员会|国防部|联合参谋部|政治工作部|装备发展部|解放军|陆军|海军|空军|火箭军|武警|战区|军事科学院/.test(input);
}

function detectMilitaryRank(text) {
  const input = String(text || "");
  if (/上将/.test(input)) return "上将";
  if (/中将/.test(input)) return "中将";
  if (/少将/.test(input)) return "少将";
  if (/中共中央军事委员会副主席|中华人民共和国中央军事委员会副主席|中央军委委员|国防部部长|联合参谋部参谋长|军委政治工作部主任|装备发展部部长|战区司令员|战区政治委员|陆军司令员|海军司令员|空军司令员|火箭军司令员/.test(input)) {
    return "上将";
  }
  return "";
}

function makeId(name, investigationDate, sourceUrl) {
  const raw = `${name}|${investigationDate || ""}|${sourceUrl || ""}`;
  return crypto.createHash("sha1").update(raw).digest("hex").slice(0, 16);
}

function normalizeDate(input) {
  if (!input) return "";
  const text = String(input).trim();
  const match = text.match(/(\d{4})[.\-/年](\d{1,2})[.\-/月](\d{1,2})/);
  if (!match) return text;
  const year = match[1];
  const month = match[2].padStart(2, "0");
  const day = match[3].padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function detectRegion(text) {
  const input = text || "";
  if (isMilitaryCurrentPost(input)) {
    return "解放军";
  }
  for (const [alias, region] of Object.entries(REGION_ALIASES)) {
    if (input.includes(alias)) return region;
  }
  if (CENTRAL_HINTS.some((hint) => input.includes(hint))) {
    return "中央部委/央企";
  }
  return "中央部委/央企";
}

function detectLevel(text) {
  const input = (text || "")
    .replaceAll("中央纪委国家监委", " ")
    .replaceAll("中央纪委", " ")
    .replaceAll("国家监委", " ")
    .replaceAll("国家监察委员会", " ");
  const militaryRank = detectMilitaryRank(text);
  if (militaryRank) {
    return militaryRank;
  }
  const isCentralEnterprise =
    /中国.{0,24}(集团|总公司)|国家能源投资集团|中国中信集团|中国兵器|中国航空工业集团|中国电子科技集团|中国航天科技集团|中国航天科工集团/.test(
      input
    ) && /中央部委\/央企|党组|党委|董事长|总经理/.test(input);
  const isCentralInstitution =
    /中国工程院|国家体育总局|中国足协|中国足球协会|中国科协|国家开发银行总行|中国银行总行|中国工商银行总行|中国光大银行总行/.test(input);
  if (
    input.includes("中央政治局") ||
    input.includes("国务委员") ||
    input.includes("中央军委委员") ||
    input.includes("中共中央军事委员会副主席") ||
    input.includes("中华人民共和国中央军事委员会副主席")
  ) {
    return "国家级";
  }
  if (
    /(?:北京市|上海市|天津市|重庆市|北京|上海|天津|重庆).{0,12}市委常委/.test(input) ||
    /(?:北京市|上海市|天津市|重庆市|北京|上海|天津|重庆).{0,12}(副市长|市政协主席|市人大常委会主任)/.test(input)
  ) {
    return "省部级";
  }
  if (isCentralEnterprise && /(董事长|总经理|党组书记|党组副书记|党委书记|党委副书记)/.test(input)) {
    return "省部级";
  }
  if (isCentralInstitution && /(副院长|院长|副局长|局长|党委书记|党组书记|党组成员|副董事长|行长|书记)/.test(input)) {
    return "省部级";
  }
  if (
    input.includes("省长") ||
    input.includes("副省长") ||
    input.includes("省委书记") ||
    input.includes("省委常委") ||
    input.includes("省政协") ||
    input.includes("省人大") ||
    input.includes("部长") ||
    input.includes("副部长") ||
    input.includes("联合参谋部参谋长") ||
    input.includes("军委政治工作部主任") ||
    input.includes("装备发展部部长") ||
    input.includes("国防部部长") ||
    input.includes("党组书记") ||
    input.includes("董事长")
  ) {
    return "省部级";
  }
  return "厅局级";
}

function inferName(title) {
  const text = title || "";
  const roleLead = text.match(
    /(?:书记|副书记|省长|副省长|市长|副市长|主席|副主席|部长|副部长|董事长|总经理|局长|主任)([^，。,；：\s]{2,4})(?:涉嫌严重违纪违法|接受|被开除|被双开|被逮捕|被公诉)/
  );
  if (roleLead) return roleLead[1];
  const match = text.match(/([^，。,；：\s]{2,4})(?:涉嫌严重违纪违法|接受|被开除|被双开|被逮捕|被公诉)/);
  return match ? match[1] : text.slice(0, 4);
}

function mergeOfficial(existing, incoming) {
  const merged = {
    ...existing,
    ...incoming,
    aliases: uniqueList([...(existing.aliases || []), ...(incoming.aliases || [])]),
    sources: uniqueObjects([...(existing.sources || []), ...(incoming.sources || [])], "url"),
    timeline: mergeTimeline(existing.timeline || [], incoming.timeline || []),
    updatedAt: new Date().toISOString()
  };

  merged.status = pickStatus(merged.timeline);
  return merged;
}

function pickStatus(timeline) {
  const order = ["审查调查", "党纪政务处分", "移送司法", "逮捕", "起诉", "一审", "二审", "执行"];
  const sorted = [...timeline].sort((a, b) => {
    const ai = order.indexOf(a.stage);
    const bi = order.indexOf(b.stage);
    return ai - bi;
  });
  return sorted.length ? sorted[sorted.length - 1].stage : "审查调查";
}

function mergeTimeline(current, incoming) {
  const map = new Map();
  for (const item of [...current, ...incoming]) {
    const key = `${item.stage}|${item.date}|${item.url || ""}|${item.summary || ""}`;
    map.set(key, item);
  }
  return [...map.values()].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

function uniqueList(list) {
  return [...new Set(list.filter(Boolean))];
}

function uniqueObjects(list, key) {
  const map = new Map();
  for (const item of list) {
    if (!item || !item[key]) continue;
    map.set(item[key], item);
  }
  return [...map.values()];
}

module.exports = {
  makeId,
  normalizeDate,
  detectRegion,
  detectLevel,
  inferName,
  mergeOfficial
  ,
  isMilitaryCurrentPost,
  detectMilitaryRank
};
