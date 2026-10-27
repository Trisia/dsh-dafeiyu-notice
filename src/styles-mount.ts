/**
 * 样式表挂载：把插件样式插入文档，卸载时移除。
 */
import { PLUGIN } from './constants.js';
import { CSS } from './styles.js';

/**
 * 把插件样式插入文档；同一页面只插入一次，卸载时移除。
 *
 * 动态客户端包只能依赖共享模块表里的模块与注入的服务，因此样式由插件自行挂载，
 * 用 data-plugin 标记保证同一页面不会重复插入。
 * @returns {() => void} 移除样式表的清理函数。
 */
export function insertStyles() {
  const existing = document.querySelector(`style[data-plugin="${PLUGIN}"]`);
  if (existing) return () => {};
  const tag = document.createElement('style');
  tag.dataset.plugin = PLUGIN;
  tag.textContent = CSS;
  document.head.appendChild(tag);
  return () => tag.remove();
}
