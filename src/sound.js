/**
 * 提示音：优先播放插件自带的钉钉音频，被自动播放策略拦截时退回 WebAudio 合成音。
 */

/**
 * 解析插件自带提示音文件的绝对地址。
 *
 * 客户端包经宿主路由以 `/plugins/<id>/client.js` 提供，资源与它同目录；
 * 其它加载场景下按页面基准地址解析。两者都无法解析时返回空串，
 * 由 {@link ring} 退回合成音。
 * @returns {string} 音频文件地址，无法解析时为空串。
 */
export function resolveSoundUrl() {
  try {
    const base = document.baseURI;
    const dir = base.includes('/plugins/') ? base.slice(0, base.lastIndexOf('/') + 1) : base;
    return new URL('assets/dingtalk.mp3', dir).toString();
  } catch (error) {
    return '';
  }
}

/**
 * 用 WebAudio 合成钉钉的提示音（两段上行的三和弦琶音）。
 *
 * 不加载任何外部文件，页面获得用户手势后即可直接发声。
 * @param {AudioContext} audio - 已恢复运行的音频上下文。
 * @returns {Promise<void>} 调度结束后兑现。
 */
async function playDingTone(audio) {
  const chords = [
    { at: 0, notes: [880, 1174.66, 1479.98] },
    { at: 0.16, notes: [1318.51, 1760, 2217.46] },
  ];
  const master = audio.createGain();
  master.gain.value = 0.22;
  master.connect(audio.destination);
  for (const chord of chords) {
    for (const frequency of chord.notes) {
      const oscillator = audio.createOscillator();
      const envelope = audio.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      const start = audio.currentTime + chord.at;
      envelope.gain.setValueAtTime(0.0001, start);
      envelope.gain.exponentialRampToValueAtTime(0.9, start + 0.012);
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + 0.45);
      oscillator.connect(envelope);
      envelope.connect(master);
      oscillator.start(start);
      oscillator.stop(start + 0.5);
    }
  }
  await new Promise((resolve) => window.setTimeout(resolve, 700));
  master.disconnect();
}

/**
 * 播放三段下降的提示音，用于“等待回答/确认”，与完成提示区分。
 * @param {AudioContext} audio - 已恢复运行的音频上下文。
 * @returns {Promise<void>} 调度结束后兑现。
 */
async function playQuestionTone(audio) {
  const notes = [
    { at: 0, frequency: 987.77 },
    { at: 0.13, frequency: 783.99 },
    { at: 0.26, frequency: 1046.5 },
  ];
  const master = audio.createGain();
  master.gain.value = 0.2;
  master.connect(audio.destination);
  for (const note of notes) {
    const oscillator = audio.createOscillator();
    const envelope = audio.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.value = note.frequency;
    const start = audio.currentTime + note.at;
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(0.9, start + 0.01);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + 0.32);
    oscillator.connect(envelope);
    envelope.connect(master);
    oscillator.start(start);
    oscillator.stop(start + 0.34);
  }
  await new Promise((resolve) => window.setTimeout(resolve, 620));
  master.disconnect();
}

/**
 * 找到页面中挂载的提示音播放元素。
 * @returns {HTMLAudioElement|undefined} 播放元素，未挂载时返回 undefined。
 */
function findAudioElement() {
  return typeof document === 'undefined' ? undefined : document.querySelector('audio[data-dshtn-player]');
}

/**
 * 播放一次提示音。
 *
 * 优先播放内嵌的音频文件（钉钉原生提示音）；被浏览器自动播放策略拦截时，
 * 退回 WebAudio 即时合成，保证页面获得手势后一定能听到提示。
 * @param {boolean} isQuestion - 是否为“等待回答/确认”类提示。
 * @returns {Promise<void>} 播放尝试结束后兑现。
 */
export async function ring(isQuestion) {
  const element = findAudioElement();
  if (element) {
    try {
      element.currentTime = 0;
      await element.play();
      return;
    } catch (error) {
      // 自动播放被拦截，继续用合成音兜底。
    }
  }
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return;
  const audio = new Ctor();
  try {
    if (audio.state === 'suspended') await audio.resume();
    if (audio.state !== 'running') return;
    if (isQuestion) await playQuestionTone(audio);
    else await playDingTone(audio);
  } catch (error) {
    // 音频不可用时静默失败，视觉提示仍然生效。
  } finally {
    if (typeof audio.close === 'function') audio.close().catch(() => {});
  }
}
