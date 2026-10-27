/**
 * 极简订阅仓库：槽位渲染器通过 useSyncExternalStore 读取，需满足其快照契约。
 */

/** 仓库句柄。 */
export interface Store<T> {
  /** 读取当前快照。 */
  getSnapshot: () => T;
  /** 订阅变更，返回取消函数。 */
  subscribe: (listener: () => void) => () => void;
  /** 替换快照并通知所有订阅者。 */
  set: (next: T) => void;
}

/**
 * 创建一个极简订阅仓库，作为槽位 store 使用。
 *
 * 槽位渲染器通过 useSyncExternalStore 读取状态，这里提供
 * getSnapshot / subscribe / set 三个方法即可满足其要求。
 * @param initial - 初始状态。
 * @returns 仓库句柄。
 */
export function createStore<T>(initial: T): Store<T> {
  let snapshot = initial;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set: (next) => {
      snapshot = next;
      for (const listener of [...listeners]) listener();
    },
  };
}
