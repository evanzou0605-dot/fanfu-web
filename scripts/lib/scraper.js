const { SOURCE_SECTIONS } = require("./constants");
const { makeId, normalizeDate, detectRegion, detectLevel, inferName, mergeOfficial } = require("./normalize");

const START_DATE = "2022-10-01";

function resolveUrl(base, href) {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

function htmlDecode(text) {
  return String(text || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}

function stripTags(text) {
  return htmlDecode(String(text || "").replace(/<script[\s\S]*?<\/script>/gi, " "))
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildPagedUrl(baseUrl, pageNumber) {
  if (pageNumber === 1) return baseUrl;
  const clean = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  return `${clean}/index_${pageNumber - 1}.html`;
}

function inferDateFromUrl(url) {
  const match = String(url || "").match(/\/(\d{6})\/t(\d{4})(\d{2})(\d{2})_/);
  if (!match) return "";
  return `${match[2]}-${match[3]}-${match[4]}`;
}

async function fetchText(url) {
  const signal = AbortSignal.timeout(12000);
  const response = await fetch(url, {
    signal,
    headers: {
      "User-Agent": "fanfu-web/0.2"
    }
  });
  if (!response.ok) {
    throw new Error(`Fetch failed: ${response.status} ${url}`);
  }
  return response.text();
}

function inferSectionFromUrl(url) {
  const text = String(url || "");
  if (text.includes("/djcf/")) {
    return {
      key: "manual-punish",
      label: "手动导入党纪政务处分",
      type: "punish",
      url: text
    };
  }
  return {
    key: "manual-review",
    label: "手动导入审查调查",
    type: "review",
    url: text
  };
}

function extractByPatterns(html, patterns) {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return match[1];
  }
  return "";
}

function extractCards(html, baseUrl) {
  const scopes = [
    extractByPatterns(html, [
      /<ul[^>]+class="[^"]*(?:list|news|bd|xx_list)[^"]*"[^>]*>([\s\S]*?)<\/ul>/i,
      /<div[^>]+class="[^"]*(?:list|news|bd|column)[^"]*"[^>]*>([\s\S]*?)<\/div>/i
    ]),
    html
  ];

  const map = new Map();
  for (const scope of scopes) {
    const regex =
      /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]{0,160}?(?:<span[^>]*>|<em[^>]*>|<i[^>]*>)?([^<\d]{0,8}\d{4}[.\-/年]\d{1,2}[.\-/月]\d{1,2}(?:日)?|)/gi;
    let match;
    while ((match = regex.exec(scope))) {
      const title = stripTags(match[2]);
      const url = resolveUrl(baseUrl, match[1]);
      const date = normalizeDate(stripTags(match[3] || ""));
      if (!title || !url) continue;
      if (!/t\d{8}_\d+\.html|\/\d{6}\/t\d{8}_\d+\.html|\.s?html/i.test(url)) continue;
      const key = `${title}|${url}`;
      if (!map.has(key)) {
        map.set(key, { title, url, date });
      }
    }
  }
  return [...map.values()];
}

function extractDetail(html) {
  const title = stripTags(
    extractByPatterns(html, [
      /<h1[^>]*>([\s\S]*?)<\/h1>/i,
      /<title[^>]*>([\s\S]*?)<\/title>/i
    ])
  );
  const body = stripTags(
    extractByPatterns(html, [
      /<div[^>]+class="[^"]*(?:content|detail|TRS_Editor|detail_con|left_side|article-content|article_body)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<article[^>]*>([\s\S]*?)<\/article>/i,
      /<div[^>]+id="[^"]*(?:zoom|content)[^"]*"[^>]*>([\s\S]*?)<\/div>/i
    ]) || html
  ).slice(0, 4000);
  const timeText = stripTags(
    extractByPatterns(html, [
      /<div[^>]+class="[^"]*(?:time|article-info|info|source)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<span[^>]+class="[^"]*(?:time|date)[^"]*"[^>]*>([\s\S]*?)<\/span>/i
    ])
  );
  const date = normalizeDate(timeText) || normalizeDate(stripTags(html));
  return { title, body, date };
}

function extractLastPosition(title, body) {
  const text = `${title} ${body}`;
  const patterns = [
    /([^，。；]{4,80}(?:书记|副书记|省长|副省长|市长|副市长|主席|副主席|部长|副部长|董事长|总经理|院长|检察长|秘书长|局长|主任))(?:涉嫌严重违纪违法|接受纪律审查|接受监察调查)/,
    /(?:曾任|历任|担任|出任)([^。；]{6,80})/
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return "";
}

function classifyTimeline(sectionType, title, date, url) {
  let stage = "审查调查";
  if (sectionType === "punish") stage = "党纪政务处分";
  if (title.includes("移送检察机关") || title.includes("移送司法")) stage = "移送司法";
  if (title.includes("逮捕")) stage = "逮捕";
  if (title.includes("起诉") || title.includes("公诉")) stage = "起诉";
  if (title.includes("一审")) stage = "一审";
  if (title.includes("二审")) stage = "二审";
  return { stage, date, url, summary: title };
}

async function scrapeSection(section, maxPages = 20) {
  const results = [];
  let sawPage = false;
  for (let page = 1; page <= maxPages; page += 1) {
    const pageUrl = buildPagedUrl(section.url, page);
    let html;
    try {
      html = await fetchText(pageUrl);
    } catch (error) {
      if (page === 1) throw error;
      break;
    }
    sawPage = true;
    const cards = extractCards(html, pageUrl);
    if (!cards.length) {
      if (page === 1) {
        const preview = stripTags(html).slice(0, 160);
        throw new Error(`No article cards found on first page. Preview: ${preview}`);
      }
      break;
    }
    let hasRecent = false;
    for (const card of cards) {
      if (!card.date || card.date >= START_DATE) {
        hasRecent = true;
        results.push({ ...card, section });
      }
    }
    if (!hasRecent) break;
  }
  if (!sawPage) {
    throw new Error("No pages fetched");
  }
  return results;
}

async function buildOfficialFromCard(card) {
  const detailHtml = await fetchText(card.url);
  const detail = extractDetail(detailHtml);
  const title = detail.title || card.title;
  const effectiveDate = card.date || detail.date;
  const name = inferName(title);
  const positionText = `${extractLastPosition(title, detail.body)} ${detail.body.slice(0, 260)}`;
  return {
    id: makeId(name, effectiveDate, card.url),
    name,
    birth: "",
    region: detectRegion(`${title} ${positionText}`),
    level: detectLevel(`${title} ${positionText}`),
    lastPosition: extractLastPosition(title, detail.body),
    previousPositions: [],
    investigationDate: effectiveDate,
    status: card.section.type === "punish" ? "党纪政务处分" : "审查调查",
    summary: title,
    detail: detail.body,
    timeline: [classifyTimeline(card.section.type, title, effectiveDate, card.url)],
    sources: [
      {
        type: "official",
        label: card.section.label,
        url: card.url
      }
    ],
    aliases: [],
    editable: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

async function importOfficialFromSource(input) {
  const sourceUrl = input.url || "";
  const section = input.section || inferSectionFromUrl(sourceUrl);
  let html = input.html || "";
  if (!html && sourceUrl) {
    try {
      html = await fetchText(sourceUrl);
    } catch (error) {
      if (sourceUrl.includes("ccdi.gov.cn")) {
        throw new Error("无法获取中纪委官网页面。当前环境访问 www.ccdi.gov.cn 失败，请改用“原始 HTML”或“离线样本导入”。");
      }
      throw new Error(`无法获取目标页面：${sourceUrl}`);
    }
  }
  if (!html) {
    throw new Error("没有可导入的页面内容。请填写文章链接，或直接粘贴原始 HTML。");
  }
  const detail = extractDetail(html);
  const title = detail.title || input.title || "";
  if (!title) {
    throw new Error("已拿到页面内容，但无法识别文章标题。请手动填写“标题覆盖”，或改用更完整的原始 HTML。");
  }
  const effectiveDate = normalizeDate(input.date || detail.date || inferDateFromUrl(sourceUrl) || "");
  const name = inferName(title);
  const lastPosition = extractLastPosition(title, detail.body);
  const sourceLabel = input.sourceLabel || section.label;
  const sourceReference = sourceUrl || `local://import/${encodeURIComponent(sourceLabel || title)}`;
  return {
    id: makeId(name, effectiveDate || new Date().toISOString().slice(0, 10), sourceUrl || title),
    name,
    birth: "",
    region: detectRegion(`${title} ${lastPosition} ${detail.body}`),
    level: detectLevel(`${title} ${lastPosition} ${detail.body}`),
    lastPosition,
    previousPositions: [],
    investigationDate: effectiveDate,
    status: section.type === "punish" ? "党纪政务处分" : "审查调查",
    summary: title,
    detail: detail.body,
    timeline: [classifyTimeline(section.type, title, effectiveDate, sourceUrl)],
    sources: sourceLabel || sourceUrl
      ? [
          {
            type: "official",
            label: sourceLabel,
            url: sourceReference
          }
        ]
      : [],
    aliases: [],
    editable: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function findMatchingOfficial(existingOfficials, incoming) {
  return existingOfficials.find((item) => {
    return item.name === incoming.name || item.sources?.some((source) => source.url === incoming.sources[0].url);
  });
}

async function syncOfficials(existingOfficials, options = {}) {
  const allCards = [];
  const errors = [];
  const maxPages = options.maxPagesPerSection || 20;

  for (const section of SOURCE_SECTIONS) {
    try {
      const cards = await scrapeSection(section, maxPages);
      allCards.push(...cards);
    } catch (error) {
      errors.push({ section: section.label, message: error.message });
    }
  }

  const mergedMap = new Map(existingOfficials.map((item) => [item.id, item]));
  let created = 0;
  let updated = 0;

  for (const card of allCards) {
    try {
      const incoming = await buildOfficialFromCard(card);
      const match = findMatchingOfficial(existingOfficials, incoming);
      if (match) {
        mergedMap.set(match.id, mergeOfficial(match, incoming));
        updated += 1;
      } else {
        mergedMap.set(incoming.id, incoming);
        created += 1;
      }
    } catch (error) {
      errors.push({ section: card.section.label, url: card.url, message: error.message });
    }
  }

  const officials = [...mergedMap.values()].sort((a, b) => (b.investigationDate || "").localeCompare(a.investigationDate || ""));
  return {
    officials,
    created,
    updated,
    scanned: allCards.length,
    errors
  };
}

module.exports = {
  START_DATE,
  syncOfficials,
  importOfficialFromSource
};
