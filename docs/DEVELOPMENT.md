# 开发与实现说明

本文档面向维护者，介绍 `dsh-dafeiyu-notice` 的实现方式、开发命令、素材生成和目录结构。功能与使用说明见 [README](../README.md)。

## 实现说明

### 数据流

```text
uiSession.sessionStatus ──运行中 → 空闲──▶ 等待 900ms ──▶ 判定完成 ──▶ 大肥鱼队列
        │
        └──新的 pendingInteraction──▶ 大肥鱼队列（问答 / 审批）

大肥鱼点击 ──▶ uiWorkspace.openSession(sessionId) ──▶ 播放点击回应动画

拖动 / 拖右下角缩放 ──▶ localStorage（位置 / 缩放比例）
```

### 会话状态观察

`src/observer.ts` 不直接轮询会话列表，而是：

- 通过 `ctx.inject(['sessions', 'uiSession'])` 等待宿主服务就绪；若宿主不提供 `ctx.inject`，则回退到每秒轮询。
- 以 `uiSession.sessionStatus` 的 `running` 变化判断运行结束，延迟 900ms 等宿主刷新投影后再确认。
- 跳过空白会话、仍有 `pendingInteraction` 的会话，以及用户刚手动中止的会话（8 秒有效窗口）。
- 子智能体会话（列表行 `origin === 'subagent'` 或带 `parentId`）的“任务完成”由注入的 `shouldNotifyTurnEnd()` 决定，默认返回 `false`；问答/审批不走这条判定，照常提醒。
- 通过 `sessions.list` 的快照读取会话标题；标题为空时退回会话 id。
- 第一次加载时已经存在的待交互请求不补入队列，只响应之后新出现的请求。

### 大肥鱼队列

`src/client.ts` 中的 `spriteStore` 保存：

```js
{
  visible: boolean,
  title: string,
  kind: 'turnEnd' | 'question' | 'approval',
  sessionLabel: string,
  queue: [{ sessionId, sessionLabel, kind }],
  phase: 'idle' | 'click',
  clickIndex: number,   // -1 表示尚未播放过点击回应
  clickSeq: number,     // 每次点击递增，用于重置动画帧
}
```

任务完成、等待回答、等待确认都调用同一个 `enqueueSprite` 进入这条 FIFO 队列。点击时先消费队首，再调用 `uiWorkspace.openSession`，因此切换和动画是同一个动作；队列里还有条目时气泡标题切到下一条的 `kind`。点击动画按 `CLICK_FRAMES` 帧、每帧 `CLICK_FRAME_MS` 逐帧播放，由组件在到达最后一帧时回调 `clickFinished`：队列还有条目就回到待机，队列为空就直接收起，不依赖任何固定时长。

### 渲染

- `TaskSprite`：待机层与点击层叠放，按 `data-phase` 只显示其中一层（`display` 切换，不做透明度过渡）；待机层一直循环，点击层播完最后一帧后回调并停住。相位变化时帧号在同一轮渲染内归零，所以点击当帧画出的就是点击动画第 0 帧，不会闪现点击前的待机画面。
- `NotifySettingsRow`：设置页的开关行（子智能体完成 / 声音 / 提醒）。
- 所有状态通过极简 `createStore` 暴露给宿主的 `useSyncExternalStore` 槽位。

### 位置与缩放

- `dsh.taskNotify.spritePos.v1` 保存显式坐标；从未拖动过时由 CSS 的 `right` / `bottom` 定位。
- `dsh.taskNotify.spriteScale.v1` 保存缩放比例，范围 `0.5`～`2`，基准尺寸为 108×114。画布尺寸、雪碧图 `background-size` 与逐帧位移都乘以该比例，气泡位置相对画布尺寸计算，因此缩放后仍贴在精灵左上方。
- 缩放手柄平时隐藏，鼠标悬停精灵或正在缩放时显示；`@media (hover: none)` 的触屏设备上常显，否则无法发现该操作。
- 拖右下角手柄时以精灵左上角为锚点：指针横向位移 1px 对应宽度变化 1px，高度按基准比例联动；放大超出视口时收拢坐标，保证精灵和手柄始终在视口内。
- 松手后才写入 localStorage；窗口尺寸变化时按当前缩放后的实际尺寸把坐标收回视口。

注入面约定：槽位 `inject` 返回对象里的 `hooks` 是有保留含义的隔间，里面的每个键都会被当成订阅源（`getSnapshot` + `subscribe`）合成 `use<Name>` 钩子；动作函数（如 `activateNext`、`dismiss`）必须放在 `hooks` 外层，才会原样透传给组件。

### 资源内联

宿主只通过 `/plugins/<id>/client.js` 提供客户端包，包内 `assets/` 不对外，因此：

- 钉钉提示音由 `scripts/embed-audio.mjs` 转成 `src/dingtalk-audio.ts` 里的 data URL。
- 点击回应动画由 `scripts/build-click-sheets.py` 转成 `src/clips/<id>.ts`，一段一个模块，
  由 `src/clips/index.ts` 汇总后内联进客户端包。
- 待机动画同样内联在 `src/sprite-sheet.ts`。

点击回应动画的单帧是 216x228（每段 24 帧后约 420~470 KB），九段合计约 4 MB，
再加上待机和提示音，客户端包约 5 MB；换来的是不依赖宿主的资源路由，刷新即可用。

## 开发

### 常用命令

```bash
pnpm install      # 安装 tsdown 与 typescript
pnpm typecheck    # tsc --noEmit 类型检查
pnpm build        # 编译 index.ts、生成内嵌音频并构建 dist/client.js
pnpm watch        # tsdown 监听构建，适合改 UI 时使用
```

### 挂到 DSH profile

需要可运行的 DSH Web 环境、Node.js 与 pnpm。先按上面的常用命令安装依赖并构建，再把本地目录挂到 profile：

```bash
cd ~/.dsh/profiles/web
pnpm add link:/absolute/path/to/notify-plugin
```

把包名加入该 profile 的 `dsh.profile.bundles`（保留原有条目，在末尾追加）：

```json
{
  "dependencies": {
    "@cliven/dsh-dafeiyu-notice": "link:/absolute/path/to/notify-plugin"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "@cliven/dsh-dafeiyu-notice"
      ]
    }
  }
}
```

插件包内的 `cordis.patch.yml` 会自动把 `task-notify` 条目插入 profile。重启 DSH Web 服务并刷新页面即可。

### 重新生成提示音

```bash
node scripts/embed-audio.mjs
```

输入是 `assets/dingtalk.mp3`，输出是 `src/dingtalk-audio.ts`，生成文件不要手改。

### 重新生成点击回应动画

需要准备 dsh-pet 的 webm 素材，文件名与脚本顶部的 `CLIPS` 表一致：

```text
点击回应-元气挥手.webm
点击回应-开心跃动.webm
点击回应-害羞惊讶.webm
点击回应-挠痒咯咯笑.webm
点击回应-傲娇生气.webm
被吓一跳.webm
原地跳跃抓碎头顶物品.webm
打瞌睡被惊醒.webm
原地左转奔跑.webm
```

```bash
python3 scripts/build-click-sheets.py --src /path/to/webm-dir
```

参数说明：

| 参数 | 说明 |
| --- | --- |
| `--src` | 存放 webm 素材的目录 |
| `--only` | 只生成指定 id 的动画，例如 `--only scared wake` |
| `--outdir` | 动画模块目录，默认 `src/clips`（一段一个文件） |

依赖：

- `ffmpeg`（需要 `libvpx-vp9` 解码透明通道）
- Python 3 + `Pillow`、`numpy`、`scipy`

```bash
python3 -m venv .devcache/venv
.devcache/venv/bin/pip install numpy scipy Pillow
```

处理流程（每段动画）：

1. 解码 2 秒、12fps、24 帧的 RGBA 帧，取 80ms/帧，与 `src/constants.ts` 的 `CLICK_FRAMES` / `CLICK_FRAME_MS` 对应；
2. 交给 `scripts/build-alpha.py` 抠像（流程见下文「抠像与杂边」）；
3. 整段共用一个缩放比例（按每帧角色本体的 90 分位高度，让各段角色看起来一样大），
   并让角色在 216x228 画布内居中，播放时不会漂移；
4. 横向拼成 WebP（保留透明通道），写入 `src/clips/<id>.ts`，并重建 `src/clips/index.ts`。

单帧尺寸 216x228 由 `src/constants.ts` 的 `CLICK_WIDTH` / `CLICK_HEIGHT` 与脚本共同约定。
画布尺寸一直是 108x114（由缩放比例决定），所以把单帧从 108x114 提到 216x228 后，
在 2 倍缩放、高分屏和高 DPR 触屏上都是清晰的原生像素，不再由浏览器放大小图。

每段动画输出一个独立文件，`git diff` 只会落在改动过的那几段上：

```text
src/clips/
├── index.ts      # 汇总索引，按 CLIPS 顺序导出 CLICK_SHEETS
├── wave.ts       # 元气挥手
├── ...
└── tumble.ts     # 原地左转奔跑
```

加了新动作时，在 `CLIPS` 表里追加一行 `(id, 素材文件名, 起始秒, 展示名)`，然后只生成这一段：

```bash
python3 scripts/build-click-sheets.py --src /path/to/webm-dir --only newid
```

其余模块和索引都会保留，索引会按 `CLIPS` 顺序自动补上新段。生成文件已提交，正常开发不需要重跑。

### 抠像与杂边

素材是白底色度抠像的 VP9 alpha 视频，直接合成有三处问题：轮廓外压着一圈 alpha 0.1~0.5、
颜色被白底冲淡的灰边，深色主题下会显出一道灰绿描边；轮廓内侧还有实色的细描边，
清灰边时不能顺手削掉；爱心、星星、花边这类浅色对象的外圈还会泛出白色描边光。

`scripts/build-alpha.py` 是点击动画的抠像实现：

1. 用 `-c:v libvpx-vp9` 解码：ffmpeg 默认会选原生 vp9 解码器，它读不出 alpha 平面；
2. 把二值轮廓外扩 4px 再回缩 1px，框出轮廓外压着的那圈灰带；只往外侧扩，
   所以轮廓上 1 像素宽的实色描边（例如呆毛外沿）不会被误判成灰边；
3. 灰带里逐像素估前景色：锚点取局部 alpha 极大值的平滑池（4px，配合远处 16px 的同量级配色），
   发丝之间的抬头空隙不会被旁边的白底带偏；
4. 灰带里按素材 alpha 一刀切（≥0.9 视为实色、其余透明），不输出半透明的中间值，
   因此不会浮出描边；星光、爱心这些素材里本来就半透明的特效不在灰带里，保持原样；
5. 灰带里浅色的薄边（爱心、星星、花边的外圈）直接清掉，深色主题下不会泛出白色描边光。

调试时可以用 `scripts/key-preview.py` 把同一帧分别画在深色、浅色背景上对比：

```bash
python3 scripts/key-preview.py --src .devcache/webm/点击回应-元气挥手.webm --at 3.4 --box 200,40,470,345 --zoom 4
```

## 目录结构

```text
notify-plugin/
├── index.ts                  # Host 源码：空实现，仅让 bundle 可被选中
├── index.js                  # Host 构建产物（tsc 生成，需提交）
├── cordis.patch.yml          # 把 task-notify 插入 profile
├── package.json
├── tsconfig.json             # 类型检查配置
├── tsconfig.host.json        # Host 入口编译配置
├── tsdown.config.ts          # 构建为 window.__ModuleLoader__ 的 CJS 工厂
├── README.md
├── icon.svg
├── docs/
│   ├── DEVELOPMENT.md        # 本文档
│   ├── plugin-install.png    # README 安装截图
│   └── task-notify-preview.png # README 头部截图
├── locale/
│   ├── en.json
│   └── zh.json
├── assets/
│   └── dingtalk.mp3          # 提示音原始文件
├── scripts/
│   ├── embed-audio.mjs       # mp3 → src/dingtalk-audio.ts
│   ├── build-alpha.py        # 共用抠像：解码 + 去灰边 + 还原前景色
│   ├── build-click-sheets.py # webm → 抠像 → 放大取景 → src/clips/<id>.ts
│   └── key-preview.py        # 抠像效果的深/浅色背景对比图
├── src/
│   ├── react.d.ts            # 最小 React 运行时类型声明
│   ├── client.ts             # 注册槽位、状态仓库、队列与提示
│   ├── observer.ts           # 会话状态观察、完成/问答/审批判定
│   ├── task-sprite.ts        # 大肥鱼与点击回应动画
│   ├── notify-settings-row.ts
│   ├── sound.ts              # MP3 播放 + WebAudio 兜底
│   ├── storage.ts            # localStorage 读写
│   ├── store.ts              # useSyncExternalStore 仓库
│   ├── constants.ts          # 时长、尺寸、存储键等常量
│   ├── locale.ts             # zh/en 字典
│   ├── styles.ts             # 全部样式
│   ├── styles-mount.ts       # 注入 <style>
│   ├── session-view.ts       # 坐标与缩放约束等视图辅助
│   ├── sprite-sheet.ts       # 待机动画（内联）
│   ├── clips/                # 点击回应动画，一段一个模块（生成）
│   │   ├── index.ts          # 汇总索引（生成）
│   │   └── <id>.ts           # 单段雪碧图 data URL（生成）
│   └── dingtalk-audio.ts     # 提示音 data URL（生成）
└── dist/                     # 构建产物，gitignore
    ├── client.js
    └── client.js.map
```

## 持续集成

推送任意分支都会触发 [`ci.yml`](../.github/workflows/ci.yml)：依次安装依赖、类型检查、构建，并检查 `index.js` 与 `src/dingtalk-audio.ts` 是否已随源码提交。打 `v*` 标签时该工作流不运行，由发布流程完成同样的校验。

## 发布

发布由 [`.github/workflows/publish.yml`](../.github/workflows/publish.yml) 完成：推送 `v*` 标签后，工作流会校验标签与 `package.json` 的 `version` 一致，然后依次安装依赖、类型检查、构建、检查产物与仓库是否一致，带 provenance 发布到 npm，最后创建同名 GitHub Release（说明由 GitHub 按提交自动生成，版本号带 `-` 时标记为 prerelease）。

发布步骤：

1. 修改 `package.json` 的 `version`（例如 `1.1.0`）并提交。
2. 打同名标签并推送：

   ```bash
   git tag v1.1.0
   git push origin master --follow-tags
   ```

3. 在 GitHub Actions 里查看 `Publish` 工作流；成功后 Releases 里会出现 `v1.1.0`。失败时按日志修复后重跑（同一版本已发布时需要先升级版本）。

仓库需要配置 `NPM_TOKEN` Secret：在 npm 生成 **Granular Access Token**（读写权限、允许发布并绕过 2FA），加到仓库的 Actions secrets 中。首次发布前令牌只能选 **All packages**，发布成功后可以收敛到本包；令牌有有效期，过期后 CI 会报 401，需要重新生成并更新 Secret。`@cliven` 作用域与 `publishConfig.access: public` 已在 `package.json` 里配置，发布包名为 `@cliven/dsh-dafeiyu-notice`，首次发布前确认 npm 账号有该作用域的发布权限。

provenance 要求仓库公开；如果仓库改为私有，去掉工作流里的 `--provenance` 即可。

依赖由 `pnpm-lock.yaml` 锁定；`pnpm-workspace.yaml` 关闭了自动安装 peer 依赖，因为这些 peer 由宿主提供，其中部分宿主包并未发布到 npm。

## 配置说明

`cordis.patch.yml` 里预留的 `notifyOn*` / `onlyWhenHidden` 目前不参与运行逻辑；提醒类别与开关以设置页为准。
