/**
 * 最小 React 运行时类型声明：插件只使用 createElement 与少量 Hooks，
 * 不引入完整的 @types/react，避免给构建增加额外依赖。
 */
declare module 'react' {
  interface ReactStatic {
    createElement: (type: unknown, props?: unknown, ...children: unknown[]) => unknown;
    useState: <S>(initial: S | (() => S)) => [S, (value: S | ((previous: S) => S)) => void];
    useEffect: (effect: () => void | (() => void) | undefined, deps?: readonly unknown[]) => void;
    useLayoutEffect: (effect: () => void | (() => void), deps?: readonly unknown[]) => void;
    useRef: (initial?: unknown) => { current: any };
  }

  const React: ReactStatic;
  export default React;
}
