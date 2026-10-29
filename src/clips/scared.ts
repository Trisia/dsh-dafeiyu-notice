/**
 * 点击回应动画「被吓一跳」：24 帧，单帧 216x228。
 *
 * 素材：dsh-pet《被吓一跳.webm》第 1.4 秒起的 2 秒。
 * 由 scripts/build-click-sheets.py 转为 assets/web/scared.webp，构建时由
 * scripts/embed-web-assets.mjs 内联；素材来源：https://github.com/PC2005-cloud/dsh-pet
 */
import { SCARED_SHEET_DATA } from '../generated/sheets.js';

export const SCARED_SHEET = {
  id: 'scared',
  name: '被吓一跳',
  sheet: SCARED_SHEET_DATA,
};
