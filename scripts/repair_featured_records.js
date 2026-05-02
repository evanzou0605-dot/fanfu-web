const { getOfficials, saveOfficials } = require("./lib/store");

const fixes = {
  王宜林: { region: "中央部委/央企" },
  凌成兴: { region: "中央部委/央企" },
  王祥喜: { region: "中央部委/央企" },
  胡衡华: { region: "重庆市" }
};

const officials = getOfficials();
let changed = 0;

for (const official of officials) {
  const fix = fixes[official.name];
  if (!fix) continue;
  Object.assign(official, fix, { updatedAt: new Date().toISOString() });
  changed += 1;
  console.log(`已修复：${official.name} -> ${official.region}`);
}

saveOfficials(officials);
console.log(`完成，共修复 ${changed} 条重点记录。`);
