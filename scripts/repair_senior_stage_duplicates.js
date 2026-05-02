const { getOfficials, saveOfficials } = require("./lib/store");

function normalize(text) {
  return String(text || "")
    .replace(/^[\u4e00-\u9fa5]{2,8}省/, "")
    .replace(/^[\u4e00-\u9fa5]{2,8}自治区/, "")
    .replace(/党组书记|党组副书记|党组成员|党委书记|党委副书记|党委委员/g, "")
    .replace(/市委党校（[^）]*）?/g, "")
    .replace(/市委党校|党校校长|第一校（院）长|第一校院长|第一书记|第一政委/g, "")
    .replace(/代市长/g, "市长")
    .replace(/副市长（常务）/g, "常务副市长")
    .replace(/[，、,；;（）()\s]/g, "")
    .trim();
}

function localityOf(text) {
  const stripped = String(text || "")
    .replace(/^[\u4e00-\u9fa5]{2,8}省/, "")
    .replace(/^[\u4e00-\u9fa5]{2,8}自治区/, "");
  const match = stripped.match(/([\u4e00-\u9fa5]{2,10}(?:市|州|盟))(?:委|政府|人大|政协|军分区|警备区|开发区|新区|$)/);
  return match ? match[1] : "";
}

function stageFamily(text) {
  const input = String(text || "");
  if (/(常务副市长|副市长（常务）|常务副省长|副省长（常务）)/.test(input)) return "execdeputy";
  if (/副书记/.test(input) && /(市长|省长|主席)/.test(input)) return "mayor";
  if (/书记/.test(input)) return "secretary";
  if (/(副市长|副省长|副主席)/.test(input)) return "deputy";
  return "";
}

function equivalent(a, b) {
  const leftLocality = localityOf(a);
  const rightLocality = localityOf(b);
  if (!leftLocality || !rightLocality || leftLocality !== rightLocality) return false;
  const leftFamily = stageFamily(a);
  const rightFamily = stageFamily(b);
  return leftFamily && leftFamily === rightFamily;
}

function score(text) {
  const input = String(text || "");
  let total = 0;
  if (/书记/.test(input) && /人大常委会主任/.test(input)) total += 8;
  if (/书记/.test(input) && /(市长|省长|主席)/.test(input)) total += 7;
  if (/副书记/.test(input) && /(市长|省长|主席)/.test(input) && !/代市长|代省长|代主席/.test(input)) total += 6;
  if (/代市长|代省长|代主席/.test(input)) total += 4;
  if (/常委/.test(input) && /(常务副市长|常务副省长)/.test(input)) total += 5;
  if (/常委/.test(input)) total += 2;
  if (/人大常委会主任/.test(input)) total += 2;
  total += Math.min(input.length / 18, 3);
  return total;
}

function prefer(a, b) {
  return score(a) >= score(b) ? a : b;
}

function repairPositions(positions) {
  const kept = [];
  for (const position of positions || []) {
    const cleaned = String(position || "").trim();
    if (!cleaned) continue;
    const existingIndex = kept.findIndex((item) => equivalent(item, cleaned) || normalize(item) === normalize(cleaned));
    if (existingIndex === -1) {
      kept.push(cleaned);
      continue;
    }
    kept[existingIndex] = prefer(kept[existingIndex], cleaned);
  }
  return kept;
}

const officials = getOfficials();
let changed = 0;

for (const official of officials) {
  if (!["国家级", "省部级"].includes(official.level)) continue;
  const before = JSON.stringify(official.previousPositions || []);
  official.previousPositions = repairPositions(official.previousPositions || []);
  const after = JSON.stringify(official.previousPositions || []);
  if (before !== after) {
    official.updatedAt = new Date().toISOString();
    changed += 1;
    console.log(`已压缩重复阶段：${official.name}`);
  }
}

saveOfficials(officials);
console.log(`完成，共修正 ${changed} 名高级别官员的重复阶段。`);
