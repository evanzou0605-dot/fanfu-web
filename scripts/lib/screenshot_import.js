const { makeId, normalizeDate, detectRegion, detectLevel, mergeOfficial } = require("./normalize");

const REVIEW_SUFFIX_RE = /(接受中央纪委国家监委纪律审查和监察调查|接受纪律审查和监察调查|接受审查调查)$/;
const OCR_DATE_RE = /20\d{2}[-./年](?:1[0-2]|0?[1-9])[-./月](?:3[01]|[12]\d|0?[1-9])(?:日)?/;
const COMMON_SURNAMES = new Set(
  "赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜戚谢邹喻柏水窦章云苏潘葛奚范彭郎鲁韦昌马苗凤花方俞任袁柳鲍史唐费廉岑薛雷贺倪汤滕殷罗毕郝邬安常乐于时傅皮卞齐康伍余元顾孟平黄和穆萧尹姚邵湛汪祁毛禹狄米贝明臧计伏成戴谈宋茅庞熊纪舒屈项祝董梁杜阮蓝闵席季麻强贾路娄危江童颜郭梅盛林钟徐邱骆高夏蔡田胡凌霍虞万支柯管卢莫房解应宗丁宣贲邓郁单杭洪包诸左石崔吉钮龚程嵇邢裴陆荣翁荀羊甄曲家封芮羿储靳汲邴糜松井段富巫乌焦巴弓牧隗山谷车侯宓蓬全郗班仰秋仲伊宫宁仇栾暴甘钭厉戎祖武符刘景詹束龙叶幸司韶郜黎薄印宿白怀蒲邰从鄂索咸籍卓蔺屠蒙池乔阴郁胥能苍双闻莘党翟谭贡劳逄姬申扶堵冉宰郦雍璩桑桂濮牛寿通边扈燕冀郏浦尚农温别庄晏柴瞿阎连习容向古易慎戈廖庾终暨居衡步都耿满弘匡国文寇广禄阙东欧殳沃利蔚越夔隆师巩厍聂晁勾敖融冷訾辛阚那简饶空曾毋沙乜养鞠须丰巢关蒯相查后荆红游竺权逯盖益桓公仉督岳帅缑亢况郈有琴归海晋楚闫法汝鄢涂钦商牟佘佴伯赏墨哈谯笪年爱阳佟言福".split("")
);

function normalizeScreenshotLine(line) {
  return String(line || "").replace(/\s+/g, " ").trim();
}

function inferNameAndPosition(headline) {
  const clean = normalizeScreenshotLine(headline).replace(REVIEW_SUFFIX_RE, "").trim();
  for (const len of [3, 2]) {
    const candidate = clean.slice(-len);
    if (candidate.length === len && COMMON_SURNAMES.has(candidate[0])) {
      return {
        name: candidate,
        lastPosition: clean.slice(0, clean.length - candidate.length).trim().replace(/[，、,]+$/, "")
      };
    }
  }
  const fallback = clean.match(/([\u4e00-\u9fa5·]{2,4})$/);
  const name = fallback ? fallback[1] : clean.slice(-3);
  return {
    name,
    lastPosition: clean.slice(0, clean.length - name.length).trim().replace(/[，、,]+$/, "")
  };
}

function parseScreenshotText(input) {
  const lines = String(input || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.map((line) => {
    const parts = line.split("|").map((item) => item.trim()).filter(Boolean);
    if (parts.length < 2) {
      throw new Error(`截图导入格式错误：${line}`);
    }
    const date = normalizeDate(parts.pop());
    const headline = parts.join(" | ");
    return { headline, date };
  });
}

function normalizeOcrDateToken(input) {
  return String(input || "")
    .replace(/[OoＯ〇○]/g, "0")
    .replace(/[Il｜丨]/g, "1")
    .replace(/[—–—_]/g, "-")
    .replace(/[.。]/g, "-")
    .replace(/年/g, "-")
    .replace(/月/g, "-")
    .replace(/日/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function extractDateFromText(input) {
  const normalized = normalizeOcrDateToken(input);
  const match = normalized.match(OCR_DATE_RE);
  return match ? normalizeDate(match[0]) : "";
}

function looksLikeStandaloneDate(input) {
  const normalized = normalizeOcrDateToken(input);
  return Boolean(normalized) && normalized.replace(OCR_DATE_RE, "").trim() === "" && Boolean(extractDateFromText(normalized));
}

function groupObservationsByRow(observations) {
  const isPixelCoordinates = observations.some((item) => Math.abs(item.centerY || 0) > 2);
  const rowThreshold = isPixelCoordinates ? 18 : 0.02;
  const sorted = [...observations].sort((a, b) => {
    const yDiff = isPixelCoordinates ? (a.centerY || 0) - (b.centerY || 0) : (b.centerY || 0) - (a.centerY || 0);
    if (Math.abs(yDiff) > rowThreshold / (isPixelCoordinates ? 1 : 1)) return yDiff;
    return (a.minX || 0) - (b.minX || 0);
  });

  const rows = [];
  for (const item of sorted) {
    const text = normalizeScreenshotLine(item.text);
    if (!text) continue;
    const existing = rows.find((row) => Math.abs((row.centerY || 0) - (item.centerY || 0)) <= rowThreshold);
    if (existing) {
      existing.items.push({ ...item, text });
      existing.centerY = (existing.centerY + (item.centerY || 0)) / 2;
    } else {
      rows.push({
        centerY: item.centerY || 0,
        items: [{ ...item, text }]
      });
    }
  }

  return rows
    .map((row) => ({
      ...row,
      items: row.items.sort((a, b) => (a.minX || 0) - (b.minX || 0))
    }))
    .sort((a, b) => (isPixelCoordinates ? (a.centerY || 0) - (b.centerY || 0) : (b.centerY || 0) - (a.centerY || 0)));
}

function parseScreenshotOcrObservations(observations) {
  const rows = groupObservationsByRow(Array.isArray(observations) ? observations : []);
  const entries = [];
  let pendingHeadline = "";

  for (const row of rows) {
    const segments = row.items.map((item) => item.text).filter(Boolean);
    if (!segments.length) continue;
    const rowText = segments.join(" ").trim();
    const rightmostDateSegment = [...row.items].reverse().find((item) => looksLikeStandaloneDate(item.text));
    const date = rightmostDateSegment ? extractDateFromText(rightmostDateSegment.text) : extractDateFromText(rowText);

    let headline = "";
    if (rightmostDateSegment) {
      headline = row.items
        .filter((item) => item !== rightmostDateSegment)
        .map((item) => item.text)
        .join(" ")
        .trim();
    } else if (date) {
      headline = rowText.replace(OCR_DATE_RE, "").trim();
    }

    if (date && headline) {
      const mergedHeadline = normalizeScreenshotLine([pendingHeadline, headline].filter(Boolean).join(" "));
      entries.push({ headline: mergedHeadline, date });
      pendingHeadline = "";
      continue;
    }

    if (date && !headline && pendingHeadline) {
      entries.push({ headline: pendingHeadline, date });
      pendingHeadline = "";
      continue;
    }

    if (!date) {
      pendingHeadline = normalizeScreenshotLine([pendingHeadline, rowText].filter(Boolean).join(" "));
    }
  }

  return entries.filter((entry) => entry.headline && entry.date);
}

function buildOfficialFromScreenshotEntry(entry, options = {}) {
  const headline = normalizeScreenshotLine(entry.headline);
  const investigationDate = normalizeDate(entry.date);
  const { name, lastPosition } = inferNameAndPosition(headline);
  const region = detectRegion(lastPosition || headline);
  const level = detectLevel(`${region} ${lastPosition} ${headline}`);
  const sourceLabel = options.sourceLabel || "截图批量导入";
  const sourceUrl = options.sourceUrl || "";
  const summary = headline;

  return {
    id: makeId(name, investigationDate, `${sourceLabel}|${sourceUrl}|${headline}`),
    name,
    birth: "",
    investigationDate,
    region,
    level,
    lastPosition,
    previousPositions: [],
    status: "审查调查",
    summary,
    detail: `来自截图批量导入。原始标题：${headline}`,
    timeline: [
      {
        date: investigationDate,
        stage: "审查调查",
        summary,
        url: sourceUrl
      }
    ],
    sources: [
      {
        type: "screenshot",
        label: sourceLabel,
        url: sourceUrl
      }
    ],
    editable: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function mergeScreenshotOfficials(existingOfficials, entries, options = {}) {
  const officials = [...existingOfficials];
  const results = [];

  for (const entry of entries) {
    const incoming = buildOfficialFromScreenshotEntry(entry, options);
    const normalizedSummary = String(incoming.summary || "").replace(/\s+/g, "");
    const existingIndex = officials.findIndex(
      (item) => {
        const itemSummary = String(item.summary || "").replace(/\s+/g, "");
        return (
          item.id === incoming.id ||
          (item.name === incoming.name &&
            item.investigationDate === incoming.investigationDate &&
            (item.region === incoming.region || item.lastPosition === incoming.lastPosition)) ||
          (item.investigationDate === incoming.investigationDate &&
            item.region === incoming.region &&
            itemSummary &&
            itemSummary === normalizedSummary)
        );
      }
    );

    if (existingIndex >= 0) {
      const merged = mergeOfficial(officials[existingIndex], incoming);
      officials[existingIndex] = merged;
      results.push({ official: merged, action: "updated" });
    } else {
      officials.push(incoming);
      results.push({ official: incoming, action: "created" });
    }
  }

  officials.sort((a, b) => (b.investigationDate || "").localeCompare(a.investigationDate || ""));
  return {
    officials,
    results
  };
}

function parseMilitaryText(input) {
  const lines = String(input || "")
    .split(/\r?\n/)
    .map((line) => normalizeScreenshotLine(line))
    .filter(Boolean);

  return lines.map((line) => {
    const parts = line
      .split(/[|｜]/)
      .map((item) => normalizeScreenshotLine(item))
      .filter(Boolean);
    if (parts.length < 3) {
      throw new Error(`解放军截图导入格式错误：${line}`);
    }
    const [name, lastPosition, level] = parts;
    if (!["上将", "中将", "少将"].includes(level)) {
      throw new Error(`解放军军衔格式错误：${line}`);
    }
    return { name, lastPosition, level };
  });
}

function parseMilitaryOcrObservations(observations) {
  const rawText = Array.isArray(observations)
    ? [...observations]
        .sort((a, b) => (a.centerY || 0) - (b.centerY || 0) || (a.minX || 0) - (b.minX || 0))
        .map((item) => item.text)
        .join("\n")
    : "";
  return parseMilitaryText(rawText);
}

function buildMilitaryOfficialFromEntry(entry, options = {}) {
  const name = normalizeScreenshotLine(entry.name);
  const lastPosition = normalizeScreenshotLine(entry.lastPosition);
  const level = normalizeScreenshotLine(entry.level);
  const sourceLabel = options.sourceLabel || "解放军截图导入";
  const sourceUrl = options.sourceUrl || "";
  return {
    id: makeId(name, "", `${sourceLabel}|${level}|${lastPosition}`),
    name,
    birth: "",
    investigationDate: "",
    region: "解放军",
    level,
    lastPosition,
    previousPositions: [],
    status: "审查调查",
    summary: `${name} 已录入解放军样本，具体落马时间待补`,
    detail: `来自解放军截图批量导入。最后任职：${lastPosition || "待补"}；军衔：${level || "待补"}`,
    timeline: [],
    sources: [
      {
        type: "screenshot",
        label: sourceLabel,
        url: sourceUrl
      }
    ],
    editable: true,
    manualRegionOverride: true,
    manualLevelOverride: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function mergeMilitaryOfficials(existingOfficials, entries, options = {}) {
  const officials = [...existingOfficials];
  const results = [];

  for (const entry of entries) {
    const incoming = buildMilitaryOfficialFromEntry(entry, options);
    const existingIndex = officials.findIndex(
      (item) =>
        item.id === incoming.id ||
        (item.region === "解放军" &&
          item.name === incoming.name &&
          item.level === incoming.level &&
          normalizeScreenshotLine(item.lastPosition) === normalizeScreenshotLine(incoming.lastPosition))
    );

    if (existingIndex >= 0) {
      const existing = officials[existingIndex];
      const merged = mergeOfficial(existing, incoming);
      if (existing.investigationDate && !incoming.investigationDate) {
        merged.investigationDate = existing.investigationDate;
      }
      if ((existing.timeline || []).length && !(incoming.timeline || []).length) {
        merged.timeline = existing.timeline;
      }
      if (existing.summary && /具体落马时间待补/.test(incoming.summary || "")) {
        merged.summary = existing.summary;
      }
      if (existing.detail && /来自解放军截图批量导入|来自解放军 Excel 离线导入/.test(incoming.detail || "")) {
        merged.detail = existing.detail;
      }
      officials[existingIndex] = merged;
      results.push({ official: merged, action: "updated" });
    } else {
      officials.push(incoming);
      results.push({ official: incoming, action: "created" });
    }
  }

  return {
    officials,
    results
  };
}

module.exports = {
  parseScreenshotText,
  parseScreenshotOcrObservations,
  buildOfficialFromScreenshotEntry,
  mergeScreenshotOfficials,
  parseMilitaryText,
  parseMilitaryOcrObservations,
  buildMilitaryOfficialFromEntry,
  mergeMilitaryOfficials
};
