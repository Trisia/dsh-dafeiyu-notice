/**
 * 点击回应动画「开心跃动」：24 帧，单帧 216x228。
 *
 * 素材：dsh-pet《点击回应-开心跃动.webm》第 3.5 秒起的 2 秒。
 * 由 scripts/build-click-sheets.py 转为 assets/web/happy.webp，构建时由
 * scripts/embed-web-assets.mjs 内联；素材来源：https://github.com/PC2005-cloud/dsh-pet
 */
import { HAPPY_SHEET_DATA } from '../generated/sheets.js';

export const HAPPY_SHEET = {
  id: 'happy',
  name: '开心跃动',
  sheet: HAPPY_SHEET_DATA,
};
