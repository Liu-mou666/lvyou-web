# 旅优 · 智能旅游攻略

基于 **高德 POI + 铁路站码库 + 5A 名录** 的可溯源旅行规划引擎。不依赖商业 OTA API，通过公开数据增强 + 携程/飞猪/点评深链引导用户查实价。

线上示例：[www.lqlyf1314.xyz](https://www.lqlyf1314.xyz)

## 功能亮点

- **流式生成**：SSE 渐进展示交通、榜单、逐日行程
- **三方案对比**：省钱 / 省时 / 体验 Pareto 变体
- **智能约束**：必去/避开、饮食（不辣/清真/素食）、无障碍、带娃/老人
- **火车查票**：聚合数据 12306 验证 + 区段中转参考价
- **价格体系**：高德详情价 → **OTA 真爬（可选）** → 公开价库 → 市场区间 → 平台深链
- **酒店性价比**：按价格排序，经济连锁优先，可设每晚住宿上限
- **拖拽改序**：单日景点拖拽后重算路线；「更新价格」保留景点顺序

## 环境变量

复制 `.env.example` 为 `.env.local`：

| 变量 | 必填 | 说明 |
|------|------|------|
| `AMAP_KEY` | ✅ | [高德 Web 服务 Key](https://console.amap.com/dev/key/app)，部署时 IP 白名单选「不限制」 |
| `JUHE_TRAIN_KEY` | 可选 | [聚合数据 12306](https://www.juhe.cn/)，有则显示真实车次与票价 |
| `UPSTASH_REDIS_REST_URL` | 可选 | Upstash Redis，多实例共享缓存 |
| `UPSTASH_REDIS_REST_TOKEN` | 可选 | 同上 |

### 个人自用 OTA 真爬（勿商用）

| 变量 | 说明 |
|------|------|
| `ENABLE_OTA_SCRAPE` | `true` 时酒店/门票会爬携程/飞猪页面价格 |
| `OTA_SCRAPE_MODE` | `fetch`（默认）或 `playwright`（本地更稳） |
| `OTA_SCRAPE_TIMEOUT_MS` | 单次超时，默认 12000 |

```bash
# .env.local
ENABLE_OTA_SCRAPE=true
OTA_SCRAPE_MODE=fetch

# 命令行测试
npm run scrape:test -- 苏州 汉庭酒店 320500 hotel

# Playwright 模式（携程反爬时）
npm install playwright
npx playwright install chromium
OTA_SCRAPE_MODE=playwright npm run scrape:test -- 苏州 全季酒店 320500
```

> **注意**：Vercel 出口 IP 常被 OTA 拦截，真爬建议 **本地 `npm run dev`** 或自建服务器。仅供个人学习，请勿对外提供服务。

## 本地开发

```bash
npm install
cp .env.example .env.local   # 填入 AMAP_KEY
npm run dev                  # 热更新开发服务器 http://localhost:3000
npm run build                # 生产构建
npm run start                # 生产启动
npm test                     # 运行单元测试
```

## 技术栈

- Next.js 16 · React 19 · TypeScript · Tailwind CSS 4
- TanStack Query · Zod · Motion
- 高德地图 Web 服务 · 聚合数据火车（可选）

## API 路由

| 路由 | 说明 |
|------|------|
| `POST /api/generate/stream` | 主路径：SSE 流式生成行程 |
| `POST /api/preview-prices` | 生成前预查火车 + 必去门票 |
| `POST /api/refresh` | 按日更新（保留景点，刷新价格/餐饮/住宿） |
| `POST /api/reoptimize-day` | 拖拽改序后重算单日 |
| `GET /api/city-suggest` | 城市输入联想 |
| `GET /api/map-static` | 静态地图代理 |

## 部署（Vercel）

1. Fork / 导入 GitHub 仓库
2. 在 Vercel 项目 Settings → Environment Variables 配置 `AMAP_KEY`
3. 可选配置 `JUHE_TRAIN_KEY`
4. Push 到 `main` 分支自动构建

## 免责声明

本工具生成的是**参考行程**，价格/车次/余票以各平台实时页面为准。远期日期携程可能显示「暂无」属未放票，非链接错误。
