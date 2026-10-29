/**
 * 点击回应动画「元气挥手」：24 帧，单帧 216x228。
 *
 * 素材：dsh-pet《点击回应-元气挥手.webm》第 3.0 秒起的 2 秒。
 * 由 scripts/build-click-sheets.py 转为 assets/web/wave.webp，构建时由
 * scripts/embed-web-assets.mjs 内联；素材来源：https://github.com/PC2005-cloud/dsh-pet
 */
import { WAVE_SHEET_DATA } from '../generated/sheets.js';

export const WAVE_SHEET = {
  id: 'wave',
  name: '元气挥手',
  sheet: WAVE_SHEET_DATA,
};
