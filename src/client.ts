/**
 * 浏览器半边：注册大肥鱼浮层与设置行，并把会话状态变化翻译成提醒。
 */
import { CLICK_DURATION, CLICK_FADE_MS, NS, PLUGIN } from './constants.js';
import { CLICK_SHEETS } from './click-sheets.js';
import { EN, ZH } from './locale.js';
import { NotifySettingsRow } from './notify-settings-row.js';
import { createSessionObserver } from './observer.js';
import { ring, resolveSoundUrl } from './sound.js';
import { createStore } from './store.js';
import { readSettings, writeSettings } from './storage.js';
import { insertStyles } from './styles-mount.js';
import { TaskSprite } from './task-sprite.js';

/**
 * 插件上下文注入的服务；sessions / uiWorkspace 为可选服务，由 get 兜底读取。
 * @type {string[]}
 */
export const inject = ['slots', 'locale', 'timer'];

/**
 * 挂载客户端插件。
 * @param {object} ctx - 客户端插件上下文。
 * @returns {void}
 */
export function apply(ctx) {
  // ── 字典与样式 ──────────────────────────────────────────────────────
  ctx.effect(() => ctx.locale.register(NS, { zh: ZH, en: EN }), 'task-notify: dictionaries');
  ctx.effect(() => insertStyles(), 'task-notify: styles');
  const t = ctx.locale.bind(NS);

  // ── 偏好设置 ────────────────────────────────────────────────────────
  const settingsStore = createStore(readSettings());
  /**
   * 更新并持久化偏好设置。
   * @param {{enabled?: boolean, sound?: boolean, notifySubagent?: boolean}} patch - 需要变更的字段。
   */
  const updateSettings = (patch) => {
    const next = { ...settingsStore.getSnapshot(), ...patch };
    settingsStore.set(next);
    writeSettings(next);
  };

  // ── 提示音播放元素 ──────────────────────────────────────────────────
  const audio = document.createElement('audio');
  audio.dataset.dshtnPlayer = PLUGIN;
  audio.preload = 'auto';
  audio.src = resolveSoundUrl();
  audio.style.display = 'none';
  document.body.appendChild(audio);
  ctx.effect(() => () => {
    audio.pause();
    audio.remove();
  }, 'task-notify: audio element');

  // 页面首次获得用户手势时解锁音频：自动播放策略只允许手势后发声。
  let unlocked = false;
  const unlock = () => {
    if (unlocked) return;
    unlocked = true;
    audio.muted = true;
    audio.play().then(() => {
      audio.pause();
      audio.muted = false;
      audio.currentTime = 0;
    }).catch(() => {
      audio.muted = false;
    });
  };
  const unlockEvents = ['pointerdown', 'keydown'];
  for (const name of unlockEvents) window.addEventListener(name, unlock, { capture: true, passive: true });
  ctx.effect(() => () => {
    for (const name of unlockEvents) window.removeEventListener(name, unlock, { capture: true });
  }, 'task-notify: audio unlock');

  // ── 大肥鱼状态 ──────────────────────────────────────────────────────
  // 大肥鱼是单例：任务完成、等待回答、等待确认都进入同一个 FIFO 队列；
  // 每点一次打开队首会话并消除它，队列点空后播放完点击动画再收起。
  const spriteStore = createStore({
    visible: false,
    title: '',
    kind: 'turnEnd',
    sessionLabel: '',
    queue: [],
    phase: 'idle',
    // -1 表示还没有播放过点击回应；首次点击可以在 5 段动画里任选。
    clickIndex: -1,
    clickSeq: 0,
  });
  /** 点击动画结束后切换待机或收起的延时器。 */
  let clickTimer;

  /** 不同提醒类型对应的气泡标题字典键。 */
  const TITLE_KEYS = {
    turnEnd: 'sprite.turnEnd',
    question: 'sprite.question',
    approval: 'sprite.approval',
  };

  /**
   * 取某类提醒的气泡标题。
   * @param {'turnEnd'|'question'|'approval'} kind - 提醒类型。
   * @returns {string} 已翻译的气泡标题。
   */
  function titleOf(kind) {
    return t(TITLE_KEYS[kind] ?? TITLE_KEYS.turnEnd);
  }

  /**
   * 选取下一段点击回应动画，避免与上一次相同。
   * @param {number} previous - 上一次使用的动画下标。
   * @returns {number} 新的动画下标。
   */
  function pickClickIndex(previous) {
    if (CLICK_SHEETS.length <= 1) return 0;
    let next = previous;
    while (next === previous) next = Math.floor(Math.random() * CLICK_SHEETS.length);
    return next;
  }

  /**
   * 把一条提醒加入大肥鱼队列；已经在显示时只更新队列，不重复播放提示音。
   * 同一会话重复触发时合并为一条，并刷新类型与标题。
   * @param {string} sessionId - 触发提醒的会话。
   * @param {string} sessionLabel - 会话标题。
   * @param {'turnEnd'|'question'|'approval'} kind - 提醒类型。
   * @returns {boolean} 本次调用是否播放了提示音。
   */
  function enqueueSprite(sessionId, sessionLabel, kind) {
    const current = settingsStore.getSnapshot();
    if (!current.enabled) return false;
    const previous = spriteStore.getSnapshot();
    const index = previous.queue.findIndex((item) => item.sessionId === sessionId);
    const queue = index >= 0
      ? previous.queue.map((item, i) => (i === index ? { ...item, sessionLabel, kind } : item))
      : [...previous.queue, { sessionId, sessionLabel, kind }];
    const head = queue[0];
    spriteStore.set({
      ...previous,
      visible: true,
      title: titleOf(head.kind),
      kind: head.kind,
      queue,
      sessionLabel: head.sessionLabel,
    });
    // 已经在显示时视为同一次提醒：不再重复响铃。
    if (previous.visible) return false;
    if (current.sound) ring(kind !== 'turnEnd');
    return true;
  }

  /** 取消待执行的点击动画收尾定时器。 */
  function clearClickTimer() {
    if (clickTimer === undefined) return;
    clickTimer();
    clickTimer = undefined;
  }

  /**
   * 点击大肥鱼：打开队首会话、消除该条，并播放一段随机的点击回应动画。
   * @returns {void}
   */
  function activateNext() {
    const current = spriteStore.getSnapshot();
    if (current.queue.length === 0) {
      hideSprite();
      return;
    }
    const [next, ...rest] = current.queue;
    const head = rest[0];
    clearClickTimer();
    spriteStore.set({
      ...current,
      visible: true,
      title: head ? titleOf(head.kind) : current.title,
      kind: head ? head.kind : current.kind,
      queue: rest,
      phase: 'click',
      clickIndex: pickClickIndex(current.clickIndex),
      clickSeq: current.clickSeq + 1,
      sessionLabel: head ? head.sessionLabel : next.sessionLabel,
    });
    openSession(next.sessionId);

    clickTimer = ctx.timeout(() => {
      clickTimer = undefined;
      const after = spriteStore.getSnapshot();
      // 队列里还有会话：回到待机、等下一次点击。
      if (after.queue.length > 0) {
        spriteStore.set({ ...after, phase: 'idle' });
        return;
      }
      // 最后一个已打开：先淡回待机动画，淡完再收起。
      spriteStore.set({ ...after, phase: 'idle' });
      clickTimer = ctx.timeout(() => {
        clickTimer = undefined;
        if (spriteStore.getSnapshot().queue.length === 0) hideSprite();
      }, CLICK_FADE_MS);
    }, CLICK_DURATION);
  }

  /** 清空队列并隐藏大肥鱼。 */
  function hideSprite() {
    clearClickTimer();
    const current = spriteStore.getSnapshot();
    if (!current.visible && current.queue.length === 0) return;
    spriteStore.set({
      ...current,
      visible: false,
      title: '',
      kind: 'turnEnd',
      sessionLabel: '',
      queue: [],
      phase: 'idle',
    });
  }

  /**
   * 通过注入的 uiWorkspace 服务打开会话。
   * @param {string} sessionId - 会话 id。
   */
  function openSession(sessionId) {
    const workspace = ctx.get('uiWorkspace');
    if (workspace !== undefined) workspace.openSession(sessionId);
  }

  // ── 会话状态观察：任务完成、等待回答与等待确认都进入同一队列 ────────
  const observer = createSessionObserver({
    ctx,
    onTurnEnd: (sessionId, sessionLabel) => enqueueSprite(sessionId, sessionLabel, 'turnEnd'),
    onQuestion: (sessionId, sessionLabel) => enqueueSprite(sessionId, sessionLabel, 'question'),
    onApproval: (sessionId, sessionLabel) => enqueueSprite(sessionId, sessionLabel, 'approval'),
    // 子智能体完成的提醒默认关闭；等待回答、等待确认不受该开关影响。
    shouldNotifyTurnEnd: () => settingsStore.getSnapshot().notifySubagent,
  });
  ctx.effect(() => () => observer.dispose(), 'task-notify: session observer');

  // ── 浮层：右下角大肥鱼 ──────────────────────────────────────────────
  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register({
      name: 'shell.overlay',
      id: 'task-notify-sprite',
      order: 90,
      locale: NS,
      // `hooks` 内的每个键都会被当成订阅源；动作函数必须放在外层，才会原样透传给组件。
      inject: () => ({
        hooks: { taskNotifySprite: spriteStore },
        activateNext,
        dismiss: hideSprite,
      }),
    }, TaskSprite),
  );

  // ── 常规设置行 ──────────────────────────────────────────────────────
  ctx.slots.inject('settings.general.item', () =>
    ctx.slots.register({
      name: 'settings.general.item',
      id: 'task-notify',
      order: 15,
      locale: NS,
      inject: () => ({
        hooks: { taskNotifySettings: settingsStore },
        setEnabled: (value) => updateSettings({ enabled: value }),
        setSound: (value) => updateSettings({ sound: value }),
        setNotifySubagent: (value) => updateSettings({ notifySubagent: value }),
        playPreview: () => {
          ring(false);
        },
      }),
    }, NotifySettingsRow),
  );
}
