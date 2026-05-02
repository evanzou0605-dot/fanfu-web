const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");
const { URL } = require("url");
const { REGIONS, LEVELS, MILITARY_LEVELS } = require("./scripts/lib/constants");
const { detectLevel, isMilitaryCurrentPost, detectMilitaryRank } = require("./scripts/lib/normalize");
const { getOfficials, saveOfficials, getMeta, saveMeta, sampleDir } = require("./scripts/lib/store");
const { enrichOfficial, enrichOfficials, needsEnrichment } = require("./scripts/lib/enrich");
const { runSyncCycle, startScheduler, updateSchedulerSettings } = require("./scripts/lib/scheduler");
const { importOfficialFromSource } = require("./scripts/lib/scraper");
const {
  parseScreenshotText,
  parseScreenshotOcrObservations,
  mergeScreenshotOfficials,
  parseMilitaryText,
  parseMilitaryOcrObservations,
  mergeMilitaryOfficials
} = require("./scripts/lib/screenshot_import");

const publicDir = path.join(process.cwd(), "public");
const runtimeDataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(process.cwd(), "data");
const uploadsDir = process.env.UPLOADS_DIR ? path.resolve(process.env.UPLOADS_DIR) : path.join(runtimeDataDir, "uploads");
const screenshotOcrScript = path.join(process.cwd(), "scripts", "ocr_screenshot.py");
const militaryExcelImportScript = path.join(process.cwd(), "scripts", "import_military_excel.py");
const bundledPython = path.join(os.homedir(), ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "python", "bin", "python3");
const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 3000);
let enrichQueueRunning = false;
let enrichQueueStopRequested = false;
let activeEnrichScope = null;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};

function looksCentralPosition(text) {
  const input = String(text || "");
  if (!input) return false;
  if (isMilitaryCurrentPost(input)) return false;
  if (/北京市委|北京市政府|北京市人大|北京市政协|北京信托|北京控股|北京银行/.test(input)) return false;
  return /中央|国务院|国务委员|全国人民代表大会|全国人大|全国政协|外交部|国防部|中央外事工作委员会|应急管理部|工业和信息化部|国家烟草专卖局|中国烟草总公司|中国石油天然气集团|中国工程院|国家体育总局|中国足协|中国足球协会|党组书记、部长|党委书记、部长|部党组|国家局|总公司|集团公司/.test(
    input
  );
}

function isCentralCurrentPost(text) {
  const input = String(text || "");
  if (!input) return false;
  if (isMilitaryCurrentPost(input)) return false;
  if (/北京市委|北京市政府|北京市人大|北京市政协|北京信托|北京控股|北京银行/.test(input)) return false;
  return /国务院|国务委员|全国人民代表大会|全国人大|全国政协|外交部|国防部|中央外事工作委员会|中央纪委|中央军委|中央组织部|中央统战部|中央政法委|中央宣传部|中央网信办|中央财办|中央外办|中央农办|应急管理部|工业和信息化部|财政部|审计署|自然资源部|国家烟草专卖局|国家药品监督管理局|中国烟草总公司|中国石油天然气集团|中国石油化工集团|中国海洋石油集团|国家能源投资集团|中国中信集团|中国兵器|中国航空工业集团|中国电子科技集团|中国工程院|国家体育总局|中国足协|中国足球协会|党组书记、部长|党委书记、部长|国家局|总公司/.test(
    input
  );
}

function resolveSavedRegion(existing, payload) {
  if (payload.manualRegionOverride && payload.region) {
    return payload.region;
  }
  const payloadRegion = payload.region || existing?.region || "中央部委/央企";
  const combined = [payload.lastPosition, payload.summary, payload.detail, ...(payload.previousPositions || [])].filter(Boolean).join(" ");
  if (isMilitaryCurrentPost(payload.lastPosition || existing?.lastPosition || "") || detectMilitaryRank(combined)) {
    return "解放军";
  }
  if (isCentralCurrentPost(payload.lastPosition || existing?.lastPosition || "")) {
    return "中央部委/央企";
  }
  if (payloadRegion === "北京市" && looksCentralPosition(combined)) {
    return "中央部委/央企";
  }
  if (existing?.region === "中央部委/央企" && payloadRegion !== "中央部委/央企" && looksCentralPosition(combined)) {
    return "中央部委/央企";
  }
  return payloadRegion;
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(JSON.stringify(data, null, 2));
}

function sendText(res, status, text) {
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(text);
}

function serveStatic(req, res, pathname) {
  const staticRoot = pathname.startsWith("/uploads/") ? uploadsDir : publicDir;
  const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
  const filePath = path.join(staticRoot, relativePath);
  if (!filePath.startsWith(staticRoot)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      sendText(res, 404, "Not found");
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
    res.end(data);
  });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 20 * 1024 * 1024) {
        reject(new Error("Request too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function getImageExtensionFromDataUrl(dataUrl, fallbackName = "") {
  const matchedMime = String(dataUrl || "").match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
  if (matchedMime) {
    if (matchedMime[1].includes("png")) return ".png";
    if (matchedMime[1].includes("jpeg") || matchedMime[1].includes("jpg")) return ".jpg";
    if (matchedMime[1].includes("webp")) return ".webp";
    if (matchedMime[1].includes("heic")) return ".heic";
  }
  const ext = path.extname(String(fallbackName || "")).toLowerCase();
  return ext || ".png";
}

function decodeUploadedImage(dataUrl, filename = "") {
  const match = String(dataUrl || "").match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/);
  if (!match) {
    throw new Error("图片数据格式不正确");
  }
  const extension = getImageExtensionFromDataUrl(dataUrl, filename);
  const tmpPath = path.join(os.tmpdir(), `fanfu-screenshot-${Date.now()}-${Math.random().toString(36).slice(2)}${extension}`);
  fs.writeFileSync(tmpPath, Buffer.from(match[1], "base64"));
  return tmpPath;
}

function saveOfficialPhoto(dataUrl, officialId, filename = "") {
  const tmpPath = decodeUploadedImage(dataUrl, filename);
  try {
    const extension = getImageExtensionFromDataUrl(dataUrl, filename);
    const targetDir = path.join(uploadsDir, "officials");
    fs.mkdirSync(targetDir, { recursive: true });
    const safeId = String(officialId || "official").replace(/[^a-zA-Z0-9_-]/g, "_");
    const targetName = `${safeId}-${Date.now()}${extension}`;
    const targetPath = path.join(targetDir, targetName);
    fs.copyFileSync(tmpPath, targetPath);
    return `/uploads/officials/${targetName}`;
  } finally {
    if (fs.existsSync(tmpPath)) {
      fs.unlinkSync(tmpPath);
    }
  }
}

function decodeUploadedFile(dataUrl, filename = "") {
  const match = String(dataUrl || "").match(/^data:([a-zA-Z0-9/+.-]+\/[a-zA-Z0-9.+-]+)?;base64,(.+)$/);
  if (!match) {
    throw new Error("文件数据格式不正确");
  }
  const ext = path.extname(String(filename || "")).toLowerCase() || ".bin";
  const tmpPath = path.join(os.tmpdir(), `fanfu-upload-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  fs.writeFileSync(tmpPath, Buffer.from(match[2], "base64"));
  return tmpPath;
}

function runScreenshotOcr(imagePath) {
  const pythonExecutable = fs.existsSync(bundledPython) ? bundledPython : "python3";
  const raw = execFileSync(pythonExecutable, [screenshotOcrScript, imagePath], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024
  });
  return JSON.parse(raw || "[]");
}

function runMilitaryExcelImport(filePath, filename = "") {
  const pythonExecutable = fs.existsSync(bundledPython) ? bundledPython : "python3";
  const raw = execFileSync(pythonExecutable, [militaryExcelImportScript, filePath, `解放军 Excel 导入：${filename || path.basename(filePath)}`], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024
  });
  return JSON.parse(raw || "[]");
}

function upsertOfficial(payload) {
  const officials = getOfficials();
  const existing = officials.find((item) => item.id === payload.id);
  const normalizedPayload = { ...payload };
  if (normalizedPayload.photoUploadData) {
    normalizedPayload.photo = saveOfficialPhoto(
      normalizedPayload.photoUploadData,
      normalizedPayload.id || existing?.id || normalizedPayload.name || "official",
      normalizedPayload.photoUploadFilename || ""
    );
    normalizedPayload.manualPhotoOverride = true;
    delete normalizedPayload.photoUploadData;
    delete normalizedPayload.photoUploadFilename;
  }
  const mergedPayload = {
    ...(existing || {}),
    ...normalizedPayload
  };
  const resolvedRegion = resolveSavedRegion(existing, mergedPayload);
  const inferredLevel = detectLevel(
    [resolvedRegion, mergedPayload.lastPosition, mergedPayload.summary, mergedPayload.detail, ...(mergedPayload.previousPositions || [])]
      .filter(Boolean)
      .join(" ")
  );
  const official = {
    ...mergedPayload,
    region: resolvedRegion,
    level: mergedPayload.manualLevelOverride
      ? mergedPayload.level || existing?.level || (resolvedRegion === "解放军" ? "少将" : "厅局级")
      : inferredLevel || mergedPayload.level || existing?.level || (resolvedRegion === "解放军" ? "少将" : "厅局级"),
    updatedAt: new Date().toISOString(),
    createdAt: existing?.createdAt || mergedPayload.createdAt || new Date().toISOString(),
    editable: true
  };
  const index = officials.findIndex((item) => item.id === official.id);
  if (index >= 0) {
    officials[index] = official;
  } else {
    officials.push(official);
  }
  officials.sort((a, b) => (b.investigationDate || "").localeCompare(a.investigationDate || ""));
  saveOfficials(officials);
  return official;
}

function mergeImportedOfficial(payload) {
  const officials = getOfficials();
  const existing = officials.find((item) => item.name === payload.name || item.id === payload.id);
  const official = existing
    ? {
        ...existing,
        ...payload,
        timeline: [...(existing.timeline || []), ...(payload.timeline || [])],
        sources: [...(existing.sources || []), ...(payload.sources || [])],
        updatedAt: new Date().toISOString()
      }
    : payload;
  return upsertOfficial(official);
}

function listSampleFiles() {
  fs.mkdirSync(sampleDir, { recursive: true });
  return fs.readdirSync(sampleDir).filter((file) => file.endsWith(".html")).sort();
}

function updateScopedQueueMeta(meta, scope, payload) {
  if (scope?.type === "region" && scope.region) {
    meta.regionEnrichQueues = {
      ...(meta.regionEnrichQueues || {}),
      [scope.region]: {
        ...(meta.regionEnrichQueues?.[scope.region] || {}),
        ...payload
      }
    };
    return;
  }
  meta.enrichQueue = {
    ...(meta.enrichQueue || {}),
    ...payload
  };
}

function readScopedQueueMeta(meta, scope) {
  if (scope?.type === "region" && scope.region) {
    return meta.regionEnrichQueues?.[scope.region] || {};
  }
  return meta.enrichQueue || {};
}

async function runBulkEnrichQueue(scope = { type: "global" }) {
  if (enrichQueueRunning) {
    return false;
  }

  enrichQueueRunning = true;
  enrichQueueStopRequested = false;
  activeEnrichScope = scope;
  const startedAt = new Date().toISOString();
  const meta = getMeta();
  const officials = getOfficials();
  const queueIds = officials
    .filter((item) => (!scope.region || item.region === scope.region) && needsEnrichment(item))
    .map((item) => item.id);
  meta.lastEnrichSummary =
    scope.type === "region"
      ? `${scope.region} 一键百科补全任务已启动，正在后台分批执行。`
      : "一键百科补全任务已启动，正在后台分批执行。";
  updateScopedQueueMeta(meta, scope, {
    running: true,
    startedAt,
    processed: 0,
    changed: 0,
    failed: 0,
    total: queueIds.length,
    remaining: queueIds.length,
    stopRequested: false,
    recentErrors: []
  });
  saveMeta(meta);

  try {
    let latestOfficials = officials;
    let totalProcessed = 0;
    let totalChanged = 0;
    let totalFailed = 0;
    const recentErrors = [];

    for (let index = 0; index < queueIds.length; index += 25) {
      if (enrichQueueStopRequested) break;
      const batchIds = queueIds.slice(index, index + 25);
      for (const id of batchIds) {
        if (enrichQueueStopRequested) break;
        const current = latestOfficials.find((item) => item.id === id);
        if (!current) continue;
        const before = JSON.stringify({
          birth: current.birth,
          lastPosition: current.lastPosition,
          previousPositions: current.previousPositions,
          detail: current.detail,
          sources: current.sources,
          region: current.region,
          level: current.level,
          status: current.status,
          investigationDate: current.investigationDate,
          timeline: current.timeline
        });
        try {
          const next = await enrichOfficial(current);
          const after = JSON.stringify({
            birth: next.birth,
            lastPosition: next.lastPosition,
            previousPositions: next.previousPositions,
            detail: next.detail,
            sources: next.sources,
            region: next.region,
            level: next.level,
            status: next.status,
            investigationDate: next.investigationDate,
            timeline: next.timeline
          });
          if (before !== after) totalChanged += 1;
          latestOfficials = latestOfficials.map((item) => (item.id === id ? next : item));
        } catch (error) {
          totalFailed += 1;
          recentErrors.unshift({
            name: current.name,
            message: error.message || String(error)
          });
          recentErrors.splice(5);
        }

        totalProcessed += 1;
        saveOfficials(latestOfficials);

        const progressMeta = getMeta();
        progressMeta.lastEnrichAt = new Date().toISOString();
        progressMeta.lastEnrichSummary = enrichQueueStopRequested
          ? `${scope.type === "region" ? `${scope.region} ` : ""}一键百科补全正在停止：已扫描 ${totalProcessed} 人，更新 ${totalChanged} 人，失败 ${totalFailed} 人。`
          : `${scope.type === "region" ? `${scope.region} ` : ""}一键百科补全后台执行中：已扫描 ${totalProcessed} 人，更新 ${totalChanged} 人，失败 ${totalFailed} 人，剩余 ${Math.max(queueIds.length - totalProcessed, 0)} 人。`;
        updateScopedQueueMeta(progressMeta, scope, {
          running: true,
          startedAt,
          processed: totalProcessed,
          changed: totalChanged,
          failed: totalFailed,
          total: queueIds.length,
          remaining: Math.max(queueIds.length - totalProcessed, 0),
          stopRequested: enrichQueueStopRequested,
          recentErrors
        });
        saveMeta(progressMeta);
      }
    }

    const finishedMeta = getMeta();
    finishedMeta.lastEnrichAt = new Date().toISOString();
    finishedMeta.lastEnrichSummary = enrichQueueStopRequested
      ? `${scope.type === "region" ? `${scope.region} ` : ""}一键百科补全已停止：已扫描 ${totalProcessed} 人，更新 ${totalChanged} 人，失败 ${totalFailed} 人，剩余 ${Math.max(queueIds.length - totalProcessed, 0)} 人。`
      : `${scope.type === "region" ? `${scope.region} ` : ""}一键百科补全完成：已扫描 ${totalProcessed} 人，更新 ${totalChanged} 人，失败 ${totalFailed} 人。`;
    updateScopedQueueMeta(finishedMeta, scope, {
      running: false,
      startedAt,
      finishedAt: new Date().toISOString(),
      processed: totalProcessed,
      changed: totalChanged,
      failed: totalFailed,
      total: queueIds.length,
      remaining: Math.max(queueIds.length - totalProcessed, 0),
      stopRequested: enrichQueueStopRequested,
      recentErrors
    });
    saveMeta(finishedMeta);
  } catch (error) {
    const failedMeta = getMeta();
    failedMeta.lastEnrichAt = new Date().toISOString();
    failedMeta.lastEnrichSummary = `${scope.type === "region" ? `${scope.region} ` : ""}一键百科补全失败：${error.message}`;
    updateScopedQueueMeta(failedMeta, scope, {
      running: false,
      startedAt,
      finishedAt: new Date().toISOString(),
      error: error.message,
      stopRequested: enrichQueueStopRequested
    });
    saveMeta(failedMeta);
  } finally {
    enrichQueueRunning = false;
    enrichQueueStopRequested = false;
    activeEnrichScope = null;
  }

  return true;
}

async function handleApi(req, res, pathname) {
  if (req.method === "OPTIONS") {
    return sendText(res, 204, "");
  }

  if (req.method === "GET" && pathname === "/api/config") {
    return sendJson(res, 200, {
      regions: REGIONS,
      levels: LEVELS,
      militaryLevels: MILITARY_LEVELS,
      meta: getMeta()
    });
  }

  if (req.method === "GET" && pathname === "/api/officials") {
    return sendJson(res, 200, { officials: getOfficials() });
  }

  if (req.method === "GET" && pathname === "/api/samples") {
    return sendJson(res, 200, { files: listSampleFiles() });
  }

  if (req.method === "POST" && pathname === "/api/officials/upsert") {
    const body = await parseBody(req);
    if (!body.id || !body.name) {
      return sendJson(res, 400, { error: "Missing id or name" });
    }
    const saved = upsertOfficial(body);
    return sendJson(res, 200, { official: saved });
  }

  if (req.method === "POST" && pathname === "/api/officials/delete") {
    const body = await parseBody(req);
    const officials = getOfficials().filter((item) => item.id !== body.id);
    saveOfficials(officials);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "POST" && pathname === "/api/officials/lock") {
    const body = await parseBody(req);
    if (!body.id) {
      return sendJson(res, 400, { error: "Missing official id" });
    }
    const officials = getOfficials();
    const target = officials.find((item) => item.id === body.id);
    if (!target) {
      return sendJson(res, 404, { error: "Official not found" });
    }
    const locked = Boolean(body.locked);
    const saved = upsertOfficial({
      id: target.id,
      name: target.name,
      locked
    });
    const meta = getMeta();
    meta.lastEnrichSummary = locked ? `已锁定 ${saved.name} 的资料，后续百科补全将跳过该条。` : `已解锁 ${saved.name} 的资料，后续可继续百科补全。`;
    saveMeta(meta);
    return sendJson(res, 200, { official: saved, meta });
  }

  if (req.method === "POST" && pathname === "/api/sync") {
    const result = await runSyncCycle("manual");
    return sendJson(res, 200, result);
  }

  if (req.method === "POST" && pathname === "/api/enrich") {
    const body = await parseBody(req);
    const officials = getOfficials();
    if (body.id) {
      const target = officials.find((item) => item.id === body.id);
      if (!target) return sendJson(res, 404, { error: "Official not found" });
      if (target.locked) {
        const meta = getMeta();
        meta.lastEnrichAt = new Date().toISOString();
        meta.lastEnrichSummary = `${target.name} 已锁定，本次百科补全已跳过。`;
        saveMeta(meta);
        return sendJson(res, 200, { official: target, meta, changed: false, skippedLocked: true });
      }
      const before = JSON.stringify({
        birth: target.birth,
        lastPosition: target.lastPosition,
        previousPositions: target.previousPositions,
        detail: target.detail,
        sources: target.sources,
        region: target.region,
        level: target.level,
        status: target.status,
        investigationDate: target.investigationDate,
        timeline: target.timeline
      });
      const next = await enrichOfficial(target);
      const after = JSON.stringify({
        birth: next.birth,
        lastPosition: next.lastPosition,
        previousPositions: next.previousPositions,
        detail: next.detail,
        sources: next.sources,
        region: next.region,
        level: next.level,
        status: next.status,
        investigationDate: next.investigationDate,
        timeline: next.timeline
      });
      const changed = before !== after;
      const updated = officials.map((item) => (item.id === next.id ? next : item));
      saveOfficials(updated);
      const meta = getMeta();
      meta.lastEnrichAt = new Date().toISOString();
      meta.lastEnrichSummary = changed ? `已补全 ${next.name} 的百科信息。` : `${next.name} 暂无可安全补全的新信息。`;
      saveMeta(meta);
      return sendJson(res, 200, { official: next, meta, changed });
    }

    if (body.background !== false && !body.limit) {
      const started = !enrichQueueRunning;
      if (started) {
        runBulkEnrichQueue({ type: "global" }).catch(() => {});
      }
      return sendJson(res, 200, {
        ok: true,
        started,
        running: enrichQueueRunning,
        scope: activeEnrichScope,
        meta: getMeta()
      });
    }

    const result = await enrichOfficials(officials, { limit: body.limit || 30 });
    saveOfficials(result.officials);
    const meta = getMeta();
    meta.lastEnrichAt = new Date().toISOString();
    meta.lastEnrichSummary = `一键补全扫描 ${result.processed} 人，更新 ${result.changed} 人。`;
    saveMeta(meta);
    return sendJson(res, 200, { result, meta });
  }

  if (req.method === "POST" && pathname === "/api/enrich/stop") {
    enrichQueueStopRequested = true;
    const meta = getMeta();
    meta.lastEnrichSummary = "已发送停止请求，当前批次结束后会停止一键百科补全。";
    updateScopedQueueMeta(meta, activeEnrichScope || { type: "global" }, {
      ...readScopedQueueMeta(meta, activeEnrichScope || { type: "global" }),
      running: enrichQueueRunning,
      stopRequested: true
    });
    saveMeta(meta);
    return sendJson(res, 200, { ok: true, meta });
  }

  if (req.method === "POST" && pathname === "/api/enrich-region") {
    const body = await parseBody(req);
    if (!body.region) {
      return sendJson(res, 400, { error: "Missing region" });
    }
    const started = !enrichQueueRunning;
    if (started) {
      runBulkEnrichQueue({ type: "region", region: body.region }).catch(() => {});
    }
    return sendJson(res, 200, {
      ok: true,
      started,
      running: enrichQueueRunning,
      scope: activeEnrichScope,
      meta: getMeta()
    });
  }

  if (req.method === "POST" && pathname === "/api/enrich-region/stop") {
    const body = await parseBody(req);
    if (!body.region) {
      return sendJson(res, 400, { error: "Missing region" });
    }
    enrichQueueStopRequested = true;
    const meta = getMeta();
    meta.lastEnrichSummary = `已发送停止请求，${body.region} 当前批次结束后会停止一键百科补全。`;
    updateScopedQueueMeta(meta, { type: "region", region: body.region }, {
      ...readScopedQueueMeta(meta, { type: "region", region: body.region }),
      running: enrichQueueRunning && activeEnrichScope?.type === "region" && activeEnrichScope?.region === body.region,
      stopRequested: true
    });
    saveMeta(meta);
    return sendJson(res, 200, { ok: true, meta });
  }

  if (req.method === "POST" && pathname === "/api/settings") {
    const body = await parseBody(req);
    const meta = updateSchedulerSettings(body);
    return sendJson(res, 200, { meta });
  }

  if (req.method === "POST" && pathname === "/api/import") {
    const body = await parseBody(req);
    const imported = await importOfficialFromSource({
      url: body.url,
      html: body.html,
      date: body.date,
      title: body.title,
      sourceLabel: body.sourceLabel
    });
    const official = mergeImportedOfficial(imported);
    return sendJson(res, 200, { official });
  }

  if (req.method === "POST" && pathname === "/api/import-sample") {
    const body = await parseBody(req);
    if (!body.file) {
      return sendJson(res, 400, { error: "Missing sample file" });
    }
    const safePath = path.join(sampleDir, path.basename(body.file));
    if (!safePath.startsWith(sampleDir) || !fs.existsSync(safePath)) {
      return sendJson(res, 404, { error: "Sample file not found" });
    }
    const html = fs.readFileSync(safePath, "utf8");
    const imported = await importOfficialFromSource({
      url: body.url || "",
      html,
      date: body.date,
      title: body.title,
      sourceLabel: body.sourceLabel || `离线样本 ${path.basename(body.file)}`
    });
    const official = mergeImportedOfficial(imported);
    return sendJson(res, 200, { official });
  }

  if (req.method === "POST" && pathname === "/api/import-screenshot") {
    const body = await parseBody(req);
    const entries = Array.isArray(body.entries) && body.entries.length
      ? body.entries
      : parseScreenshotText(body.text || "");
    if (!entries.length) {
      return sendJson(res, 400, { error: "Missing screenshot entries" });
    }
    const result = mergeScreenshotOfficials(getOfficials(), entries, {
      sourceLabel: body.sourceLabel || "截图批量导入",
      sourceUrl: body.sourceUrl || ""
    });
    saveOfficials(result.officials);
    return sendJson(res, 200, {
      imported: result.results.length,
      created: result.results.filter((item) => item.action === "created").length,
      updated: result.results.filter((item) => item.action === "updated").length,
      results: result.results
    });
  }

  if (req.method === "POST" && pathname === "/api/import-screenshot-image") {
    const body = await parseBody(req);
    if (!body.imageData) {
      return sendJson(res, 400, { error: "Missing imageData" });
    }

    let imagePath = "";
    try {
      imagePath = decodeUploadedImage(body.imageData, body.filename || "");
      const observations = runScreenshotOcr(imagePath);
      const entries = parseScreenshotOcrObservations(observations);
      const rawText = observations
        .sort((a, b) => (b.centerY || 0) - (a.centerY || 0))
        .map((item) => item.text)
        .join("\n");

      if (!entries.length) {
        return sendJson(res, 200, {
          imported: 0,
          created: 0,
          updated: 0,
          rawText,
          entries: [],
          results: []
        });
      }

      const result = mergeScreenshotOfficials(getOfficials(), entries, {
        sourceLabel: body.sourceLabel || "截图 OCR 导入",
        sourceUrl: body.sourceUrl || ""
      });
      saveOfficials(result.officials);
      return sendJson(res, 200, {
        imported: result.results.length,
        created: result.results.filter((item) => item.action === "created").length,
        updated: result.results.filter((item) => item.action === "updated").length,
        rawText,
        entries,
        results: result.results
      });
    } finally {
      if (imagePath && fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }
  }

  if (req.method === "POST" && pathname === "/api/import-military-excel") {
    const body = await parseBody(req);
    if (!body.fileData) {
      return sendJson(res, 400, { error: "Missing fileData" });
    }
    let filePath = "";
    try {
      filePath = decodeUploadedFile(body.fileData, body.filename || "military.xlsx");
      const importedOfficials = runMilitaryExcelImport(filePath, body.filename || "military.xlsx");
      const existingOfficials = getOfficials();
      const results = [];
      for (const payload of importedOfficials) {
        const existing = existingOfficials.find(
          (item) =>
            item.id === payload.id ||
            (item.region === "解放军" &&
              item.name === payload.name &&
              item.level === payload.level &&
              String(item.lastPosition || "").trim() === String(payload.lastPosition || "").trim())
        );
        const existed = Boolean(existing);
        const guardedPayload =
          existing && existing.investigationDate && !payload.investigationDate
            ? {
                ...payload,
                investigationDate: existing.investigationDate,
                timeline: (existing.timeline || []).length ? existing.timeline : payload.timeline,
                summary: existing.summary || payload.summary,
                detail: existing.detail || payload.detail
              }
            : payload;
        const saved = mergeImportedOfficial(guardedPayload);
        results.push({
          official: saved,
          action: existed ? "updated" : "created"
        });
      }
      return sendJson(res, 200, {
        imported: results.length,
        created: results.filter((item) => item.action === "created").length,
        updated: results.filter((item) => item.action === "updated").length,
        results
      });
    } finally {
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  }

  if (req.method === "POST" && pathname === "/api/import-military-screenshot") {
    const body = await parseBody(req);
    const entries = Array.isArray(body.entries) && body.entries.length ? body.entries : parseMilitaryText(body.text || "");
    if (!entries.length) {
      return sendJson(res, 400, { error: "Missing military screenshot entries" });
    }
    const result = mergeMilitaryOfficials(getOfficials(), entries, {
      sourceLabel: body.sourceLabel || "解放军截图批量导入",
      sourceUrl: body.sourceUrl || ""
    });
    saveOfficials(result.officials);
    return sendJson(res, 200, {
      imported: result.results.length,
      created: result.results.filter((item) => item.action === "created").length,
      updated: result.results.filter((item) => item.action === "updated").length,
      results: result.results
    });
  }

  if (req.method === "POST" && pathname === "/api/import-military-screenshot-image") {
    const body = await parseBody(req);
    if (!body.imageData) {
      return sendJson(res, 400, { error: "Missing imageData" });
    }

    let imagePath = "";
    try {
      imagePath = decodeUploadedImage(body.imageData, body.filename || "");
      const observations = runScreenshotOcr(imagePath);
      const rawText = observations
        .sort((a, b) => (a.centerY || 0) - (b.centerY || 0) || (a.minX || 0) - (b.minX || 0))
        .map((item) => item.text)
        .join("\n");

      let entries = [];
      try {
        entries = parseMilitaryOcrObservations(observations);
      } catch {
        entries = [];
      }

      if (!entries.length) {
        return sendJson(res, 200, {
          imported: 0,
          created: 0,
          updated: 0,
          rawText,
          entries: [],
          results: []
        });
      }

      const result = mergeMilitaryOfficials(getOfficials(), entries, {
        sourceLabel: body.sourceLabel || "解放军截图 OCR 导入",
        sourceUrl: body.sourceUrl || ""
      });
      saveOfficials(result.officials);
      return sendJson(res, 200, {
        imported: result.results.length,
        created: result.results.filter((item) => item.action === "created").length,
        updated: result.results.filter((item) => item.action === "updated").length,
        rawText,
        entries,
        results: result.results
      });
    } finally {
      if (imagePath && fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }
  }

  return sendJson(res, 404, { error: "Not found" });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || `${host}:${port}`}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url.pathname);
      return;
    }
    serveStatic(req, res, url.pathname);
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
});

server.listen(port, host, () => {
  startScheduler();
  console.log(`Fanfu web running at http://${host}:${port}`);
});
