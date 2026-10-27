/**
 * 右下角小精灵：任务完成时出现，逐帧播放雪碧图动画，可拖动，点击后隐藏。
 */
import React from 'react';
import { PET_HEIGHT, PET_WIDTH, SPRITE_FRAME_MS, SPRITE_FRAMES } from './constants.js';
import { clampAxis, defaultSpriteSize, spriteTarget } from './session-view.js';
import { readSpritePos, writeSpritePos } from './storage.js';

const h = React.createElement;

/**
 * 读取精灵元素的实际尺寸；尚未布局或环境不支持时退回默认尺寸。
 * @param {HTMLElement} element - 精灵按钮元素。
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
 * 右下角小精灵：任务完成时出现，逐帧播放动画，可拖到任意位置，点击后自行隐藏。
 *
 * `useSessionsList` 是宿主渲染器附加的装饰钩子；在渲染期调用它，
 * 返回值不参与渲染，插件据此拿到会话语义列表。
 * @param {object} props - 槽位注入的渲染属性与插件注入面。
 * @returns {object|null} 精灵元素；不显示时为 null。
 */
export function TaskSprite({ useSessionsList, useTaskNotifySprite, hideSprite }) {
  if (typeof useSessionsList === 'function') useSessionsList();
  const sprite = useTaskNotifySprite((value) => value);
  const [frame, setFrame] = React.useState(0);
  const [pos, setPos] = React.useState(readSpritePos);
  const [dragging, setDragging] = React.useState(false);
  /** 拖动会话：记录按下时的指针偏移与是否已移动。 */
  const drag = React.useRef(undefined);
  const playing = sprite.visible === true;

  // 按固定节奏推进帧，播到最后一帧后回到开头循环。
  React.useEffect(() => {
    if (!playing) return undefined;
    const timer = window.setInterval(() => {
      setFrame((current) => (current + 1) % SPRITE_FRAMES);
    }, SPRITE_FRAME_MS);
    return () => window.clearInterval(timer);
  }, [playing]);

  // 视口尺寸变化后重新收拢坐标，防止精灵停在屏幕外。
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
   * 开始拖动：记录指针相对精灵左上角的偏移。
   * @param {PointerEvent} event - 指针按下事件。
   */
  const onPointerDown = (event) => {
    if (event.button !== 0) return;
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
   * 结束拖动：拖动过就记住位置，没拖动则视为点击并隐藏精灵。
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
      hideSprite();
      return;
    }
    // 与拖动过程中同一算式，松手后不会出现小幅跳动。
    const next = spriteTarget(state, event, elementSize(event.currentTarget));
    setPos(next);
    writeSpritePos(next);
  };

  return h(
    'button',
    {
      type: 'button',
      className: 'dshtn-pet',
      'data-sprite': 'jingyu-weiba',
      'data-dragging': dragging ? 'true' : 'false',
      'data-placed': pos ? 'true' : 'false',
      style: pos ? { left: `${pos.left}px`, top: `${pos.top}px` } : undefined,
      'aria-label': sprite.title,
      title: sprite.title,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    },
    h(
      'span',
      { className: 'dshtn-pet-bubble' },
      sprite.title,
      sprite.sessionLabel
        ? h('span', { className: 'dshtn-pet-who', title: sprite.sessionLabel }, sprite.sessionLabel)
        : null,
    ),
    h('div', {
      className: 'dshtn-pet-img',
      'aria-label': '',
      role: 'img',
      style: { backgroundPosition: `${-frame * PET_WIDTH}px 0` },
    }),
  );
}
