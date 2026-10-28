/**
 * 会话状态观察：把“运行态 → 空闲”判定为任务完成，把新出现的待交互请求判定为待处理提醒。
 *
 * 状态取自宿主客户端的 `uiSession.sessionStatus`（宿主在会话事件上实时维护运行态与
 * 待交互请求），会话标题与空白标记取自 `sessions.list`。这两个服务可能晚于插件
 * 挂载才注册，因此统一用 `ctx.inject` 等待就绪后再接管；服务缺失时定时重试，
 * 不能在挂载瞬间读一次就放弃监听。
 */
import { ABORT_TTL, ESC_GAP, RETRY_DELAY, SETTLE_DELAY, STOP_LABEL } from './constants.js';

/**
 * 判断一个待交互请求应归入哪类大肥鱼提醒。
 * @param {{kind?: string}} pending - 宿主给出的待交互请求。
 * @returns {'approval'|'question'} 提醒类型；审批单独成类，计划审阅与问答归为问答。
 */
function pendingKindOf(pending) {
  return pending?.kind === 'approval' ? 'approval' : 'question';
}

/**
 * 创建一个会话观察器，接管宿主会话状态并驱动大肥鱼队列。
 * 所有定时器都挂在插件上下文上，插件停用时自动清除。
 * @param {object} options - 依赖注入面。
 * @param {object} options.ctx - 客户端插件上下文。
 * @param {(id: string, sessionLabel: string) => void} options.onTurnEnd - 会话完成时的回调。
 * @param {(sessionId: string, sessionLabel: string) => void} options.onQuestion - 出现待回答请求时的回调。
 * @param {(sessionId: string, sessionLabel: string) => void} options.onApproval - 出现待确认请求时的回调。
 * @param {() => boolean} [options.shouldNotifyTurnEnd] - 判定某次会话完成是否需要提醒；返回 false 时跳过。
 * @returns {{dispose: () => void}} 观察器句柄。
 */
export function createSessionObserver({ ctx, onTurnEnd, onQuestion, onApproval, shouldNotifyTurnEnd }) {
  /** 已提示过的待交互请求键，避免重复提示。 */
  const announced = new Set<string>();
  /** 会话 id → 运行结束后待判定的延时器。 */
  const settleTimers = new Map<string, () => void>();
  /** 会话 id → 用户手动中止的记录时间，单位：毫秒。 */
  const abortedAt = new Map<string, number>();
  /** 最近一次读到的会话状态快照，键为会话 id。 */
  let previousStatus;
  /** 最近一次读到的会话列表快照。 */
  let listSnapshot;
  /** 状态快照源；服务未就绪时为空。 */
  let statusSource;

  /**
   * 读取会话标题；列表尚未就绪或标题为空时退回会话 id。
   * @param {string} id - 会话 id。
   * @returns {string} 用于提示文案的会话标题。
   */
  function labelOf(id) {
    const row = listSnapshot?.byId?.[id];
    const label = typeof row?.displayTitle === 'string' && row.displayTitle !== ''
      ? row.displayTitle
      : row?.title;
    return typeof label === 'string' && label !== '' ? label : String(id);
  }

  /**
   * 判断会话是否仍是没有内容的新会话；这类会话结束时不必提醒。
   * @param {string} id - 会话 id。
   * @returns {boolean} 是否为空白会话。
   */
  function isBlank(id) {
    return listSnapshot?.byId?.[id]?.blank === true;
  }

  /**
   * 判断会话是否为子智能体会话（subagent / fork / AgentTeams 成员）：
   * 宿主在列表行上标记 `origin: 'subagent'`，或给出所属主会话 `parentId`。
   * @param {string} id - 会话 id。
   * @returns {boolean} 是否为子智能体会话。
   */
  function isSubagent(id) {
    const row = listSnapshot?.byId?.[id];
    return row?.origin === 'subagent' || row?.parentId !== undefined;
  }

  /**
   * 会话停止运行后判定是否为“任务完成”并提示。
   * @param {string} id - 会话 id。
   */
  function settleTurn(id) {
    const status = statusSource?.getSnapshot?.().get(id);
    // 等待期间可能又开始了新一轮任务，或多出待交互请求：此时不按完成提示。
    if (status === undefined || status.running !== false) return;
    if (status.pendingInteraction !== undefined && status.pendingInteraction !== null) return;
    if (isBlank(id)) return;
    if (isSubagent(id) && shouldNotifyTurnEnd?.() === false) return;
    onTurnEnd(id, labelOf(id));
  }

  /**
   * 处理一次状态快照变化：探测运行态转换与新增的待交互请求。
   * @param {Map<string, {running?: boolean, pendingInteraction?: object}>|undefined} before - 上一份状态快照；首次加载时为 undefined。
   * @param {Map<string, {running?: boolean, pendingInteraction?: object}>} current - 新的状态快照。
   */
  function inspect(before, current) {
    for (const [id, status] of current) {
      const previous = before?.get(id);
      const pending = status?.pendingInteraction ?? undefined;
      const previousPending = previous?.pendingInteraction ?? undefined;

      // 新增的待交互请求：只在它出现的那一刻提示一次。
      if (pending !== undefined && pending !== previousPending) {
        const key = `${id}:${pending.key}`;
        if (!announced.has(key)) {
          announced.add(key);
          // 首次加载时已存在的请求不提示，只提示之后新出现的请求。
          if (before !== undefined) {
            if (pendingKindOf(pending) === 'approval') onApproval(id, labelOf(id));
            else onQuestion(id, labelOf(id));
          }
        }
      }

      const wasRunning = previous?.running === true;
      const isRunning = status?.running === true;

      if (!wasRunning && isRunning) {
        // 新一轮任务开始：取消上一次尚未判定的结束检查并清空问答去重记录。
        settleTimers.get(id)?.();
        settleTimers.delete(id);
        abortedAt.delete(id);
        for (const key of [...announced]) {
          if (key.startsWith(`${id}:`)) announced.delete(key);
        }
      } else if (wasRunning && !isRunning) {
        settleTimers.get(id)?.();
        settleTimers.delete(id);
        // 运行态 → 空闲：稍等宿主刷新投影后再判定是否完成。
        settleTimers.set(id, ctx.timeout(() => {
          settleTimers.delete(id);
          const abortedTime = abortedAt.get(id);
          abortedAt.delete(id);
          // 用户手动停止的会话不算任务完成，直接跳过。
          if (abortedTime !== undefined && Date.now() - abortedTime < ABORT_TTL) return;
          settleTurn(id);
        }, SETTLE_DELAY));
      }
    }
  }

  /**
   * 接管状态与列表两个快照源，开始观察其变化。
   * @param {object} scope - 已就绪的服务作用域（或插件上下文本身）。
   * @returns {void}
   */
  function attach(scope) {
    const nextStatusSource = scope?.uiSession?.sessionStatus;
    if (typeof nextStatusSource?.getSnapshot !== 'function' || typeof nextStatusSource.subscribe !== 'function') return;
    statusSource = nextStatusSource;
    const listSource = scope?.sessions?.list;
    listSnapshot = listSource?.getSnapshot?.();
    previousStatus = statusSource.getSnapshot();

    const offStatus = statusSource.subscribe(() => {
      const next = statusSource.getSnapshot();
      const before = previousStatus;
      previousStatus = next;
      listSnapshot = listSource?.getSnapshot?.() ?? listSnapshot;
      inspect(before, next);
    });
    const offList = typeof listSource?.subscribe === 'function'
      ? listSource.subscribe(() => {
        listSnapshot = listSource.getSnapshot();
      })
      : () => {};

    scope.effect(() => () => {
      offStatus();
      offList();
      settleTimers.clear();
      announced.clear();
      abortedAt.clear();
    }, 'task-notify: session watcher');
  }

  /**
   * 从上下文逐次重试读取服务；`ctx.inject` 不可用时的兜底路径。
   * @returns {void}
   */
  function attachByPolling() {
    const sessions = typeof ctx.get === 'function' ? ctx.get('sessions') : undefined;
    const uiSession = typeof ctx.get === 'function' ? ctx.get('uiSession') : undefined;
    if (sessions !== undefined && uiSession !== undefined) {
      attach({ sessions, uiSession, effect: ctx.effect.bind(ctx) });
      return;
    }
    ctx.timeout(attachByPolling, RETRY_DELAY);
  }

  // 首选 ctx.inject：服务注册、重载时都会重新回调，天然处理晚就绪的情况。
  if (typeof ctx.inject === 'function') {
    ctx.inject(['sessions', 'uiSession'], (scope) => attach(scope));
  } else {
    attachByPolling();
  }

  /**
   * 取最近更新的运行中会话：用于把“用户正在停止生成”记到正确的会话上。
   * @returns {string|undefined} 会话 id；没有运行中的会话时为空。
   */
  function latestRunningId() {
    if (previousStatus === undefined) return undefined;
    let latest;
    for (const [id, status] of previousStatus) {
      if (status?.running !== true) continue;
      const stamp = listSnapshot?.byId?.[id]?.updatedAt ?? 0;
      if (latest === undefined || stamp >= latest.stamp) latest = { id, stamp };
    }
    return latest?.id;
  }

  /**
   * 记下一次“用户正在停止生成”。
   */
  function markUserAbort() {
    const id = latestRunningId();
    if (id !== undefined) abortedAt.set(id, Date.now());
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

  /** 上一次按下 Esc 的时间，单位：毫秒。 */
  let lastEscapeAt = 0;

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
    announced.clear();
    abortedAt.clear();
  }

  return { dispose };
}