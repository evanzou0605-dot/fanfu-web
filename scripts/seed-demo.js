const { saveOfficials, saveMeta } = require("./lib/store");

const demo = [
  {
    id: "demo-001",
    name: "示例官员甲",
    birth: "1968-03",
    region: "广东省",
    level: "省部级",
    lastPosition: "广东省政协原党组成员、副主席",
    previousPositions: ["某市委书记", "某省政府秘书长"],
    investigationDate: "2026-04-12",
    status: "审查调查",
    summary: "中央纪委国家监委网站发布审查调查通报。",
    detail: "这里用于演示详情信息。正式使用时可通过自动同步与人工维护补全。",
    timeline: [
      {
        stage: "审查调查",
        date: "2026-04-12",
        url: "https://www.ccdi.gov.cn/example-1",
        summary: "涉嫌严重违纪违法，接受中央纪委国家监委纪律审查和监察调查。"
      }
    ],
    sources: [
      {
        type: "official",
        label: "中纪委官网",
        url: "https://www.ccdi.gov.cn/example-1"
      },
      {
        type: "encyclopedia",
        label: "维基百科",
        url: "https://zh.wikipedia.org/"
      }
    ],
    aliases: [],
    editable: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: "demo-002",
    name: "示例官员乙",
    birth: "1971-11",
    region: "中央部委/央企",
    level: "厅局级",
    lastPosition: "某中央企业原总经理助理",
    previousPositions: ["某集团办公室主任"],
    investigationDate: "2025-11-20",
    status: "党纪政务处分",
    summary: "已被开除党籍并移送司法。",
    detail: "这里用于演示后续处分和案件进度的合并展示。",
    timeline: [
      {
        stage: "审查调查",
        date: "2025-08-15",
        url: "https://www.ccdi.gov.cn/example-2-a",
        summary: "接受纪律审查和监察调查。"
      },
      {
        stage: "党纪政务处分",
        date: "2025-11-20",
        url: "https://www.ccdi.gov.cn/example-2-b",
        summary: "被开除党籍，按规定取消其享受的待遇。"
      }
    ],
    sources: [
      {
        type: "official",
        label: "中纪委官网",
        url: "https://www.ccdi.gov.cn/example-2-a"
      }
    ],
    aliases: [],
    editable: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

saveOfficials(demo);
saveMeta({
  lastSyncAt: null,
  lastSyncSummary: "已写入演示数据，可直接查看页面和编辑流程。",
  note: "演示数据仅用于 UI 验证。"
});

console.log("Seeded demo data.");
