/**
 * 点击回应动画「傲娇生气」：24 帧，单帧 216x228。
 *
 * 素材：dsh-pet《点击回应-傲娇生气.webm》第 2.5 秒起的 2 秒。
 * 由 scripts/build-click-sheets.py 转为 assets/web/angry.webp，构建时由
 * scripts/embed-web-assets.mjs 内联；素材来源：https://github.com/PC2005-cloud/dsh-pet
 */
import { ANGRY_SHEET_DATA } from '../generated/sheets.js';

export const ANGRY_SHEET = {
  id: 'angry',
  name: '傲娇生气',
  sheet: ANGRY_SHEET_DATA,
};
