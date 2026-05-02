const fs = require("fs");
const path = require("path");

const OFFICIALS_PATH = path.resolve(__dirname, "../data/officials.json");
const HINTS_PATH = path.resolve(__dirname, "../data/enrich_hints.json");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function uniqueSources(sources) {
  const seen = new Set();
  const result = [];
  for (const source of sources || []) {
    const key = `${source?.type || ""}|${source?.label || ""}|${source?.url || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(source);
  }
  return result;
}

function applyHint(item, hint) {
  const next = { ...item };
  if (hint.birth) next.birth = hint.birth;
  if (hint.photo) next.photo = hint.photo;
  if (hint.lastPosition) next.lastPosition = hint.lastPosition;
  if (Array.isArray(hint.previousPositions) && hint.previousPositions.length) {
    next.previousPositions = hint.previousPositions.slice();
  }
  if (Array.isArray(hint.sources) && hint.sources.length) {
    next.sources = uniqueSources([...(next.sources || []), ...hint.sources]);
  }
  if (Array.isArray(hint.previousPositions) && hint.previousPositions.length) {
    const positions = [...hint.previousPositions, next.lastPosition].filter(Boolean).join("，");
    if (/曾任职务[:：]\s*/.test(next.detail || "")) {
      next.detail = String(next.detail).replace(
        /(曾任职务[:：]\s*)(.+?)(?=\s+处理结果[:：]|$)/,
        `$1${positions}`
      );
    }
  }
  next.updatedAt = new Date().toISOString();
  return next;
}

function main() {
  const officials = readJson(OFFICIALS_PATH);
  const hints = readJson(HINTS_PATH);
  let changed = 0;

  for (const hint of hints) {
    const index = officials.findIndex((item) => item.name === hint.name && item.region === hint.region);
    if (index === -1) continue;
    const before = JSON.stringify({
      birth: officials[index].birth || "",
      photo: officials[index].photo || "",
      lastPosition: officials[index].lastPosition || "",
      previousPositions: officials[index].previousPositions || [],
      detail: officials[index].detail || "",
      sources: officials[index].sources || []
    });
    const next = applyHint(officials[index], hint);
    const after = JSON.stringify({
      birth: next.birth || "",
      photo: next.photo || "",
      lastPosition: next.lastPosition || "",
      previousPositions: next.previousPositions || [],
      detail: next.detail || "",
      sources: next.sources || []
    });
    if (before !== after) {
      officials[index] = next;
      changed += 1;
      console.log(`已回填提示库：${next.name}`);
    }
  }

  fs.writeFileSync(OFFICIALS_PATH, JSON.stringify(officials, null, 2), "utf8");
  console.log(JSON.stringify({ changed }, null, 2));
}

main();
