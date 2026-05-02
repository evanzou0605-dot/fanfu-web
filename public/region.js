const state = {
  region: "",
  officials: [],
  levels: [],
  militaryLevels: [],
  regions: [],
  meta: {},
  currentProfileId: "",
  filters: {
    search: "",
    level: "全部"
  }
};

const params = new URLSearchParams(window.location.search);
state.region = params.get("region") || "";

const regionTitle = document.getElementById("regionTitle");
const regionSubtitle = document.getElementById("regionSubtitle");
const regionLastSyncAt = document.getElementById("regionLastSyncAt");
const regionSyncSummary = document.getElementById("regionSyncSummary");
const regionSearchInput = document.getElementById("regionSearchInput");
const regionLevelFilter = document.getElementById("regionLevelFilter");
const regionTotalCount = document.getElementById("regionTotalCount");
const regionUpdatedAt = document.getElementById("regionUpdatedAt");
const regionBoard = document.getElementById("regionBoard");
const regionNewButton = document.getElementById("regionNewButton");
const regionEnrichAllButton = document.getElementById("regionEnrichAllButton");
const regionStopEnrichButton = document.getElementById("regionStopEnrichButton");
const regionQueueProcessed = document.getElementById("regionQueueProcessed");
const regionQueueChanged = document.getElementById("regionQueueChanged");
const regionQueueRemaining = document.getElementById("regionQueueRemaining");
const regionQueueFailed = document.getElementById("regionQueueFailed");
const regionQueueProgressBar = document.getElementById("regionQueueProgressBar");
const regionQueueStatusText = document.getElementById("regionQueueStatusText");
const regionQueueErrorList = document.getElementById("regionQueueErrorList");
const militaryImportCard = document.getElementById("militaryImportCard");
const militaryExcelInput = document.getElementById("militaryExcelInput");
const militaryExcelImportButton = document.getElementById("militaryExcelImportButton");
const militaryScreenshotImageInput = document.getElementById("militaryScreenshotImageInput");
const militaryScreenshotImportButton = document.getElementById("militaryScreenshotImportButton");
const militaryScreenshotSourceLabel = document.getElementById("militaryScreenshotSourceLabel");
const militaryScreenshotSourceUrl = document.getElementById("militaryScreenshotSourceUrl");
const militaryScreenshotPreview = document.getElementById("militaryScreenshotPreview");
const militaryScreenshotImportText = document.getElementById("militaryScreenshotImportText");
const militaryScreenshotTextImportButton = document.getElementById("militaryScreenshotTextImportButton");
const dialog = document.getElementById("editorDialog");
const classificationDialog = document.getElementById("classificationDialog");
const classificationForm = document.getElementById("classificationForm");
const closeClassificationDialog = document.getElementById("closeClassificationDialog");
const form = document.getElementById("editorForm");
const closeDialog = document.getElementById("closeDialog");
const deleteButton = document.getElementById("deleteButton");
const regionInput = document.getElementById("regionInput");
const levelInput = document.getElementById("levelInput");
const classificationRegionInput = document.getElementById("classificationRegionInput");
const classificationLevelInput = document.getElementById("classificationLevelInput");

const profileDialog = document.getElementById("profileDialog");
const closeProfileDialog = document.getElementById("closeProfileDialog");
const profileLockButton = document.getElementById("profileLockButton");
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
const apiBase = window.location.protocol === "file:" ? "http://127.0.0.1:3000" : "";
const zhPinyinCollator = new Intl.Collator("zh-Hans-CN-u-co-pinyin", { sensitivity: "base" });
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

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function renderMilitaryScreenshotPreview(entries, rawText) {
  if (!militaryScreenshotPreview) return;
  if (entries?.length) {
    militaryScreenshotPreview.innerHTML = entries
      .map((entry, index) => `<div>${index + 1}. ${escapeHtml(entry.name)}｜${escapeHtml(entry.lastPosition)}｜${escapeHtml(entry.level)}</div>`)
      .join("");
    return;
  }
  militaryScreenshotPreview.innerHTML = rawText
    ? `<div>这次还没有自动配对出可导入将领，请检查截图格式是否接近“姓名｜最后任职｜军衔”。</div><pre>${escapeHtml(rawText)}</pre>`
    : "本次没有识别出可用文字。";
}

function fillMilitaryScreenshotImportText(entries, rawText) {
  if (!militaryScreenshotImportText) return;
  if (entries?.length) {
    militaryScreenshotImportText.value = entries.map((entry) => `${entry.name}｜${entry.lastPosition}｜${entry.level}`).join("\n");
    return;
  }
  militaryScreenshotImportText.value = rawText || "";
}

function populateSelect(select, options) {
  const currentValue = select.value;
  select.innerHTML = options.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join("");
  if (options.includes(currentValue)) {
    select.value = currentValue;
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("读取文件失败"));
    reader.readAsDataURL(file);
  });
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

function getProfileInitials(name) {
  const text = String(name || "").trim();
  return text ? text.slice(0, 2) : "档";
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

function getStageTone(stage) {
  const value = String(stage || "");
  if (/(判|审理|起诉|移送司法|逮捕)/.test(value)) return "tone-judicial";
  if (/(处分|开除党籍|双开|开除公职)/.test(value)) return "tone-disciplinary";
  return "tone-investigation";
}

function renderStageTag(stage) {
  if (!stage) return "";
  return `<span class="tag ${getStageTone(stage)}">${escapeHtml(stage)}</span>`;
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

function renderRegionQueue() {
  const queue = state.meta.regionEnrichQueues?.[state.region] || {};
  const total = Number(queue.total || 0);
  const processed = Number(queue.processed || 0);
  const percent = total > 0 ? Math.max(0, Math.min(100, Math.round((processed / total) * 100))) : 0;
  if (regionQueueProcessed) regionQueueProcessed.textContent = String(queue.processed || 0);
  if (regionQueueChanged) regionQueueChanged.textContent = String(queue.changed || 0);
  if (regionQueueRemaining) regionQueueRemaining.textContent = String(queue.remaining || 0);
  if (regionQueueFailed) regionQueueFailed.textContent = String(queue.failed || 0);
  if (regionQueueProgressBar) regionQueueProgressBar.style.width = `${percent}%`;
  if (regionQueueStatusText) {
    regionQueueStatusText.textContent = queue.running
      ? queue.stopRequested
        ? `正在停止中：已扫描 ${processed} / ${total}，更新 ${queue.changed || 0}，失败 ${queue.failed || 0}。`
        : `本地区后台补全进行中：已扫描 ${processed} / ${total}，更新 ${queue.changed || 0}，失败 ${queue.failed || 0}，还剩 ${queue.remaining || 0}。`
      : queue.total
        ? `最近一次本地区补全：已扫描 ${processed} / ${total}，更新 ${queue.changed || 0}，失败 ${queue.failed || 0}，还剩 ${queue.remaining || 0}。`
        : "当前地区没有正在运行的批量补全任务。";
  }
  if (regionQueueErrorList) {
    const errors = queue.recentErrors || [];
    regionQueueErrorList.innerHTML = errors.length
      ? errors.map((item) => `<div>${escapeHtml(item.name || "未知条目")}：${escapeHtml(item.message || "未知错误")}</div>`).join("")
      : "";
  }
  if (regionStopEnrichButton) regionStopEnrichButton.disabled = !queue.running;
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

function getLevelCardClass(level) {
  if (level === "国家级") return "card-level-national";
  if (level === "省部级") return "card-level-provincial";
  if (level === "上将") return "card-level-national";
  if (level === "中将") return "card-level-provincial";
  return "card-level-bureau";
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
    ? item.sources.map((source) => `<span class="source-chip">${escapeHtml(source.label || "来源")} · ${escapeHtml(source.url || "")}</span>`).join("")
    : `<span class="small">暂无来源信息。</span>`;

  profileDialog.showModal();
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
    <article class="card region-detail-card ${getLevelCardClass(item.level)}">
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
        <span class="tag">${escapeHtml(item.level || "级别待补")}</span>
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

function renderRegionDetail() {
  const keyword = state.filters.search.trim();
  const filtered = state.officials.filter((item) => {
    const combined = [item.name, item.lastPosition, item.summary, item.level, item.detail].join(" ");
    if (keyword && !combined.includes(keyword)) return false;
    if (state.filters.level !== "全部" && item.level !== state.filters.level) return false;
    return true;
  });

  regionTotalCount.textContent = String(filtered.length);
  regionUpdatedAt.textContent = state.meta.lastEnrichAt || "未补全";

  regionBoard.innerHTML = getLevelsForRegion(state.region)
    .map((level) => {
      const items = filtered
        .filter((item) => item.level === level)
        .sort((a, b) =>
          isMilitaryRegion(state.region)
            ? zhPinyinCollator.compare(a.name || "", b.name || "")
            : (b.investigationDate || "").localeCompare(a.investigationDate || "")
        );
      if (!items.length) return "";
      return `
        <section class="region-detail-group">
          <div class="region-detail-group-head">
            <h2>${escapeHtml(level)}</h2>
            <span class="region-count">${items.length} 人</span>
          </div>
          <div class="region-detail-list">
            ${items.map((item) => renderCard(item)).join("")}
          </div>
        </section>
      `;
    })
    .join("");

  if (!regionBoard.innerHTML.trim()) {
    regionBoard.innerHTML = `<section class="region-column"><p class="small">当前地区暂无符合条件的条目。</p></section>`;
  }

  bindActions();
}

function bindActions() {
  regionBoard.querySelectorAll("[data-edit-id]").forEach((button) => {
    button.addEventListener("click", () => {
      openEditor(state.officials.find((item) => item.id === button.dataset.editId));
    });
  });

  regionBoard.querySelectorAll("[data-enrich-id]").forEach((button) => {
    button.addEventListener("click", () => enrichOne(button.dataset.enrichId, button));
  });

  regionBoard.querySelectorAll("[data-reclassify-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = state.officials.find((official) => official.id === button.dataset.reclassifyId);
      if (item) openClassificationEditor(item);
    });
  });

  regionBoard.querySelectorAll("[data-profile-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = state.officials.find((official) => official.id === button.dataset.profileId);
      if (item) openProfile(item);
    });
  });

  regionBoard.querySelectorAll("[data-lock-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleOfficialLock(button.dataset.lockId, button, { silent: true });
    });
  });
}

function openEditor(item) {
  const draft =
    item ||
    {
      id: `manual-${Date.now()}`,
      name: "",
      birth: "",
      region: state.region,
      level: getLevelsForRegion(state.region)[0] || state.levels[0] || "厅局级",
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
  form.elements.region.value = draft.region || state.region;
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

function openClassificationEditor(item) {
  classificationForm.elements.id.value = item.id || "";
  classificationForm.elements.name.value = item.name || "";
  classificationForm.elements.region.value = item.region || state.region || state.regions[0] || "";
  syncLevelSelectForRegion(classificationForm.elements.level, classificationForm.elements.region.value, item.level || getLevelsForRegion(classificationForm.elements.region.value)[0] || "");
  classificationDialog.showModal();
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
    await loadRegionData();
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

async function loadRegionData() {
  const [config, payload] = await Promise.all([request("/api/config"), request("/api/officials")]);
  state.levels = config.levels;
  state.militaryLevels = config.militaryLevels || ["上将", "中将", "少将"];
  state.regions = config.regions;
  state.meta = config.meta;
  state.officials = (payload.officials || []).filter((item) => item.region === state.region);

  regionTitle.textContent = state.region || "未知地区";
  regionSubtitle.textContent = isMilitaryRegion(state.region)
    ? `${state.region || "当前地区"} 落马将领详情页，按军衔分组展示。`
    : `${state.region || "当前地区"} 落马官员详情页，按级别分组展示。`;
  regionLastSyncAt.textContent = state.meta.lastSyncAt || "未同步";
  regionSyncSummary.textContent = state.meta.lastSyncSummary || "暂无说明";
  if (militaryImportCard) {
    militaryImportCard.hidden = !isMilitaryRegion(state.region);
  }

  populateSelect(regionLevelFilter, ["全部", ...getLevelsForRegion(state.region)]);
  populateSelect(regionInput, state.regions);
  populateSelect(levelInput, getLevelsForRegion(regionInput.value || state.region));
  if (classificationRegionInput) populateSelect(classificationRegionInput, state.regions);
  if (classificationLevelInput) populateSelect(classificationLevelInput, getLevelsForRegion(classificationRegionInput?.value || state.region));
  renderRegionQueue();
  renderRegionDetail();
}

async function importMilitaryExcel() {
  const file = militaryExcelInput?.files?.[0];
  if (!file) {
    alert("请先选择一个解放军 Excel 文件。");
    return;
  }
  const original = militaryExcelImportButton.textContent;
  militaryExcelImportButton.disabled = true;
  militaryExcelImportButton.textContent = "导入中...";
  try {
    const fileData = await fileToDataUrl(file);
    const response = await request("/api/import-military-excel", {
      method: "POST",
      body: JSON.stringify({
        fileData,
        filename: file.name
      })
    });
    await loadRegionData();
    alert(`解放军 Excel 已导入：新增 ${response.created} 条，更新 ${response.updated} 条。`);
  } catch (error) {
    alert(`解放军 Excel 导入失败：${error.message}`);
  } finally {
    militaryExcelImportButton.disabled = false;
    militaryExcelImportButton.textContent = original;
  }
}

async function importMilitaryScreenshotImage() {
  const file = militaryScreenshotImageInput?.files?.[0];
  if (!file) {
    alert("请先选择一张解放军截图图片。");
    return;
  }
  const original = militaryScreenshotImportButton.textContent;
  militaryScreenshotImportButton.disabled = true;
  militaryScreenshotImportButton.textContent = "识别中...";
  try {
    const imageData = await fileToDataUrl(file);
    const response = await request("/api/import-military-screenshot-image", {
      method: "POST",
      body: JSON.stringify({
        imageData,
        filename: file.name,
        sourceLabel: militaryScreenshotSourceLabel?.value?.trim(),
        sourceUrl: militaryScreenshotSourceUrl?.value?.trim()
      })
    });
    renderMilitaryScreenshotPreview(response.entries || [], response.rawText || "");
    fillMilitaryScreenshotImportText(response.entries || [], response.rawText || "");
    await loadRegionData();
    if (response.entries?.length) {
      alert(`解放军截图识别完成并已导入：识别 ${response.entries.length} 条，新增 ${response.created} 条，更新 ${response.updated} 条。`);
    } else {
      alert("截图已上传，但这次没有自动识别出可直接导入的将领条目。我已经把 OCR 结果显示在预览区，方便你检查格式。");
    }
  } catch (error) {
    alert(`解放军截图识别失败：${error.message}`);
  } finally {
    militaryScreenshotImportButton.disabled = false;
    militaryScreenshotImportButton.textContent = original;
  }
}

async function importMilitaryScreenshotText() {
  const text = militaryScreenshotImportText?.value?.trim();
  if (!text) {
    alert("请先上传截图生成识别结果，或手动输入“姓名｜最后任职｜军衔”文本。");
    return;
  }
  const original = militaryScreenshotTextImportButton.textContent;
  militaryScreenshotTextImportButton.disabled = true;
  militaryScreenshotTextImportButton.textContent = "导入中...";
  try {
    const response = await request("/api/import-military-screenshot", {
      method: "POST",
      body: JSON.stringify({
        text,
        sourceLabel: militaryScreenshotSourceLabel?.value?.trim(),
        sourceUrl: militaryScreenshotSourceUrl?.value?.trim()
      })
    });
    await loadRegionData();
    alert(`解放军文本结果已导入：新增 ${response.created} 条，更新 ${response.updated} 条。`);
  } catch (error) {
    alert(`解放军文本导入失败：${error.message}`);
  } finally {
    militaryScreenshotTextImportButton.disabled = false;
    militaryScreenshotTextImportButton.textContent = original;
  }
}

async function enrichRegionAll() {
  if (!state.region) return;
  const original = regionEnrichAllButton.textContent;
  regionEnrichAllButton.disabled = true;
  regionEnrichAllButton.textContent = "补全中...";
  try {
    const response = await request("/api/enrich-region", {
      method: "POST",
      body: JSON.stringify({ region: state.region })
    });
    state.meta = response.meta;
    renderRegionQueue();
    alert(response.started ? `${state.region} 一键百科补全已启动，正在后台分批执行。` : "当前已有补全任务在运行，请稍后再试。");
  } catch (error) {
    alert(`本地区批量补全失败：${error.message}`);
  } finally {
    regionEnrichAllButton.disabled = false;
    regionEnrichAllButton.textContent = original;
  }
}

async function stopRegionEnrich() {
  if (!state.region) return;
  const original = regionStopEnrichButton.textContent;
  regionStopEnrichButton.disabled = true;
  regionStopEnrichButton.textContent = "停止中...";
  try {
    const response = await request("/api/enrich-region/stop", {
      method: "POST",
      body: JSON.stringify({ region: state.region })
    });
    state.meta = response.meta;
    renderRegionQueue();
    alert(`已发送停止请求，${state.region} 当前批次结束后会停止。`);
  } catch (error) {
    alert(`停止失败：${error.message}`);
  } finally {
    regionStopEnrichButton.textContent = original;
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
    await loadRegionData();
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

regionSearchInput.addEventListener("input", () => {
  state.filters.search = regionSearchInput.value;
  renderRegionDetail();
});

regionLevelFilter.addEventListener("change", () => {
  state.filters.level = regionLevelFilter.value;
  renderRegionDetail();
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

if (regionEnrichAllButton) regionEnrichAllButton.addEventListener("click", enrichRegionAll);
if (regionStopEnrichButton) regionStopEnrichButton.addEventListener("click", stopRegionEnrich);
if (militaryExcelImportButton) militaryExcelImportButton.addEventListener("click", importMilitaryExcel);
if (militaryScreenshotImportButton) militaryScreenshotImportButton.addEventListener("click", importMilitaryScreenshotImage);
if (militaryScreenshotTextImportButton) militaryScreenshotTextImportButton.addEventListener("click", importMilitaryScreenshotText);
regionNewButton.addEventListener("click", () => openEditor(null));
closeDialog.addEventListener("click", () => dialog.close());
if (closeClassificationDialog) closeClassificationDialog.addEventListener("click", () => classificationDialog.close());
closeProfileDialog.addEventListener("click", () => profileDialog.close());
if (profileLockButton) profileLockButton.addEventListener("click", toggleProfileLock);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const payload = await readFormPayload();
    await request("/api/officials/upsert", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    await loadRegionData();
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
    await loadRegionData();
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
    await loadRegionData();
    dialog.close();
  } catch (error) {
    alert(`删除失败：${error.message}`);
  }
});

if (!state.region) {
  regionTitle.textContent = "未指定地区";
  regionSubtitle.textContent = "请从首页点击某个省份名称进入详情页。";
  regionBoard.innerHTML = `<section class="region-column"><p class="small">缺少地区参数，请返回首页重试。</p></section>`;
} else {
  loadRegionData().catch((error) => {
    regionSubtitle.textContent = `加载失败：${error.message}`;
  });
}
