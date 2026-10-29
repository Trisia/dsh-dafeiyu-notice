/**
 * 点击回应动画「惊醒」：24 帧，单帧 216x228。
 *
 * 素材：dsh-pet《打瞌睡被惊醒.webm》第 2.3 秒起的 2 秒。
 * 由 scripts/build-click-sheets.py 转为 assets/web/wake.webp，构建时由
 * scripts/embed-web-assets.mjs 内联；素材来源：https://github.com/PC2005-cloud/dsh-pet
 */
import { WAKE_SHEET_DATA } from '../generated/sheets.js';

export const WAKE_SHEET = {
  id: 'wake',
  name: '惊醒',
  sheet: WAKE_SHEET_DATA,
};
