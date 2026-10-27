// 客户端插件的打包配置：产出一个由 window.__ModuleLoader__.load 注册的懒工厂脚本。
// 产物固定为 CommonJS 表单（factory(require) 里 return module.exports），与客户端模块
// 系统的“先注册工厂、首次引用时再物化”的加载模型一致。
const id = '@local/dsh-plugin-task-notify';

export default {
  entry: { client: 'src/client.ts' },
  outDir: 'lib',
  format: ['cjs'],
  platform: 'browser',
  target: 'es2022',
  clean: true,
  // 生成源码映射，便于在浏览器里直接定位到 src/ 下的模块。
  sourcemap: true,
  shims: true,
  // 共享模块表里的模块由宿主提供，不能打进产物。
  deps: {
    neverBundle: [
      'react',
      'react/jsx-runtime',
      'react-dom',
      'react-dom/client',
      '@deepseek-ai/cordis',
      '@deepseek-ai/dsh-client-store',
      '@deepseek-ai/dsh-client-ui-slots',
      '@deepseek-ai/dsh-client-ui-primitives',
    ],
  },
  outputOptions: {
    // 产物以“注册一个惰性工厂”的形式交给客户端模块系统，而不是立即执行的模块。
    banner: `window.__ModuleLoader__.load({\n  id: '${id}',\n  factory(require) {`,
    footer: '  },\n});',
    intro: 'const module = { exports: {} }; const exports = module.exports;',
    outro: 'return module.exports;',
    // 客户端模块系统按固定文件名 /plugins/<id>/client.js 取包。
    entryFileNames: 'client.js',
  },
};
