/**
 * 把 assets/dingtalk.mp3 内嵌成 data URL 模块。
 *
 * 客户端包只经宿主的 `/plugins/<id>/client.js` 路由提供，资源目录不对外，
 * 因此音频必须以模块形式打进 bundle；这里在构建前由原始 mp3 重新生成，
 * 保证 `assets/dingtalk.mp3` 仍是唯一事实来源。
 */
import { readFileSync, writeFileSync } from 'node:fs';

const source = readFileSync(new URL('../assets/dingtalk.mp3', import.meta.url));
const output = new URL('../src/dingtalk-audio.js', import.meta.url);
const base64 = source.toString('base64');

writeFileSync(output, `/**
 * 钉钉提示音（由 scripts/embed-audio.mjs 从 assets/dingtalk.mp3 生成，请勿手改）。
 */
export const DINGTALK_AUDIO = 'data:audio/mpeg;base64,${base64}';
`);
console.log(`embedded assets/dingtalk.mp3 (${source.byteLength} bytes) -> src/dingtalk-audio.js`);