const params = new URLSearchParams(window.location.search);
const type = params.get("type") || "twentieth-committee";

const committeeTitle = document.getElementById("committeeTitle");
const committeeSubtitle = document.getElementById("committeeSubtitle");
const committeeSummary = document.getElementById("committeeSummary");
const committeeBoard = document.getElementById("committeeBoard");
const apiBase = window.location.protocol === "file:" ? "http://127.0.0.1:3000" : "";
const zhPinyinCollator = new Intl.Collator("zh-Hans-CN-u-co-pinyin", { sensitivity: "base" });

const pageConfig = {
  "twentieth-committee": {
    title: "落马二十届中央委员",
    role: "第二十届中央委员"
  },
  "twentieth-alternate": {
    title: "落马二十届中央候补委员",
    role: "第二十届中央候补委员"
  }
};

async function request(url, options = {}) {
  const response = await fetch(`${apiBase}${url}`, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "请求失败");
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

function hasVisualPortrait(item) {
  return Boolean(item?.photo) && (/^(https?:)?\/\//.test(String(item.photo || "")) || String(item.photo || "").startsWith("/"));
}

function renderAvatarMarkup(item) {
  if (!hasVisualPortrait(item)) return "";
  return `<img class="card-portrait-image" src="${escapeAttribute(item.photo)}" alt="${escapeAttribute(item.name || "官员头像")}" loading="lazy" referrerpolicy="no-referrer">`;
}

function getIdentitySignals(item) {
  return [
    ...(item.centralRoles || []),
    item.lastPosition || "",
    ...(item.previousPositions || []),
    item.summary || "",
    item.detail || ""
  ]
    .join(" ")
    .replace(/\s+/g, " ");
}

function extractIdentityBadges(item) {
  const text = getIdentitySignals(item);
  const badges = [...(item.centralRoles || [])];
  if (/中央政治局委员/.test(text)) badges.push("中央政治局委员");
  if (/中央军委委员/.test(text)) badges.push("中央军委委员");
  if (/中央书记处书记/.test(text)) badges.push("中央书记处书记");
  const committeeMatches = text.match(/第[一二三四五六七八九十0-9]+届中央委员/g) || [];
  const alternateMatches = text.match(/第[一二三四五六七八九十0-9]+届中央候补委员/g) || [];
  const disciplineMatches = text.match(/第[一二三四五六七八九十0-9]+届中纪委委员/g) || [];
  return compressIdentityBadges([...badges, ...committeeMatches, ...alternateMatches, ...disciplineMatches].filter((value, index, list) => list.indexOf(value) === index));
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

  if (committee.length) normal.push(formatCompressedCentralBadge(committee, "中央委员"));
  if (alternate.length) normal.push(formatCompressedCentralBadge(alternate, "中央候补委员"));
  if (disciplinary.length) normal.push(formatCompressedCentralBadge(disciplinary, "中纪委委员"));
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
  return `<div class="identity-badges">${badges.map((badge) => `<span class="identity-badge">${escapeHtml(badge)}</span>`).join("")}</div>`;
}

function renderCard(item) {
  return `
    <article class="card committee-card">
      <div class="card-head ${hasVisualPortrait(item) ? "card-head-with-photo" : ""}">
        <div class="card-head-main">
          ${hasVisualPortrait(item) ? `<div class="card-portrait">${renderAvatarMarkup(item)}</div>` : ""}
          <div class="card-head-copy">
            <h4>${escapeHtml(item.name)}</h4>
            ${renderIdentityBadges(item)}
            <div class="small">${escapeHtml(item.lastPosition || "职务待补")}</div>
          </div>
        </div>
      </div>
      <div class="meta">
        ${item.investigationDate ? `<span class="tag">${escapeHtml(item.investigationDate)}</span>` : ""}
        ${item.birth ? `<span class="tag">${escapeHtml(item.birth)}</span>` : ""}
        <span class="tag">${escapeHtml(item.level || "级别待补")}</span>
        ${item.region ? `<span class="tag tag-soft">${escapeHtml(item.region)}</span>` : ""}
      </div>
      <p class="summary">${escapeHtml(item.summary || item.detail || "暂无摘要。")}</p>
    </article>
  `;
}

function hasRole(item, role) {
  if ((item.centralRoles || []).includes(role)) return true;
  return getIdentitySignals(item).includes(role);
}

async function load() {
  const config = pageConfig[type] || pageConfig["twentieth-committee"];
  committeeTitle.textContent = config.title;
  committeeSubtitle.textContent = `按照姓名拼音排序，展示全部${config.title}卡片。`;

  const payload = await request("/api/officials");
  const officials = (payload.officials || [])
    .filter((item) => hasRole(item, config.role))
    .sort((a, b) => zhPinyinCollator.compare(a.name || "", b.name || ""));

  committeeSummary.textContent = officials.length
    ? `共 ${officials.length} 人，已按姓名拼音排序。`
    : "当前暂无匹配官员。";

  committeeBoard.innerHTML = officials.length
    ? `<section class="region-detail-group"><div class="region-detail-group-head"><h2>${escapeHtml(config.title)}</h2><span class="region-count">${officials.length} 人</span></div><div class="region-detail-list">${officials.map((item) => renderCard(item)).join("")}</div></section>`
    : `<section class="region-column"><p class="small">当前暂无匹配官员。</p></section>`;
}

load().catch((error) => {
  committeeSummary.textContent = `加载失败：${error.message}`;
});
