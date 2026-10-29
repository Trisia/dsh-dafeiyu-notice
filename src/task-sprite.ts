/**
 * 右下角大肥鱼：任务完成、等待回答或等待确认时出现，逐帧播放雪碧图动画，可拖动，可拖右下角手柄缩放。
 * 点击一次打开队首会话并播放一段随机的点击回应动画；队列点空后自行收起。
 */
import React from 'react';
import {
  CLICK_FRAMES,
  CLICK_FRAME_MS,
  CLICK_HEIGHT,
  CLICK_WIDTH,
  PET_HEIGHT,
  PET_WIDTH,
  SPRITE_FRAME_MS,
  SPRITE_FRAMES,
} from './constants.js';
import { CLICK_SHEETS } from './clips/index.js';
import { clampAxis, clampScale, spriteSize, spriteTarget } from './session-view.js';
import { readSpritePos, readSpriteScale, writeSpritePos, writeSpriteScale } from './storage.js';

const h = React.createElement;

/**
 * 读取大肥鱼元素的实际尺寸；尚未布局或环境不支持时按当前缩放比例退回基准尺寸。
 * @param {HTMLElement} element - 大肥鱼按钮元素。
 * @param {number} scale - 当前缩放比例，1 表示基准尺寸。
 * @returns {{width: number, height: number}} 尺寸，单位：像素。
 */
function elementSize(element, scale) {
  const fallback = spriteSize(scale);
  return {
    width: element.offsetWidth || fallback.width,
    height: element.offsetHeight || fallback.height,
  };
}

/**
 * 右下角大肥鱼：任务完成、等待回答或等待确认时出现，逐帧播放动画，可拖到任意位置，
 * 也可拖右下角手柄缩放；位置与缩放比例都会记住。
 * @param {object} props - 槽位注入的渲染属性与插件注入面。
 * @param {(key: string, params?: object) => string} props.t - 文案取值函数。
 * @param {object} props.useTaskNotifySprite - 大肥鱼状态仓库的读取钩子。
 * @param {() => void} props.activateNext - 打开队首会话并播放点击动画。
 * @param {() => void} props.dismiss - 清空队列并收起大肥鱼。
 * @param {() => void} [props.clickFinished] - 当前这段点击回应动画播完最后一帧时调用。
 * @returns {object|null} 大肥鱼元素；不显示时为 null。
 */
export function TaskSprite({ t, useTaskNotifySprite, activateNext, dismiss, clickFinished }) {
  const sprite = useTaskNotifySprite((value) => value);
  const [frame, setFrame] = React.useState(0);
  const [pos, setPos] = React.useState(readSpritePos);
  const [scale, setScale] = React.useState(readSpriteScale);
  const [dragging, setDragging] = React.useState(false);
  const [resizing, setResizing] = React.useState(false);
  /** 拖动会话：记录按下时的指针偏移与是否已移动。 */
  const drag = React.useRef(undefined);
  /** 缩放会话：记录按下时的指针位置、尺寸与比例，松手后写回 localStorage。 */
  const resize = React.useRef(undefined);
  const playing = sprite.visible === true;
  const size = spriteSize(scale);
  const clicking = sprite.phase === 'click';
  const clickSheet = CLICK_SHEETS[sprite.clickIndex] ?? CLICK_SHEETS[0];

  // 当前已生效的帧相位，取值 'idle' 或 'click'。
  const phase = sprite.phase === 'click' ? 'click' : 'idle';

  // 相位变化时帧号必须在同一轮渲染内归零，否则点击后的首帧会沿用待机动画的当前帧。
  // 在渲染期用 state 追赶上一轮相位：React 会同步重算这次渲染，不会提交过渡帧。
  const [markedPhase, setMarkedPhase] = React.useState(phase);
  if (markedPhase !== phase) {
    setMarkedPhase(phase);
    setFrame(0);
  }

  // 每段新的点击回应（clickSeq 变化）都从第一帧开始；布局阶段重置，避免闪出上一段。
  React.useLayoutEffect(() => {
    setFrame(0);
  }, [sprite.clickSeq]);

  // 按固定节奏推进帧：待机循环播放；点击回应按素材自身的帧数逐帧播完，
  // 停在最后一帧时通知上层，由上层决定回到待机还是收起。
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

  // 点击回应到达最后一帧：本段是否播完只由素材帧数决定，与外部计时无关。
  React.useEffect(() => {
    if (!playing || !clicking || frame < CLICK_FRAMES - 1) return;
    clickFinished?.();
  }, [playing, clicking, frame, clickFinished]);

  // 视口或缩放比例变化后重新收拢坐标，防止大肥鱼停在屏幕外。
  React.useEffect(() => {
    if (!playing) return undefined;
    const keepInside = () => {
      const current = spriteSize(scale);
      setPos((value) => {
        if (!value) return value;
        return {
          left: clampAxis(value.left, window.innerWidth - current.width),
          top: clampAxis(value.top, window.innerHeight - current.height),
        };
      });
    };
    // 恢复上次的缩放后，先按新尺寸收拢一次已保存的位置。
    keepInside();
    window.addEventListener('resize', keepInside);
    return () => window.removeEventListener('resize', keepInside);
  }, [playing, scale]);

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
    setPos(spriteTarget(state, event, elementSize(event.currentTarget, scale)));
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
    const next = spriteTarget(state, event, elementSize(event.currentTarget, scale));
    setPos(next);
    writeSpritePos(next);
  };

  /** 指针被系统取消时只结束拖动，不当作点击。 */
  const onPointerCancel = () => {
    drag.current = undefined;
    setDragging(false);
  };

  /**
   * 开始拖动右下角手柄：记录起始指针、尺寸与位置，用指针捕获保证拖出精灵后仍能继续缩放。
   * @param {PointerEvent} event - 手柄上的指针按下事件。
   */
  const onResizePointerDown = (event) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    const pet = event.currentTarget.closest?.('.dshtn-pet') ?? event.currentTarget.parentElement;
    const rect = pet.getBoundingClientRect();
    resize.current = {
      startX: event.clientX,
      startY: event.clientY,
      startWidth: rect.width || size.width,
      startLeft: rect.left,
      startTop: rect.top,
      startScale: scale,
      nextScale: undefined,
      nextPos: undefined,
    };
    setResizing(true);
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch (error) {
      // 部分环境不支持指针捕获，缩放仍可继续。
    }
  };

  /**
   * 拖动缩放中：宽度跟随指针横向位移，左上角保持不动；放大到视口边缘时收拢坐标。
   * @param {PointerEvent} event - 手柄上的指针移动事件。
   */
  const onResizePointerMove = (event) => {
    const state = resize.current;
    if (!state) return;
    event.stopPropagation();
    const ratio = (state.startWidth + (event.clientX - state.startX)) / state.startWidth;
    const nextScale = clampScale(state.startScale * ratio);
    const nextSize = spriteSize(nextScale);
    const nextPos = {
      left: clampAxis(state.startLeft, window.innerWidth - nextSize.width),
      top: clampAxis(state.startTop, window.innerHeight - nextSize.height),
    };
    state.nextScale = nextScale;
    state.nextPos = nextPos;
    setScale(nextScale);
    setPos(nextPos);
  };

  /**
   * 结束缩放：尺寸没变化就不写存储，否则记住新的比例与位置。
   * @param {PointerEvent} event - 手柄上的指针松开事件。
   */
  const onResizePointerUp = (event) => {
    const state = resize.current;
    resize.current = undefined;
    setResizing(false);
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch (error) {
      // 指针未捕获时释放会抛错，忽略即可。
    }
    if (!state || state.nextScale === undefined) return;
    writeSpriteScale(state.nextScale);
    writeSpritePos(state.nextPos);
  };

  /** 指针被系统取消时结束缩放，不写存储。 */
  const onResizePointerCancel = () => {
    resize.current = undefined;
    setResizing(false);
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
      'data-resizing': resizing ? 'true' : 'false',
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
        style: { width: `${size.width}px`, height: `${size.height}px` },
        onKeyDown,
        // 鼠标/触摸的点击已由 pointerup 处理；这里只接读屏软件合成的 click。
        onClick: (event) => {
          if (event.detail === 0) activateNext();
        },
      },
      h('div', {
        className: 'dshtn-pet-img',
        'aria-hidden': true,
        style: {
          backgroundSize: `${PET_WIDTH * SPRITE_FRAMES * scale}px ${PET_HEIGHT * scale}px`,
          backgroundPosition: `${-(frame % SPRITE_FRAMES) * PET_WIDTH * scale}px 0`,
        },
      }),
      h('div', {
        className: 'dshtn-pet-click',
        'aria-hidden': true,
        style: {
          backgroundImage: `url(${clickSheet.sheet})`,
          backgroundSize: `${CLICK_WIDTH * CLICK_FRAMES * scale}px ${CLICK_HEIGHT * scale}px`,
          backgroundPosition: `${-(frame % CLICK_FRAMES) * CLICK_WIDTH * scale}px 0`,
        },
      }),
    ),
    h('span', {
      className: 'dshtn-pet-resize',
      'aria-hidden': 'true',
      title: t('sprite.resize'),
      onPointerDown: onResizePointerDown,
      onPointerMove: onResizePointerMove,
      onPointerUp: onResizePointerUp,
      onPointerCancel: onResizePointerCancel,
    }),
  );
}
