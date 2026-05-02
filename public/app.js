const state = {
  officials: [],
  regions: [],
  levels: [],
  militaryLevels: [],
  meta: {},
  currentProfileId: "",
  filters: {
    search: "",
    region: "全部",
    level: "全部"
  }
};

const board = document.getElementById("board");
const regionFilter = document.getElementById("regionFilter");
const levelFilter = document.getElementById("levelFilter");
const searchInput = document.getElementById("searchInput");
const syncButton = document.getElementById("syncButton");
const newButton = document.getElementById("newButton");
const enrichAllButton = document.getElementById("enrichAllButton");
const stopEnrichButton = document.getElementById("stopEnrichButton");
const saveSettingsButton = document.getElementById("saveSettingsButton");
const autoSyncEnabled = document.getElementById("autoSyncEnabled");
const autoSyncInterval = document.getElementById("autoSyncInterval");
const autoEnrichEnabled = document.getElementById("autoEnrichEnabled");
const maxPagesPerSection = document.getElementById("maxPagesPerSection");
const runHistory = document.getElementById("runHistory");
const syncErrors = document.getElementById("syncErrors");
const lastEnrichAt = document.getElementById("lastEnrichAt");
const enrichSummary = document.getElementById("enrichSummary");
const importUrl = document.getElementById("importUrl");
const importTitle = document.getElementById("importTitle");
const importDate = document.getElementById("importDate");
const importSourceLabel = document.getElementById("importSourceLabel");
const importHtml = document.getElementById("importHtml");
const importButton = document.getElementById("importButton");
const sampleSelect = document.getElementById("sampleSelect");
const refreshSamplesButton = document.getElementById("refreshSamplesButton");
const importSampleButton = document.getElementById("importSampleButton");
const screenshotImageInput = document.getElementById("screenshotImageInput");
const screenshotImageImportButton = document.getElementById("screenshotImageImportButton");
const screenshotSourceLabel = document.getElementById("screenshotSourceLabel");
const screenshotSourceUrl = document.getElementById("screenshotSourceUrl");
const screenshotOcrPreview = document.getElementById("screenshotOcrPreview");
const screenshotImportText = document.getElementById("screenshotImportText");
const screenshotImportButton = document.getElementById("screenshotImportButton");
const dialog = document.getElementById("editorDialog");
const classificationDialog = document.getElementById("classificationDialog");
const classificationForm = document.getElementById("classificationForm");
const closeClassificationDialog = document.getElementById("closeClassificationDialog");
const classificationRegionInput = document.getElementById("classificationRegionInput");
const classificationLevelInput = document.getElementById("classificationLevelInput");
const profileDialog = document.getElementById("profileDialog");
const profileLockButton = document.getElementById("profileLockButton");
const form = document.getElementById("editorForm");
const closeDialog = document.getElementById("closeDialog");
const closeProfileDialog = document.getElementById("closeProfileDialog");
const deleteButton = document.getElementById("deleteButton");
const lastSyncAt = document.getElementById("lastSyncAt");
const syncSummary = document.getElementById("syncSummary");
const regionInput = document.getElementById("regionInput");
const levelInput = document.getElementById("levelInput");
const profileName = document.getElementById("profileName");
const profileAvatar = document.getElementById("profileAvatar");
const profileBadges = document.getElementById("profileBadges");
const profileFacts = document.getElementById("profileFacts");
const profileOutcome = document.getElementById("profileOutcome");
const profileSummary = document.getElementById("profileSummary");
const profilePositions = document.getElementById("profilePositions");
const profileTimeline = document.getElementById("profileTimeline");
const profileDetail = document.getElementById("profileDetail");
const profileSources = document.getElementById("profileSources");
const queueProcessed = document.getElementById("queueProcessed");
const queueChanged = document.getElementById("queueChanged");
const queueRemaining = document.getElementById("queueRemaining");
const queueFailed = document.getElementById("queueFailed");
const queueProgressBar = document.getElementById("queueProgressBar");
const queueStatusText = document.getElementById("queueStatusText");
const queueErrorList = document.getElementById("queueErrorList");
const regionQuickNav = document.getElementById("regionQuickNav");
const apiBase = window.location.protocol === "file:" ? "http://127.0.0.1:3000" : "";
const MANUAL_CENTRAL_ROLE_OPTIONS = [
  "中央政治局委员",
  "中央军委委员",
  "中央书记处书记",
  "第十八届中纪委委员",
  "第十九届中纪委委员",
  "第二十届中纪委委员",
  "第十八届中央委员",
  "第十八届中央候补委员",
  "第十九届中央委员",
  "第十九届中央候补委员",
  "第二十届中央委员",
  "第二十届中央候补委员"
];

async function request(url, options = {}) {
  const response = await fetch(`${apiBase}${url}`, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  if (!response.ok) {
    const text = await response.text();
    try {
      const parsed = JSON.parse(text);
      throw new Error(parsed.error || text || "请求失败");
    } catch {
      throw new Error(text || "请求失败");
    }
  }
  return response.json();
}

async function refreshData() {
  const [config, payload] = await Promise.all([request("/api/config"), request("/api/officials")]);
  state.regions = config.regions;
  state.levels = config.levels;
  state.militaryLevels = config.militaryLevels || ["上将", "中将", "少将"];
  state.meta = config.meta;
  state.officials = payload.officials;
  renderMeta();
  renderRegionQuickNav();
  render();
}

async function load() {
  await refreshData();
  await loadSamples();
  populateSelect(regionFilter, ["全部", ...state.regions]);
  populateSelect(levelFilter, ["全部", ...state.levels, ...state.militaryLevels]);
  populateSelect(regionInput, state.regions);
  populateSelect(levelInput, getLevelsForRegion(regionInput.value || state.regions[0]));
  if (classificationRegionInput) populateSelect(classificationRegionInput, state.regions);
  if (classificationLevelInput) populateSelect(classificationLevelInput, getLevelsForRegion(classificationRegionInput?.value || state.regions[0]));
}

function populateSelect(select, options) {
  const currentValue = select.value;
  select.innerHTML = options.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join("");
  if (options.includes(currentValue)) {
    select.value = currentValue;
  }
}

function isMilitaryRegion(region) {
  return region === "解放军";
}

function getLevelsForRegion(region) {
  return isMilitaryRegion(region) ? state.militaryLevels : state.levels;
}

function syncLevelSelectForRegion(select, region, preferredValue) {
  const options = getLevelsForRegion(region);
  populateSelect(select, options);
  if (preferredValue && options.includes(preferredValue)) {
    select.value = preferredValue;
  } else if (!options.includes(select.value)) {
    select.value = options[0] || "";
  }
}

function shouldAlsoShowInCentralColumn(item) {
  if (!item || item.region !== "解放军" || item.level !== "上将") {
    return false;
  }
  const text = [item.lastPosition || "", ...(item.centralRoles || []), item.summary || "", item.detail || ""].join(" ");
  return /中央军委委员|中共中央军事委员会副主席|中华人民共和国中央军事委员会副主席|国务委员|国防部部长|联合参谋部参谋长|中央军委政治工作部主任/.test(
    text
  );
}

function hasVisualPortrait(item) {
  return Boolean(item?.photo) && (/^(https?:)?\/\//.test(String(item.photo || "")) || String(item.photo || "").startsWith("/"));
}

function renderAvatarMarkup(item, className = "profile-avatar-photo") {
  if (!hasVisualPortrait(item)) {
    return "";
  }
  return `<img class="${className}" src="${escapeAttribute(item.photo)}" alt="${escapeAttribute(item.name || "官员头像")}" loading="lazy" referrerpolicy="no-referrer">`;
}

function renderProfileAvatar(item) {
  const imageMarkup = renderAvatarMarkup(item);
  if (imageMarkup) {
    profileAvatar.classList.add("has-photo");
    profileAvatar.innerHTML = imageMarkup;
    return;
  }
  profileAvatar.classList.remove("has-photo");
  profileAvatar.textContent = getProfileInitials(item.name);
}

function renderMeta() {
  const settings = state.meta.settings || {};
  const queue = state.meta.enrichQueue || {};
  lastSyncAt.textContent = state.meta.lastSyncAt || "未同步";
  syncSummary.textContent = state.meta.lastSyncSummary || state.meta.note || "暂无说明";
  lastEnrichAt.textContent = state.meta.lastEnrichAt || "未执行";
  enrichSummary.textContent = state.meta.lastEnrichSummary || "暂无补全记录";
  autoSyncEnabled.checked = Boolean(settings.autoSyncEnabled);
  autoSyncInterval.value = settings.autoSyncIntervalMinutes || 180;
  autoEnrichEnabled.checked = settings.autoEnrichEnabled !== false;
  maxPagesPerSection.value = settings.maxPagesPerSection || 20;
  const total = Number(queue.total || 0);
  const processed = Number(queue.processed || 0);
  const percent = total > 0 ? Math.max(0, Math.min(100, Math.round((processed / total) * 100))) : 0;
  if (queueProcessed) queueProcessed.textContent = String(queue.processed || 0);
  if (queueChanged) queueChanged.textContent = String(queue.changed || 0);
  if (queueRemaining) queueRemaining.textContent = String(queue.remaining || 0);
  if (queueFailed) queueFailed.textContent = String(queue.failed || 0);
  if (queueProgressBar) queueProgressBar.style.width = `${percent}%`;
  if (queueStatusText) {
    queueStatusText.textContent = queue.running
      ? queue.stopRequested
        ? `正在停止中：已扫描 ${processed} / ${total}，更新 ${queue.changed || 0}，失败 ${queue.failed || 0}。`
        : `后台补全进行中：已扫描 ${processed} / ${total}，更新 ${queue.changed || 0}，失败 ${queue.failed || 0}，还剩 ${queue.remaining || 0}。`
      : queue.total
        ? `最近一次批量补全：已扫描 ${processed} / ${total}，更新 ${queue.changed || 0}，失败 ${queue.failed || 0}，还剩 ${queue.remaining || 0}。`
        : "当前没有正在运行的批量补全任务。";
  }
  if (queueErrorList) {
    const errors = queue.recentErrors || [];
    queueErrorList.innerHTML = errors.length
      ? errors.map((item) => `<div>${escapeHtml(item.name || "未知条目")}：${escapeHtml(item.message || "未知错误")}</div>`).join("")
      : "";
  }
  if (stopEnrichButton) stopEnrichButton.disabled = !queue.running;
  renderSyncErrors();
  renderRunHistory();
}

function renderSyncErrors() {
  const errors = state.meta.lastSyncErrors || [];
  if (!errors.length) {
    syncErrors.innerHTML = `<div class="small">最近一次同步没有记录失败项。</div>`;
    return;
  }
  syncErrors.innerHTML = errors
    .map(
      (item) => `
        <div class="run-item">
          <div><strong>${escapeHtml(item.section || "未知栏目")}</strong></div>
          <div class="small">${escapeHtml(item.message || "未知错误")}</div>
        </div>
      `
    )
    .join("");
}

function renderRunHistory() {
  const items = state.meta.recentRuns || [];
  if (!items.length) {
    runHistory.innerHTML = `<div class="small">暂无运行记录。</div>`;
    return;
  }
  runHistory.innerHTML = items
    .map((item) => {
      const main = item.error
        ? `失败：${escapeHtml(item.error)}`
        : `同步扫描 ${escapeHtml(item.sync?.scanned || 0)} 条，新增 ${escapeHtml(item.sync?.created || 0)} 条，更新 ${escapeHtml(item.sync?.updated || 0)} 条`;
      const enrich = item.enrich?.processed
        ? `；补全 ${escapeHtml(item.enrich.processed)} 人，更新 ${escapeHtml(item.enrich.changed || 0)} 人`
        : "";
      return `
        <div class="run-item">
          <div><strong>${escapeHtml(item.reason || "manual")}</strong> · ${escapeHtml(item.finishedAt || item.startedAt || "")}</div>
          <div class="small">${main}${enrich}</div>
        </div>
      `;
    })
    .join("");
}

function renderRegionQuickNav() {
  if (!regionQuickNav) return;
  const regionOrder = [
    "中央部委/央企",
    "解放军",
    ...state.regions.filter((region) => !["中央部委/央企", "解放军"].includes(region))
  ];
  regionQuickNav.innerHTML = regionOrder
    .map((region) => {
      const count =
        region === "中央部委/央企"
          ? state.officials.filter((item) => item.region === region || shouldAlsoShowInCentralColumn(item)).length
          : state.officials.filter((item) => item.region === region).length;
      return `
        <a class="region-quick-link" href="/region.html?region=${encodeURIComponent(region)}">
          <span>${escapeHtml(region)}</span>
          <strong>${count}</strong>
        </a>
      `;
    })
    .join("");
}

async function loadSamples() {
  try {
    const response = await request("/api/samples");
    const files = response.files || [];
    populateSelect(sampleSelect, files.length ? files : ["暂无样本"]);
  } catch {
    populateSelect(sampleSelect, ["暂无样本"]);
  }
}

function render() {
  const keyword = state.filters.search.trim();
  const filtered = state.officials.filter((item) => {
    const combined = [item.name, item.lastPosition, item.summary, item.region, item.level, item.detail].join(" ");
    if (keyword && !combined.includes(keyword)) return false;
    if (state.filters.region !== "全部" && item.region !== state.filters.region) return false;
    if (state.filters.level !== "全部" && item.level !== state.filters.level) return false;
    return true;
  });

  const regionOrder = [
    "中央部委/央企",
    "解放军",
    ...state.regions.filter((region) => !["中央部委/央企", "解放军"].includes(region))
  ];

  board.innerHTML = regionOrder
    .map((region) => renderRegion(region, filtered))
    .join("");

  board.querySelectorAll("[data-edit-id]").forEach((button) => {
    button.addEventListener("click", () => {
      openEditor(state.officials.find((item) => item.id === button.dataset.editId));
    });
  });

  board.querySelectorAll("[data-enrich-id]").forEach((button) => {
    button.addEventListener("click", () => enrichOne(button.dataset.enrichId, button));
  });

  board.querySelectorAll("[data-reclassify-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = state.officials.find((official) => official.id === button.dataset.reclassifyId);
      if (item) openClassificationEditor(item);
    });
  });

  board.querySelectorAll("[data-profile-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = state.officials.find((official) => official.id === button.dataset.profileId);
      if (item) openProfile(item);
    });
  });

  board.querySelectorAll("[data-lock-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleOfficialLock(button.dataset.lockId, button, { silent: true });
    });
  });
}

function renderRegion(region, list) {
  const displayList =
    region === "中央部委/央企"
      ? list.filter((item) => item.region === region || shouldAlsoShowInCentralColumn(item))
      : list.filter((item) => item.region === region);
  if (isMilitaryRegion(region)) {
    const counts = {
      上将: displayList.filter((item) => item.level === "上将").length,
      中将: displayList.filter((item) => item.level === "中将").length,
      少将: displayList.filter((item) => item.level === "少将").length
    };
    const items = displayList.filter((item) => item.level === "上将").sort((a, b) => (b.investigationDate || "").localeCompare(a.investigationDate || ""));
    const sections = items.length
      ? `
        <section class="level-block">
          <h3>上将</h3>
          <div class="card-list">
            ${items.map((item) => renderCard(item)).join("")}
          </div>
        </section>
      `
      : "";
    return `
      <section class="region-column">
        <div class="region-header">
          <h2><a class="region-link" href="/region.html?region=${encodeURIComponent(region)}">${escapeHtml(region)}</a></h2>
          <span class="region-count">上将 ${counts.上将} · 中将 ${counts.中将} · 少将 ${counts.少将}</span>
        </div>
        ${sections || `<p class="small">首页当前仅展示解放军栏目的上将卡片，完整名单请点击地区名称进入子页面。</p>`}
      </section>
    `;
  }
  const counts = {
    "国家级": displayList.filter((item) => item.level === "国家级" || shouldAlsoShowInCentralColumn(item)).length,
    "省部级": displayList.filter((item) => item.level === "省部级").length,
    "厅局级": displayList.filter((item) => item.level === "厅局级").length
  };
  const overviewLevels = region === "中央部委/央企" ? ["国家级", "省部级"] : ["省部级"];
  const sections = overviewLevels
    .map((level) => {
      const items = displayList
        .filter((item) => (level === "国家级" ? item.level === "国家级" || shouldAlsoShowInCentralColumn(item) : item.level === level))
        .sort((a, b) => (b.investigationDate || "").localeCompare(a.investigationDate || ""));
      if (!items.length) return "";
      return `
        <section class="level-block">
          <h3>${escapeHtml(level)}</h3>
          <div class="card-list ${region === "中央部委/央企" ? "card-list-central" : ""}">
            ${items.map((item) => renderCard(item)).join("")}
          </div>
        </section>
      `;
    })
    .join("");

  const columnClass = region === "中央部委/央企" ? "region-column region-column-central" : "region-column";
  const emptyText =
    region === "中央部委/央企"
      ? "首页当前展示中央部委/央企的国家级与省部级官员，完整名单请点击地区名称进入子页面。"
      : "首页当前仅展示省部级官员，完整名单请点击地区名称进入子页面。";

  return `
    <section class="${columnClass}">
      <div class="region-header">
        <h2><a class="region-link" href="/region.html?region=${encodeURIComponent(region)}">${escapeHtml(region)}</a></h2>
        <span class="region-count">国家级 ${counts["国家级"]} · 省部级 ${counts["省部级"]} · 厅局级 ${counts["厅局级"]}</span>
      </div>
      ${sections || `<p class="small">${escapeHtml(emptyText)}</p>`}
    </section>
  `;
}

function getResumeSignals(item) {
  return [
    item.lastPosition || "",
    ...(item.centralRoles || []),
    ...(item.previousPositions || []),
    item.summary || "",
    item.detail || ""
  ]
    .join(" ")
    .replace(/\s+/g, " ");
}

function extractIdentityBadges(item) {
  const text = getResumeSignals(item);
  const badges = [...(item.centralRoles || [])];
  if (/中央政治局委员/.test(text)) badges.push("中央政治局委员");
  if (/中央军委委员/.test(text)) badges.push("中央军委委员");
  if (/中央书记处书记/.test(text)) badges.push("中央书记处书记");
  const committeeMatches = text.match(/第[一二三四五六七八九十0-9]+届中央委员/g) || [];
  const alternateMatches = text.match(/第[一二三四五六七八九十0-9]+届中央候补委员/g) || [];
  return compressIdentityBadges([...badges, ...committeeMatches, ...alternateMatches].filter((value, index, list) => list.indexOf(value) === index));
}

function compressIdentityBadges(badges) {
  const normal = [];
  const committee = [];
  const alternate = [];
  const disciplinary = [];

  for (const badge of badges) {
    const committeeMatch = badge.match(/^第([一二三四五六七八九十0-9]+)届中央委员$/);
    const alternateMatch = badge.match(/^第([一二三四五六七八九十0-9]+)届中央候补委员$/);
    const disciplinaryMatch = badge.match(/^第([一二三四五六七八九十0-9]+)届中纪委委员$/);
    if (committeeMatch) {
      committee.push(committeeMatch[1]);
      continue;
    }
    if (alternateMatch) {
      alternate.push(alternateMatch[1]);
      continue;
    }
    if (disciplinaryMatch) {
      disciplinary.push(disciplinaryMatch[1]);
      continue;
    }
    normal.push(badge);
  }

  if (committee.length) {
    normal.push(formatCompressedCentralBadge(committee, "中央委员"));
  }
  if (alternate.length) {
    normal.push(formatCompressedCentralBadge(alternate, "中央候补委员"));
  }
  if (disciplinary.length) {
    normal.push(formatCompressedCentralBadge(disciplinary, "中纪委委员"));
  }

  return normal;
}

function formatCompressedCentralBadge(terms, suffix) {
  const uniqueTerms = [...new Set(terms)];
  if (!uniqueTerms.length) return "";
  if (uniqueTerms.length === 1) return `第${uniqueTerms[0]}届${suffix}`;
  return `第${uniqueTerms.join("、")}届${suffix}`;
}

function renderIdentityBadges(item) {
  const badges = extractIdentityBadges(item);
  if (!badges.length) return "";
  return `
    <div class="identity-badges">
      ${badges.map((badge) => `<span class="identity-badge">${escapeHtml(badge)}</span>`).join("")}
    </div>
  `;
}

function renderLockButton(item) {
  const label = item.locked ? "已锁定，点击解锁" : "未锁定，点击锁定";
  const text = item.locked ? "已锁定" : "锁定";
  const stateClass = item.locked ? "is-locked" : "is-unlocked";
  return `
    <button
      class="card-lock-button ${stateClass}"
      type="button"
      data-lock-id="${escapeHtml(item.id)}"
      aria-label="${escapeAttribute(label)}"
      title="${escapeAttribute(label)}"
    >
      <span class="card-lock-icon" aria-hidden="true">${item.locked ? "锁" : "开"}</span>
      <span class="card-lock-text">${escapeHtml(text)}</span>
    </button>
  `;
}

function renderCard(item) {
  const timelineItems = (item.timeline || []).slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const latest = timelineItems[0];
  const summaryText = String(item.summary || item.detail || "").trim();
  const latestSummary = String(latest?.summary || "").trim();
  const normalizedSummary = summaryText.replace(/\s+/g, " ");
  const normalizedLatest = latestSummary.replace(/\s+/g, " ");
  const showSummary = normalizedSummary && normalizedSummary !== normalizedLatest;
  const progress = latest
    ? `
        <div class="timeline compact-timeline">
          <div class="timeline-item">
            <strong>${escapeHtml(latest.date || item.investigationDate || "日期待补")}</strong>
            <span class="tag">${escapeHtml(latest.stage || item.status || "阶段待补")}</span>
            <div class="small">${escapeHtml(latest.summary || item.summary || item.detail || "")}</div>
          </div>
        </div>
      `
    : "";

  return `
    <article class="card">
      <div class="card-head ${hasVisualPortrait(item) ? "card-head-with-photo" : ""}">
        <div class="card-head-main">
          ${hasVisualPortrait(item) ? `<div class="card-portrait">${renderAvatarMarkup(item, "card-portrait-image")}</div>` : ""}
          <div class="card-head-copy">
            <h4><button class="name-button" data-profile-id="${escapeHtml(item.id)}">${escapeHtml(item.name)}</button></h4>
            ${renderIdentityBadges(item)}
            <div class="small">${escapeHtml(item.lastPosition || "职务待补")}</div>
          </div>
        </div>
        ${renderLockButton(item)}
      </div>
      <div class="meta">
        <span class="tag">${escapeHtml(item.investigationDate || "日期待补")}</span>
        ${item.birth ? `<span class="tag">${escapeHtml(item.birth)}</span>` : ""}
        <span class="tag">${escapeHtml(item.level)}</span>
      </div>
      ${showSummary ? `<p class="summary">${escapeHtml(summaryText)}</p>` : ""}
      ${progress || (summaryText ? "" : `<div class="small summary-empty">暂无摘要。</div>`)}
      <div class="card-actions">
        <button class="secondary" data-edit-id="${escapeHtml(item.id)}">编辑</button>
        <button class="ghost" data-reclassify-id="${escapeHtml(item.id)}">改地区/级别</button>
        <button class="ghost" data-enrich-id="${escapeHtml(item.id)}">百科补全</button>
      </div>
    </article>
  `;
}

function openClassificationEditor(item) {
  classificationForm.elements.id.value = item.id || "";
  classificationForm.elements.name.value = item.name || "";
  classificationForm.elements.region.value = item.region || state.regions[0] || "";
  syncLevelSelectForRegion(classificationForm.elements.level, classificationForm.elements.region.value, item.level || getLevelsForRegion(classificationForm.elements.region.value)[0] || "");
  classificationDialog.showModal();
}

function openEditor(item) {
  const draft =
    item ||
    {
      id: `manual-${Date.now()}`,
      name: "",
      birth: "",
      region: state.regions[0],
      level: getLevelsForRegion(state.regions[0])[0] || state.levels[0],
      lastPosition: "",
      centralRoles: [],
      previousPositions: [],
      investigationDate: "",
      status: "审查调查",
      summary: "",
      detail: "",
      timeline: [],
      sources: [],
      createdAt: new Date().toISOString()
    };

  form.elements.id.value = draft.id || "";
  form.elements.name.value = draft.name || "";
  form.elements.birth.value = draft.birth || "";
  form.elements.investigationDate.value = draft.investigationDate || "";
  form.elements.region.value = draft.region || state.regions[0];
  syncLevelSelectForRegion(form.elements.level, form.elements.region.value, draft.level || getLevelsForRegion(form.elements.region.value)[0] || "");
  form.elements.lastPosition.value = draft.lastPosition || "";
  form.elements.previousPositions.value = (draft.previousPositions || []).join("|");
  const selectedCentralRoles = new Set(draft.centralRoles || []);
  form.querySelectorAll('input[name="centralRoles"]').forEach((input) => {
    input.checked = selectedCentralRoles.has(input.value);
  });
  form.elements.status.value = draft.status || "";
  form.elements.sourceLabel.value = draft.sources?.[0]?.label || "";
  form.elements.sourceUrl.value = draft.sources?.[0]?.url || "";
  form.elements.photoUrl.value = draft.photo || "";
  form.elements.photoFile.value = "";
  form.elements.summary.value = draft.summary || "";
  form.elements.detail.value = draft.detail || "";
  form.elements.timeline.value = (draft.timeline || [])
    .map((entry) => [entry.date || "", entry.stage || "", entry.summary || "", entry.url || ""].join("|"))
    .join("\n");
  form.dataset.originalRegion = draft.region || "";
  form.dataset.originalLevel = draft.level || "";
  form.dataset.regionTouched = "false";
  form.dataset.levelTouched = "false";
  deleteButton.dataset.id = draft.id || "";
  dialog.showModal();
}

function openProfile(item) {
  state.currentProfileId = item.id || "";
  profileName.textContent = item.name || "未命名";
  renderProfileAvatar(item);
  profileBadges.innerHTML = [
    item.status ? renderStageTag(item.status) : "",
    item.level ? `<span class="tag tag-soft">${escapeHtml(item.level)}</span>` : "",
    item.region ? `<span class="tag tag-soft">${escapeHtml(item.region)}</span>` : "",
    item.locked ? `<span class="tag tag-soft">已锁定</span>` : "",
    ...extractIdentityBadges(item).map((badge) => `<span class="identity-badge">${escapeHtml(badge)}</span>`)
  ]
    .filter(Boolean)
    .join("");
  if (profileLockButton) {
    profileLockButton.textContent = item.locked ? "解除锁定" : "锁定资料";
    profileLockButton.dataset.id = item.id || "";
  }

  const facts = [
    item.birth ? `出生年月：${item.birth}` : "",
    item.lastPosition ? `最后职务：${item.lastPosition}` : "",
    item.investigationDate ? `被查时间：${item.investigationDate}` : ""
  ].filter(Boolean);
  profileFacts.innerHTML = facts.map((fact) => `<span class="fact-chip">${escapeHtml(fact)}</span>`).join("");
  profileOutcome.innerHTML = renderOutcomeSummary(item);

  profileSummary.textContent = item.summary || item.detail || "暂无摘要。";

  const positions = (item.previousPositions || []).filter(Boolean);
  profilePositions.innerHTML = positions.length
    ? positions.map((position, index) => `<div class="profile-item"><div class="small">履历节点 ${index + 1}</div><div class="profile-item-title">${escapeHtml(position)}</div></div>`).join("")
    : `<div class="small">暂无曾任职务信息。</div>`;

  const timeline = (item.timeline || []).slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  profileTimeline.innerHTML = timeline.length
    ? timeline
        .map(
          (entry) => `
            <div class="profile-timeline-item">
              <div class="profile-timeline-rail"></div>
              <div class="profile-timeline-dot ${escapeHtml(getStageTone(entry.stage || item.status || ""))}"></div>
              <div class="profile-timeline-body">
                <div class="small">${escapeHtml(entry.date || "日期待补")}</div>
                <div class="profile-timeline-head">
                  <div class="profile-item-title">${escapeHtml(entry.stage || "进展待补")}</div>
                  ${renderStageTag(entry.stage || "")}
                </div>
                <div>${escapeHtml(entry.summary || "")}</div>
                ${entry.url ? `<a class="timeline-link" href="${escapeAttribute(entry.url)}" target="_blank" rel="noreferrer">查看原文</a>` : ""}
              </div>
            </div>
          `
        )
        .join("")
    : `<div class="small">暂无处理进展。</div>`;

  profileDetail.textContent = item.detail || "暂无详情。";
  profileSources.innerHTML = (item.sources || []).length
    ? item.sources
        .map(
          (source) => `
            <span class="source-chip">${escapeHtml(source.label || "来源")} · ${escapeHtml(source.url || "")}</span>
          `
        )
        .join("")
    : `<span class="small">暂无来源信息。</span>`;

  profileDialog.showModal();
}

function getProfileInitials(name) {
  const text = String(name || "").trim();
  if (!text) return "档";
  return text.slice(0, 2);
}

function getStageTone(stage) {
  const value = String(stage || "");
  if (/(判|审理|起诉|移送司法|逮捕)/.test(value)) return "tone-judicial";
  if (/(处分|开除党籍|双开|开除公职)/.test(value)) return "tone-disciplinary";
  return "tone-investigation";
}

function renderStageTag(stage) {
  if (!stage) return "";
  const tone = getStageTone(stage);
  return `<span class="tag ${tone}">${escapeHtml(stage)}</span>`;
}

function renderOutcomeSummary(item) {
  const timeline = (item.timeline || []).slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const latest = timeline[0];
  const latestStage = latest?.stage || item.status || "阶段待补";
  const latestDate = latest?.date || item.investigationDate || "日期待补";
  const summary = latest?.summary || item.summary || item.detail || "暂无处理结果摘要。";
  return `
    <div class="outcome-card">
      <div class="small">当前处理结果</div>
      <div class="outcome-head">
        ${renderStageTag(latestStage)}
        <strong>${escapeHtml(latestDate)}</strong>
      </div>
      <div class="outcome-text">${escapeHtml(summary)}</div>
    </div>
  `;
}

function escapeAttribute(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("读取截图失败"));
    reader.readAsDataURL(file);
  });
}

function renderScreenshotPreview(entries, rawText) {
  if (!screenshotOcrPreview) return;
  if (entries?.length) {
    screenshotOcrPreview.innerHTML = entries
      .map((entry, index) => `<div>${index + 1}. ${escapeHtml(entry.headline)} | ${escapeHtml(entry.date)}</div>`)
      .join("");
    return;
  }
  screenshotOcrPreview.innerHTML = rawText
    ? `<div>未自动配对出可导入条目，请检查下方文本框并手动修正：</div><pre>${escapeHtml(rawText)}</pre>`
    : "本次没有识别出可用文字。";
}

async function readFormPayload() {
  const originalRegion = form.dataset.originalRegion || "";
  const originalLevel = form.dataset.originalLevel || "";
  const regionTouched = form.dataset.regionTouched === "true";
  const levelTouched = form.dataset.levelTouched === "true";
  const timeline = form.elements.timeline.value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [date, stage, summary, url] = line.split("|");
      return {
        date: (date || "").trim(),
        stage: (stage || "").trim(),
        summary: (summary || "").trim(),
        url: (url || "").trim()
      };
    });
  const centralRoles = Array.from(form.querySelectorAll('input[name="centralRoles"]:checked'))
    .map((input) => input.value)
    .filter((value) => MANUAL_CENTRAL_ROLE_OPTIONS.includes(value));
  const photoFile = form.elements.photoFile?.files?.[0];
  const photoUrl = form.elements.photoUrl.value.trim();

  const payload = {
    id: form.elements.id.value.trim(),
    name: form.elements.name.value.trim(),
    birth: form.elements.birth.value.trim(),
    investigationDate: form.elements.investigationDate.value.trim(),
    manualRegionOverride: true,
    manualLevelOverride: true,
    region: !regionTouched && originalRegion ? originalRegion : form.elements.region.value,
    level: !levelTouched && originalLevel ? originalLevel : form.elements.level.value,
    lastPosition: form.elements.lastPosition.value.trim(),
    centralRoles,
    previousPositions: form.elements.previousPositions.value
      .split("|")
      .map((item) => item.trim())
      .filter(Boolean),
    status: form.elements.status.value.trim(),
    summary: form.elements.summary.value.trim(),
    detail: form.elements.detail.value.trim(),
    timeline,
    sources: form.elements.sourceUrl.value.trim()
      ? [
          {
            type: "manual",
            label: form.elements.sourceLabel.value.trim() || "手动录入",
            url: form.elements.sourceUrl.value.trim()
          }
        ]
      : []
  };

  if (photoUrl) {
    payload.photo = photoUrl;
    payload.manualPhotoOverride = true;
  }
  if (photoFile) {
    payload.photoUploadData = await fileToDataUrl(photoFile);
    payload.photoUploadFilename = photoFile.name;
    payload.manualPhotoOverride = true;
  }

  return payload;
}

async function saveSettings() {
  saveSettingsButton.disabled = true;
  saveSettingsButton.textContent = "保存中...";
  try {
    const response = await request("/api/settings", {
      method: "POST",
      body: JSON.stringify({
        autoSyncEnabled: autoSyncEnabled.checked,
        autoSyncIntervalMinutes: Number(autoSyncInterval.value) || 180,
        autoEnrichEnabled: autoEnrichEnabled.checked,
        maxPagesPerSection: Number(maxPagesPerSection.value) || 20
      })
    });
    state.meta = response.meta;
    renderMeta();
    alert("设置已保存。");
  } catch (error) {
    alert(`保存设置失败：${error.message}`);
  } finally {
    saveSettingsButton.disabled = false;
    saveSettingsButton.textContent = "保存设置";
  }
}

async function enrichOne(id, button) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "补全中...";
  try {
    const response = await request("/api/enrich", {
      method: "POST",
      body: JSON.stringify({ id })
    });
    state.meta = response.meta;
    state.officials = (await request("/api/officials")).officials;
    renderMeta();
    render();
    alert(
      response.skippedLocked
        ? "该官员资料已锁定，本次百科补全已自动跳过。"
        : response.changed
          ? "百科补全完成，已写入新信息。"
          : "已执行百科补全，但这次没有发现可安全写入的新信息。"
    );
  } catch (error) {
    alert(`补全失败：${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

async function enrichAll() {
  enrichAllButton.disabled = true;
  enrichAllButton.textContent = "补全中...";
  try {
    const response = await request("/api/enrich", {
      method: "POST",
      body: JSON.stringify({})
    });
    state.meta = response.meta;
    renderMeta();
    if (response.started) {
      alert("一键百科补全已经启动，系统会在后台分批执行。你可以继续浏览页面，结果会陆续写入。");
    } else {
      alert("一键百科补全任务已经在后台运行中。");
    }
  } catch (error) {
    alert(`批量补全失败：${error.message}`);
  } finally {
    enrichAllButton.disabled = false;
    enrichAllButton.textContent = "一键百科补全";
  }
}

async function stopEnrichQueue() {
  stopEnrichButton.disabled = true;
  const original = stopEnrichButton.textContent;
  stopEnrichButton.textContent = "停止中...";
  try {
    const response = await request("/api/enrich/stop", {
      method: "POST",
      body: JSON.stringify({})
    });
    state.meta = response.meta;
    renderMeta();
    alert("已发送停止请求，当前批次结束后会停止。");
  } catch (error) {
    alert(`停止失败：${error.message}`);
  } finally {
    stopEnrichButton.textContent = original;
  }
}

async function importArticle() {
  importButton.disabled = true;
  importButton.textContent = "导入中...";
  try {
    await request("/api/import", {
      method: "POST",
      body: JSON.stringify({
        url: importUrl.value.trim(),
        html: importHtml.value.trim(),
        title: importTitle.value.trim(),
        date: importDate.value.trim(),
        sourceLabel: importSourceLabel.value.trim()
      })
    });
    await refreshData();
    importUrl.value = "";
    importTitle.value = "";
    importDate.value = "";
    importSourceLabel.value = "";
    importHtml.value = "";
    alert("文章已导入。");
  } catch (error) {
    alert(`导入失败：${error.message}`);
  } finally {
    importButton.disabled = false;
    importButton.textContent = "导入文章";
  }
}

async function importSample() {
  const file = sampleSelect.value;
  if (!file || file === "暂无样本") {
    alert("当前没有可导入的样本。");
    return;
  }
  importSampleButton.disabled = true;
  importSampleButton.textContent = "导入中...";
  try {
    await request("/api/import-sample", {
      method: "POST",
      body: JSON.stringify({
        file,
        title: importTitle.value.trim(),
        date: importDate.value.trim(),
        sourceLabel: importSourceLabel.value.trim()
      })
    });
    await refreshData();
    alert("样本已导入。");
  } catch (error) {
    alert(`样本导入失败：${error.message}`);
  } finally {
    importSampleButton.disabled = false;
    importSampleButton.textContent = "导入样本";
  }
}

async function importScreenshotBatch() {
  const text = screenshotImportText.value.trim();
  if (!text) {
    alert("请先粘贴截图识别结果，每行一条“标题 | 日期”。");
    return;
  }
  screenshotImportButton.disabled = true;
  screenshotImportButton.textContent = "导入中...";
  try {
    const response = await request("/api/import-screenshot", {
      method: "POST",
      body: JSON.stringify({
        text,
        sourceLabel: screenshotSourceLabel.value.trim(),
        sourceUrl: screenshotSourceUrl.value.trim()
      })
    });
    await refreshData();
    screenshotImportText.value = "";
    alert(`截图条目已导入：新增 ${response.created} 条，更新 ${response.updated} 条。`);
  } catch (error) {
    alert(`截图导入失败：${error.message}`);
  } finally {
    screenshotImportButton.disabled = false;
    screenshotImportButton.textContent = "批量导入截图条目";
  }
}

async function importScreenshotImage() {
  const file = screenshotImageInput?.files?.[0];
  if (!file) {
    alert("请先选择一张截图图片。");
    return;
  }
  screenshotImageImportButton.disabled = true;
  screenshotImageImportButton.textContent = "识别中...";
  try {
    const imageData = await fileToDataUrl(file);
    const response = await request("/api/import-screenshot-image", {
      method: "POST",
      body: JSON.stringify({
        imageData,
        filename: file.name,
        sourceLabel: screenshotSourceLabel.value.trim(),
        sourceUrl: screenshotSourceUrl.value.trim()
      })
    });
    const lines = (response.entries || []).map((entry) => `${entry.headline} | ${entry.date}`);
    screenshotImportText.value = lines.join("\n");
    renderScreenshotPreview(response.entries || [], response.rawText || "");
    await refreshData();
    if (response.entries?.length) {
      alert(`截图识别完成并已导入：识别 ${response.entries.length} 条，新增 ${response.created} 条，更新 ${response.updated} 条。`);
    } else {
      alert("截图已上传，但这次没有自动识别出可直接导入的条目。我已经把 OCR 原文回填到预览区，方便你手动修正。");
    }
  } catch (error) {
    alert(`截图识别失败：${error.message}`);
  } finally {
    screenshotImageImportButton.disabled = false;
    screenshotImageImportButton.textContent = "上传截图并识别导入";
  }
}

async function toggleProfileLock() {
  const id = state.currentProfileId;
  if (!id || !profileLockButton) return;
  await toggleOfficialLock(id, profileLockButton, { reopenProfile: true });
}

async function toggleOfficialLock(id, button, options = {}) {
  const item = state.officials.find((official) => official.id === id);
  if (!id || !item) return;
  const nextLocked = !item.locked;
  const original = button?.textContent || "";
  if (button) {
    button.disabled = true;
    button.textContent = nextLocked ? "锁定中..." : "解锁中...";
  }
  try {
    await request("/api/officials/lock", {
      method: "POST",
      body: JSON.stringify({ id, locked: nextLocked })
    });
    await refreshData();
    if (options.reopenProfile) {
      const refreshed = state.officials.find((official) => official.id === id);
      if (refreshed) openProfile(refreshed);
    }
    if (!options.silent) {
      alert(nextLocked ? "资料已锁定，后续百科补全会跳过这条。需要继续更新时可随时解锁。" : "资料已解锁，后续可以继续手动编辑和百科补全。");
    }
  } catch (error) {
    alert(`切换锁定状态失败：${error.message}`);
  } finally {
    if (button) {
      button.disabled = false;
      const latest = state.officials.find((official) => official.id === id);
      if (button === profileLockButton) {
        button.textContent = latest?.locked ? "解除锁定" : "锁定资料";
      } else {
        button.textContent = original;
      }
    }
  }
}

searchInput.addEventListener("input", () => {
  state.filters.search = searchInput.value;
  render();
});

regionFilter.addEventListener("change", () => {
  state.filters.region = regionFilter.value;
  render();
});

levelFilter.addEventListener("change", () => {
  state.filters.level = levelFilter.value;
  render();
});

regionInput.addEventListener("change", () => {
  form.dataset.regionTouched = "true";
  syncLevelSelectForRegion(levelInput, regionInput.value, levelInput.value);
});

levelInput.addEventListener("change", () => {
  form.dataset.levelTouched = "true";
});

if (classificationRegionInput && classificationLevelInput) {
  classificationRegionInput.addEventListener("change", () => {
    syncLevelSelectForRegion(classificationLevelInput, classificationRegionInput.value, classificationLevelInput.value);
  });
}

syncButton.addEventListener("click", async () => {
  syncButton.disabled = true;
  syncButton.textContent = "同步中...";
  try {
    const response = await request("/api/sync", { method: "POST", body: "{}" });
    state.meta = response.meta;
    state.officials = (await request("/api/officials")).officials;
    renderMeta();
    render();
  } catch (error) {
    alert(`同步失败：${error.message}`);
  } finally {
    syncButton.disabled = false;
    syncButton.textContent = "执行官网同步";
  }
});

if (enrichAllButton) enrichAllButton.addEventListener("click", enrichAll);
if (stopEnrichButton) stopEnrichButton.addEventListener("click", stopEnrichQueue);
if (saveSettingsButton) saveSettingsButton.addEventListener("click", saveSettings);
if (importButton) importButton.addEventListener("click", importArticle);
if (refreshSamplesButton) refreshSamplesButton.addEventListener("click", loadSamples);
if (importSampleButton) importSampleButton.addEventListener("click", importSample);
if (screenshotImageImportButton) screenshotImageImportButton.addEventListener("click", importScreenshotImage);
if (screenshotImportButton) screenshotImportButton.addEventListener("click", importScreenshotBatch);
if (newButton) newButton.addEventListener("click", () => openEditor(null));
if (closeDialog) closeDialog.addEventListener("click", () => dialog.close());
if (closeClassificationDialog) closeClassificationDialog.addEventListener("click", () => classificationDialog.close());
if (closeProfileDialog) closeProfileDialog.addEventListener("click", () => profileDialog.close());
if (profileLockButton) profileLockButton.addEventListener("click", toggleProfileLock);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const payload = await readFormPayload();
    await request("/api/officials/upsert", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    state.officials = (await request("/api/officials")).officials;
    render();
    dialog.close();
  } catch (error) {
    alert(`保存失败：${error.message}`);
  }
});

classificationForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = classificationForm.elements.id.value.trim();
  const name = classificationForm.elements.name.value.trim();
  try {
    await request("/api/officials/upsert", {
      method: "POST",
      body: JSON.stringify({
        id,
        name,
        region: classificationForm.elements.region.value,
        level: classificationForm.elements.level.value,
        manualRegionOverride: true,
        manualLevelOverride: true
      })
    });
    state.officials = (await request("/api/officials")).officials;
    render();
    classificationDialog.close();
    alert("归档已修正。后续自动归类不会再覆盖这条手动设置。");
  } catch (error) {
    alert(`归档修正失败：${error.message}`);
  }
});

deleteButton.addEventListener("click", async () => {
  const id = deleteButton.dataset.id;
  if (!id) return;
  if (!window.confirm("确认删除这个条目吗？")) return;
  try {
    await request("/api/officials/delete", {
      method: "POST",
      body: JSON.stringify({ id })
    });
    state.officials = (await request("/api/officials")).officials;
    render();
    dialog.close();
  } catch (error) {
    alert(`删除失败：${error.message}`);
  }
});

load().catch((error) => {
  syncSummary.textContent = `加载失败：${error.message}`;
});
