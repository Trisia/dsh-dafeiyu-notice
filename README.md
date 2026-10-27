<p align="center">
  <img src="./icon.svg" width="72" height="72" alt="任务完成提醒图标">
</p>

<h1 align="center">DSH 任务完成提醒</h1>

<p align="center">
  会话完成任务时弹出小精灵，点击直接切回对应会话；支持 FIFO 排队、点击回应动画、等待回答/确认卡片与钉钉提示音。
</p>

<p align="center">
  <img src="./docs/task-notify-preview.png" alt="任务完成提醒截图：会话结束后右下角出现小精灵，气泡显示任务完成啦和会话标题" width="100%">
</p>

## 目录

- [功能](#功能)
- [安装](#安装)
- [使用](#使用)
- [设置](#设置)
- [实现说明](#实现说明)
- [开发](#开发)
- [目录结构](#目录结构)
- [常见问题](#常见问题)
- [素材与许可](#素材与许可)

## 功能

### 任务完成小精灵

任意 DSH 会话从“运行中”变为“空闲”，并且不是空白会话、没有待回答/待确认请求时，右下角会出现一只鲸鱼尾巴小精灵：

- 待机动画循环播放，气泡显示“任务完成啦！”和会话标题。
- 多个会话先后完成时排成 **FIFO 队列**，精灵只出现一个，气泡显示“还有 N 个”。
- 同一会话重复完成只更新队列里的标题，不会重复占位。
- 用户主动停止生成（点击“停止生成”或连按两次 Esc）不会触发完成提醒。

### 点击切换会话与点击回应动画

点击小精灵（或聚焦后按 Enter / 空格）：

1. 立即打开 **队首** 会话，并把它从队列中移除。
2. 播放一段随机“点击回应”动画，动画会跟着新页面继续播放。
3. 队列还有会话时，动画结束后回到待机，等下一次点击；队列清空时，动画结束后淡出收起。

点击回应动画共 5 段，随机选择，并避免与上一次连续重复：

| id | 名称 |
| --- | --- |
| `wave` | 元气挥手 |
| `happy` | 开心跃动 |
| `shy` | 害羞惊讶 |
| `tickle` | 挠痒咯咯笑 |
| `angry` | 傲娇生气 |

气泡右上角的 `×` 可以随时清空整个队列并收起精灵。

### 等待回答 / 等待确认卡片

出现新的问答或审批请求时，右下角弹出提示卡片：

- 卡片会自动消失，停留时长 8 秒。
- 最多同时显示 4 张，超出时挤掉最早的。
- 点击卡片或按 Enter 打开对应会话；点 `×` 只关闭当前卡片。
- 同一类提示 1.5 秒内只弹一次，避免连续事件刷屏。
- 容器带 `role="status"` 与 `aria-live="polite"`，方便读屏软件播报。

### 提示音

- 任务完成使用内嵌的钉钉提示音；等待回答/确认使用另一段三音提示，便于区分。
- 浏览器自动播放策略要求页面先获得一次用户手势（点击或按键），之后才能稳定发声。
- MP3 被策略拦截时会自动退回 WebAudio 合成音，视觉提示不受影响。
- 精灵已经显示时，新完成的会话只入队，不重复响铃。

### 其它

- **拖动与位置记忆**：小精灵可以拖到任意位置，位置保存在 `localStorage`，刷新页面后恢复；窗口尺寸变化时会自动收回视口内。
- **主题适配**：颜色使用宿主的 `--dsw-alias-*` 主题令牌，浅色/深色主题都可融入。
- **中英文文案**：跟随宿主语言，提供 `zh` / `en` 两套字典。
- **键盘与读屏**：精灵是有 `role="button"` 的焦点元素，支持 Enter / 空格；读屏软件合成的 click 也能触发切换。

## 安装

本插件是 DSH Web 的本地客户端插件，Host 半边不做事，所有逻辑都在浏览器半边。

### 前置条件

- 可运行的 DSH Web 环境。
- Node.js 与 pnpm（用于构建）。
- 目标 DSH profile 能加载 `@local/dsh-plugin-task-notify`。

### 1. 构建

```bash
cd /absolute/path/to/notify-plugin
pnpm install
pnpm build
```

构建会先执行 `scripts/embed-audio.mjs` 把 `assets/dingtalk.mp3` 生成 `src/dingtalk-audio.js`，再由 `tsdown` 输出：

```text
lib/client.js
lib/client.js.map
```

`lib/` 是 gitignore 的构建产物，但运行时必须存在，所以新环境拉取代码后要先构建。

### 2. 挂到 DSH profile

以本机 Web profile 为例：

```bash
cd ~/.dsh/profiles/web
pnpm add link:/absolute/path/to/notify-plugin
```

然后把包名加入该 profile 的 `dsh.profile.bundles`（保留原有条目，在末尾追加）：

```json
{
  "dependencies": {
    "@local/dsh-plugin-task-notify": "link:/absolute/path/to/notify-plugin"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "@local/dsh-plugin-task-notify"
      ]
    }
  }
}
```

插件包内的 `cordis.patch.yml` 会自动把 `task-notify` 条目插入 profile：

```yaml
- insert:
    - id: task-notify
      name: '@local/dsh-plugin-task-notify'
```

重启 DSH Web 服务，刷新页面即可。之后修改插件代码只需重新 `pnpm build` 并刷新页面；如果改的是 profile 的 bundle 列表，则需要重启 DSH Web。

> `cordis.patch.yml` 里预留的 `notifyOn*` / `onlyWhenHidden` 目前不参与运行逻辑，提醒类别与开关以设置页为准。

## 使用

| 操作 | 效果 |
| --- | --- |
| 点击小精灵 | 打开队首会话，播放一段随机点击回应动画 |
| 点击气泡 `×` | 清空完成队列并收起小精灵 |
| 拖动小精灵 | 移动位置，松手后保存 |
| 聚焦小精灵后按 Enter / 空格 | 等同于点击 |
| 点击等待回答/确认卡片 | 打开对应会话 |
| 点击卡片 `×` | 只关闭这张卡片 |

完成会话的消费顺序就是入队顺序：

```text
会话 A 完成 ─┐
会话 B 完成 ─┼─▶ 队列 [A, B, C] ──点击──▶ 打开 A，队列 [B, C]
会话 C 完成 ─┘                          ──点击──▶ 打开 B，队列 [C]
                                        ──点击──▶ 打开 C，队列 []
```

队列清空后，最后一段点击回应动画播完会先淡回待机，再淡出收起；如果淡出期间又有会话完成，精灵会继续保留。

## 设置

在 **设置 → 通用 → 任务完成提醒** 中可以调整：

| 设置 | 默认 | 说明 |
| --- | --- | --- |
| 提醒 | 开启 | 总开关；关闭后不再产生新的精灵和卡片 |
| 声音 | 开启 | 控制完成提示音与等待提示音；打开时会试听一次 |

设置保存在 `localStorage`：

| 键 | 内容 |
| --- | --- |
| `dsh.taskNotify.settings.v1` | `{"enabled": true, "sound": true}` |
| `dsh.taskNotify.spritePos.v1` | `{"left": number, "top": number}`，单位：像素 |

需要重置时，在浏览器控制台删除对应键并刷新页面即可。

## 实现说明

### 数据流

```text
uiSession.sessionStatus ──运行中 → 空闲──▶ 等待 900ms ──▶ 判定完成 ──▶ 精灵队列
        │
        └──新的 pendingInteraction──▶ 提示卡片（问答 / 审批）

精灵点击 ──▶ uiWorkspace.openSession(sessionId) ──▶ 播放点击回应动画
```

### 会话状态观察

`src/observer.js` 不直接轮询会话列表，而是：

- 通过 `ctx.inject(['sessions', 'uiSession'])` 等待宿主服务就绪；若宿主不提供 `ctx.inject`，则回退到每秒轮询。
- 以 `uiSession.sessionStatus` 的 `running` 变化判断运行结束，延迟 900ms 等宿主刷新投影后再确认。
- 跳过空白会话、仍有 `pendingInteraction` 的会话，以及用户刚手动中止的会话（8 秒有效窗口）。
- 通过 `sessions.list` 的快照读取会话标题；标题为空时退回会话 id。
- 第一次加载时已经存在的待交互请求不补弹提示，只响应之后新出现的请求。

### 精灵队列

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

- 精灵出现、帧推进、拖动与位置恢复；
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
├── icon.svg
├── docs/
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
│   ├── task-sprite.js        # 小精灵与点击回应动画
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

## 常见问题

### 完成任务后没有小精灵

按顺序检查：

1. 设置页的“提醒”总开关是否开启。
2. 会话是否真的从运行中变为空闲，而不是被手动停止。
3. 会话是否仍是空白会话，或仍有待回答/待确认请求。
4. 修改代码后是否重新执行过 `pnpm build`，并刷新了页面。
5. 浏览器控制台是否有插件加载错误。

### 没有声音

1. 先点击页面任意位置或按一次键，满足浏览器的手势要求。
2. 检查设置页的“声音”开关。
3. 检查系统/标签页是否静音。
4. 若 MP3 被策略拦截，插件会尝试 WebAudio 合成音；两者都不可用时只保留视觉提示。

### 点击小精灵没有切换会话

- 确认当前 DSH 版本提供 `uiWorkspace` 服务。
- 确认队列里的会话仍然存在；已删除或归档的会话可能无法打开。
- 如果刚点完最后一个会话，精灵会在动画结束后收起，这是预期行为。

### 刷新后队列消失

完成队列只保存在内存中，刷新页面会清空；这是为了避免恢复出已经过期的提醒。位置和设置会保留。

### 小精灵跑到屏幕外

拖动回来即可；如果坐标异常，删除 `localStorage` 里的 `dsh.taskNotify.spritePos.v1` 后刷新。

## 素材与许可

- 点击回应动画素材来自 [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet)，由本仓库脚本离线转成雪碧图；使用或再分发请遵循原仓库的许可。
- 钉钉提示音来自 `assets/dingtalk.mp3`，仅用于本插件提示。
- 本仓库目前未附带独立 `LICENSE` 文件；如需对外分发，请先补充许可证并确认上述素材的授权范围。