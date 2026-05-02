const { getOfficials, saveOfficials } = require("./lib/store");
const { normalizePositionList, normalizePositionText, extractDetailHistoryPositions } = require("./lib/enrich");

function cleanSeniorOfficial(item) {
  const next = { ...item };
  next.lastPosition = normalizePositionText(next.lastPosition || "");
  const original = next.previousPositions || [];
  const detailPositions = extractDetailHistoryPositions(next);
  const merged = [...original, ...detailPositions];
  const filtered = merged.filter(
    (position) =>
      position &&
      (!next.lastPosition || (position !== next.lastPosition && !next.lastPosition.includes(position) && !position.includes(next.lastPosition)))
  );
  next.previousPositions = normalizePositionList(filtered, next);
  next.updatedAt = new Date().toISOString();
  return next;
}

function main() {
  const officials = getOfficials();
  let changed = 0;

  for (let index = 0; index < officials.length; index += 1) {
    const item = officials[index];
    if (!["国家级", "省部级"].includes(item.level)) continue;
    const before = JSON.stringify({
      lastPosition: item.lastPosition || "",
      previousPositions: item.previousPositions || []
    });
    const next = cleanSeniorOfficial(item);
    const after = JSON.stringify({
      lastPosition: next.lastPosition || "",
      previousPositions: next.previousPositions || []
    });
    if (before !== after) {
      officials[index] = next;
      changed += 1;
      console.log(`已清洗：${next.name}`);
    }
  }

  saveOfficials(officials);
  console.log(`完成，共清洗 ${changed} 名高级别官员履历。`);
}

main();
