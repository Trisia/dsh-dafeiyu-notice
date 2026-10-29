/**
 * 点击回应动画索引：每段动画独立一个模块，新增动作只需放入 assets/web/<id>.webp、
 * 新增同名模块并在这里登记。顺序即随机池顺序。
 */
import { WAVE_SHEET } from './wave.js';
import { HAPPY_SHEET } from './happy.js';
import { SHY_SHEET } from './shy.js';
import { TICKLE_SHEET } from './tickle.js';
import { ANGRY_SHEET } from './angry.js';
import { SCARED_SHEET } from './scared.js';
import { MEET_SHEET } from './meet.js';
import { WAKE_SHEET } from './wake.js';
import { TUMBLE_SHEET } from './tumble.js';

/** @type {Array<{id: string, name: string, sheet: string}>} */
export const CLICK_SHEETS = [
  WAVE_SHEET,
  HAPPY_SHEET,
  SHY_SHEET,
  TICKLE_SHEET,
  ANGRY_SHEET,
  SCARED_SHEET,
  MEET_SHEET,
  WAKE_SHEET,
  TUMBLE_SHEET,
];
