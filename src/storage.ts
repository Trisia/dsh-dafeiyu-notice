/**
 * 偏好设置与大肥鱼位置的持久化，都存放在页面 localStorage。
 */
import { POS_KEY, STORAGE_KEY } from './constants.js';

/**
 * 读取偏好设置的持久化内容。
 * @returns {{enabled: boolean, sound: boolean, notifySubagent: boolean}} 合并默认值后的设置。
 */
export function readSettings() {
  const defaults = { enabled: true, sound: true, notifySubagent: false };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    return {
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : defaults.enabled,
      sound: typeof parsed.sound === 'boolean' ? parsed.sound : defaults.sound,
      notifySubagent: typeof parsed.notifySubagent === 'boolean' ? parsed.notifySubagent : defaults.notifySubagent,
    };
  } catch (error) {
    return defaults;
  }
}

/**
 * 写入偏好设置。
 * @param {{enabled: boolean, sound: boolean, notifySubagent: boolean}} settings - 完整的设置对象。
 */
export function writeSettings(settings) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    // 隐私模式下 localStorage 不可写；设置仍在本页生效。
  }
}

/**
 * 读取已保存的大肥鱼位置。
 * @returns {{left: number, top: number}|undefined} 视口坐标；从未拖动过时为 undefined。
 */
export function readSpritePos() {
  try {
    const raw = window.localStorage.getItem(POS_KEY);
    if (!raw) return undefined;
    const value = JSON.parse(raw);
    if (typeof value?.left !== 'number' || typeof value?.top !== 'number') return undefined;
    return { left: value.left, top: value.top };
  } catch (error) {
    return undefined;
  }
}

/**
 * 保存大肥鱼位置，供下次打开页面时恢复。
 * @param {{left: number, top: number}} pos - 视口坐标。
 */
export function writeSpritePos(pos) {
  try {
    window.localStorage.setItem(POS_KEY, JSON.stringify(pos));
  } catch (error) {
    // 隐私模式等场景下无法持久化，忽略即可。
  }
}
