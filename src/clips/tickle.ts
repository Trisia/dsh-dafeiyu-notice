/**
 * 点击回应动画「挠痒咯咯笑」：24 帧，单帧 216x228。
 *
 * 素材：dsh-pet《点击回应-挠痒咯咯笑.webm》第 6.5 秒起的 2 秒。
 * 由 scripts/build-click-sheets.py 转为 assets/web/tickle.webp，构建时由
 * scripts/embed-web-assets.mjs 内联；素材来源：https://github.com/PC2005-cloud/dsh-pet
 */
import { TICKLE_SHEET_DATA } from '../generated/sheets.js';

export const TICKLE_SHEET = {
  id: 'tickle',
  name: '挠痒咯咯笑',
  sheet: TICKLE_SHEET_DATA,
};
