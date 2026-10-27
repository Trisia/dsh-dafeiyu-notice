# 开发与实现说明

本文档面向维护者，介绍 `dsh-dafeiyu-notice` 的实现方式、开发命令、素材生成和目录结构。功能与使用说明见 [README](../README.md)。

## 实现说明

### 数据流

```text
uiSession.sessionStatus ──运行中 → 空闲──▶ 等待 900ms ──▶ 判定完成 ──▶ 大肥鱼队列
        │
        └──新的 pendingInteraction──▶ 提示卡片（问答 / 审批）

大肥鱼点击 ──▶ uiWorkspace.openSession(sessionId) ──▶ 播放点击回应动画
```

### 会话状态观察

`src/observer.js` 不直接轮询会话列表，而是：

- 通过 `ctx.inject(['sessions', 'uiSession'])` 等待宿主服务就绪；若宿主不提供 `ctx.inject`，则回退到每秒轮询。
- 以 `uiSession.sessionStatus` 的 `running` 变化判断运行结束，延迟 900ms 等宿主刷新投影后再确认。
- 跳过空白会话、仍有 `pendingInteraction` 的会话，以及用户刚手动中止的会话（8 秒有效窗口）。
- 通过 `sessions.list` 的快照读取会话标题；标题为空时退回会话 id。
- 第一次加载时已经存在的待交互请求不补弹提示，只响应之后新出现的请求。

### 大肥鱼队列

`src/client.js` 中的 `spriteStore` 保存：

```js
{
  visible: boolean,
  title: string,
  sessionLabel: string,
  queue: [{ sessionId, sessionLabel }],
  phase: 'idle' | 'click',
  clickIndex: number,   // -1 表示尚未播放过点击回应
  clickSeq: number,     // 每次点击递增，用于重置动画帧
}
```

点击时先消费队首，再调用 `uiWorkspace.openSession`，因此切换和动画是同一个动作。点击动画时长为 `24 帧 × 80ms = 1920ms`；队列为空时，切回待机后再等 160ms 淡出。

### 渲染

- `TaskSprite`：待机层与点击层叠放，靠 `data-phase` 切换透明度；待机层一直循环，点击层播放完停住。
- `NoticeStack`：渲染等待回答/确认卡片。
- `NotifySettingsRow`：设置页的开关行。
- 所有状态通过极简 `createStore` 暴露给宿主的 `useSyncExternalStore` 槽位。

### 资源内联

宿主只通过 `/plugins/<id>/client.js` 提供客户端包，包内 `assets/` 不对外，因此：

- 钉钉提示音由 `scripts/embed-audio.mjs` 转成 `src/dingtalk-audio.js` 里的 data URL。
- 点击回应动画由 `scripts/build-click-sheets.py` 转成 `src/click-sheets.js` 里的 5 张 WebP data URL。
- 待机动画同样内联在 `src/sprite-sheet.js`。

这也是客户端包约 1.3 MB 的原因；换来的是不依赖宿主的资源路由，刷新即可用。

## 开发

### 常用命令

```bash
pnpm install      # 安装 tsdown
pnpm build        # 生成内嵌音频 + 构建 lib/client.js
pnpm watch        # tsdown 监听构建，适合改 UI 时使用
pnpm test         # 运行浏览器回归测试（见下）
```

### 重新生成提示音

```bash
node scripts/embed-audio.mjs
```

输入是 `assets/dingtalk.mp3`，输出是 `src/dingtalk-audio.js`，生成文件不要手改。

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

脚本每段取 2 秒、12fps、24 帧，按角色本体包围盒统一取景，缩放到 108×114，横向拼成 WebP，写入 `src/click-sheets.js`。生成文件已提交，正常开发不需要重跑。

### 测试

```bash
pnpm test
```

当前回归脚本位于开发工作区的 `../test-harness/browser-test.mjs`（不在本包内），使用真实 Chromium + React UMD 挂载客户端包，覆盖：

- 大肥鱼出现、帧推进、拖动与位置恢复；
- 多会话 FIFO 队列、点击切换、点击层透明度切换；
- 最后一段动画结束后自动收起、`×` 清空队列；
- 问答/审批卡片、设置开关、音频元素与构建产物加载。

脚本会在无头环境中 stub 掉 `<audio>` 的播放，避免自动播放策略干扰渲染断言；真实浏览器里仍使用内嵌 MP3，失败时退回合成音。脚本结束时会自动关闭浏览器；若手动中断，请自行清理残留进程。

## 目录结构

```text
notify-plugin/
├── index.js                  # Host 半边：空实现，仅让 bundle 可被选中
├── cordis.patch.yml          # 把 task-notify 插入 profile
├── package.json
├── tsdown.config.js          # 构建为 window.__ModuleLoader__ 的 CJS 工厂
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
│   ├── embed-audio.mjs       # mp3 → src/dingtalk-audio.js
│   └── build-click-sheets.py # webm → src/click-sheets.js
├── src/
│   ├── client.js             # 注册槽位、状态仓库、队列与提示
│   ├── observer.js           # 会话状态观察、完成/问答/审批判定
│   ├── task-sprite.js        # 大肥鱼与点击回应动画
│   ├── notice-stack.js       # 等待回答/确认卡片
│   ├── notify-settings-row.js
│   ├── sound.js              # MP3 播放 + WebAudio 兜底
│   ├── storage.js            # localStorage 读写
│   ├── store.js              # useSyncExternalStore 仓库
│   ├── constants.js          # 时长、尺寸、存储键等常量
│   ├── locale.js             # zh/en 字典
│   ├── styles.js             # 全部样式
│   ├── styles-mount.js       # 注入 <style>
│   ├── session-view.js       # 坐标约束等视图辅助
│   ├── sprite-sheet.js       # 待机动画（内联）
│   ├── click-sheets.js       # 5 段点击回应动画（内联，生成）
│   └── dingtalk-audio.js     # 提示音 data URL（生成）
└── lib/                      # 构建产物，gitignore
    ├── client.js
    └── client.js.map
```

## 配置说明

`cordis.patch.yml` 里预留的 `notifyOn*` / `onlyWhenHidden` 目前不参与运行逻辑；提醒类别与开关以设置页为准。
