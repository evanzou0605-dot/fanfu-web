# fanfu_web

一个面向中国反腐消息整理的本地网站原型，支持：

- 按 31 个省级行政区和“中央部委/央企”分栏展示
- 按国家级 / 省部级 / 厅局级分层
- 以中央纪委国家监委网站通报为主做自动同步
- 在网页中手动编辑官员履历、来源、时间线和案件进展

## 运行

```bash
node server.js
```

打开 `http://127.0.0.1:3000`

## 可选命令

```bash
node scripts/seed-demo.js
node scripts/sync.js
```

## 说明

- 第一版使用本地 JSON 存储，便于后续迁移到 SQLite / PostgreSQL。
- 自动抓取依赖中纪委官网页面结构，实际长期运行时建议增加更稳健的解析与人工复核流程。
- 维基百科、百度百科等补充信息暂由网页内手动维护；后续可再扩展搜索结果抓取与待审核队列。
- 当前环境若直接访问 `ccdi.gov.cn` 被拦截，可在页面中使用“手动导入官网文章”或“离线样本导入”作为兜底。

## 部署到 Render

项目已经包含 [render.yaml](/Users/jianweizou/Documents/codex/fanfu_web/render.yaml)，适合直接部署到 Render，并使用持久磁盘保存：

- 官员数据库 `officials.json`
- 元数据 `meta.json`
- 手动上传的官员照片

### 推荐步骤

1. 把当前项目推送到 GitHub 仓库。
2. 登录 Render，选择 `New +` -> `Blueprint`。
3. 连接你的 GitHub 仓库，选择这个项目仓库。
4. Render 会自动读取 `render.yaml`，创建一个 Node Web Service。
5. 首次部署完成后，Render 会自动挂载 `/var/data` 持久磁盘。
6. 站点正式数据会写入 `/var/data/fanfu`，重启后不会丢失。

### 当前部署配置

- 启动命令：`npm start`
- 健康检查：`/api/config`
- 监听地址：`0.0.0.0:3000`
- 持久数据目录环境变量：`DATA_DIR=/var/data/fanfu`

### 重要说明

- 仓库里的 `data/` 会作为首次启动的种子数据来源。
- 如果持久磁盘里还没有 `officials.json` / `meta.json`，服务会自动从仓库里的 `data/` 复制过去。
- 官员上传照片在云端会保存到持久目录，不再依赖本地 `public/uploads/`。

### 当前限制

- 截图 OCR 和部分 Excel 导入依赖 Python 运行环境；如果 Render 实例里没有对应依赖，这部分功能可能需要后续单独补部署环境。
- 网站核心浏览、编辑、锁定、统计、JSON 数据持久化不受影响。
