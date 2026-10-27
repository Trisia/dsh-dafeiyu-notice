/**
 * 会话列表观察：把“运行态 → 空闲”判定为任务完成，把新增待回答请求判定为等待提示。
 */
import { ABORT_TTL, ESC_GAP, RETRY_DELAY, SETTLE_DELAY, STOP_LABEL } from './constants.js';
import { activeQuestionCount, metaOf, pendingQuestions } from './session-view.js';

/**
 * 创建一个会话观察器，接管宿主会话列表并驱动精灵与卡片。
 *
 * 列表优先取自上下文可达的 `sessions` 服务；该服务尚未就绪时，
 * 由浮层组件在渲染期调用 {@link observe.useSessionsList} 取得。
 * 所有定时器都挂在插件上下文上，插件停用时自动清除。
 * @param {object} options - 依赖注入面。
 * @param {object} options.ctx - 客户端插件上下文。
 * @param {(id: string, sessionLabel: string, title: string) => void} options.onTurnEnd - 会话完成时的回调。
 * @param {(sessionId: string, sessionLabel: string) => void} options.onQuestion - 出现待回答请求时的回调。
 * @param {(key: string) => string} options.t - 文案取值函数。
 * @returns {{useSessionsList: (scope: object) => undefined, dispose: () => void}} 观察器句柄。
 */
export function createSessionObserver({ ctx, onTurnEnd, onQuestion, t }) {
  /** 已提示过的“等待回答”请求键，避免重复响铃。 */
  const announcedQuestions = new Set();
  /** 会话 id → 运行结束后待判定的延时器。 */
  const settleTimers = new Map();
  /** 会话 id → 用户手动中止的记录时间，单位：毫秒。 */
  const abortedAt = new Map();
  /** 已接管的列表及其上一份快照。 */
  let list = undefined;
  let previous = undefined;
  /** 列表是否已经接管（成功或经上下文注入），避免重复尝试。 */
  let settled = false;
  /** 上一次按下 Esc 的时间，单位：毫秒。 */
  let lastEscapeAt = 0;

  /**
   * 会话停止运行后判定是否为“任务完成”并提示。
   * @param {string} id - 会话 id。
   */
  function settleTurn(id) {
    const snapshot = list.getSnapshot();
    const meta = metaOf(snapshot, id);
    if (!meta || meta.running) return;
    if (meta.blank) return;
    // 仍有待回答的问答时由等待类提示负责。
    if (activeQuestionCount(snapshot, id) > 0) return;
    onTurnEnd(id, meta.label, t('sprite.turnEnd'));
  }

  /**
   * 处理一次列表快照变化：探测运行态转换与新增的待回答请求。
   * @param {object} current - 新的会话列表快照。
   * @param {object} before - 上一份会话列表快照；首次加载时传入 undefined。
   */
  function inspectList(current, before) {
    for (const id of Object.keys(current?.byId ?? {})) {
      const wasRunning = before?.byId?.[id]?.running === true;
      const isRunning = current.byId[id]?.running === true;

      if (!wasRunning && isRunning) {
        // 新一轮任务开始：取消上一次尚未判定的结束检查并清空问答去重记录。
        settleTimers.get(id)?.();
        settleTimers.delete(id);
        abortedAt.delete(id);
        for (const key of [...announcedQuestions]) {
          if (key.startsWith(`${id}:`)) announcedQuestions.delete(key);
        }
      } else if (wasRunning && !isRunning) {
        settleTimers.get(id)?.();
        settleTimers.delete(id);
        const abortedTime = abortedAt.get(id);
        abortedAt.delete(id);
        // 用户手动停止的会话不算任务完成，直接跳过。
        if (abortedTime !== undefined && Date.now() - abortedTime < ABORT_TTL) continue;
        // 运行态 → 空闲：稍等宿主刷新投影后判定是否完成。
        settleTimers.set(id, ctx.timeout(() => {
          settleTimers.delete(id);
          settleTurn(id);
        }, SETTLE_DELAY));
      }

      // 新增的待回答请求：弹出“等待回答”提示。
      for (const question of pendingQuestions(current, id)) {
        const key = `${id}:${question.key}`;
        if (announcedQuestions.has(key)) continue;
        announcedQuestions.add(key);
        // 首次加载时已存在的请求不提示，只提示之后新出现的请求。
        if (before === undefined) continue;
        const meta = metaOf(current, id);
        if (!meta) continue;
        onQuestion(id, meta.label);
      }
    }
  }

  /**
   * 接管一个会话列表快照源，开始观察其变化。
   * @param {object} source - 提供 getSnapshot / subscribe 的会话列表。
   * @returns {() => void} 解除订阅的清理函数。
   */
  function attachList(source) {
    settled = true;
    list = source;
    previous = source.getSnapshot();
    inspectList(previous, undefined);
    return source.subscribe(() => {
      const current = list.getSnapshot();
      const before = previous;
      previous = current;
      inspectList(current, before);
    });
  }

  /**
   * 从宿主装饰上下文取得会话列表；尚未就绪时定时重试，直到拿到或插件停用。
   *
   * 动态客户端包可能在页面的会话服务就绪之前加载并被渲染，因此这里不假定
   * 某个服务此刻已经存在。返回值不参与渲染，仅供浮层组件在渲染期触发取数。
   * @param {object} scope - 槽位注册回调收到的装饰上下文。
   * @returns {undefined} 始终返回 undefined。
   */
  function useSessionsList(scope) {
    if (list !== undefined || settled) return undefined;
    const hook = scope?.useSessionsList;
    const source = typeof hook === 'function' ? hook() : undefined;
    if (source !== undefined && typeof source.getSnapshot === 'function'
      && typeof source.subscribe === 'function') {
      settled = true;
      // 渲染期不产生副作用：等本次提交结束后再订阅。
      Promise.resolve().then(() => ctx.effect(
        () => attachList(source),
        'task-notify: session list watcher',
      ));
      return undefined;
    }
    ctx.timeout(() => useSessionsList(scope), RETRY_DELAY);
    return undefined;
  }

  /**
   * 记下一次“用户正在停止生成”：取当前最近更新的运行中会话。
   */
  function markUserAbort() {
    const snapshot = list?.getSnapshot();
    if (!snapshot) return;
    let latest;
    for (const id of Object.keys(snapshot.byId ?? {})) {
      const row = snapshot.byId[id];
      if (row?.running !== true) continue;
      if (!latest || (row.updatedAt ?? 0) >= latest.updatedAt) {
        latest = { id, updatedAt: row.updatedAt ?? 0 };
      }
    }
    if (latest) abortedAt.set(latest.id, Date.now());
  }

  /**
   * 点击页面上的“停止生成”按钮时记录中止。
   * @param {MouseEvent} event - 冒泡到 document 的点击事件。
   */
  function onDocumentClick(event) {
    const target = event.target;
    if (!target || typeof target.closest !== 'function') return;
    const button = target.closest('button[aria-label]');
    const label = button?.getAttribute('aria-label') ?? '';
    if (STOP_LABEL.test(label)) markUserAbort();
  }

  /**
   * 连按两次 Esc 是停止生成的快捷键，这里用同样的节奏记录中止。
   * @param {KeyboardEvent} event - 键盘事件。
   */
  function onDocumentKeyDown(event) {
    if (event.key !== 'Escape') return;
    const now = Date.now();
    const repeated = now - lastEscapeAt < ESC_GAP;
    lastEscapeAt = now;
    if (repeated) markUserAbort();
  }

  // 首选上下文可达的会话服务；未就绪时由浮层的 useSessionsList 钩子接管。
  const attached = ctx.get('sessions')?.list;
  if (attached !== undefined && typeof attached.getSnapshot === 'function'
    && typeof attached.subscribe === 'function') {
    ctx.effect(() => attachList(attached), 'task-notify: session list watcher');
  }

  window.addEventListener('click', onDocumentClick, true);
  window.addEventListener('keydown', onDocumentKeyDown, true);
  ctx.effect(() => () => {
    window.removeEventListener('click', onDocumentClick, true);
    window.removeEventListener('keydown', onDocumentKeyDown, true);
    abortedAt.clear();
  }, 'task-notify: user abort watcher');

  /**
   * 插件停用时释放观察器自身持有的状态。
   * @returns {void}
   */
  function dispose() {
    settleTimers.clear();
    announcedQuestions.clear();
    abortedAt.clear();
  }

  return { useSessionsList, dispose };
}
