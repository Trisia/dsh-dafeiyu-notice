/**
 * 点击回应动画「头顶开光」：24 帧，单帧 216x228。
 *
 * 素材：dsh-pet《原地跳跃抓碎头顶物品.webm》第 5.4 秒起的 2 秒。
 * 由 scripts/build-click-sheets.py 转为 assets/web/meet.webp，构建时由
 * scripts/embed-web-assets.mjs 内联；素材来源：https://github.com/PC2005-cloud/dsh-pet
 */
import { MEET_SHEET_DATA } from '../generated/sheets.js';

export const MEET_SHEET = {
  id: 'meet',
  name: '头顶开光',
  sheet: MEET_SHEET_DATA,
};
