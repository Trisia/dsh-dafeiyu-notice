/**
 * 点击回应动画「原地左转奔跑」：24 帧，单帧 216x228。
 *
 * 素材：dsh-pet《原地左转奔跑.webm》第 2.0 秒起的 2 秒。
 * 由 scripts/build-click-sheets.py 转为 assets/web/tumble.webp，构建时由
 * scripts/embed-web-assets.mjs 内联；素材来源：https://github.com/PC2005-cloud/dsh-pet
 */
import { TUMBLE_SHEET_DATA } from '../generated/sheets.js';

export const TUMBLE_SHEET = {
  id: 'tumble',
  name: '原地左转奔跑',
  sheet: TUMBLE_SHEET_DATA,
};
