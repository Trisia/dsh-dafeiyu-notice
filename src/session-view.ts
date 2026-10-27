/**
 * 会话列表快照的读取工具：单行元数据、待回答问题、大肥鱼坐标计算。
 */
import { PET_HEIGHT, PET_WIDTH } from './constants.js';

/**
 * 读取单个会话在会话列表快照中的元数据。
 * @param {object} list - 会话列表快照。
 * @param {string} id - 会话 id。
 * @returns {{running: boolean, blank: boolean, label: string}|undefined} 元数据。
 */
export function metaOf(list, id) {
  const row = list?.byId?.[id];
  if (!row) return undefined;
  return {
    running: row.running === true,
    blank: row.blank === true,
    label: typeof row.displayTitle === 'string' && row.displayTitle.length > 0
      ? row.displayTitle
      : (typeof row.title === 'string' && row.title.length > 0 ? row.title : String(id)),
  };
}

/**
 * 读取单个会话当前处于等待状态的问答请求数量。
 * @param {object} list - 会话列表快照。
 * @param {string} id - 会话 id。
 * @returns {number} 待回答的请求数量。
 */
export function activeQuestionCount(list, id) {
  const view = list?.projectionsBySession?.[id]?.values?.userQuestions;
  return Array.isArray(view?.active) ? view.active.length : 0;
}

/**
 * 展开某一会话当前的待回答请求。
 * @param {object} snapshot - 会话列表快照。
 * @param {string} id - 会话 id。
 * @returns {Array<{key: string, text: string}>} 待回答请求列表。
 */
export function pendingQuestions(snapshot, id) {
  const view = snapshot?.projectionsBySession?.[id]?.values?.userQuestions;
  const active = Array.isArray(view?.active) ? view.active : [];
  return active.map((item) => {
    const first = Array.isArray(item.questions) && item.questions.length > 0 ? item.questions[0] : undefined;
    const text = first && typeof first.question === 'string'
      ? first.question
      : (first && typeof first.header === 'string' ? first.header : '');
    return { key: String(item.callId), text };
  });
}

/**
 * 把坐标限制在视口内，避免拖动或缩放后大肥鱼跑到屏幕外。
 * @param {number} value - 待限制的坐标值，单位：像素。
 * @param {number} max - 该轴允许的最大值，单位：像素。
 * @returns {number} 限制后的坐标值，单位：像素。
 */
export function clampAxis(value, max) {
  if (max <= 0) return 0;
  return Math.min(Math.max(0, value), max);
}

/**
 * 计算大肥鱼的左上角坐标：以指针位置减去按下时的偏移，再约束在视口内。
 * @param {{offsetX: number, offsetY: number}} drag - 按下时记录相对大肥鱼左上角的偏移，单位：像素。
 * @param {{clientX: number, clientY: number}} point - 当前指针位置，单位：像素。
 * @param {{width: number, height: number}} size - 大肥鱼的实际尺寸，单位：像素。
 * @returns {{left: number, top: number}} 视口坐标，单位：像素。
 */
export function spriteTarget(drag, point, size) {
  return {
    left: clampAxis(point.clientX - drag.offsetX, window.innerWidth - size.width),
    top: clampAxis(point.clientY - drag.offsetY, window.innerHeight - size.height),
  };
}

/**
 * 大肥鱼元素的默认尺寸；元素尚未布局或环境不支持时使用。
 * @returns {{width: number, height: number}} 尺寸，单位：像素。
 */
export function defaultSpriteSize() {
  return { width: PET_WIDTH, height: PET_HEIGHT };
}
