/**
 * 把 assets/web/*.webp 内联成 data URL 模块，供客户端包在构建时导入。
 *
 * 客户端包只经宿主的 `/plugins/<id>/client.js` 路由提供，资源目录不对外，
 * 因此雪碧图必须以 data URL 形式打进 bundle。`assets/web/` 里的 webp 是唯一
 * 事实来源，本脚本在每次 build / typecheck 前重新生成 `src/generated/sheets.ts`
 * （该文件不入库，见 .gitignore）。
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';

/** 点击回应动画 id，顺序与 src/clips/index.ts 的随机池一致。 */
const CLIP_IDS = [
  'wave',
  'happy',
  'shy',
  'tickle',
  'angry',
  'scared',
  'meet',
  'wake',
  'tumble',
];

/**
 * 把动画 id 转成数据常量名，例如 wave -> WAVE_SHEET_DATA。
 *
 * @param {string} id - 动画 id，也对应 assets/web/<id>.webp。
 * @returns {string} 导出的常量名。
 */
function dataName(id) {
  return `${id.toUpperCase()}_SHEET_DATA`;
}

/**
 * 读取单个 webp 并编码成 data URL。
 *
 * @param {string} id - 素材 id；`idle` 表示待机雪碧图。
 * @returns {string} `data:image/webp;base64,...` 形式的字符串。
 */
function loadDataUrl(id) {
  const path = new URL(`../assets/web/${id}.webp`, import.meta.url);
  let bytes;
  try {
    bytes = readFileSync(path);
  } catch {
    throw new Error(`缺少素材 assets/web/${id}.webp，请先运行对应的素材转换脚本`);
  }
  return `data:image/webp;base64,${bytes.toString('base64')}`;
}

/** 生成模块源码；每个常量一行，避免生成物出现空白抖动。 */
const lines = [
  '/**',
  ' * 内联的 webp 素材（由 scripts/embed-web-assets.mjs 从 assets/web/*.webp 生成，请勿手改）。',
  ' * 该文件不入库，每次 build / typecheck 前重新生成。',
  ' */',
  '',
  `export const IDLE_SHEET = '${loadDataUrl('idle')}';`,
  '',
];

for (const id of CLIP_IDS) {
  lines.push(`export const ${dataName(id)} = '${loadDataUrl(id)}';`);
  lines.push('');
}

const output = new URL('../src/generated/sheets.ts', import.meta.url);
mkdirSync(new URL('../src/generated/', import.meta.url), { recursive: true });
writeFileSync(output, lines.join('\n'));
console.log(`embedded ${CLIP_IDS.length + 1} webp assets -> src/generated/sheets.ts`);