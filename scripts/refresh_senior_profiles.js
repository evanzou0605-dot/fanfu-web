const { getOfficials, saveOfficials } = require("./lib/store");
const { enrichOfficial } = require("./lib/enrich");

function summarizeBefore(item) {
  return JSON.stringify({
    birth: item.birth || "",
    photo: item.photo || "",
    lastPosition: item.lastPosition || "",
    previousPositions: item.previousPositions || [],
    sources: (item.sources || []).map((source) => source.url || source.label || ""),
    timeline: item.timeline || []
  });
}

async function main() {
  const officials = getOfficials();
  const seniorLevels = new Set(["国家级", "省部级"]);
  const targets = officials.filter((item) => seniorLevels.has(item.level));

  let changed = 0;
  let failed = 0;

  console.log(`准备刷新 ${targets.length} 名高级别官员（国家级 + 省部级）。`);

  for (let index = 0; index < targets.length; index += 1) {
    const current = targets[index];
    const before = summarizeBefore(current);
    try {
      const enriched = await enrichOfficial(current);
      const after = summarizeBefore(enriched);
      if (before !== after) {
        changed += 1;
      }
      const storeIndex = officials.findIndex((item) => item.id === current.id);
      if (storeIndex !== -1) {
        officials[storeIndex] = enriched;
      }
    } catch (error) {
      failed += 1;
      console.error(`[${index + 1}/${targets.length}] ${current.name} 刷新失败：${error.message}`);
      continue;
    }

    if ((index + 1) % 10 === 0 || index === targets.length - 1) {
      saveOfficials(officials);
    }
    console.log(`[${index + 1}/${targets.length}] ${current.name} 完成，累计更新 ${changed}，失败 ${failed}`);
  }

  saveOfficials(officials);
  console.log(`刷新结束：扫描 ${targets.length} 人，更新 ${changed} 人，失败 ${failed} 人。`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
