const { getOfficials, saveOfficials, getMeta, saveMeta } = require("./lib/store");
const { syncOfficials, START_DATE } = require("./lib/scraper");

async function main() {
  const existing = getOfficials();
  const result = await syncOfficials(existing);
  saveOfficials(result.officials);

  const meta = getMeta();
  meta.lastSyncAt = new Date().toISOString();
  meta.lastSyncSummary = `扫描 ${result.scanned} 条官网列表，新增 ${result.created} 条，更新 ${result.updated} 条。整理起点 ${START_DATE}。`;
  saveMeta(meta);

  console.log(meta.lastSyncSummary);
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exit(1);
});
