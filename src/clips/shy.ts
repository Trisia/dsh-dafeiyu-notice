/**
 * 点击回应动画「害羞惊讶」：24 帧，单帧 216x228。
 *
 * 素材：dsh-pet《点击回应-害羞惊讶.webm》第 4.75 秒起的 2 秒。
 * 由 scripts/build-click-sheets.py 转为 assets/web/shy.webp，构建时由
 * scripts/embed-web-assets.mjs 内联；素材来源：https://github.com/PC2005-cloud/dsh-pet
 */
import { SHY_SHEET_DATA } from '../generated/sheets.js';

export const SHY_SHEET = {
  id: 'shy',
  name: '害羞惊讶',
  sheet: SHY_SHEET_DATA,
};
