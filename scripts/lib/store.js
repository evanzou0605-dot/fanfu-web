const fs = require("fs");
const path = require("path");

const sourceDataDir = path.join(process.cwd(), "data");
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : sourceDataDir;
const officialsPath = path.join(dataDir, "officials.json");
const metaPath = path.join(dataDir, "meta.json");
const sampleDir = path.join(dataDir, "samples");

function ensureDir() {
  fs.mkdirSync(dataDir, { recursive: true });
}

function copyBundledSeedIfMissing(filePath) {
  const relativePath = path.relative(dataDir, filePath);
  const bundledPath = path.join(sourceDataDir, relativePath);
  if (fs.existsSync(bundledPath)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.copyFileSync(bundledPath, filePath);
    return true;
  }
  return false;
}

function ensureFile(filePath, fallback) {
  ensureDir();
  if (!fs.existsSync(filePath)) {
    if (copyBundledSeedIfMissing(filePath)) return;
    fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2), "utf8");
  }
}

function readJson(filePath, fallback) {
  ensureFile(filePath, fallback);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  ensureDir();
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tempPath, filePath);
}

function getOfficials() {
  return readJson(officialsPath, []);
}

function saveOfficials(officials) {
  writeJson(officialsPath, officials);
}

function getMeta() {
  const defaults = {
    lastSyncAt: null,
    lastSyncSummary: "",
    lastEnrichAt: null,
    lastEnrichSummary: "",
    lastSyncErrors: [],
    settings: {
      autoSyncEnabled: false,
      autoSyncIntervalMinutes: 180,
      autoEnrichEnabled: true,
      maxPagesPerSection: 20
    },
    recentRuns: [],
    note:
      "默认从 2022-10-01 起整理。自动同步以中纪委官网栏目为准，百科字段可人工补全校订。"
  };
  const current = readJson(metaPath, defaults);
  return {
    ...defaults,
    ...current,
    settings: {
      ...defaults.settings,
      ...(current.settings || {})
    },
    recentRuns: current.recentRuns || [],
    lastSyncErrors: current.lastSyncErrors || []
  };
}

function saveMeta(meta) {
  writeJson(metaPath, meta);
}

module.exports = {
  getOfficials,
  saveOfficials,
  getMeta,
  saveMeta,
  officialsPath,
  metaPath,
  sampleDir
};
