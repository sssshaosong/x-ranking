# X Radar

Cloudflare Workers + D1 上的 X-only 实时热度监控。

## 现在只监控 X

- X 官方 Trends（WOEID 地区热榜）
- 关键词 / X Recent Search 查询规则
- X 账号（自动转换成 `from:username`）
- 5 分钟 / 15 分钟 / 1 小时帖子量
- 5 分钟环比暴涨检测
- 监控规则下的热门帖子与公开互动指标
- Telegram 异动推送

原来的 Google Trends、百度、Bilibili、CoinGecko、GitHub Trending、Hacker News 已从运行代码删除。

## Cloudflare 绑定

继续使用现有 D1 Binding：

- `DB` -> 现有 D1 数据库

Worker 会自动创建 `x_*` 表，不需要手工执行迁移。旧多源表不会被删除，但不再读取。

## Runtime Secrets

在 Cloudflare Worker -> Settings -> Variables and Secrets 中配置：

- `X_BEARER_TOKEN` **必需**：X Developer App 的 Bearer Token
- `RUN_TOKEN` **必需**：后台登录密码
- `TELEGRAM_BOT_TOKEN` 可选
- `TELEGRAM_CHAT_ID` 可选

不要把真实 Secret 提交进 GitHub。

## 页面

打开站点后全部通过导航点击：

- 总览：X 热榜、最强增速、最近告警、热门帖子
- X 热榜：官方 Trends + 本地快照增减
- 监控规则：添加关键词或账号、暂停、删除、查看 5m/15m/60m 热度
- 热门帖子：按公开互动指标加权排序
- 设置：登录后手动采集、健康检查、Telegram 测试、WOEID、频率和告警阈值

## 自动运行

Cloudflare 基础 Cron 每分钟唤醒 Worker 一次；真正的 X API 采集间隔保存在 D1，可直接从“设置”页面修改。默认 10 分钟，最短 5 分钟。

为了控制 X API 用量，每轮最多处理 20 条启用的监控规则。规则越多、采集越频繁，API 用量越高。
