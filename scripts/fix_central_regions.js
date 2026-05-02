const { getOfficials, saveOfficials } = require("./lib/store");

function isCentralCurrentPost(text) {
  const input = String(text || "");
  if (!input) return false;
  if (/北京市委|北京市政府|北京市人大|北京市政协|北京信托|北京控股|北京银行/.test(input)) return false;
  return /中央|国务院|全国人民代表大会|全国人大|全国政协|应急管理部|工业和信息化部|国家烟草专卖局|中国烟草总公司|中国石油天然气集团|中国石油化工集团|中国海洋石油集团|国家能源投资集团|中国中信集团|中国兵器|中国航空工业集团|中国电子科技集团|党组书记、部长|党委书记、部长|国家局|总公司|集团公司/.test(
    input
  );
}

const officials = getOfficials();
let changed = 0;

for (const item of officials) {
  if (item.region === "中央部委/央企") continue;
  if (!isCentralCurrentPost(item.lastPosition || "")) continue;
  item.region = "中央部委/央企";
  item.updatedAt = new Date().toISOString();
  changed += 1;
  console.log(`已修正地区：${item.name} -> 中央部委/央企`);
}

saveOfficials(officials);
console.log(`完成，共修正 ${changed} 条。`);
