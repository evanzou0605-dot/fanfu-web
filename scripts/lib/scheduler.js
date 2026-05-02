const { getOfficials, saveOfficials, getMeta, saveMeta } = require("./store");
const { syncOfficials } = require("./scraper");
const { enrichOfficials } = require("./enrich");

let timer = null;
let running = false;

function appendRun(meta, entry) {
  const next = { ...meta };
  next.recentRuns = [entry, ...(next.recentRuns || [])].slice(0, 20);
  return next;
}

function summarizeEnrich(result) {
  return {
    changed: result.changed || 0,
    processed: result.processed || 0
  };
}

async function runSyncCycle(reason = "manual") {
  if (running) {
    return { skipped: true, reason: "already-running" };
  }

  running = true;
  const startedAt = new Date().toISOString();
  const meta = getMeta();
  const settings = meta.settings || {};

  try {
    const existing = getOfficials();
    const syncResult = await syncOfficials(existing, settings);
    let officials = syncResult.officials;

    let enrichResult = { changed: 0, processed: 0 };
    if (settings.autoEnrichEnabled) {
      enrichResult = await enrichOfficials(officials, { limit: Math.min(officials.length, 40) });
      officials = enrichResult.officials;
      meta.lastEnrichAt = new Date().toISOString();
      meta.lastEnrichSummary = `补全 ${enrichResult.processed} 人，更新 ${enrichResult.changed} 人。`;
    }

    saveOfficials(officials);

    meta.lastSyncAt = new Date().toISOString();
    meta.lastSyncSummary =
      `扫描 ${syncResult.scanned} 条官网列表，新增 ${syncResult.created} 条，更新 ${syncResult.updated} 条。` +
      (syncResult.errors.length ? ` 失败 ${syncResult.errors.length} 条。` : "");
    meta.lastSyncErrors = syncResult.errors || [];
    const nextMeta = appendRun(meta, {
      startedAt,
      finishedAt: new Date().toISOString(),
      reason,
      sync: {
        scanned: syncResult.scanned,
        created: syncResult.created,
        updated: syncResult.updated,
        errors: syncResult.errors.length
      },
      enrich: summarizeEnrich(enrichResult)
    });
    saveMeta(nextMeta);
    return { ok: true, meta: nextMeta, syncResult, enrichResult };
  } catch (error) {
    const failedMeta = appendRun(meta, {
      startedAt,
      finishedAt: new Date().toISOString(),
      reason,
      error: error.message
    });
    saveMeta(failedMeta);
    throw error;
  } finally {
    running = false;
  }
}

function stopScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

function startScheduler() {
  stopScheduler();
  const meta = getMeta();
  const settings = meta.settings || {};
  if (!settings.autoSyncEnabled) return false;
  const intervalMinutes = Math.max(15, Number(settings.autoSyncIntervalMinutes) || 180);
  timer = setInterval(() => {
    runSyncCycle("timer").catch(() => {});
  }, intervalMinutes * 60 * 1000);
  return true;
}

function updateSchedulerSettings(partial) {
  const meta = getMeta();
  meta.settings = {
    autoSyncEnabled: false,
    autoSyncIntervalMinutes: 180,
    autoEnrichEnabled: true,
    maxPagesPerSection: 20,
    ...(meta.settings || {}),
    ...partial
  };
  saveMeta(meta);
  startScheduler();
  return meta;
}

module.exports = {
  runSyncCycle,
  startScheduler,
  stopScheduler,
  updateSchedulerSettings
};
