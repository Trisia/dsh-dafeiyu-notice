# 开发与实现说明

本文档面向维护者，介绍 `dsh-dafeiyu-notice` 的实现方式、开发命令、素材生成和目录结构。功能与使用说明见 [README](../README.md)。

## 实现说明

### 数据流

```text
uiSession.sessionStatus ──运行中 → 空闲──▶ 等待 900ms ──▶ 判定完成 ──▶ 大肥鱼队列
        │
        └──新的 pendingInteraction──▶ 大肥鱼队列（问答 / 审批）

大肥鱼点击 ──▶ uiWorkspace.openSession(sessionId) ──▶ 播放点击回应动画
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

注入面约定：槽位 `inject` 返回对象里的 `hooks` 是有保留含义的隔间，里面的每个键都会被当成订阅源（`getSnapshot` + `subscribe`）合成 `use<Name>` 钩子；动作函数（如 `activateNext`、`dismiss`）必须放在 `hooks` 外层，才会原样透传给组件。

### 资源内联

宿主只通过 `/plugins/<id>/client.js` 提供客户端包，包内 `assets/` 不对外，因此：

- 钉钉提示音由 `scripts/embed-audio.mjs` 转成 `src/dingtalk-audio.ts` 里的 data URL。
- 点击回应动画由 `scripts/build-click-sheets.py` 转成 `src/click-sheets.ts` 里的 5 张 WebP data URL。
- 待机动画同样内联在 `src/sprite-sheet.ts`。

这也是客户端包约 1.3 MB 的原因；换来的是不依赖宿主的资源路由，刷新即可用。

## 开发

### 常用命令

```bash
pnpm install      # 安装 tsdown 与 typescript
pnpm typecheck    # tsc --noEmit 类型检查
pnpm build        # 编译 index.ts、生成内嵌音频并构建 lib/client.js
pnpm watch        # tsdown 监听构建，适合改 UI 时使用
pnpm test         # 运行浏览器回归测试（见下）
```

### 重新生成提示音

```bash
node scripts/embed-audio.mjs
```

输入是 `assets/dingtalk.mp3`，输出是 `src/dingtalk-audio.ts`，生成文件不要手改。

### 重新生成点击回应动画

需要准备 dsh-pet 的 5 个 webm 素材，文件名固定：

```text
点击回应-元气挥手.webm
点击回应-开心跃动.webm
点击回应-害羞惊讶.webm
点击回应-挠痒咯咯笑.webm
点击回应-傲娇生气.webm
```

```bash
python3 scripts/build-click-sheets.py --src /path/to/webm-dir
```

依赖：

- `ffmpeg`（需要 `libvpx-vp9` 解码透明通道）
- Python 3
- `Pillow`
- `numpy`
- `scipy`

脚本每段取 2 秒、12fps、24 帧，按角色本体包围盒统一取景，缩放到 108×114，横向拼成 WebP，写入 `src/click-sheets.ts`。生成文件已提交，正常开发不需要重跑。

### 测试

```bash
pnpm test
```

当前回归脚本位于开发工作区的 `../test-harness/browser-test.mjs`（不在本包内），使用真实 Chromium + React UMD 挂载客户端包，覆盖：

- 大肥鱼出现、帧推进、拖动与位置恢复；
- 完成、等待回答、等待确认共用 FIFO 队列，气泡标题随队首切换；
- 多会话点击切换、点击层透明度切换；
- 最后一段动画结束后自动收起、`×` 清空队列；
- 设置开关、音频元素与构建产物加载。

脚本会在无头环境中 stub 掉 `<audio>` 的播放，避免自动播放策略干扰渲染断言；真实浏览器里仍使用内嵌 MP3，失败时退回合成音。脚本结束时会自动关闭浏览器；若手动中断，请自行清理残留进程。

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
│   └── task-notify-preview.png # README 头部截图
├── locale/
│   ├── en.json
│   └── zh.json
├── assets/
│   └── dingtalk.mp3          # 提示音原始文件
├── scripts/
│   ├── embed-audio.mjs       # mp3 → src/dingtalk-audio.ts
│   └── build-click-sheets.py # webm → src/click-sheets.ts
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
│   ├── session-view.ts       # 坐标约束等视图辅助
│   ├── sprite-sheet.ts       # 待机动画（内联）
│   ├── click-sheets.ts       # 5 段点击回应动画（内联，生成）
│   └── dingtalk-audio.ts     # 提示音 data URL（生成）
└── lib/                      # 构建产物，gitignore
    ├── client.js
    └── client.js.map
```

## 配置说明

`cordis.patch.yml` 里预留的 `notifyOn*` / `onlyWhenHidden` 目前不参与运行逻辑；提醒类别与开关以设置页为准。
