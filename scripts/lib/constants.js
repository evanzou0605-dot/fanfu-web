const REGIONS = [
  "中央部委/央企",
  "解放军",
  "北京市",
  "天津市",
  "河北省",
  "山西省",
  "内蒙古自治区",
  "辽宁省",
  "吉林省",
  "黑龙江省",
  "上海市",
  "江苏省",
  "浙江省",
  "安徽省",
  "福建省",
  "江西省",
  "山东省",
  "河南省",
  "湖北省",
  "湖南省",
  "广东省",
  "广西壮族自治区",
  "海南省",
  "重庆市",
  "四川省",
  "贵州省",
  "云南省",
  "西藏自治区",
  "陕西省",
  "甘肃省",
  "青海省",
  "宁夏回族自治区",
  "新疆维吾尔自治区"
];

const LEVELS = ["国家级", "省部级", "厅局级"];
const MILITARY_LEVELS = ["上将", "中将", "少将"];

const SOURCE_SECTIONS = [
  {
    key: "zggb-review",
    label: "中管干部审查调查",
    type: "review",
    url: "https://www.ccdi.gov.cn/scdcn/zggb/zjsc/"
  },
  {
    key: "zggb-punish",
    label: "中管干部党纪政务处分",
    type: "punish",
    url: "https://www.ccdi.gov.cn/scdcn/zggb/djcf/"
  },
  {
    key: "zyyj-review",
    label: "中央一级党和国家机关、国企和金融单位干部审查调查",
    type: "review",
    url: "https://www.ccdi.gov.cn/scdcn/zyyj/zjsc/"
  },
  {
    key: "zyyj-punish",
    label: "中央一级党和国家机关、国企和金融单位干部党纪政务处分",
    type: "punish",
    url: "https://www.ccdi.gov.cn/scdcn/zyyj/djcf/"
  },
  {
    key: "sggb-review",
    label: "省管干部审查调查",
    type: "review",
    url: "https://www.ccdi.gov.cn/scdcn/sggb/zjsc/"
  },
  {
    key: "sggb-punish",
    label: "省管干部党纪政务处分",
    type: "punish",
    url: "https://www.ccdi.gov.cn/scdcn/sggb/djcf/"
  }
];

const REGION_ALIASES = {
  北京: "北京市",
  天津: "天津市",
  河北: "河北省",
  山西: "山西省",
  内蒙古: "内蒙古自治区",
  辽宁: "辽宁省",
  吉林: "吉林省",
  黑龙江: "黑龙江省",
  上海: "上海市",
  江苏: "江苏省",
  浙江: "浙江省",
  安徽: "安徽省",
  福建: "福建省",
  江西: "江西省",
  山东: "山东省",
  河南: "河南省",
  湖北: "湖北省",
  湖南: "湖南省",
  广东: "广东省",
  广西: "广西壮族自治区",
  海南: "海南省",
  重庆: "重庆市",
  四川: "四川省",
  贵州: "贵州省",
  云南: "云南省",
  西藏: "西藏自治区",
  陕西: "陕西省",
  甘肃: "甘肃省",
  青海: "青海省",
  宁夏: "宁夏回族自治区",
  新疆: "新疆维吾尔自治区"
};

const CENTRAL_HINTS = [
  "中央",
  "国务院",
  "全国人大",
  "全国政协",
  "最高人民法院",
  "最高人民检察院",
  "国家",
  "部",
  "委",
  "央企",
  "中央军委",
  "国防部",
  "解放军",
  "陆军",
  "海军",
  "空军",
  "火箭军",
  "武警",
  "集团",
  "银行",
  "保险",
  "证券"
];

module.exports = {
  REGIONS,
  LEVELS,
  MILITARY_LEVELS,
  SOURCE_SECTIONS,
  REGION_ALIASES,
  CENTRAL_HINTS
};
