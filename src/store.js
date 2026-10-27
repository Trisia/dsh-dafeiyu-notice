/**
 * 极简订阅仓库：槽位渲染器通过 useSyncExternalStore 读取，需满足其快照契约。
 */

/**
 * 创建一个极简订阅仓库，作为槽位 store 使用。
 *
 * 槽位渲染器通过 useSyncExternalStore 读取状态，这里提供
 * getSnapshot / subscribe / set 三个方法即可满足其要求。
 * @template T
 * @param {T} initial - 初始状态。
 * @returns {{getSnapshot: () => T, subscribe: (listener: () => void) => (() => void), set: (next: T) => void}} 仓库句柄。
 */
export function createStore(initial) {
  let snapshot = initial;
  const listeners = new Set();
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set: (next) => {
      snapshot = next;
      for (const listener of [...listeners]) listener();
    },
  };
}
