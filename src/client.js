/**
 * 浏览器半边：注册精灵浮层、提示卡片与设置行，并把会话列表变化翻译成提示。
 */
import { CLICK_DURATION, CLICK_FADE_MS, DEFAULT_DURATION, MAX_NOTICES, MIN_INTERVAL, NS, PLUGIN } from './constants.js';
import { CLICK_SHEETS } from './click-sheets.js';
import { EN, ZH } from './locale.js';
import { NoticeStack } from './notice-stack.js';
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
   * @param {{enabled?: boolean, sound?: boolean}} patch - 需要变更的字段。
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

  // ── 小精灵状态 ──────────────────────────────────────────────────────
  // 精灵是单例：多个会话完成时排成 FIFO 队列，每点一次打开队首会话并消除它；
  // 队列非空时保持显示，点空后播放完点击动画再收起。
  const spriteStore = createStore({
    visible: false,
    title: '',
    sessionLabel: '',
    queue: [],
    phase: 'idle',
    // -1 表示还没有播放过点击回应；首次点击可以在 5 段动画里任选。
    clickIndex: -1,
    clickSeq: 0,
  });
  /** 点击动画结束后切换待机或收起的延时器。 */
  let clickTimer;

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
   * 显示完成精灵；已经在显示时只更新队列，不重复播放提示音。
   * 同一会话重复完成时合并为一条，并刷新它的标题。
   * @param {string} sessionId - 触发提示的会话。
   * @param {string} sessionLabel - 会话标题。
   * @param {string} title - 气泡文案。
   * @returns {boolean} 本次调用是否播放了提示音。
   */
  function showSprite(sessionId, sessionLabel, title) {
    const current = settingsStore.getSnapshot();
    if (!current.enabled) return false;
    const previous = spriteStore.getSnapshot();
    const queued = previous.queue.some((item) => item.sessionId === sessionId);
    const queue = queued
      ? previous.queue.map((item) => (item.sessionId === sessionId ? { ...item, sessionLabel } : item))
      : [...previous.queue, { sessionId, sessionLabel }];
    spriteStore.set({
      ...previous,
      visible: true,
      title,
      queue,
      sessionLabel: queue[0].sessionLabel,
    });
    // 已经在显示时视为同一次提醒：不再重复响铃。
    if (previous.visible) return false;
    if (current.sound) ring(false);
    return true;
  }

  /** 取消待执行的点击动画收尾定时器。 */
  function clearClickTimer() {
    if (clickTimer === undefined) return;
    clickTimer();
    clickTimer = undefined;
  }

  /**
   * 点击精灵：打开队首会话、消除该条，并播放一段随机的点击回应动画。
   * @returns {void}
   */
  function activateNext() {
    const current = spriteStore.getSnapshot();
    if (current.queue.length === 0) {
      hideSprite();
      return;
    }
    const [next, ...rest] = current.queue;
    clearClickTimer();
    spriteStore.set({
      ...current,
      visible: true,
      queue: rest,
      phase: 'click',
      clickIndex: pickClickIndex(current.clickIndex),
      clickSeq: current.clickSeq + 1,
      sessionLabel: rest.length > 0 ? rest[0].sessionLabel : next.sessionLabel,
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

  /** 清空队列并隐藏完成精灵。 */
  function hideSprite() {
    clearClickTimer();
    const current = spriteStore.getSnapshot();
    if (!current.visible && current.queue.length === 0) return;
    spriteStore.set({
      ...current,
      visible: false,
      title: '',
      sessionLabel: '',
      queue: [],
      phase: 'idle',
    });
  }

  // ── 提示卡片状态 ────────────────────────────────────────────────────
  const noticesStore = createStore([]);
  let noticeSeq = 0;
  const lastFireAt = {};

  /**
   * 移除指定提示卡片。
   * @param {number} id - 提示卡片编号。
   */
  function dismissNotice(id) {
    const current = noticesStore.getSnapshot();
    if (!current.some((item) => item.id === id)) return;
    noticesStore.set(current.filter((item) => item.id !== id));
  }

  /**
   * 显示一张提示卡片并播放提示音，停留结束后自动移除。
   * @param {'turnEnd'|'question'|'approval'} kind - 提示类别。
   * @param {string} sessionId - 触发提示的会话。
   * @param {string} sessionLabel - 会话标题。
   */
  function showNotice(kind, sessionId, sessionLabel) {
    const current = settingsStore.getSnapshot();
    if (!current.enabled) return;
    const now = Date.now();
    if (now - (lastFireAt[kind] ?? 0) < MIN_INTERVAL) return;
    lastFireAt[kind] = now;
    noticeSeq += 1;
    const id = noticeSeq;
    noticesStore.set([...noticesStore.getSnapshot(), {
      id,
      kind,
      sessionId,
      sessionLabel,
      title: t(`notice.${kind}.title`),
      body: t(`notice.${kind}.body`),
      openLabel: t('notice.open'),
      closeLabel: t('notice.close'),
    }].slice(-MAX_NOTICES));
    if (current.sound) ring(kind !== 'turnEnd');
    ctx.timeout(() => dismissNotice(id), DEFAULT_DURATION);
  }

  /**
   * 通过注入的 uiWorkspace 服务打开会话。
   * @param {string} sessionId - 会话 id。
   */
  function openSession(sessionId) {
    const workspace = ctx.get('uiWorkspace');
    if (workspace !== undefined) workspace.openSession(sessionId);
  }

  // ── 会话状态观察：任务完成、等待回答与等待确认 ──────────────────────
  const observer = createSessionObserver({
    ctx,
    t,
    onTurnEnd: showSprite,
    onQuestion: (sessionId, sessionLabel) => showNotice('question', sessionId, sessionLabel),
    onApproval: (sessionId, sessionLabel) => showNotice('approval', sessionId, sessionLabel),
  });
  ctx.effect(() => () => observer.dispose(), 'task-notify: session observer');

  // ── 浮层：右下角小精灵 ──────────────────────────────────────────────
  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register({
      name: 'shell.overlay',
      id: 'task-notify-sprite',
      order: 90,
      locale: NS,
      inject: () => ({
        hooks: { taskNotifySprite: spriteStore },
        activateNext,
        dismiss: hideSprite,
      }),
    }, TaskSprite),
  );

  // ── 浮层：等待回答/确认提示卡片 ──────────────────────────────────────
  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register({
      name: 'shell.overlay',
      id: 'task-notify-cards',
      order: 89,
      locale: NS,
      inject: () => ({
        hooks: { taskNotifyNotices: noticesStore },
        openSession,
        dismiss: dismissNotice,
      }),
    }, NoticeStack),
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
        playPreview: () => {
          ring(false);
        },
      }),
    }, NotifySettingsRow),
  );
}
