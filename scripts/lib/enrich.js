const { REGION_ALIASES } = require("./constants");
const { detectRegion, detectLevel } = require("./normalize");
const { execFile } = require("child_process");
const { promisify } = require("util");
const fs = require("fs");
const path = require("path");

const execFileAsync = promisify(execFile);
const ENRICH_HINTS_PATH = path.resolve(__dirname, "../../data/enrich_hints.json");

function loadEnrichmentHints() {
  try {
    return JSON.parse(fs.readFileSync(ENRICH_HINTS_PATH, "utf8"));
  } catch {
    return [];
  }
}

function trimText(text) {
  return String(text || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function isCentralCurrentPost(text) {
  const input = String(text || "");
  if (!input) return false;
  if (/北京市委|北京市政府|北京市人大|北京市政协|北京信托|北京控股|北京银行/.test(input)) return false;
  return /国务院|全国人民代表大会|全国人大|全国政协|中央纪委|中央军委|中央组织部|中央统战部|中央政法委|中央宣传部|中央网信办|中央财办|中央外办|中央农办|应急管理部|工业和信息化部|财政部|审计署|自然资源部|国家烟草专卖局|国家药品监督管理局|中国烟草总公司|中国石油天然气集团|中国石油化工集团|中国海洋石油集团|国家能源投资集团|中国中信集团|中国兵器|中国航空工业集团|中国电子科技集团|党组书记、部长|党委书记、部长|国家局|总公司/.test(
    input
  );
}

function cleanNoise(text) {
  return trimText(text)
    .replace(/_百度百科/g, " ")
    .replace(/\.rc-dialog[\s\S]*?(?=罗蔺|中文名|人物履历|$)/g, " ")
    .replace(/window\.PAGE_DATA[\s\S]*/g, " ")
    .replace(/新手上路[\s\S]*/g, " ")
    .replace(/使用百度前必读[\s\S]*/g, " ")
    .replace(/\[[0-9\-]+\]/g, " ")
    .replace(/播报 编辑/g, " ")
    .replace(/目录 \d+ /g, " ")
    .replace(/人物事件 \d+ 学术成果/g, " ")
    .replace(/\b[0-9]{1,2}\b$/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseMetaContent(html, name) {
  const patterns = [
    new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+property=["']${name}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${name}["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${name}["']`, "i"),
    new RegExp(`<meta[^>]+name=${name}[^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+property=${name}[^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=${name}\\b`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=${name}\\b`, "i")
  ];
  for (const pattern of patterns) {
    const match = String(html || "").match(pattern);
    if (match?.[1]) return cleanNoise(match[1]);
  }
  return "";
}

function parsePhotoUrl(html, fallback = "") {
  const candidates = [
    ((String(html || "").match(/<img[^>]+id=["']js-entry-image["'][^>]+src=["']([^"']+)["']/i) || [])[1] || "").replace(/\\\//g, "/"),
    ((String(html || "").match(/<img[^>]+src=["']([^"']+)["'][^>]+alt=["'][^"']{1,20}["'][^>]*title=["'][^"']{1,20}["']/i) || [])[1] || "").replace(/\\\//g, "/"),
    parseMetaContent(html, "og:image"),
    parseMetaContent(html, "twitter:image"),
    parseMetaContent(html, "image"),
    ((String(html || "").match(/"summaryPic":"([^"]+)"/i) || [])[1] || "").replace(/\\\//g, "/"),
    ((String(html || "").match(/"coverPic":\{"albumId":[^}]*"url":"([^"]+)"/i) || [])[1] || "").replace(/\\\//g, "/"),
    ((String(html || "").match(/"albums":\[\{"albumId":[^[]*?"url":"([^"]+)"/i) || [])[1] || "").replace(/\\\//g, "/"),
    ((String(html || "").match(/"pic":"([^"]{20,400})"/i) || [])[1] || "").replace(/\\\//g, "/")
  ]
    .map((item) => String(item || "").trim())
    .filter(Boolean);

  const picked = candidates.find((url) => /^https?:\/\//.test(url) && !/favicon|logo|default|icon\/AI推荐/i.test(url));
  return picked || fallback || "";
}

function extractBaiduItemUrls(html) {
  const urls = new Set();
  for (const match of String(html || "").matchAll(/href="([^"]*(?:baike\.baidu\.com)?\/item\/[^"]+)"/g)) {
    const raw = match[1];
    if (!raw || /百度百科：本人词条编辑服务/.test(raw)) continue;
    if (raw.startsWith("http")) {
      urls.add(raw.replace("https://baike.baidu.hk", "https://baike.baidu.com"));
    } else if (raw.startsWith("/item/")) {
      urls.add(`https://baike.baidu.com${raw.split("?")[0]}`);
    }
  }
  return [...urls].slice(0, 4);
}

function isNoisyText(text) {
  const input = String(text || "");
  return (
    !trimText(input) ||
    /rc-dialog|window\.PAGE_DATA|使用百度前必读|新手上路|_百度百科|人物事件 4 学术成果|function\(\)\{return/.test(input) ||
    input.length > 140
  );
}

function inferPositionFromSummary(summary, name) {
  const text = trimText(summary);
  if (!text || !name) return "";
  const pattern = new RegExp(`^(.*?)${name}(?:接受|涉嫌严重违纪违法|被查)`);
  const match = text.match(pattern);
  return cleanNoise(match?.[1] || "");
}

function inferDateFromOfficial(official) {
  const url = official.sources?.[0]?.url || "";
  const urlMatch = url.match(/\/(\d{6})\/t(\d{4})(\d{2})(\d{2})_/);
  if (urlMatch) {
    return `${urlMatch[2]}-${urlMatch[3]}-${urlMatch[4]}`;
  }
  return parseInvestigationDate(`${official.summary || ""} ${official.detail || ""}`);
}

function looksLikePosition(text) {
  return /书记|副书记|省长|副省长|市长|副市长|盟长|副盟长|旗长|副旗长|县长|副县长|常委|主席|副主席|部长|副部长|厅长|副厅长|秘书长|局长|副局长|主任|院长|检察长|副秘书长|党工委/.test(
    text || ""
  );
}

function parseBirth(text) {
  const match =
    text.match(/(\d{4})年(\d{1,2})月(?:出生|生)/) ||
    text.match(/出生于?(\d{4})年(\d{1,2})月/) ||
    text.match(/born[^0-9]*(\d{4})[-/年](\d{1,2})/i);
  if (!match) return "";
  return `${match[1]}-${String(match[2]).padStart(2, "0")}`;
}

function parseInvestigationDate(text) {
  const match =
    text.match(/(\d{4})年(\d{1,2})月(\d{1,2})日[^。]{0,40}(?:据中央纪委国家监委消息|接受中央纪委国家监委纪律审查和监察调查)/) ||
    text.match(/(\d{4})[.-](\d{1,2})[.-](\d{1,2})/);
  if (!match) return "";
  return `${match[1]}-${String(match[2]).padStart(2, "0")}-${String(match[3]).padStart(2, "0")}`;
}

function parsePositions(text) {
  const lines = trimText(text)
    .split(/[。；]/)
    .map((item) => item.trim())
    .filter(Boolean);
  const hits = lines.filter((line) => /任|历任|担任|曾任|出任/.test(line));
  return hits.slice(0, 8);
}

function needsProfilePhoto(official) {
  return ["国家级", "省部级", "厅局级"].includes(official?.level);
}

function getRegionHints(region) {
  const hints = new Set();
  if (!region || region === "中央部委/央企") return [];
  hints.add(region);
  for (const [alias, mappedRegion] of Object.entries(REGION_ALIASES)) {
    if (mappedRegion === region) hints.add(alias);
  }
  return [...hints];
}

function detectMentionedRegions(text) {
  const input = String(text || "");
  const regions = new Set();
  for (const [alias, mappedRegion] of Object.entries(REGION_ALIASES)) {
    if (input.includes(alias) || input.includes(mappedRegion)) {
      regions.add(mappedRegion);
    }
  }
  return [...regions];
}

function extractOrgTokens(text) {
  return uniqueStrings(
    [...String(text || "").matchAll(/([\u4e00-\u9fa5]{2,24}(?:省委|市委|区委|县委|新区|开发区|党工委|人大常委会|人大|政协|市政府|省政府|政府|集团|领导小组|工作领导小组|委员会|兵团|大学|学院))/g)]
      .map((match) => trimText(match[1]))
      .filter((item) => item.length >= 2)
  );
}

function extractRoleTokens(text) {
  return uniqueStrings(
    [...String(text || "").matchAll(/(书记|副书记|组长|副组长|委员|省长|副省长|市长|副市长|常委|主席|副主席|部长|副部长|秘书长|副秘书长|局长|副局长|主任|副主任|总经理|副总经理|董事长|院长|校长|检察长)/g)].map(
      (match) => match[1]
    )
  );
}

function buildEnrichmentQueries(official) {
  const context = cleanNoise([official.region, official.lastPosition, official.summary, official.detail].filter(Boolean).join(" "));
  const inferredPosition = inferPositionFromSummary(official.summary, official.name);
  const regionHints = getRegionHints(official.region).slice(0, 3);
  const orgTokens = extractOrgTokens(`${inferredPosition} ${official.lastPosition || ""} ${official.summary || ""}`).slice(0, 3);
  const roleTokens = extractRoleTokens(`${inferredPosition} ${official.lastPosition || ""} ${official.summary || ""}`).slice(0, 3);
  const queries = [];

  if (orgTokens[0] && roleTokens[0]) {
    queries.push(`${official.name} ${orgTokens[0]} ${roleTokens[0]}`);
  }
  if (regionHints[0] && roleTokens[0]) {
    queries.push(`${official.name} ${regionHints[0]} ${roleTokens[0]}`);
  }
  if (orgTokens[0]) {
    queries.push(`${official.name} ${orgTokens[0]}`);
  }
  if (context.includes("青岛")) {
    queries.push(`${official.name} 青岛 副市长`);
    queries.push(`${official.name} 青岛`);
  }
  if (inferredPosition) {
    queries.push(`${official.name} ${inferredPosition}`);
  }
  queries.push(official.name);

  return uniqueStrings(queries).filter((item) => item.length <= 40).slice(0, 4);
}

function normalizePositionText(text) {
  return cleanNoise(
    String(text || "")
      .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 65248))
      .replace(/[－–—]/g, "-")
      .replace(/　/g, " ")
  )
    .replace(/^(?:\d{1,2}\s+)/, "")
    .replace(/^[12]-+\s*/, "")
    .replace(/^[12]-\s*/, "")
    .replace(/^([12])-((?:19|20)\d{2}\.\d{2})/, "$2")
    .replace(/^([12])-((?:19|20)\d{2}\.\d{2}[-—至](?:(?:19|20)\d{2}\.\d{2}|今|-))/, "$2")
    .replace(/^(\d{3})年/, (_, year) => `${year.startsWith("0") || year.startsWith("1") || year.startsWith("2") ? "2" : "1"}${year}年`)
    .replace(/^\d{1,4}年\d{1,2}月[，,]?\s*/, "")
    .replace(/^(?:\d{3,4}|(?:19|20)\d{2})年(?:\d{1,2}月)?\s*/, "")
    .replace(/^(?:\d{1,4}[-—])?(?:19|20)\d{2}\.\d{2}\s*/, "")
    .replace(/^(?:(?:19|20)\d{2}\.\d{2}[-—至](?:(?:19|20)\d{2}\.\d{2}|今|-?)\s*)/, "")
    .replace(/^(?:19|20)\d{2}\.\d{2}\s*/, "")
    .replace(/^(?:0-|1\s+)/, "")
    .replace(/^(历任|曾任|任|担任|出任)/, "")
    .replace(/^[，、:\-]+/, "")
    .replace(/（期间[^）]*）/g, "")
    .replace(/\(期间[^)]*\)/g, "")
    .replace(/([\u4e00-\u9fa5]{2,12})省市委/g, "$1市委")
    .replace(/([\u4e00-\u9fa5]{2,12})省市政府/g, "$1市政府")
    .replace(/([\u4e00-\u9fa5]{2,12})省市人大/g, "$1市人大")
    .replace(/([\u4e00-\u9fa5]{2,12})省市政协/g, "$1市政协")
    .replace(/党组书[\u4e00-\u9fa5]{0,8}?记/g, "党组书记")
    .replace(/党组副书[\u4e00-\u9fa5]{0,8}?记/g, "党组副书记")
    .replace(/市委副书[\u4e00-\u9fa5]{0,8}?记/g, "市委副书记")
    .replace(/省委副书[\u4e00-\u9fa5]{0,8}?记/g, "省委副书记")
    .replace(/州委副书[\u4e00-\u9fa5]{0,8}?记/g, "州委副书记")
    .replace(/区委副书[\u4e00-\u9fa5]{0,8}?记/g, "区委副书记")
    .replace(/县委副书[\u4e00-\u9fa5]{0,8}?记/g, "县委副书记")
    .replace(/市委委[\u4e00-\u9fa5]{0,8}?员、常委、书记/g, "市委委员、常委、书记")
    .replace(/省委委[\u4e00-\u9fa5]{0,8}?员、常委、书记/g, "省委委员、常委、书记")
    .replace(/^[,，;；、]+/, "")
    .trim();
}

function prependLocalityToFragment(locality, fragment) {
  const area = String(locality || "").trim();
  const part = normalizePositionText(fragment);
  if (!area || !part) return part;
  if (/^(中央|国务院|全国人大|全国政协)/.test(part)) return part;
  if (/^[\u4e00-\u9fa5]{2,12}(?:省|自治区|市|州|盟).*(?:委|人民政府|政府|人大|政协)/.test(part)) return part;

  const joinRules = [
    [/^市委/, 1],
    [/^市人民政府/, 1],
    [/^市政府/, 1],
    [/^市人大/, 1],
    [/^市政协/, 1],
    [/^省委/, 1],
    [/^省人民政府/, 1],
    [/^省政府/, 1],
    [/^省人大/, 1],
    [/^省政协/, 1],
    [/^州委/, 1],
    [/^州人民政府/, 1],
    [/^州政府/, 1],
    [/^区委/, 1],
    [/^区人民政府/, 1],
    [/^区政府/, 1],
    [/^区人大/, 1],
    [/^区政协/, 1],
    [/^县委/, 1],
    [/^县人民政府/, 1],
    [/^县政府/, 1],
    [/^县人大/, 1],
    [/^县政协/, 1],
    [/^自治区党委/, 3],
    [/^自治区人民政府/, 3],
    [/^自治区政府/, 3],
    [/^自治区人大/, 3],
    [/^自治区政协/, 3]
  ];

  for (const [pattern, trimLength] of joinRules) {
    if (pattern.test(part)) {
      return `${area}${part.slice(trimLength)}`;
    }
  }

  return `${area}${part}`;
}

function splitCombinedStagePosition(text) {
  const input = normalizePositionText(text);
  if (!input) return [];

  const splitAtExplicitNextLocality = (value) => {
    const match = value.match(/[，、]((?:中央|国务院|全国人大|全国政协|[\u4e00-\u9fa5]{2,12}(?:省|自治区|市|州|盟))(?:委|人民政府|政府|人大|政协|党工委|开发区|新区|集团|总公司))/);
    if (!match?.index) return [value];
    const cutIndex = match.index + 1;
    return [normalizePositionText(value.slice(0, cutIndex)), normalizePositionText(value.slice(cutIndex))].filter(Boolean);
  };

  const splitByBareMarker = (marker, localityRequired) => {
    const index = input.indexOf(marker);
    if (index <= 0) return null;
    const head = normalizePositionText(input.slice(0, index).replace(/[，、]+$/, ""));
    const tail = normalizePositionText(input.slice(index));
    const locality = inferLocalityKey(head);
    if (!head || !tail || (localityRequired && !locality)) return null;
    return [head, prependLocalityToFragment(locality, tail)]
      .flatMap(splitAtExplicitNextLocality)
      .map(normalizePositionText)
      .filter(Boolean);
  };

  if (/^[\u4e00-\u9fa5]{2,12}市委副书记/.test(input) && /(市长|代市长)/.test(input) && /[，、]市委书记/.test(input)) {
    const result = splitByBareMarker("市委书记", true);
    if (result) return result;
  }

  if (
    /(?:省委副书记|自治区党委副书记|直辖市委副书记)/.test(input) &&
    /(省长|主席|代省长|代主席)/.test(input) &&
    /[，、](?:省委书记|自治区党委书记|直辖市委书记)/.test(input)
  ) {
    const markerMatch = input.match(/(省委书记|自治区党委书记|直辖市委书记)/);
    if (markerMatch?.[1]) {
      const result = splitByBareMarker(markerMatch[1], true);
      if (result) return result;
    }
  }

  return splitAtExplicitNextLocality(input);
}

function isEducationLine(text) {
  return /学习|毕业|获.*学位|研究生|博士|硕士|学士|待分配/.test(text || "");
}

function parseCareerEntries(text, currentPosition = "") {
  const input = cleanNoise(text);
  if (!input) return [];

  const entries = [];
  const rangeRegex = /((?:19|20)\d{2}[.\-年](?:0?\d|1[0-2])(?:[-—至](?:19|20)\d{2}[.\-年](?:0?\d|1[0-2])|[-—至](?:今|-)|))(.*?)(?=(?:19|20)\d{2}[.\-年](?:0?\d|1[0-2])(?:[-—至]|$)|$)/g;
  let match;
  while ((match = rangeRegex.exec(input))) {
    const raw = normalizePositionText(match[2] || "");
    if (!raw) continue;
    if (isEducationLine(raw)) continue;
    if (!looksLikePosition(raw)) continue;
    if (currentPosition && (raw.includes(currentPosition) || currentPosition.includes(raw))) continue;
    entries.push(raw);
  }

  if (!entries.length) {
    return parsePositions(input)
      .map(normalizePositionText)
      .filter((item) => item && !isEducationLine(item) && looksLikePosition(item));
  }

  return entries;
}

function extractDetailHistoryPositions(official) {
  const detail = String(official?.detail || "");
  const match = detail.match(/曾任职务[:：]\s*(.+)$/);
  if (!match?.[1]) return [];

  const segments = match[1]
    .split("，")
    .map((item) => normalizePositionText(item))
    .filter(Boolean);

  const entries = [];
  let current = "";

  const startsNewEntry = (fragment, existing) => {
    if (!existing) return true;
    if (/^(中央|国务院|全国人大|全国政协|[\u4e00-\u9fa5]{2,12}(?:省|自治区|市|州|盟))(?:委|人民政府|政府|人大|政协|党工委|开发区|新区|集团|总公司|领导小组)/.test(fragment)) {
      return true;
    }
    if (/^(市委书记|省委书记|自治区党委书记|直辖市委书记|市人大常委会主任|市人大主任|省人大常委会副主任|省政协副主席)$/.test(fragment)) {
      return /(副书记|市长|代市长|省长|主席|常务副市长|常务副省长)/.test(existing);
    }
    return false;
  };

  for (const fragment of segments) {
    if (startsNewEntry(fragment, current)) {
      const priorLocality = inferLocalityKey(current);
      if (current) entries.push(current);
      current =
        !priorLocality || /^(中央|国务院|全国人大|全国政协|[\u4e00-\u9fa5]{2,12}(?:省|自治区|市|州|盟))(?:委|人民政府|政府|人大|政协|党工委|开发区|新区|集团|总公司|领导小组)/.test(fragment)
          ? fragment
          : prependLocalityToFragment(priorLocality, fragment);
      continue;
    }

    const locality = inferLocalityKey(current);
    const nextPart =
      /^(市委书记|省委书记|自治区党委书记|直辖市委书记|市人大常委会主任|市人大主任|省人大常委会副主任|省政协副主席|市人民政府市长|市长|代市长|省人民政府省长|省长|主席)$/.test(
        fragment
      )
        ? prependLocalityToFragment(locality, fragment)
        : fragment;
    current = `${current}，${nextPart}`;
  }

  if (current) entries.push(current);
  return entries.flatMap(splitCombinedStagePosition).map(normalizePositionText).filter(Boolean);
}

function isPureAuxiliaryPosition(text) {
  const input = normalizePositionText(text);
  if (!input) return true;
  if (/中央委员|中央候补委员/.test(input) && !/中央政治局委员|书记|省长|市长|部长|副部长|副主席|主任|司令员|政治委员/.test(input)) return true;
  if (/工作协调小组成员|领导小组成员|委员会成员|成员$|第一政委/.test(input) && !/书记|省长|市长|部长|副部长/.test(input)) return true;
  return /^(党组成员|党委委员|成员|副组长|组长)$/.test(input);
}

function isLowPriorityDepartmentRole(text) {
  const input = normalizePositionText(text);
  if (!input) return false;
  if (!/(公司|集团|银行|院|中心|出版社|研究所|大学|学院)/.test(input)) return false;
  if (!/(?:部|处|室|科|办)/.test(input)) return false;
  if (!/(副部长|部长|副主任|主任|副经理|经理|部长助理|主任助理)/.test(input)) return false;
  if (/(党委书记|党组书记|纪委书记|董事长|总经理|副总经理|局长|院长|校长|主任委员|常委|书记|市长|省长|主席)/.test(input)) return false;
  return true;
}

function isImportantProvincialRole(text) {
  const input = normalizePositionText(text);
  return (
    /中央政治局委员|中央军委委员|中共中央军事委员会副主席|中华人民共和国中央军事委员会副主席|国务委员/.test(input) ||
    /(?:省委|自治区党委|直辖市委).*(书记|副书记|常委)/.test(input) ||
    /(?:省人民政府|自治区人民政府|自治区政府|省政府).*(省长|主席|副省长|副主席)/.test(input) ||
    /(?:省人大常委会|省政协).*(副主任|副主席)/.test(input) ||
    /(?:市委).*(书记|副书记|常委)/.test(input) ||
    /(?:市人民政府|市政府).*(市长|副市长)/.test(input) ||
    /(?:大学|学院).*(校长|党委书记|党委副书记)/.test(input) ||
    /(?:区委).*(书记|副书记)/.test(input) ||
    /(?:区人民政府|区政府).*(区长|副区长)/.test(input) ||
    /战区司令员|海军政治委员|中央军委政治工作部主任|国防部部长/.test(input) ||
    /(?:部|委员会|总局|署).*(部长|副部长|局长|副局长|书记)/.test(input) ||
    /国家航天局局长|国防科技工业局局长/.test(input)
  );
}

function isImportantBureauRole(text) {
  const input = normalizePositionText(text);
  return (
    /(?:市委|州委|区委|县委).*(书记|副书记|常委)/.test(input) ||
    /(?:盟委|旗委).*(书记|副书记|委员|常委)/.test(input) ||
    /(?:市人民政府|州人民政府|区人民政府|县人民政府|市政府).*(市长|副市长|州长|副州长|区长|副区长|县长|副县长)/.test(input) ||
    /(?:盟行政公署|盟政府|旗人民政府|旗政府).*(盟长|副盟长|旗长|副旗长)/.test(input) ||
    /(?:市人大常委会|市政协).*(主任|副主任|主席|副主席)/.test(input) ||
    /(?:州人大常委会|州政协|盟人大工委|盟政协).*(主任|副主任|主席|副主席)/.test(input) ||
    /(?:区人大常委会|区政协|县人大常委会|县政协|旗人大常委会|旗政协).*(主任|副主任|主席|副主席)/.test(input) ||
    /(?:省|自治区).*(?:厅|局|委员会|管理局|总队).*(厅长|局长|副厅长|副局长|主任|副主任|党组书记|党组副书记)/.test(input) ||
    /(?:开发区|新区|党工委).*(书记|副书记|主任)/.test(input)
  );
}

function shouldKeepSignificantPosition(official, text) {
  const input = normalizePositionText(text);
  if (!input || isPureAuxiliaryPosition(input) || isLowPriorityDepartmentRole(input)) return false;
  if (["国家级", "省部级"].includes(official?.level)) {
    return isImportantProvincialRole(input);
  }
  if (official?.level === "厅局级") {
    return isImportantBureauRole(input);
  }
  return looksLikePosition(input);
}

function combineSeniorPositions(items) {
  let positions = [...items];
  const combineInto = (matcher, targetMatcher, joiner) => {
    const from = positions.find((item) => matcher.test(item));
    const targetIndex = positions.findIndex((item) => targetMatcher.test(item));
    if (!from || targetIndex === -1) return;
    positions[targetIndex] = joiner(from, positions[targetIndex]);
    positions = positions.filter((item) => item !== from);
  };

  combineInto(/中央政治局委员/, /党委书记|省委书记|自治区党委书记/, (from, target) =>
    target.includes(from) ? target : `${from}，${target}`
  );

  const primaryProvinceHead = positions.find((item) => /自治区党委书记|省委书记|市委书记/.test(item));
  if (primaryProvinceHead) {
    positions = positions.filter((item) => !/第一政委/.test(item));
  }

  const deputySecretary = positions.find((item) => /省委副书记|自治区党委副书记/.test(item));
  const governorIndex = positions.findIndex((item) => /省政府.*省长|省人民政府省长|自治区政府主席|省长、党组书记|主席、党组书记/.test(item));
  if (deputySecretary && governorIndex !== -1) {
    const governor = positions[governorIndex];
    positions[governorIndex] = governor.includes(deputySecretary) ? governor : `${deputySecretary}，${governor}`;
    positions = positions.filter((item) => item !== deputySecretary);
  }

  return positions;
}

function simplifyPositionForKey(text) {
  const normalized = normalizePositionText(text)
    .replace(/^[^市州盟区县]{2,8}省/, "")
    .replace(/^[^市州盟区县]{2,8}自治区/, "")
    .replace(/（兼）/g, "")
    .replace(/兼任?/g, "")
    .replace(/党组书记|党组副书记|党组成员|党委书记|党委副书记|党委委员/g, "")
    .replace(/市委党校（[^）]*）?/g, "")
    .replace(/市委党校|党校校长|第一校（院）长|第一校院长|第一书记|第一政委|军分区党委第一书记|警备区党委第一书记/g, "")
    .replace(/副市长（常务）/g, "常务副市长")
    .replace(/副省长（常务）/g, "常务副省长")
    .replace(/代市长/g, "市长")
    .replace(/常务副市长/g, "副市长")
    .replace(/常务副省长/g, "副省长")
    .replace(/市人民政府/g, "市政府")
    .replace(/省人民政府/g, "省政府")
    .replace(/自治区人民政府/g, "自治区政府")
    .replace(/市人大常委会主任/g, "市人大主任")
    .replace(/省人大常委会副主任/g, "省人大副主任")
    .replace(/市政协副主席/g, "市政协副主席")
    .replace(/省政协副主席/g, "省政协副主席")
    .trim();

  const locality = inferLocalityKey(normalized);
  if (locality) {
    if (hasTopLeaderSecretaryRole(normalized)) return `${locality}:书记阶段`;
    if (/市长|州长|区长|县长|省长|主席/.test(normalized) && !/副市长|副州长|副区长|副县长|副省长|副主席/.test(normalized)) {
      return `${locality}:主政阶段`;
    }
    if (/常务副市长|副市长（常务）|常务副省长|副省长（常务）/.test(normalized)) {
      return `${locality}:常务副职阶段`;
    }
    if (/副市长|副州长|副区长|副县长|副省长|副主席/.test(normalized)) {
      return `${locality}:副职阶段`;
    }
  }

  return normalized.replace(/[，、,；;（）()\s]/g, "").trim();
}

function isOverCombinedPosition(text) {
  const input = normalizePositionText(text);
  if (!input) return false;
  if (/市委副书记/.test(input) && /市委书记/.test(input)) return true;
  if (/市长/.test(input) && /市人大(?:常委会)?主任/.test(input) && /书记/.test(input)) return true;
  if (/副市长/.test(input) && /市长/.test(input) && /书记/.test(input)) return true;
  const majorTags = [
    /副书记/,
    /书记/,
    /市长|省长|主席/,
    /副市长|副省长|副主席/,
    /市人大(?:常委会)?主任|省人大(?:常委会)?副主任/,
    /市政协副主席|省政协副主席/,
    /常委/,
    /部长/
  ].filter((pattern) => pattern.test(input)).length;
  return majorTags >= 4;
}

function inferPositionOrderScore(text) {
  const input = normalizePositionText(text);
  let score = 0;
  if (/知青|科员|办事员|副主任科员|主任科员/.test(input)) score += 1;
  if (/副县长|副区长|副市长|副州长|副厅长|副局长|副部长/.test(input)) score += 10;
  if (/代市长|代州长|代区长|代县长/.test(input)) score += 16;
  if (/市长|州长|区长|县长|主任/.test(input)) score += 20;
  if (/常委/.test(input)) score += 26;
  if (/副书记/.test(input)) score += 30;
  if (/书记/.test(input)) score += 36;
  if (/市人大主任|市人大常委会主任|市政协副主席/.test(input)) score += 42;
  if (/副省长|副主席|省人大副主任|省政协副主席/.test(input)) score += 50;
  if (/省委常委|自治区党委常委|直辖市委常委/.test(input)) score += 56;
  if (/省委副书记|自治区党委副书记|直辖市委副书记/.test(input)) score += 62;
  if (/省长|主席/.test(input)) score += 68;
  if (/省委书记|自治区党委书记|直辖市委书记/.test(input)) score += 74;
  if (/中央|国务院|全国人大|全国政协|部党组|部长|总公司|集团公司/.test(input)) score += 82;
  return score;
}

function inferLocalityKey(text) {
  const input = normalizePositionText(text);
  const match = input.match(/((?:[\u4e00-\u9fa5]{2,12}(?:省|自治区))?[\u4e00-\u9fa5]{2,12}(?:市|州|盟))(?:委|政府|人大|政协|军分区|警备区|开发区|新区|$)/);
  if (!match) return "";
  return match[1]
    .replace(/^[\u4e00-\u9fa5]{2,12}省/, "")
    .replace(/^[\u4e00-\u9fa5]{2,12}自治区/, "");
}

function inferStageFamily(text) {
  const input = normalizePositionText(text);
  if (hasTopLeaderSecretaryRole(input)) return "secretary";
  if (/市长|州长|区长|县长|省长|主席/.test(input) && !/副市长|副州长|副区长|副县长|副省长|副主席/.test(input)) return "chief-executive";
  if (/常务副市长|副市长（常务）|常务副省长|副省长（常务）/.test(input)) return "executive-deputy";
  if (/副市长|副州长|副区长|副县长|副省长|副主席/.test(input)) return "deputy-executive";
  if (/常委/.test(input)) return "standing-committee";
  if (/组织部部长|宣传部部长|统战部部长|政法委书记/.test(input)) return "party-portfolio";
  return "";
}

function preferStageRepresentative(a, b) {
  const score = (text) => {
    const input = normalizePositionText(text);
    let total = 0;
    if (hasTopLeaderSecretaryRole(input) && /人大(?:常委会)?主任/.test(input)) total += 8;
    if (hasTopLeaderSecretaryRole(input) && /市长|省长|主席/.test(input)) total += 7;
    if (/副书记/.test(input) && /市长|省长|主席/.test(input) && !/代市长|代省长/.test(input)) total += 6;
    if (/代市长|代省长|代主席/.test(input)) total += 4;
    if (/常委/.test(input) && /常务副市长|副市长（常务）|常务副省长|副省长（常务）/.test(input)) total += 5;
    if (/常委/.test(input)) total += 2;
    if (/人大(?:常委会)?主任/.test(input)) total += 2;
    if (/党组书记|党委书记/.test(input)) total += 1;
    total += Math.min(input.length / 18, 3);
    return total;
  };
  return score(a) >= score(b) ? a : b;
}

function areEquivalentStagePositions(a, b) {
  const left = normalizePositionText(a);
  const right = normalizePositionText(b);
  const leftLocality = inferLocalityKey(left);
  const rightLocality = inferLocalityKey(right);
  if (!leftLocality || !rightLocality || leftLocality !== rightLocality) return false;

  const bothExecutiveDeputy =
    /(常务副市长|副市长（常务）|常务副省长|副省长（常务）)/.test(left) &&
    /(常务副市长|副市长（常务）|常务副省长|副省长（常务）)/.test(right);
  if (bothExecutiveDeputy) return true;

  const bothMayorStage =
    /副书记/.test(left) &&
    /副书记/.test(right) &&
    /(市长|州长|区长|县长|省长|主席)/.test(left) &&
    /(市长|州长|区长|县长|省长|主席)/.test(right);
  if (bothMayorStage) return true;

  const bothSecretaryStage = hasTopLeaderSecretaryRole(left) && hasTopLeaderSecretaryRole(right);
  if (bothSecretaryStage) return true;

  return false;
}

function collapseLocalityStageDuplicates(items, official) {
  if (!["国家级", "省部级"].includes(official?.level)) {
    return items;
  }

  const grouped = new Map();
  for (const item of items) {
    const locality = inferLocalityKey(item);
    const family = inferStageFamily(item);
    if (!locality || !family) {
      const fallbackKey = `raw:${simplifyPositionForKey(item)}`;
      grouped.set(fallbackKey, grouped.has(fallbackKey) ? preferStageRepresentative(grouped.get(fallbackKey), item) : item);
      continue;
    }
    const key = `${locality}::${family}`;
    grouped.set(key, grouped.has(key) ? preferStageRepresentative(grouped.get(key), item) : item);
  }

  const collapsed = [];
  for (const item of grouped.values()) {
    const existingIndex = collapsed.findIndex((existing) => areEquivalentStagePositions(existing, item));
    if (existingIndex === -1) {
      collapsed.push(item);
      continue;
    }
    collapsed[existingIndex] = preferStageRepresentative(collapsed[existingIndex], item);
  }

  return collapsed;
}

function harmonizeLocalityPrefixes(items) {
  const explicitPrefixes = new Map();
  for (const item of items) {
    const normalized = normalizePositionText(item);
    const locality = inferLocalityKey(normalized);
    const prefixMatch = normalized.match(/^([\u4e00-\u9fa5]{2,12}(?:省|自治区))(.*)$/);
    if (!locality || !prefixMatch?.[1]) continue;
    explicitPrefixes.set(locality, prefixMatch[1]);
  }

  return items.map((item) => {
    const normalized = normalizePositionText(item);
    const locality = inferLocalityKey(normalized);
    const prefix = locality ? explicitPrefixes.get(locality) : "";
    if (!locality || !prefix) return item;
    if (normalized.startsWith(prefix)) return item;
    if (!normalized.startsWith(locality)) return item;
    return `${prefix}${normalized}`;
  });
}

function buildDetailOrderAnchors(text) {
  const normalized = normalizePositionText(text);
  return uniqueStrings([
    normalized,
    normalized.replace(/副市长（常务）/g, "常务副市长"),
    normalized.replace(/副省长（常务）/g, "常务副省长"),
    normalized.replace(/市人民政府副市长（常务）/g, "市政府常务副市长"),
    normalized.replace(/省人民政府副省长（常务）/g, "省政府常务副省长"),
    normalized.replace(/市人民政府市长/g, "市政府市长"),
    normalized.replace(/省人民政府省长/g, "省政府省长"),
    normalized.replace(/^[^，、]*常委、/, ""),
    normalized.replace(/^[^市州盟区县]{2,8}省/, ""),
    normalized.replace(/^[^市州盟区县]{2,8}自治区/, ""),
    normalized.replace(/^[^市州盟区县]{2,8}特别行政区/, ""),
    normalized.replace(/^[^市州盟区县]{2,8}(?:市|州)/, (match) => match.slice(-1)),
    normalized.replace(/^[^,，]*?(?=(?:市委|市政府|市人大|市政协|区委|区政府|州委|州政府|省委|省政府|全国人大|全国政协|国务院|中央))/, "")
  ]).filter(Boolean);
}

function inferDetailOrderIndex(official, text) {
  const detail = normalizePositionText(official?.detail || "");
  if (!detail) return Number.MAX_SAFE_INTEGER;
  const anchors = buildDetailOrderAnchors(text);
  for (const anchor of anchors) {
    const index = detail.indexOf(anchor);
    if (index !== -1) return index;
  }
  return Number.MAX_SAFE_INTEGER;
}

function scoreSignificantPosition(text) {
  const input = normalizePositionText(text);
  let score = 0;
  if (/书记/.test(input)) score += 6;
  if (/省长|主席|市长/.test(input)) score += 5;
  if (/副书记/.test(input)) score += 4;
  if (/常委/.test(input)) score += 3;
  if (/副省长|副市长|副主席|副主任/.test(input)) score += 2;
  if (/部长|副部长|局长/.test(input)) score += 3;
  if (/中央政治局委员/.test(input)) score += 2;
  return score;
}

function hasTopLeaderSecretaryRole(text) {
  const input = normalizePositionText(text);
  return /(?:省委书记|自治区党委书记|直辖市委书记|市委书记|州委书记|区委书记|县委书记|党工委书记)/.test(input);
}

function hydrateBareLocalityStages(items) {
  const localityHints = uniqueStrings(items.map((item) => inferLocalityKey(item)).filter(Boolean));
  if (localityHints.length !== 1) return items;
  const locality = localityHints[0];
  return items.map((item) => {
    const normalized = normalizePositionText(item);
    if (/^(市委书记|市委副书记|市人民政府市长|市长|代市长|市人大常委会主任|市人大主任|市政协副主席)$/.test(normalized)) {
      return prependLocalityToFragment(locality, normalized);
    }
    if (/^(省委书记|省委副书记|省人民政府省长|省长|代省长|省人大常委会副主任|省政协副主席)$/.test(normalized)) {
      return prependLocalityToFragment(locality, normalized);
    }
    return item;
  });
}

function normalizePositionList(items, official = {}) {
  const prepared = hydrateBareLocalityStages(
    items
    .flatMap(splitCombinedStagePosition)
    .map(normalizePositionText)
    .filter((item) => item && !isNoisyText(item) && item.length <= 120 && looksLikePosition(item) && !/[《》]/.test(item) && !isOverCombinedPosition(item))
  );

  const scoped = prepared.filter((item) =>
    shouldKeepSignificantPosition(official, item) ||
    (!["国家级", "省部级", "厅局级"].includes(official?.level) && looksLikePosition(item))
  );

  const grouped = new Map();
  for (const rawItem of scoped) {
    const key = simplifyPositionForKey(rawItem) || canonicalizePosition(rawItem);
    if (!key) continue;
    if (!grouped.has(key)) {
      grouped.set(key, rawItem);
      continue;
    }
    grouped.set(key, preferPosition(grouped.get(key), rawItem));
  }

  let ordered = [...grouped.values()];
  if (["国家级", "省部级"].includes(official?.level)) {
    ordered = combineSeniorPositions(ordered);
  }
  ordered = collapseLocalityStageDuplicates(ordered, official);
  ordered = harmonizeLocalityPrefixes(ordered);

  ordered = ordered.sort((a, b) => {
    const detailIndexGap = inferDetailOrderIndex(official, a) - inferDetailOrderIndex(official, b);
    if (detailIndexGap !== 0) return detailIndexGap;
    const orderGap = inferPositionOrderScore(a) - inferPositionOrderScore(b);
    if (orderGap !== 0) return orderGap;
    return scoreSignificantPosition(a) - scoreSignificantPosition(b);
  });
  return ordered;
}

function htmlToText(html) {
  return cleanNoise(
    String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  );
}

function extractBaiduCareerEntries(html, currentPosition = "") {
  const source = String(html || "");
  const headingMatch =
    source.match(/<h2>\s*人物履历\s*<\/h2>/) ||
    source.match(/data-name="人物履历"/) ||
    source.match(/>人物履历<\/h2>/);
  const start = headingMatch ? headingMatch.index : source.indexOf("人物履历");
  if (start === -1) return [];
  const afterStart = source.slice(start);
  const endMatch = afterStart.search(/<h2>\s*(?:担任职务|人物事件|学术成果|参考资料)\s*<\/h2>|data-name="(?:担任职务|人物事件|学术成果|参考资料)"/);
  const section = endMatch === -1 ? afterStart : afterStart.slice(0, endMatch);

  const matches = [...section.matchAll(/<span[^>]*data-text="true"[^>]*>([\s\S]*?)<\/span>/g)];
  const entries = [];
  for (const match of matches) {
    const text = htmlToText(match[1]);
    const rangeMatch = text.match(
      /^((?:19|20)\d{2}[.\-年](?:0?\d|1[0-2])(?:[-—至](?:(?:19|20)\d{2}[.\-年](?:0?\d|1[0-2])|今|-))?)\s*(.+)$/
    );
    const raw = normalizePositionText(rangeMatch ? rangeMatch[2] : text);
    if (!raw) continue;
    if (isEducationLine(raw)) continue;
    if (!looksLikePosition(raw)) continue;
    if (currentPosition && (raw.includes(currentPosition) || currentPosition.includes(raw))) continue;
    entries.push(raw);
  }

  return uniqueStrings(entries);
}

function shouldDropInjectedInlineText(text) {
  const input = cleanNoise(htmlToText(text));
  if (!input) return true;
  if (/\d/.test(input)) return false;
  if (
    /(书记|副书记|常委|委员|市长|副市长|州长|副州长|区长|副区长|县长|副县长|旗长|副旗长|盟长|副盟长|厅长|副厅长|局长|副局长|主任|副主任|主席|副主席|政府|人大|政协|党组|党委|市委|省委|州委|县委|区委|旗委|盟委|自治区|自治州|内蒙古|阿拉善|赤峰|呼伦贝尔)/.test(
      input
    )
  ) {
    return false;
  }
  return input.length <= 8;
}

function extract360CareerEntries(html, currentPosition = "") {
  const source = String(html || "");
  const headingMatch = source.match(/<b class=title>\s*人物履历\s*<\/b>/) || source.match(/>人物履历<\/b>/);
  const start = headingMatch ? headingMatch.index : source.indexOf("人物履历");
  if (start === -1) return [];

  const afterStart = source.slice(start);
  const endMatch = afterStart.search(/<b class=title>\s*(?:职务任免|人物事件|参考资料|社会任职|人物评价)\s*<\/b>|<dt>\s*参考资料\s*<\/dt>/);
  const section = endMatch === -1 ? afterStart : afterStart.slice(0, endMatch);

  const matches = [...section.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)];
  const entries = [];
  for (const match of matches) {
    const sanitizedHtml = String(match[1] || "").replace(
      /<(span|strong|b)[^>]*>([\s\S]*?)<\/\1>/gi,
      (_, tag, inner) => (shouldDropInjectedInlineText(inner) ? "" : htmlToText(inner))
    );
    const rawText = htmlToText(sanitizedHtml)
      .replace(/^他/, "")
      .replace(/\s+/g, " ")
      .trim();
    const normalized = normalizePositionText(rawText);
    if (!normalized) continue;
    if (isEducationLine(normalized)) continue;
    if (!looksLikePosition(normalized)) continue;
    if (currentPosition && (normalized.includes(currentPosition) || currentPosition.includes(normalized))) continue;
    entries.push(normalized);
  }

  return uniqueStrings(entries);
}

function pickLastPosition(text) {
  const patterns = [
    /(重庆市委常委、两江新区区委书记)/,
    /(?:曾任|历任|担任|出任)([^。；]{6,80})/,
    /([^。；]{4,60}(?:书记|省长|市长|主席|副主席|部长|副部长|董事长|总经理|院长|检察长|秘书长|局长|主任))/
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return trimText(match[1]);
  }
  return "";
}

function extractBaiduSummary(html, name) {
  const cleaned = cleanNoise(html.replace(/<[^>]+>/g, " "));
  const metaDescription = parseMetaContent(html, "description") || parseMetaContent(html, "og:description");
  const titleText = cleanNoise((html.match(/<title>([^<]+)<\/title>/i) || [])[1] || "");
  const descMatch = html.match(/"lemmaDesc":"([^"]+)"/);
  const descriptionMatch = html.match(/"description":"([^"]+)"/);
  const dateOfBirthMatch = html.match(/"dateOfBirth"[\s\S]{0,240}?"text":"([^"]+)"/);
  const resumeMatch = cleaned.match(/人物履历\s*(.*?)\s*担任职务/);
  const eventMatch = cleaned.match(/人物事件\s*(.*?)(?:学术成果|参考资料|$)/);
  const description = cleanNoise(metaDescription || descMatch?.[1] || descriptionMatch?.[1] || titleText.replace(/_百度百科$/, ""));
  const resume = cleanNoise(resumeMatch?.[1] || "");
  const event = cleanNoise(eventMatch?.[1] || "");
  const birth = parseBirth([dateOfBirthMatch?.[1] || "", description, cleaned].join(" "));
  const lastPosition = pickLastPosition(`${description}。${resume}`) || description;
  const regionText = cleanNoise([resume, lastPosition, description].filter(Boolean).join(" "));
  const timelinePositions = extractBaiduCareerEntries(html, lastPosition);
  const previousPositions = normalizePositionList(
    (timelinePositions.length ? timelinePositions : parseCareerEntries(resume, lastPosition)).reverse(),
    { level: detectLevel(regionText), lastPosition }
  );
  const detailParts = [description].filter(Boolean);
  if (!detailParts.length && !cleaned.includes(name)) return null;
  return {
    birth,
    photo: parsePhotoUrl(html),
    lastPosition,
    previousPositions,
    region: detectRegion(regionText),
    level: detectLevel(regionText),
    investigationDate: parseInvestigationDate(event),
    timeline: extractDispositionTimeline(event),
    detailAppend: detailParts.join("。"),
    sources: [
      {
        type: "encyclopedia",
        label: "百度百科检索",
        url: `https://baike.baidu.com/search/word?word=${encodeURIComponent(name)}`
      }
    ]
  };
}

async function fetchJson(url) {
  const signal = AbortSignal.timeout(12000);
  const response = await fetch(url, {
    signal,
    headers: { "User-Agent": "fanfu-web/0.2" }
  });
  if (!response.ok) {
    throw new Error(`Fetch failed: ${response.status} ${url}`);
  }
  return response.json();
}

async function fetchText(url) {
  const signal = AbortSignal.timeout(12000);
  const response = await fetch(url, {
    signal,
    headers: { "User-Agent": "fanfu-web/0.2" }
  });
  if (!response.ok) {
    throw new Error(`Fetch failed: ${response.status} ${url}`);
  }
  return response.text();
}

async function fetchTextByCurl(url) {
  const { stdout } = await execFileAsync("curl", [
    "-L",
    "--max-time",
    "18",
    "-A",
    "fanfu-web/0.2",
    url
  ], {
    maxBuffer: 8 * 1024 * 1024,
    env: {
      ...process.env,
      HTTP_PROXY: "",
      HTTPS_PROXY: "",
      ALL_PROXY: "",
      http_proxy: "",
      https_proxy: "",
      all_proxy: "",
      NO_PROXY: "*",
      no_proxy: "*"
    }
  });
  return stdout;
}

async function fetchTextWithFallback(url) {
  try {
    return await fetchText(url);
  } catch (error) {
    if (/zh\.wikipedia\.org/.test(url)) {
      return fetchTextByCurl(url);
    }
    throw error;
  }
}

function parseBirthFromCategories(html) {
  const categoryMatch = String(html || "").match(/"wgCategories":\[(.*?)\]/);
  if (!categoryMatch?.[1]) return "";
  const categories = categoryMatch[1].match(/"([^"]+)"/g) || [];
  const text = categories.map((item) => item.replace(/^"|"$/g, "")).join(" ");
  const full = text.match(/(\d{4})年(\d{1,2})月出生/);
  if (full) {
    return `${full[1]}-${String(full[2]).padStart(2, "0")}`;
  }
  const yearOnly = text.match(/(\d{4})年出生/);
  return yearOnly ? yearOnly[1] : "";
}

function extractWikipediaSummaryFromHtml(html, name, pageUrl) {
  const plainText = cleanNoise(htmlToText(html));
  if (!plainText.includes(name)) return null;
  const titleText = cleanNoise((String(html || "").match(/<title>([^<]+)<\/title>/i) || [])[1] || "");
  const leadPassage = extractRelevantPassage(plainText, name);
  const birth = parseBirth([leadPassage, plainText].join(" ")) || parseBirthFromCategories(html);
  const lastPosition = pickLastPosition(leadPassage) || pickLastPosition(plainText);
  const derivedLevel = detectLevel([titleText, plainText].join(" "));
  const previousPositions = normalizePositionList(parseCareerEntries(plainText, lastPosition).reverse(), { level: derivedLevel, lastPosition });
  const detailAppend = cleanNoise(leadPassage || titleText.replace(/ - 维基百科.*$/, ""));
  return {
    birth,
    photo: parsePhotoUrl(html),
    lastPosition,
    previousPositions,
    region: detectRegion([titleText, plainText].join(" ")),
    level: derivedLevel,
    investigationDate: parseInvestigationDate(plainText),
    timeline: extractDispositionTimeline(plainText),
    detailAppend,
    sources: pageUrl
      ? [
          {
            type: "encyclopedia",
            label: `维基百科词条：${name}`,
            url: pageUrl
          }
        ]
      : []
  };
}

async function queryWikipediaDirectPage(official) {
  const title = official.name;
  const pageUrl = `https://zh.wikipedia.org/wiki/${encodeURIComponent(title)}`;
  try {
    const html = await fetchTextWithFallback(pageUrl);
    const parsed = extractWikipediaSummaryFromHtml(html, official.name, pageUrl);
    return parsed ? [parsed] : [];
  } catch {
    return [];
  }
}

async function fetchWikipediaPage(title) {
  const encodedTitle = encodeURIComponent(title);
  const summaryUrl = `https://zh.wikipedia.org/api/rest_v1/page/summary/${encodedTitle}`;
  const extractsUrl =
    `https://zh.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&titles=${encodedTitle}&format=json&origin=*`;

  let extract = "";
  let pageUrl = "";
  let description = "";
  let thumbnail = "";

  try {
    const summary = await fetchJson(summaryUrl);
    extract = trimText(summary.extract || "");
    description = trimText(summary.description || "");
    pageUrl = summary?.content_urls?.desktop?.page || "";
    thumbnail = summary?.thumbnail?.source || "";
  } catch {}

  try {
    const payload = await fetchJson(extractsUrl);
    const pages = payload?.query?.pages || {};
    const page = Object.values(pages)[0] || {};
    extract = trimText(page.extract || extract);
    pageUrl = pageUrl || `https://zh.wikipedia.org/wiki/${encodedTitle}`;
  } catch {}

  if (!extract && !description) return null;

  return { extract, description, pageUrl, thumbnail };
}

async function queryWikipedia(official) {
  const queries = buildEnrichmentQueries(official);
  const candidates = [];

  for (const query of queries.slice(0, 2)) {
    const searchUrl =
      `https://zh.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=1&format=json&origin=*`;
    const titles = [];

    if (query === official.name) {
      titles.push(official.name);
    }

    try {
      const payload = await fetchJson(searchUrl);
      const hits = payload?.query?.search || [];
      for (const hit of hits.slice(0, 3)) {
        if (hit?.title) titles.push(hit.title);
      }
    } catch {}

    for (const title of uniqueStrings(titles)) {
      const page = await fetchWikipediaPage(title);
      if (!page) continue;

      const { extract, description, pageUrl, thumbnail } = page;
      const birth = parseBirth(extract);
      const lastPosition = pickLastPosition(extract);
      const derivedLevel = detectLevel(`${description} ${extract}`);
      const previousPositions = normalizePositionList(parseCareerEntries(extract, lastPosition).reverse(), { level: derivedLevel, lastPosition });

      candidates.push({
        birth,
        photo: thumbnail || "",
        lastPosition,
        previousPositions,
        region: detectRegion(extract),
        level: derivedLevel,
        detailAppend: extract,
        sources: pageUrl
          ? [
              {
                type: "encyclopedia",
                label: `维基百科检索：${query}`,
                url: pageUrl
              }
            ]
          : []
      });
    }
  }

  return candidates;
}

async function queryBaiduBaike(official) {
  const candidates = [];
  const queries = buildEnrichmentQueries(official);

  for (const queryText of queries) {
    const url = `https://baike.baidu.com/search/word?word=${encodeURIComponent(queryText)}`;
    try {
      const html = await fetchText(url);
      const parsed = extractBaiduSummary(html, official.name);
      if (parsed) {
        parsed.sources = [{ type: "encyclopedia", label: `百度百科检索：${queryText}`, url }];
        candidates.push(parsed);
      }

      for (const itemUrl of extractBaiduItemUrls(html)) {
        try {
          const itemHtml = await fetchText(itemUrl);
          const itemParsed = extractBaiduSummary(itemHtml, official.name);
          if (!itemParsed) continue;
          itemParsed.sources = [{ type: "encyclopedia", label: `百度百科词条：${queryText}`, url: itemUrl }];
          candidates.push(itemParsed);
        } catch {}
      }
    } catch {}
  }

  return candidates;
}

function extract360DocLinks(html) {
  const links = new Set();
  for (const match of String(html || "").matchAll(/https?:\/\/baike\.so\.com\/doc\/[^\s"'<>]+/g)) {
    const url = match[0].replace(/#.*$/, "");
    if (/\/doc\/search/.test(url) || /%q%/.test(url)) continue;
    links.add(url);
  }
  return [...links].slice(0, 4);
}

function extractRelevantPassage(text, name) {
  const input = cleanNoise(text);
  const index = input.indexOf(name);
  if (index === -1) return input.slice(0, 240);
  return input.slice(Math.max(0, index - 40), index + 220);
}

async function query360Baike(official) {
  const queries = uniqueStrings([
    `${official.name} ${official.lastPosition || ""}`.trim(),
    `${official.name} ${official.region || ""} ${official.lastPosition || ""}`.trim(),
    `${official.name} ${official.region || ""}`.trim()
  ]).slice(0, 3);
  const candidates = [];

  for (const queryText of queries) {
    const searchUrl = `https://www.so.com/s?q=${encodeURIComponent(queryText)}`;
    try {
      const searchHtml = await fetchText(searchUrl);
      const searchText = extractRelevantPassage(htmlToText(searchHtml), official.name);

      for (const itemUrl of extract360DocLinks(searchHtml)) {
        try {
          const itemHtml = await fetchText(itemUrl);
          const pageTitle = cleanNoise((itemHtml.match(/<title>([^<]+)/i) || [])[1] || "");
          const pageText = htmlToText(itemHtml);
          const combined = cleanNoise([pageTitle, searchText, pageText].join(" "));
          const birth = parseBirth(combined);
          const lastPosition = pickLastPosition(combined) || pageTitle.replace(/_360百科$/, "").replace(/^[^()]*\(/, "").replace(/\)$/, "");
          const derivedLevel = detectLevel(combined);
          const careerEntries = extract360CareerEntries(itemHtml, lastPosition);
          const previousPositions = normalizePositionList(
            (careerEntries.length ? careerEntries : parseCareerEntries(pageText, lastPosition)).reverse(),
            { level: derivedLevel, lastPosition }
          );
          candidates.push({
            birth,
            photo: parsePhotoUrl(itemHtml),
            lastPosition,
            previousPositions,
            region: detectRegion(combined),
            level: derivedLevel,
            investigationDate: parseInvestigationDate(combined),
            timeline: extractDispositionTimeline(combined),
            detailAppend: cleanNoise(searchText),
            sources: [
              {
                type: "encyclopedia",
                label: `360百科词条：${queryText}`,
                url: itemUrl
              }
            ]
          });
        } catch {}
      }
    } catch {}
  }

  return candidates;
}

async function queryExistingEncyclopediaSource(official, options = {}) {
  const includeKinds = options.includeKinds || null;
  const excludeKinds = options.excludeKinds || [];
  const sourceUrls = uniqueStrings((official.sources || []).map((source) => source?.url).filter(Boolean))
    .filter((url) => {
      const kind = /baike\.baidu\.com/.test(url) ? "baidu" : /baike\.so\.com/.test(url) ? "360" : /wikipedia\.org/.test(url) ? "wikipedia" : "other";
      if (includeKinds && !includeKinds.includes(kind)) return false;
      if (excludeKinds.includes(kind)) return false;
      return true;
    })
    .sort((a, b) => {
      const rank = (url) => (/baike\.baidu\.com/.test(url) ? 0 : /baike\.so\.com/.test(url) ? 1 : /wikipedia\.org/.test(url) ? 2 : 3);
      return rank(a) - rank(b);
    })
    .slice(0, 4);
  const candidates = [];

  for (const url of sourceUrls) {
    try {
      if (/baike\.so\.com\/doc\//.test(url)) {
        const html = await fetchText(url);
        const pageTitle = cleanNoise((html.match(/<title>([^<]+)/i) || [])[1] || "");
        const metaDescription = parseMetaContent(html, "description");
        const pageText = htmlToText(html);
        const combined = cleanNoise([pageTitle, metaDescription, pageText].join(" "));
        const birth = parseBirth(combined);
        const titlePosition = pageTitle.replace(/_360百科$/, "").replace(/^[^()]*\(/, "").replace(/\)$/, "");
        const lastPosition = pickLastPosition(combined) || titlePosition;
        const derivedLevel = detectLevel(combined);
        const careerEntries = extract360CareerEntries(html, lastPosition);
        const previousPositions = normalizePositionList(
          (careerEntries.length ? careerEntries : parseCareerEntries(`${metaDescription}。${pageText}`, lastPosition)).reverse(),
          { level: derivedLevel, lastPosition }
        );
        candidates.push({
          birth,
          photo: parsePhotoUrl(html),
          lastPosition,
          previousPositions,
          region: detectRegion(combined),
          level: derivedLevel,
          investigationDate: parseInvestigationDate(combined),
          timeline: extractDispositionTimeline(combined),
          detailAppend: cleanNoise(metaDescription || pageText || pageTitle),
          sources: [
            {
              type: "encyclopedia",
              label: `360百科词条：${official.name}`,
              url
            }
          ]
        });
        continue;
      }

      if (/baike\.baidu\.com\/item\//.test(url)) {
        const html = await fetchText(url);
        const parsed = extractBaiduSummary(html, official.name);
        if (parsed) {
          parsed.sources = [
            {
              type: "encyclopedia",
              label: `百度百科词条：${official.name}`,
              url
            }
          ];
          candidates.push(parsed);
        }
        continue;
      }

      if (/zh\.wikipedia\.org\/wiki\//.test(url)) {
        const html = await fetchTextWithFallback(url);
        const parsed = extractWikipediaSummaryFromHtml(html, official.name, url);
        if (parsed) {
          candidates.push(parsed);
        }
      }
    } catch {}
  }

  return candidates;
}

function uniqueStrings(items) {
  return [...new Set((items || []).map((item) => trimText(item)).filter(Boolean))];
}

function uniqueTimeline(items) {
  const map = new Map();
  for (const item of items || []) {
    if (!item) continue;
    const key = [item.date || "", item.stage || ""].join("|");
    if (map.has(key)) continue;
    map.set(key, {
      date: item.date || "",
      stage: item.stage || "",
      summary: item.summary || "",
      url: item.url || ""
    });
  }
  return [...map.values()].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

function parseChineseDate(text) {
  const withDay = String(text || "").match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (withDay) {
    return `${withDay[1]}-${String(withDay[2]).padStart(2, "0")}-${String(withDay[3]).padStart(2, "0")}`;
  }
  const withMonth = String(text || "").match(/(\d{4})年(\d{1,2})月/);
  if (withMonth) {
    return `${withMonth[1]}-${String(withMonth[2]).padStart(2, "0")}`;
  }
  return "";
}

function detectTimelineStage(text) {
  const input = String(text || "");
  if (/(提起公诉|审查起诉|移送检察机关|移送司法|逮捕|一审|二审|宣判)/.test(input)) return "移送司法";
  if (/(开除党籍|开除公职|双开|依法双开|党纪政务处分|处分决定)/.test(input)) return "党纪政务处分";
  if (/(接受纪律审查和监察调查|接受审查调查|涉嫌严重违纪违法|被查)/.test(input)) return "审查调查";
  return "";
}

function extractDispositionTimeline(text) {
  const entries = [];

  const patterns = [
    {
      stage: "审查调查",
      regex: /((?:违纪被查\s*)?\d{4}年\d{1,2}月\d{1,2}日[^。]{0,120}(?:接受中央纪委国家监委纪律审查和监察调查|接受纪律审查和监察调查|涉嫌严重违纪违法[^。]{0,40}(?:接受|被查))[^。]*)(?:。|$)/g
    },
    {
      stage: "党纪政务处分",
      regex: /((?:依法双开\s*)?\d{4}年\d{1,2}月(?:\d{1,2}日)?[^。]{0,140}(?:开除党籍|开除公职|双开)[^。]*)(?:。|$)/g
    },
    {
      stage: "移送司法",
      regex: /((?:提起公诉\s*)?\d{4}年\d{1,2}月(?:\d{1,2}日)?[^。]{0,140}(?:移送检察机关|审查起诉|提起公诉|逮捕)[^。]*)(?:。|$)/g
    }
  ];

  for (const { stage, regex } of patterns) {
    for (const match of String(text || "").matchAll(regex)) {
      const summary = cleanNoise(match[1] || "");
      if (!summary || summary.length > 160 || /人物履历|担任职务|学术成果/.test(summary)) continue;
      entries.push({
        date: parseChineseDate(summary),
        stage,
        summary,
        url: ""
      });
    }
  }

  return uniqueTimeline(entries);
}

function isExcelProtectedOfficial(official) {
  return (official.sources || []).some((source) => source?.type === "excel");
}

function hasEncyclopediaSource(official) {
  return (official.sources || []).some((source) => source?.type === "encyclopedia");
}

function hasOutcomeTimeline(official) {
  return (official.timeline || []).some((entry) => entry?.stage && entry.stage !== "审查调查");
}

function needsEnrichment(official) {
  if (!official) return false;
  if (official.locked) return false;
  if (isExcelProtectedOfficial(official)) {
    return !official.birth || !hasEncyclopediaSource(official) || !hasOutcomeTimeline(official) || (needsProfilePhoto(official) && !official.photo);
  }
  return (
    !official.birth ||
    (needsProfilePhoto(official) && !official.photo) ||
    !hasEncyclopediaSource(official) ||
    !(official.previousPositions || []).length ||
    !(official.detail || "").trim()
  );
}

function findHintEnrichment(official) {
  return loadEnrichmentHints().find((item) => {
    if (!item || item.name !== official.name) return false;
    if (item.region && item.region !== official.region) return false;
    if (item.lastPosition && item.lastPosition !== official.lastPosition) return false;
    return true;
  }) || null;
}

function scoreEnrichmentCandidate(official, enrichment) {
  if (!enrichment) return { accepted: false, score: -999, reason: "empty" };

  const officialText = cleanNoise([official.region, official.lastPosition, official.summary, official.detail].filter(Boolean).join(" "));
  const candidateText = cleanNoise(
    [enrichment.region, enrichment.lastPosition, ...(enrichment.previousPositions || []), enrichment.detailAppend].filter(Boolean).join(" ")
  );
  if (!candidateText) return { accepted: false, score: -999, reason: "empty-candidate" };

  let score = 0;
  let hardConflict = false;

  const regionHints = getRegionHints(official.region);
  const candidateRegions = detectMentionedRegions(candidateText);
  const hasRegionMatch = regionHints.some((hint) => candidateText.includes(hint));
  const exactTitleSource = (enrichment.sources || []).some((source) => {
    const url = String(source?.url || "");
    return (
      url.includes(`/wiki/${encodeURIComponent(official.name)}`) ||
      url.includes(`/wiki/${official.name}`) ||
      url.includes(`/item/${encodeURIComponent(official.name)}`) ||
      url.includes(`/item/${official.name}/`)
    );
  });

  if (official.region && official.region !== "中央部委/央企") {
    if (hasRegionMatch) {
      score += 6;
    }
    if (
      enrichment.region &&
      enrichment.region !== official.region &&
      enrichment.region !== "中央部委/央企" &&
      !candidateRegions.includes(official.region) &&
      !hasRegionMatch &&
      !exactTitleSource
    ) {
      score -= 6;
      hardConflict = true;
    }
    if (candidateRegions.length && !candidateRegions.includes(official.region) && !hasRegionMatch && !exactTitleSource) {
      score -= 6;
      hardConflict = true;
    }
  }

  const orgTokens = extractOrgTokens(officialText);
  let orgHits = 0;
  for (const token of orgTokens) {
    if (candidateText.includes(token)) {
      score += 4;
      orgHits += 1;
    }
  }

  const roleTokens = extractRoleTokens(officialText);
  let roleHits = 0;
  for (const token of roleTokens) {
    if (candidateText.includes(token)) {
      score += 1.5;
      roleHits += 1;
    }
  }

  if (official.level && enrichment.level) {
    score += official.level === enrichment.level ? 1 : -1;
  }

  if (enrichment.birth) score += 1.5;
  if (exactTitleSource) score += 3;

  const inferredPosition = inferPositionFromSummary(official.summary, official.name);
  if (inferredPosition && enrichment.lastPosition) {
    const positionOverlap =
      enrichment.lastPosition.includes(inferredPosition) ||
      inferredPosition.includes(enrichment.lastPosition) ||
      extractRoleTokens(inferredPosition).some((token) => enrichment.lastPosition.includes(token));
    score += positionOverlap ? 2 : -2;
  }

  if (official.region !== "中央部委/央企" && !hasRegionMatch && orgHits === 0 && roleHits <= 1 && official.lastPosition) {
    score -= 4;
  }

  if (exactTitleSource && (orgHits >= 1 || roleHits >= 2 || enrichment.birth)) {
    hardConflict = false;
  }

  const bureauFriendlyAcceptance =
    official.level === "厅局级" &&
    exactTitleSource &&
    !hardConflict &&
    (hasRegionMatch || orgHits >= 1) &&
    (roleHits >= 1 || Boolean(enrichment.birth) || Boolean(enrichment.photo));

  return {
    accepted: bureauFriendlyAcceptance || (!hardConflict && score >= (exactTitleSource ? 1.5 : 3)),
    score,
    reason: hardConflict ? "hard-conflict" : "low-score"
  };
}

function chooseBestEnrichment(official, candidates) {
  const ranked = (candidates || [])
    .filter(Boolean)
    .map((candidate) => ({
      candidate,
      verdict: scoreEnrichmentCandidate(official, candidate)
    }))
    .sort((a, b) => b.verdict.score - a.verdict.score);

  const best = ranked[0];
  return best && best.verdict.accepted ? best.candidate : null;
}

function hasRegionConflict(official, text) {
  if (!official?.region || official.region === "中央部委/央企") return false;
  const input = cleanNoise(text);
  if (!input) return false;
  const candidateRegions = detectMentionedRegions(input);
  if (!candidateRegions.length) return false;
  const ownHints = getRegionHints(official.region);
  const hasOwnRegion = ownHints.some((hint) => input.includes(hint));
  return !hasOwnRegion && candidateRegions.some((region) => region !== official.region);
}

function sanitizeOfficialIdentity(official) {
  const next = { ...official };
  const combined = cleanNoise([next.lastPosition, ...(next.previousPositions || []), next.detail].filter(Boolean).join(" "));
  if (!hasRegionConflict(next, combined)) {
    return next;
  }

  const inferredPosition = cleanNoise(inferPositionFromSummary(next.summary, next.name));
  if (inferredPosition) {
    next.lastPosition = inferredPosition;
  }
  next.previousPositions = [];
  next.detail = cleanNoise(next.summary || inferredPosition || "");
  next.sources = (next.sources || []).filter((source) => source?.type !== "encyclopedia");
  next.updatedAt = new Date().toISOString();
  return next;
}

function dedupePositions(items) {
  const kept = [];
  for (const item of items) {
    const normalized = canonicalizePosition(item);
    if (!normalized) continue;
    if (kept.some((existing) => canonicalizePosition(existing) === normalized)) {
      continue;
    }
    kept.push(item);
  }
  return kept;
}

function canonicalizePosition(text) {
  return normalizePositionText(text)
    .replace(/中央政治局委员，/g, "")
    .replace(/中央港澳工作协调小组成员，?/g, "")
    .replace(/（正厅局长级）/g, "")
    .replace(/两江新区区委书记/g, "两江新区党工委书记")
    .replace(/两江新区区委/g, "两江新区党工委")
    .replace(/党工委/g, "")
    .replace(/区委/g, "")
    .replace(/市委常委，/g, "市委常委、")
    .replace(/市委常委、两江新区党工委副书记、管委会主任/g, "市委常委、两江新区管委会主任")
    .replace(/市委常委、两江新区副书记、管委会主任/g, "市委常委、两江新区管委会主任")
    .replace(/市委常委、两江新区管委会主任/g, "两江新区管委会主任")
    .replace(/两江新区党工委副书记、管委会主任/g, "两江新区管委会主任")
    .replace(/两江新区副书记、管委会主任/g, "两江新区管委会主任")
    .replace(/市委常委、两江新区党工委书记/g, "市委常委、两江新区书记")
    .replace(/市委常委、两江新区书记/g, "市委常委、两江新区书记")
    .replace(/\s+/g, "");
}

function preferPosition(a, b) {
  const score = (text) => {
    let total = 0;
    if (/市委常委/.test(text)) total += 4;
    if (/秘书长/.test(text)) total += 3;
    if (/书记/.test(text)) total += 2;
    if (/管委会主任/.test(text)) total += 2;
    if (/副秘书长/.test(text)) total += 1;
    total += Math.min(String(text || "").length / 20, 2);
    return total;
  };
  return score(a) >= score(b) ? a : b;
}

function uniqueSources(items) {
  const map = new Map();
  for (const item of items || []) {
    if (!item?.url) continue;
    map.set(item.url, item);
  }
  return [...map.values()];
}

function scorePositionCollection(items) {
  const list = (items || []).filter(Boolean);
  return list.reduce((total, item) => total + scoreSignificantPosition(item) + inferPositionOrderScore(item) / 20, 0) + list.length * 8;
}

function chooseRicherPositions(currentItems, candidateItems, official) {
  const current = normalizePositionList(dedupePositions((currentItems || []).filter(Boolean)), official);
  const candidate = normalizePositionList(dedupePositions((candidateItems || []).filter(Boolean)), official);
  if (!candidate.length) return current;
  if (!current.length) return candidate;
  return scorePositionCollection(candidate) >= scorePositionCollection(current) ? candidate : current;
}

function finalizeOfficialProfile(official) {
  const next = { ...official };
  if (isCentralCurrentPost(next.lastPosition || "")) {
    next.region = "中央部委/央企";
  }
  next.lastPosition = cleanNoise(next.lastPosition || "");
  const existingPositions = (next.previousPositions || []).filter(
    (item) => !next.lastPosition || (item !== next.lastPosition && !next.lastPosition.includes(item) && !item.includes(next.lastPosition))
  );
  next.previousPositions = existingPositions.length ? normalizePositionList(dedupePositions(existingPositions), next) : [];
  next.sources = uniqueSources(next.sources || []);
  next.timeline = uniqueTimeline(next.timeline || []);
  if (!next.detail && next.summary) {
    next.detail = cleanNoise(next.summary);
  }
  return next;
}

function mergeEnrichment(official, enrichment) {
  const next = sanitizeOfficialIdentity({ ...official });
  if (!enrichment) return finalizeOfficialProfile(next);
  if (isExcelProtectedOfficial(next)) {
    if (!next.birth) {
      next.birth = enrichment.birth || parseBirth([enrichment.lastPosition, enrichment.detailAppend].filter(Boolean).join(" "));
    }
    if (!next.photo && enrichment.photo) {
      next.photo = enrichment.photo;
    }
    if ((next.previousPositions || []).length || (enrichment.previousPositions || []).length) {
      next.previousPositions = chooseRicherPositions(
        next.previousPositions || [],
        [...(next.previousPositions || []), ...(enrichment.previousPositions || [])],
        next
      );
    }
    next.sources = uniqueSources([...(next.sources || []), ...(enrichment.sources || [])]);
    next.timeline = uniqueTimeline([...(next.timeline || []), ...(enrichment.timeline || [])]).map((item) => ({
      ...item,
      date: item.date || next.investigationDate || ""
    }));
    if (next.timeline[0]?.stage) {
      next.status = next.timeline[0].stage;
    }
    next.updatedAt = new Date().toISOString();
    return finalizeOfficialProfile(next);
  }
  if (!next.birth) {
    next.birth = enrichment.birth || parseBirth([enrichment.lastPosition, enrichment.detailAppend].filter(Boolean).join(" "));
  }
  if (!next.photo && enrichment.photo) {
    next.photo = enrichment.photo;
  }
  const inferredPosition = inferPositionFromSummary(next.summary, next.name);
  if ((!next.lastPosition || isNoisyText(next.lastPosition)) && (enrichment.lastPosition || inferredPosition)) {
    next.lastPosition = cleanNoise(enrichment.lastPosition || inferredPosition);
  } else {
    next.lastPosition = cleanNoise(next.lastPosition || "");
  }
  const mergedPositions = uniqueStrings([...(next.previousPositions || []), ...(enrichment.previousPositions || [])].map(normalizePositionText)).filter(
    (item) => item && !isNoisyText(item) && item.length <= 100 && looksLikePosition(item) && !/[《》]/.test(item)
  );
  next.previousPositions = normalizePositionList(
    dedupePositions(
      mergedPositions.filter(
        (item) => !next.lastPosition || (item !== next.lastPosition && !next.lastPosition.includes(item) && !item.includes(next.lastPosition))
      )
    ),
    next
  );
  if ((!next.region || next.region === "中央部委/央企") && enrichment.region) next.region = enrichment.region;
  next.level = detectLevel([next.region, next.lastPosition, next.summary, next.detail, ...(next.previousPositions || [])].filter(Boolean).join(" "));
  if (!next.investigationDate) next.investigationDate = enrichment.investigationDate || inferDateFromOfficial(next);
  const cleanedExistingDetail = cleanNoise(next.detail || "");
  if (isNoisyText(cleanedExistingDetail)) {
    next.detail = cleanNoise(enrichment.detailAppend || cleanedExistingDetail || next.summary || "");
  } else if (enrichment.detailAppend && !cleanedExistingDetail.includes(enrichment.detailAppend.slice(0, 40))) {
    next.detail = trimText([cleanedExistingDetail, enrichment.detailAppend].filter(Boolean).join("\n\n"));
  } else {
    next.detail = cleanedExistingDetail;
  }
  next.sources = uniqueSources([...(next.sources || []), ...(enrichment.sources || [])]);
  next.timeline = (next.timeline || []).map((item) => ({
    ...item,
    date: item.date || next.investigationDate || ""
  }));
  next.updatedAt = new Date().toISOString();
  return finalizeOfficialProfile(next);
}

function preserveOfficialPlacement(original, enriched) {
  if (!original) return enriched;
  return {
    ...enriched,
    region: original.region || enriched.region,
    level: original.level || enriched.level,
    photo: original.manualPhotoOverride && original.photo ? original.photo : enriched.photo,
    manualRegionOverride: original.manualRegionOverride ?? enriched.manualRegionOverride,
    manualLevelOverride: original.manualLevelOverride ?? enriched.manualLevelOverride,
    manualPhotoOverride: original.manualPhotoOverride ?? enriched.manualPhotoOverride
  };
}

async function enrichOfficial(official) {
  if (!official || official.locked) {
    return official;
  }
  const hint = findHintEnrichment(official);
  if (hint) {
    return preserveOfficialPlacement(official, mergeEnrichment(official, hint));
  }

  const existingBaiduCandidates = await queryExistingEncyclopediaSource(official, { includeKinds: ["baidu"] });
  const existingBaiduBest = chooseBestEnrichment(official, existingBaiduCandidates || []);
  if (existingBaiduBest) {
    return preserveOfficialPlacement(official, mergeEnrichment(official, existingBaiduBest));
  }

  const baiduCandidates = await queryBaiduBaike(official);
  const baiduBest = chooseBestEnrichment(official, baiduCandidates || []);
  if (baiduBest) {
    return preserveOfficialPlacement(official, mergeEnrichment(official, baiduBest));
  }

  const sourceCandidates = await queryExistingEncyclopediaSource(official, { excludeKinds: ["baidu"] });
  const sourceBest = chooseBestEnrichment(official, sourceCandidates || []);
  if (sourceBest) {
    return preserveOfficialPlacement(official, mergeEnrichment(official, sourceBest));
  }

  const baike360Candidates = await query360Baike(official);
  const baike360Best = chooseBestEnrichment(official, baike360Candidates || []);
  if (baike360Best) {
    return preserveOfficialPlacement(official, mergeEnrichment(official, baike360Best));
  }

  const wikipediaDirectCandidates = await queryWikipediaDirectPage(official);
  const wikipediaDirectBest = chooseBestEnrichment(official, wikipediaDirectCandidates || []);
  if (wikipediaDirectBest) {
    return preserveOfficialPlacement(official, mergeEnrichment(official, wikipediaDirectBest));
  }

  const wikipediaCandidates = await queryWikipedia(official);
  return preserveOfficialPlacement(official, mergeEnrichment(official, chooseBestEnrichment(official, wikipediaCandidates || [])));
}

async function enrichOfficials(officials, options = {}) {
  const queue = (officials || []).filter(needsEnrichment);
  const limit = options.limit || queue.length;
  const targets = queue.slice(0, limit);
  const untouched = new Set(targets.map((item) => item.id));
  const updated = [];
  let changed = 0;

  for (const official of targets) {
    const before = JSON.stringify({
      birth: official.birth,
      photo: official.photo,
      lastPosition: official.lastPosition,
      previousPositions: official.previousPositions,
      sources: official.sources,
      detail: official.detail,
      status: official.status,
      investigationDate: official.investigationDate,
      timeline: official.timeline
    });
    const next = await enrichOfficial(official);
    const after = JSON.stringify({
      birth: next.birth,
      photo: next.photo,
      lastPosition: next.lastPosition,
      previousPositions: next.previousPositions,
      sources: next.sources,
      detail: next.detail,
      status: next.status,
      investigationDate: next.investigationDate,
      timeline: next.timeline
    });
    if (before !== after) changed += 1;
    updated.push(next);
  }

  const merged = (officials || []).map((official) => updated.find((item) => item.id === official.id) || official);

  return {
    officials: merged,
    changed,
    processed: targets.length,
    queued: queue.length
  };
}

module.exports = {
  enrichOfficial,
  enrichOfficials,
  needsEnrichment,
  normalizePositionList,
  normalizePositionText,
  extractDetailHistoryPositions
};
