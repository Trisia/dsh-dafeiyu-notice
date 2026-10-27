/**
 * 右下角大肥鱼：任务完成、等待回答或等待确认时出现，逐帧播放雪碧图动画，可拖动。
 * 点击一次打开队首会话并播放一段随机的点击回应动画；队列点空后自行收起。
 */
import React from 'react';
import { CLICK_FRAMES, CLICK_FRAME_MS, PET_HEIGHT, PET_WIDTH, SPRITE_FRAME_MS, SPRITE_FRAMES } from './constants.js';
import { CLICK_SHEETS } from './click-sheets.js';
import { clampAxis, defaultSpriteSize, spriteTarget } from './session-view.js';
import { readSpritePos, writeSpritePos } from './storage.js';

const h = React.createElement;

/**
 * 读取大肥鱼元素的实际尺寸；尚未布局或环境不支持时退回默认尺寸。
 * @param {HTMLElement} element - 大肥鱼按钮元素。
 * @returns {{width: number, height: number}} 尺寸，单位：像素。
 */
function elementSize(element) {
  const fallback = defaultSpriteSize();
  return {
    width: element.offsetWidth || fallback.width,
    height: element.offsetHeight || fallback.height,
  };
}

/**
 * 右下角大肥鱼：任务完成、等待回答或等待确认时出现，逐帧播放动画，可拖到任意位置。
 * @param {object} props - 槽位注入的渲染属性与插件注入面。
 * @param {(key: string, params?: object) => string} props.t - 文案取值函数。
 * @param {object} props.useTaskNotifySprite - 大肥鱼状态仓库的读取钩子。
 * @param {() => void} props.activateNext - 打开队首会话并播放点击动画。
 * @param {() => void} props.dismiss - 清空队列并收起大肥鱼。
 * @returns {object|null} 大肥鱼元素；不显示时为 null。
 */
export function TaskSprite({ t, useTaskNotifySprite, activateNext, dismiss }) {
  const sprite = useTaskNotifySprite((value) => value);
  const [frame, setFrame] = React.useState(0);
  const [pos, setPos] = React.useState(readSpritePos);
  const [dragging, setDragging] = React.useState(false);
  /** 拖动会话：记录按下时的指针偏移与是否已移动。 */
  const drag = React.useRef(undefined);
  const playing = sprite.visible === true;
  const clicking = sprite.phase === 'click';
  const clickSheet = CLICK_SHEETS[sprite.clickIndex] ?? CLICK_SHEETS[0];

  // 每次进入新动画（待机或点击回应）都从第一帧开始；布局阶段重置，避免闪出上一帧。
  React.useLayoutEffect(() => {
    setFrame(0);
  }, [playing, sprite.phase, sprite.clickSeq]);

  // 按固定节奏推进帧：待机循环播放，点击回应播到最后一帧后停住。
  React.useEffect(() => {
    if (!playing) return undefined;
    const timer = window.setInterval(() => {
      setFrame((current) => {
        if (!clicking) return (current + 1) % SPRITE_FRAMES;
        return current + 1 >= CLICK_FRAMES ? CLICK_FRAMES - 1 : current + 1;
      });
    }, clicking ? CLICK_FRAME_MS : SPRITE_FRAME_MS);
    return () => window.clearInterval(timer);
  }, [playing, clicking]);

  // 视口尺寸变化后重新收拢坐标，防止大肥鱼停在屏幕外。
  React.useEffect(() => {
    if (!playing) return undefined;
    const keepInside = () => {
      setPos((current) => {
        if (!current) return current;
        return {
          left: clampAxis(current.left, window.innerWidth - PET_WIDTH),
          top: clampAxis(current.top, window.innerHeight - PET_HEIGHT),
        };
      });
    };
    window.addEventListener('resize', keepInside);
    return () => window.removeEventListener('resize', keepInside);
  }, [playing]);

  if (!playing) return null;

  /**
   * 开始拖动：记录指针相对大肥鱼左上角的偏移。
   * @param {PointerEvent} event - 指针按下事件。
   */
  const onPointerDown = (event) => {
    if (event.button !== 0) return;
    if (event.target.closest?.('.dshtn-pet-close')) return;
    const rect = event.currentTarget.getBoundingClientRect();
    drag.current = {
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch (error) {
      // 部分环境不支持指针捕获，拖拽仍可继续。
    }
  };

  /**
   * 拖动中：超过 4 像素才算拖动，避免手抖把点击误判成拖拽。
   * @param {PointerEvent} event - 指针移动事件。
   */
  const onPointerMove = (event) => {
    const state = drag.current;
    if (!state) return;
    if (!state.moved
      && Math.abs(event.clientX - state.startX) < 4
      && Math.abs(event.clientY - state.startY) < 4) return;
    state.moved = true;
    setDragging(true);
    setPos(spriteTarget(state, event, elementSize(event.currentTarget)));
  };

  /**
   * 结束拖动：拖动过就记住位置；没拖动则视为点击，打开队首会话。
   * @param {PointerEvent} event - 指针松开事件。
   */
  const onPointerUp = (event) => {
    const state = drag.current;
    drag.current = undefined;
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch (error) {
      // 指针未捕获时释放会抛错，忽略即可。
    }
    if (!state) return;
    setDragging(false);
    if (!state.moved) {
      activateNext();
      return;
    }
    // 与拖动过程中同一算式，松手后不会出现小幅跳动。
    const next = spriteTarget(state, event, elementSize(event.currentTarget));
    setPos(next);
    writeSpritePos(next);
  };

  /** 指针被系统取消时只结束拖动，不当作点击。 */
  const onPointerCancel = () => {
    drag.current = undefined;
    setDragging(false);
  };

  /**
   * 键盘激活：Enter / 空格等价于点击大肥鱼。
   * @param {KeyboardEvent} event - 键盘事件。
   */
  const onKeyDown = (event) => {
    if (event.target !== event.currentTarget) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    activateNext();
  };

  const label = sprite.sessionLabel;
  return h(
    'div',
    {
      className: 'dshtn-pet',
      'data-sprite': 'jingyu-weiba',
      'data-phase': clicking ? 'click' : 'idle',
      'data-kind': sprite.kind,
      'data-dragging': dragging ? 'true' : 'false',
      'data-placed': pos ? 'true' : 'false',
      style: pos ? { left: `${pos.left}px`, top: `${pos.top}px` } : undefined,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
    },
    h(
      'span',
      { className: 'dshtn-pet-bubble' },
      h(
        'button',
        {
          type: 'button',
          className: 'dshtn-pet-close',
          'aria-label': t('sprite.dismiss'),
          title: t('sprite.dismiss'),
          onPointerDown: (event) => event.stopPropagation(),
          onClick: (event) => {
            event.stopPropagation();
            dismiss();
          },
        },
        '×',
      ),
      h('span', { className: 'dshtn-pet-title' }, sprite.title),
      label
        ? h('span', { className: 'dshtn-pet-who', title: label }, label)
        : null,
      sprite.queue.length > 1
        ? h('span', { className: 'dshtn-pet-more' }, t('sprite.more', { count: sprite.queue.length - 1 }))
        : null,
    ),
    h(
      'div',
      {
        role: 'button',
        tabIndex: 0,
        className: 'dshtn-pet-canvas',
        'aria-label': label ? `${sprite.title}：${label}` : sprite.title,
        title: label ? `${sprite.title}（${label}）` : sprite.title,
        onKeyDown,
        // 鼠标/触摸的点击已由 pointerup 处理；这里只接读屏软件合成的 click。
        onClick: (event) => {
          if (event.detail === 0) activateNext();
        },
      },
      h('div', {
        className: 'dshtn-pet-img',
        'aria-hidden': true,
        style: { backgroundPosition: `${-(frame % SPRITE_FRAMES) * PET_WIDTH}px 0` },
      }),
      h('div', {
        className: 'dshtn-pet-click',
        'aria-hidden': true,
        style: {
          backgroundImage: `url(${clickSheet.sheet})`,
          backgroundSize: `${PET_WIDTH * CLICK_FRAMES}px ${PET_HEIGHT}px`,
          backgroundPosition: `${-(frame % CLICK_FRAMES) * PET_WIDTH}px 0`,
        },
      }),
    ),
  );
}
