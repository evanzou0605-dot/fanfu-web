const state = {
  officials: [],
  regions: [],
  years: [],
  selectedYear: "",
  adminDivisions: [],
  peerProvince: "",
  peerCity: ""
};

const analyticsRange = document.getElementById("analyticsRange");
const analyticsSummary = document.getElementById("analyticsSummary");
const twentiethCommitteeCount = document.getElementById("twentiethCommitteeCount");
const twentiethCommitteeRatio = document.getElementById("twentiethCommitteeRatio");
const twentiethAlternateCount = document.getElementById("twentiethAlternateCount");
const twentiethAlternateRatio = document.getElementById("twentiethAlternateRatio");
const yearlyTrend = document.getElementById("yearlyTrend");
const analyticsYearStartSelect = document.getElementById("analyticsYearStartSelect");
const analyticsYearEndSelect = document.getElementById("analyticsYearEndSelect");
const heatmapYearStartSelect = document.getElementById("heatmapYearStartSelect");
const heatmapYearEndSelect = document.getElementById("heatmapYearEndSelect");
const heatmapLevelSelect = document.getElementById("heatmapLevelSelect");
const heatmapSummary = document.getElementById("heatmapSummary");
const heatmapMap = document.getElementById("heatmapMap");
const heatmapGrid = document.getElementById("heatmapGrid");
const provincialRanking = document.getElementById("provincialRanking");
const bureauRanking = document.getElementById("bureauRanking");
const provincialRankingMeta = document.getElementById("provincialRankingMeta");
const bureauRankingMeta = document.getElementById("bureauRankingMeta");
const yoyBoard = document.getElementById("yoyBoard");
const peerProvinceSelect = document.getElementById("peerProvinceSelect");
const peerCitySelect = document.getElementById("peerCitySelect");
const peerSummary = document.getElementById("peerSummary");
const peerList = document.getElementById("peerList");
const ageRangeStartSelect = document.getElementById("ageRangeStartSelect");
const ageRangeEndSelect = document.getElementById("ageRangeEndSelect");
const ageRangeLabel = document.getElementById("ageRangeLabel");
const ageRangeSummary = document.getElementById("ageRangeSummary");
const ageRangeCount = document.getElementById("ageRangeCount");
const ageRangeRatio = document.getElementById("ageRangeRatio");
const ageRangeDenominator = document.getElementById("ageRangeDenominator");
const dialog = document.getElementById("editorDialog");
const form = document.getElementById("editorForm");
const closeDialog = document.getElementById("closeDialog");
const deleteButton = document.getElementById("deleteButton");
const regionInput = document.getElementById("regionInput");
const levelInput = document.getElementById("levelInput");
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

state.heatmapYear = "";
state.heatmapLevel = "省部级";
state.heatmapChart = null;
state.analyticsYearStart = "";
state.analyticsYearEnd = "";
state.heatmapYearStart = "";
state.heatmapYearEnd = "";
state.ageRangeStart = 58;
state.ageRangeEnd = 62;

const regionMapNames = {
  "北京市": "北京",
  "天津市": "天津",
  "河北省": "河北",
  "山西省": "山西",
  "内蒙古自治区": "内蒙古",
  "辽宁省": "辽宁",
  "吉林省": "吉林",
  "黑龙江省": "黑龙江",
  "上海市": "上海",
  "江苏省": "江苏",
  "浙江省": "浙江",
  "安徽省": "安徽",
  "福建省": "福建",
  "江西省": "江西",
  "山东省": "山东",
  "河南省": "河南",
  "湖北省": "湖北",
  "湖南省": "湖南",
  "广东省": "广东",
  "广西壮族自治区": "广西",
  "海南省": "海南",
  "重庆市": "重庆",
  "四川省": "四川",
  "贵州省": "贵州",
  "云南省": "云南",
  "西藏自治区": "西藏",
  "陕西省": "陕西",
  "甘肃省": "甘肃",
  "青海省": "青海",
  "宁夏回族自治区": "宁夏",
  "新疆维吾尔自治区": "新疆"
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

function populateSelect(select, options) {
  const currentValue = select.value;
  select.innerHTML = options.map((item) => `<option value="${escapeHtml(item.value)}">${escapeHtml(item.label)}</option>`).join("");
  const values = options.map((item) => item.value);
  if (values.includes(currentValue)) {
    select.value = currentValue;
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getYear(item) {
  return String(item.investigationDate || "").slice(0, 4);
}

function parsePartialDateParts(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3] || 1)
  };
}

function calculateAgeAtInvestigation(official) {
  if (official.region === "解放军") return null;
  const birth = parsePartialDateParts(official.birth);
  const investigation = parsePartialDateParts(official.investigationDate);
  if (!birth || !investigation) return null;

  let age = investigation.year - birth.year;
  if (investigation.month < birth.month || (investigation.month === birth.month && investigation.day < birth.day)) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

function normalizePlaceName(name) {
  return String(name || "")
    .replace(/壮族自治区|回族自治区|维吾尔自治区|自治区|特别行政区/g, "")
    .replace(/自治州|地区|盟|新区|林区/g, "")
    .replace(/省|市|区|县/g, "")
    .trim();
}

function getPositionTimeline(official) {
  return [...(official.previousPositions || []), official.lastPosition].filter(Boolean);
}

function uniqueStrings(items) {
  return [...new Set((items || []).filter(Boolean))];
}

function isMunicipality(name) {
  return /北京市|上海市|天津市|重庆市/.test(name || "");
}

function isDistrictLikeName(name) {
  return /(区|县|旗)$/.test(String(name || ""));
}

function hasProvinceContext(text, provinceName, provinceAlias) {
  const input = String(text || "");
  return input.includes(provinceName) || (provinceAlias && input.includes(provinceAlias));
}

function hasTimelineProvinceContext(timeline, provinceName, provinceAlias) {
  return timeline.some((position) => hasProvinceContext(position, provinceName, provinceAlias));
}

function mentionsOtherCityBeforeDistrict(text, districtName, provinceName, provinceAlias) {
  const input = String(text || "");
  const match = input.match(new RegExp(`([\\u4e00-\\u9fa5]{2,12}市)${districtName}`));
  if (!match?.[1]) return false;
  return !match[1].includes(provinceName) && !(provinceAlias && match[1].includes(provinceAlias));
}

function buildYearStats() {
  const levels = ["国家级", "省部级", "厅局级"];
  return state.years.map((year) => {
    const items = state.officials.filter((item) => getYear(item) === year);
    return {
      year,
      total: items.length,
      counts: Object.fromEntries(levels.map((level) => [level, items.filter((item) => item.level === level).length]))
    };
  });
}

function getSelectedRange(start, end) {
  if (!start || !end) return [];
  const sorted = [...state.years].sort();
  const startIndex = sorted.indexOf(start);
  const endIndex = sorted.indexOf(end);
  if (startIndex === -1 || endIndex === -1) return [];
  const from = Math.min(startIndex, endIndex);
  const to = Math.max(startIndex, endIndex);
  return sorted.slice(from, to + 1);
}

function formatYearRangeLabel(start, end) {
  if (!start || !end) return "未知时间段";
  return start === end ? `${start} 年` : `${start}-${end} 年`;
}

function renderYearSelects() {
  const options = state.years.map((year) => `<option value="${escapeHtml(year)}">${escapeHtml(year)} 年</option>`).join("");
  analyticsYearStartSelect.innerHTML = options;
  analyticsYearEndSelect.innerHTML = options;
  heatmapYearStartSelect.innerHTML = options;
  heatmapYearEndSelect.innerHTML = options;
  analyticsYearStartSelect.value = state.analyticsYearStart;
  analyticsYearEndSelect.value = state.analyticsYearEnd;
  heatmapYearStartSelect.value = state.heatmapYearStart;
  heatmapYearEndSelect.value = state.heatmapYearEnd;
}

function renderSummary(yearStats) {
  const start = state.years[0] || "未知";
  const end = state.years[state.years.length - 1] || "未知";
  const total = state.officials.length;
  analyticsRange.textContent = `${start} 至 ${end}`;
  analyticsSummary.textContent = `当前统计 ${total} 名官员，覆盖 ${state.years.length} 个年份。`;
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

function hasRole(item, role) {
  if ((item.centralRoles || []).includes(role)) return true;
  return getIdentitySignals(item).includes(role);
}

function renderCentralCommitteeStats() {
  const committeeCount = state.officials.filter((item) => hasRole(item, "第二十届中央委员")).length;
  const alternateCount = state.officials.filter((item) => hasRole(item, "第二十届中央候补委员")).length;
  const committeePercent = ((committeeCount / 205) * 100).toFixed(1);
  const alternatePercent = ((alternateCount / 171) * 100).toFixed(1);
  if (twentiethCommitteeCount) twentiethCommitteeCount.textContent = `${committeeCount} 人`;
  if (twentiethCommitteeRatio) twentiethCommitteeRatio.textContent = `${committeeCount} / 205 · ${committeePercent}%`;
  if (twentiethAlternateCount) twentiethAlternateCount.textContent = `${alternateCount} 人`;
  if (twentiethAlternateRatio) twentiethAlternateRatio.textContent = `${alternateCount} / 171 · ${alternatePercent}%`;
}

async function loadAdminDivisions() {
  const cacheKey = "fanfu-admin-divisions-pca-v1";
  try {
    const cached = window.localStorage.getItem(cacheKey);
    if (cached) {
      state.adminDivisions = JSON.parse(cached);
      return;
    }
  } catch {}

  try {
    const response = await fetch("https://cdn.jsdelivr.net/gh/caijf/lcn/data/pca.json");
    if (!response.ok) throw new Error("行政区划数据加载失败");
    const data = await response.json();
    state.adminDivisions = data;
    try {
      window.localStorage.setItem(cacheKey, JSON.stringify(data));
    } catch {}
  } catch {
    state.adminDivisions = state.regions.map((region) => ({
      name: region,
      children: []
    }));
  }
}

function getPeerProvinceNode() {
  return state.adminDivisions.find((item) => item.name === state.peerProvince) || null;
}

function buildPeerCityOptions() {
  const provinceNode = getPeerProvinceNode();
  if (!provinceNode) return [];
  const isMunicipality = /北京市|上海市|天津市|重庆市/.test(provinceNode.name);
  if (isMunicipality) {
    const cityNode = provinceNode.children?.[0];
    return (cityNode?.children || []).map((item) => ({ label: item.name, value: item.name }));
  }
  return (provinceNode.children || []).map((item) => ({ label: item.name, value: item.name }));
}

function renderPeerSelectors() {
  const provinceOptions = (state.adminDivisions || []).map((item) => ({ label: item.name, value: item.name }));
  populateSelect(peerProvinceSelect, provinceOptions);
  if (!state.peerProvince && provinceOptions[0]) {
    state.peerProvince = provinceOptions[0].value;
  }
  peerProvinceSelect.value = state.peerProvince;

  const cityOptions = buildPeerCityOptions();
  populateSelect(peerCitySelect, cityOptions);
  if (!cityOptions.some((item) => item.value === state.peerCity)) {
    state.peerCity = cityOptions[0]?.value || "";
  }
  peerCitySelect.value = state.peerCity;
}

function renderAgeRangeSelectors() {
  const options = Array.from({ length: 51 }, (_, index) => 30 + index)
    .map((age) => `<option value="${age}">${age} 岁</option>`)
    .join("");
  if (ageRangeStartSelect) ageRangeStartSelect.innerHTML = options;
  if (ageRangeEndSelect) ageRangeEndSelect.innerHTML = options;
  if (ageRangeStartSelect) ageRangeStartSelect.value = String(state.ageRangeStart);
  if (ageRangeEndSelect) ageRangeEndSelect.value = String(state.ageRangeEnd);
}

function renderAgeRangeStats() {
  const start = Math.min(Number(state.ageRangeStart || 30), Number(state.ageRangeEnd || 80));
  const end = Math.max(Number(state.ageRangeStart || 30), Number(state.ageRangeEnd || 80));
  const eligible = state.officials
    .filter((official) => official.region !== "解放军")
    .map((official) => ({
      official,
      age: calculateAgeAtInvestigation(official)
    }))
    .filter((item) => Number.isInteger(item.age));
  const matched = eligible.filter((item) => item.age >= start && item.age <= end);
  const ratio = eligible.length ? ((matched.length / eligible.length) * 100).toFixed(1) : "0.0";

  if (ageRangeLabel) ageRangeLabel.textContent = `${start}-${end} 岁`;
  if (ageRangeSummary) {
    ageRangeSummary.textContent = matched.length
      ? `该年龄段共有 ${matched.length} 名官员，统计时已排除解放军及出生年月/落马时间不完整的样本。`
      : "当前年龄区间没有匹配官员，统计时已排除解放军及出生年月/落马时间不完整的样本。";
  }
  if (ageRangeCount) ageRangeCount.textContent = `${matched.length} 人`;
  if (ageRangeRatio) ageRangeRatio.textContent = `${ratio}%`;
  if (ageRangeDenominator) ageRangeDenominator.textContent = `有效样本 ${eligible.length} 人`;
}

function extractMatchedPositions(official) {
  if (!state.peerCity) return [];
  const timeline = getPositionTimeline(official);
  const cityName = state.peerCity;
  const cityAlias = normalizePlaceName(cityName);
  const provinceAlias = normalizePlaceName(state.peerProvince);
  const municipality = isMunicipality(state.peerProvince);
  const districtLike = isDistrictLikeName(cityName);
  const timelineProvinceContext = hasTimelineProvinceContext(timeline, state.peerProvince, provinceAlias);

  return uniqueStrings(
    timeline.filter((position) => {
      const text = String(position || "");
      const exactMatch = text.includes(cityName);
      const samePositionProvinceContext = hasProvinceContext(text, state.peerProvince, provinceAlias);

      if (municipality && districtLike) {
        if (!exactMatch) return false;
        if (mentionsOtherCityBeforeDistrict(text, cityName, state.peerProvince, provinceAlias)) return false;
        if (samePositionProvinceContext) return true;
        if (official.region === state.peerProvince) return true;
        return timelineProvinceContext;
      }

      if (exactMatch) return true;

      if (cityAlias && text.includes(cityAlias)) {
        if (districtLike) {
          return samePositionProvinceContext;
        }
        if (municipality) return true;
        if (samePositionProvinceContext) return true;
      }
      return false;
    })
  );
}

function renderPeerList() {
  if (!state.peerProvince || !state.peerCity) {
    peerSummary.textContent = "请选择省份和地市。";
    peerList.innerHTML = "";
    return;
  }

  const matches = state.officials
    .map((official) => ({
      official,
      positions: extractMatchedPositions(official)
    }))
    .filter((item) => item.positions.length)
    .sort((a, b) => (b.official.investigationDate || "").localeCompare(a.official.investigationDate || ""));

  peerSummary.textContent = matches.length
    ? `${state.peerCity} 共筛出 ${matches.length} 名曾在当地任职的官员，已按落马时间从新到旧排列。`
    : `${state.peerCity} 当前没有筛出匹配官员。`;

  peerList.innerHTML = matches.length
    ? matches
        .map(
          ({ official, positions }) => `
            <article class="peer-card">
              <div class="peer-card-head">
                <div>
                  <h3>${escapeHtml(official.name)}</h3>
                  <div class="small">${escapeHtml(official.investigationDate || "日期待补")} · ${escapeHtml(official.level || "级别待补")}</div>
                </div>
                <button class="secondary" data-peer-edit-id="${escapeHtml(official.id)}">编辑</button>
              </div>
              <div class="peer-positions">
                ${positions
                  .map(
                    (position, index) => `
                      <div class="peer-position-item">
                        <span class="peer-position-order">${index + 1}</span>
                        <div>${escapeHtml(position)}</div>
                      </div>
                    `
                  )
                  .join("")}
              </div>
            </article>
          `
        )
        .join("")
    : `<div class="small">暂无匹配结果。</div>`;

  peerList.querySelectorAll("[data-peer-edit-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = state.officials.find((official) => official.id === button.dataset.peerEditId);
      if (item) openEditor(item);
    });
  });
}

function renderYearlyTrend(yearStats) {
  const max = Math.max(
    1,
    ...yearStats.flatMap((item) => [item.counts["国家级"], item.counts["省部级"], item.counts["厅局级"]])
  );
  yearlyTrend.innerHTML = yearStats
    .map((item) => {
      const nationalHeight = Math.max(8, Math.round((item.counts["国家级"] / max) * 180));
      const provincialHeight = Math.max(8, Math.round((item.counts["省部级"] / max) * 180));
      const bureauHeight = Math.max(8, Math.round((item.counts["厅局级"] / max) * 180));
      return `
        <div class="trend-year-card">
          <div class="trend-bars">
            <div class="trend-bar-wrap">
              <span class="trend-value">${item.counts["国家级"]}</span>
              <div class="trend-bar trend-bar-national" style="height:${nationalHeight}px"></div>
            </div>
            <div class="trend-bar-wrap">
              <span class="trend-value">${item.counts["省部级"]}</span>
              <div class="trend-bar trend-bar-provincial" style="height:${provincialHeight}px"></div>
            </div>
            <div class="trend-bar-wrap">
              <span class="trend-value">${item.counts["厅局级"]}</span>
              <div class="trend-bar trend-bar-bureau" style="height:${bureauHeight}px"></div>
            </div>
          </div>
          <div class="trend-year-foot">
            <strong>${escapeHtml(item.year)}</strong>
            <span class="small">合计 ${item.total}</span>
          </div>
        </div>
      `;
    })
    .join("");
}

function buildRegionRanking(yearStart, yearEnd, level) {
  const selectedYears = new Set(getSelectedRange(yearStart, yearEnd));
  const ranking = state.regions
    .filter((region) => region !== "中央部委/央企")
    .map((region) => ({
      region,
      count: state.officials.filter((item) => selectedYears.has(getYear(item)) && item.level === level && item.region === region).length
    }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count || a.region.localeCompare(b.region, "zh-CN"));
  return ranking;
}

function countByRegion(yearStart, yearEnd, level) {
  const selectedYears = new Set(getSelectedRange(yearStart, yearEnd));
  return state.regions
    .filter((region) => region !== "中央部委/央企")
    .map((region) => {
      const count = state.officials.filter((item) => {
        if (!selectedYears.has(getYear(item))) return false;
        if (level !== "全部" && item.level !== level) return false;
        return item.region === region;
      }).length;
      return { region, count };
    });
}

function getHeatmapToneClass(ratio) {
  if (ratio >= 0.85) return "heat-5";
  if (ratio >= 0.65) return "heat-4";
  if (ratio >= 0.45) return "heat-3";
  if (ratio > 0) return "heat-2";
  return "heat-0";
}

function renderHeatmap() {
  const rows = countByRegion(state.heatmapYearStart, state.heatmapYearEnd, state.heatmapLevel);
  const max = Math.max(1, ...rows.map((item) => item.count));
  const activeCount = rows.filter((item) => item.count > 0).length;
  const top = rows.slice().sort((a, b) => b.count - a.count)[0];
  const rangeLabel = formatYearRangeLabel(state.heatmapYearStart, state.heatmapYearEnd);
  heatmapSummary.textContent = top?.count
    ? `${rangeLabel} ${state.heatmapLevel}累计查处热度最高地区为 ${top.region}（${top.count} 人），共 ${activeCount} 个地区有记录。`
    : `${rangeLabel} 暂无 ${state.heatmapLevel} 查处记录。`;
  heatmapGrid.innerHTML = rows
    .map((item) => {
      const ratio = item.count / max;
      const tone = getHeatmapToneClass(ratio);
      return `
        <a class="heatmap-tile ${tone}" href="/region.html?region=${encodeURIComponent(item.region)}">
          <span class="heatmap-name">${escapeHtml(item.region)}</span>
          <strong class="heatmap-count">${item.count}</strong>
        </a>
      `;
    })
    .join("");
  renderChinaMap(rows, max);
}

function renderChinaMap(rows, max) {
  const canRenderMap =
    heatmapMap &&
    window.echarts &&
    typeof window.echarts.getMap === "function" &&
    window.echarts.getMap("china");

  if (!canRenderMap) {
    if (heatmapMap) {
      heatmapMap.innerHTML = "";
      heatmapMap.classList.add("is-hidden");
    }
    heatmapGrid.classList.remove("is-hidden");
    return;
  }

  heatmapMap.classList.remove("is-hidden");
  heatmapGrid.classList.add("is-hidden");
  state.heatmapChart = state.heatmapChart || window.echarts.init(heatmapMap);

  const data = rows.map((item) => ({
    name: regionMapNames[item.region],
    value: item.count,
    rawRegion: item.region
  }));

  state.heatmapChart.setOption({
    tooltip: {
      trigger: "item",
      formatter(params) {
        const rawRegion = rows.find((item) => regionMapNames[item.region] === params.name)?.region || params.name;
        const value = Number(params.value || 0);
        return `${rawRegion}<br/>${formatYearRangeLabel(state.heatmapYearStart, state.heatmapYearEnd)} ${state.heatmapLevel}：${value} 人`;
      }
    },
    visualMap: {
      min: 0,
      max,
      left: "left",
      bottom: 8,
      calculable: false,
      text: ["高", "低"],
      inRange: {
        color: ["#fff7ef", "#f0ca8d", "#d88c3b", "#9f1c12"]
      },
      textStyle: {
        color: "#665b54"
      }
    },
    series: [
      {
        name: "查处人数",
        type: "map",
        map: "china",
        roam: false,
        data,
        label: {
          show: true,
          color: "#3a2f29",
          fontSize: 10
        },
        emphasis: {
          label: {
            color: "#7a120a",
            fontWeight: "700"
          },
          itemStyle: {
            areaColor: "#f2d39f"
          }
        },
        itemStyle: {
          borderColor: "rgba(103, 74, 55, 0.35)",
          borderWidth: 1,
          areaColor: "#fff7ef"
        }
      }
    ]
  });

  state.heatmapChart.off("click");
  state.heatmapChart.on("click", (params) => {
    const hit = rows.find((item) => regionMapNames[item.region] === params.name);
    if (hit?.region) {
      window.location.href = `/region.html?region=${encodeURIComponent(hit.region)}`;
    }
  });
}

function formatDelta(delta) {
  if (delta > 0) return `+${delta}`;
  return String(delta);
}

function formatPercent(current, previous) {
  if (!previous && !current) return "0%";
  if (!previous) return "新增";
  const percent = ((current - previous) / previous) * 100;
  const rounded = Math.round(percent * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

function getDeltaClass(delta) {
  if (delta > 0) return "delta-up";
  if (delta < 0) return "delta-down";
  return "delta-flat";
}

function renderYoyBoard(yearStats) {
  const items = yearStats.map((item, index) => {
    const previous = yearStats[index - 1];
    if (!previous) {
      return `
        <div class="yoy-card">
          <div class="yoy-head">
            <strong>${escapeHtml(item.year)}</strong>
            <span class="small">基准年</span>
          </div>
          <div class="yoy-grid">
            <div class="yoy-metric"><span>国家级</span><strong>${item.counts["国家级"]}</strong></div>
            <div class="yoy-metric"><span>省部级</span><strong>${item.counts["省部级"]}</strong></div>
            <div class="yoy-metric"><span>厅局级</span><strong>${item.counts["厅局级"]}</strong></div>
            <div class="yoy-metric"><span>合计</span><strong>${item.total}</strong></div>
          </div>
        </div>
      `;
    }

    const metrics = [
      { label: "国家级", current: item.counts["国家级"], previous: previous.counts["国家级"] },
      { label: "省部级", current: item.counts["省部级"], previous: previous.counts["省部级"] },
      { label: "厅局级", current: item.counts["厅局级"], previous: previous.counts["厅局级"] },
      { label: "合计", current: item.total, previous: previous.total }
    ];

    return `
      <div class="yoy-card">
        <div class="yoy-head">
          <strong>${escapeHtml(item.year)}</strong>
          <span class="small">对比 ${escapeHtml(previous.year)}</span>
        </div>
        <div class="yoy-grid">
          ${metrics
            .map((metric) => {
              const delta = metric.current - metric.previous;
              return `
                <div class="yoy-metric">
                  <span>${escapeHtml(metric.label)}</span>
                  <strong>${metric.current}</strong>
                  <div class="delta-chip ${getDeltaClass(delta)}">
                    ${formatDelta(delta)} · ${formatPercent(metric.current, metric.previous)}
                  </div>
                </div>
              `;
            })
            .join("")}
        </div>
      </div>
    `;
  });
  yoyBoard.innerHTML = items.join("");
}

function renderRanking(container, metaNode, title, ranking) {
  const max = Math.max(1, ...ranking.map((item) => item.count));
  metaNode.textContent = ranking.length
    ? `${formatYearRangeLabel(state.analyticsYearStart, state.analyticsYearEnd)} 共 ${ranking.length} 个地区上榜`
    : "当前时间段暂无数据";
  container.innerHTML = ranking.length
    ? ranking
        .map(
          (item, index) => `
            <div class="rank-row">
              <div class="rank-label">
                <span class="rank-order">${index + 1}</span>
                <span>${escapeHtml(item.region)}</span>
              </div>
              <div class="rank-bar-track">
                <div class="rank-bar-fill" style="width:${Math.max(8, Math.round((item.count / max) * 100))}%"></div>
              </div>
              <strong class="rank-value">${item.count}</strong>
            </div>
          `
        )
        .join("")
    : `<div class="small">${escapeHtml(formatYearRangeLabel(state.analyticsYearStart, state.analyticsYearEnd))} 暂无${escapeHtml(title)}查处记录。</div>`;
}

function renderRankings() {
  const provincial = buildRegionRanking(state.analyticsYearStart, state.analyticsYearEnd, "省部级");
  const bureau = buildRegionRanking(state.analyticsYearStart, state.analyticsYearEnd, "厅局级");
  renderRanking(provincialRanking, provincialRankingMeta, "省部级", provincial);
  renderRanking(bureauRanking, bureauRankingMeta, "厅局级", bureau);
}

function render() {
  const yearStats = buildYearStats();
  renderYearSelects();
  renderSummary(yearStats);
  renderCentralCommitteeStats();
  renderYearlyTrend(yearStats);
  renderRankings();
  renderHeatmap();
  renderYoyBoard(yearStats);
  renderPeerSelectors();
  renderPeerList();
  renderAgeRangeSelectors();
  renderAgeRangeStats();
}

function openEditor(item) {
  if (!form) return;
  const draft = item || {
    id: `manual-${Date.now()}`,
    name: "",
    birth: "",
    region: state.regions[0],
    level: "厅局级",
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
  form.elements.level.value = draft.level || "厅局级";
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

async function load() {
  const [config, payload] = await Promise.all([request("/api/config"), request("/api/officials")]);
  state.regions = config.regions || [];
  state.officials = payload.officials || [];
  state.years = [...new Set(state.officials.map(getYear).filter(Boolean))].sort();
  state.selectedYear = state.years[state.years.length - 1] || "";
  state.analyticsYearStart = state.years[0] || "";
  state.analyticsYearEnd = state.selectedYear;
  state.heatmapYearStart = state.years[0] || "";
  state.heatmapYearEnd = state.selectedYear;
  await loadAdminDivisions();
  state.peerProvince = state.adminDivisions[0]?.name || "";
  state.peerCity = buildPeerCityOptions()[0]?.value || "";
  populateSelect(regionInput, state.regions.map((item) => ({ label: item, value: item })));
  populateSelect(levelInput, ["国家级", "省部级", "厅局级"].map((item) => ({ label: item, value: item })));
  render();
}

analyticsYearStartSelect.addEventListener("change", () => {
  state.analyticsYearStart = analyticsYearStartSelect.value;
  renderRankings();
});

analyticsYearEndSelect.addEventListener("change", () => {
  state.analyticsYearEnd = analyticsYearEndSelect.value;
  renderRankings();
});

heatmapYearStartSelect.addEventListener("change", () => {
  state.heatmapYearStart = heatmapYearStartSelect.value;
  renderHeatmap();
});

heatmapYearEndSelect.addEventListener("change", () => {
  state.heatmapYearEnd = heatmapYearEndSelect.value;
  renderHeatmap();
});

heatmapLevelSelect.addEventListener("change", () => {
  state.heatmapLevel = heatmapLevelSelect.value;
  renderHeatmap();
});

peerProvinceSelect.addEventListener("change", () => {
  state.peerProvince = peerProvinceSelect.value;
  state.peerCity = "";
  renderPeerSelectors();
  renderPeerList();
});

peerCitySelect.addEventListener("change", () => {
  state.peerCity = peerCitySelect.value;
  renderPeerList();
});

if (ageRangeStartSelect) {
  ageRangeStartSelect.addEventListener("change", () => {
    state.ageRangeStart = Number(ageRangeStartSelect.value || 30);
    renderAgeRangeStats();
  });
}

if (ageRangeEndSelect) {
  ageRangeEndSelect.addEventListener("change", () => {
    state.ageRangeEnd = Number(ageRangeEndSelect.value || 80);
    renderAgeRangeStats();
  });
}

if (regionInput) {
  regionInput.addEventListener("change", () => {
    form.dataset.regionTouched = "true";
  });
}

if (levelInput) {
  levelInput.addEventListener("change", () => {
    form.dataset.levelTouched = "true";
  });
}

if (closeDialog) {
  closeDialog.addEventListener("click", () => dialog.close());
}

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = await readFormPayload();
    await request("/api/officials/upsert", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    state.officials = (await request("/api/officials")).officials;
    render();
    dialog.close();
  });
}

if (deleteButton) {
  deleteButton.addEventListener("click", async () => {
    const id = deleteButton.dataset.id;
    if (!id) return;
    if (!window.confirm("确认删除这个条目吗？")) return;
    await request("/api/officials/delete", {
      method: "POST",
      body: JSON.stringify({ id })
    });
    state.officials = (await request("/api/officials")).officials;
    render();
    dialog.close();
  });
}

load().catch((error) => {
  analyticsSummary.textContent = `加载失败：${error.message}`;
});

window.addEventListener("resize", () => {
  if (state.heatmapChart) {
    state.heatmapChart.resize();
  }
});
