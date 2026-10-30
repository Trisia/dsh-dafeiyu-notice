<p align="center">
  <img src="./icon.svg" width="72" height="72" alt="大肥鱼项目图标">
</p>

<h1 align="center">dsh-dafeiyu-notice</h1>

<p align="center">
  <strong>大肥鱼你做完了就叫我</strong><br>
  DSH Web 的完成提醒插件：任务完成、等待回答、等待确认都汇入同一条大肥鱼队列，点一下切回一个会话；自带点击回应动画与钉钉提示音。
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@cliven/dsh-dafeiyu-notice"><img src="https://img.shields.io/npm/v/@cliven/dsh-dafeiyu-notice?logo=npm" alt="npm 版本"></a>
  <a href="https://github.com/Trisia/dsh-dafeiyu-notice/actions/workflows/ci.yml?query=branch%3Amaster"><img src="https://github.com/Trisia/dsh-dafeiyu-notice/actions/workflows/ci.yml/badge.svg?branch=master" alt="CI 构建状态"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/github/license/Trisia/dsh-dafeiyu-notice" alt="MIT License"></a>
  <a href="./package.json"><img src="https://img.shields.io/badge/dsh-%E2%89%A50.1.0-4B32C3" alt="DSH 版本要求：>= 0.1.0"></a>
</p>

<p align="center">
  <img src="./docs/task-notify-preview.png" alt="大肥鱼任务完成提醒截图：会话结束后右下角出现大肥鱼，气泡显示任务完成啦和会话标题" width="100%">
</p>

## 能做什么

- **完成提醒**：任意会话跑完，右下角出现大肥鱼，气泡显示“任务完成啦！”和会话标题。
- **等你回答、等你确认**：问答与审批请求同样会提醒，不会一闪而过。
- **排队逐个处理**：所有提醒共用一条队列，点一次打开一个会话，气泡显示“还有 N 个”。
- **点击回应动画**：9 段随机动画；点大肥鱼或直接点开被提醒的会话都会播放。
- **钉钉提示音**：完成与等待使用不同提示音，声音被浏览器拦下时自动降级。
- **随手摆放**：可拖动、可缩放，位置和大小会记住；跟随宿主的深浅色主题与中英文。

## 安装

在 DSH 的 **设置 → 插件 → 添加插件** 中填入插件名与版本号：

```text
@cliven/dsh-dafeiyu-notice@1.0.1
```

也可以用命令行安装：

```bash
dsh plugin add @cliven/dsh-dafeiyu-notice@1.0.1
```

版本号固定为当前发布版本（现在是 `1.0.1`），升级时替换 `@` 后面的数字即可。

安装后重启 DSH Web 服务并刷新页面即可。安装界面示意：

<p align="center">
  <img src="./docs/plugin-install.png" alt="DSH 添加插件对话框，输入框里填写 @cliven/dsh-dafeiyu-notice" width="100%">
</p>

从源码构建并挂到本地 profile 的方法见[开发文档](./docs/DEVELOPMENT.md#挂到-dsh-profile)。

## 使用

| 操作 | 效果 |
| --- | --- |
| 点击大肥鱼 | 打开队列里的下一个会话，并播放一段点击回应动画 |
| 直接点开被提醒的会话 | 同样算处理这条提醒，不会重复排队 |
| 点击气泡 `×` | 清空所有提醒，收起大肥鱼 |
| 拖动大肥鱼 | 移动位置，松手后保存 |
| 悬停后拖右下角手柄 | 调整大小（0.5～2 倍），松手后保存 |
| 聚焦后按 Enter / 空格 | 等同于点击大肥鱼 |

## 设置

在 **设置 → 通用 → 任务完成提醒** 中可以调整：

| 开关 | 默认 | 作用 |
| --- | --- | --- |
| 提醒 | 开启 | 总开关，关闭后不再出现新的提醒 |
| 声音 | 开启 | 完成与等待的提示音 |
| 子智能体完成 | 关闭 | 子智能体干完也提醒；等待回答/确认始终提醒 |

## 更多

- 队列规则、动画清单、存储键与重置方法：[使用与配置](./docs/USAGE.md)
- 没有提醒、没有声音等排查：[常见问题](./docs/FAQ.md)
- 构建、素材生成与实现细节：[开发文档](./docs/DEVELOPMENT.md)

## 许可

代码以 [MIT License](./LICENSE) 发布，Copyright (c) 2026 Quan Guanyu。点击回应动画素材来自 [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet)，使用或再分发请遵循原仓库的许可。