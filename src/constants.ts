/**
 * 插件内共享的常量。
 */

/** 插件包名，同时用作样式标签的归属标记与音频元素标记。 */
export const PLUGIN = '@cliven/dsh-dafeiyu-notice';

/** 字典命名空间。 */
export const NS = 'taskNotify';

/** 会话运行结束后延迟判定的时间，单位：毫秒，等宿主先刷新待回答问题投影。 */
export const SETTLE_DELAY = 900;

/** 等待宿主会话服务就绪时的重试间隔，单位：毫秒。 */
export const RETRY_DELAY = 1000;

/** 动画单帧宽度，单位：像素；待机与点击回应动画共用，与 scripts/sheet-spec.py 的 FRAME_WIDTH 一致。 */
export const FRAME_WIDTH = 216;

/** 动画单帧高度，单位：像素；待机与点击回应动画共用，与 scripts/sheet-spec.py 的 FRAME_HEIGHT 一致。 */
export const FRAME_HEIGHT = 228;

/** 动画单帧停留时长，单位：毫秒；待机与点击回应动画共用，对应 12fps。 */
export const FRAME_MS = 80;

/** 待机动画包含的帧数；逐帧循环播放。 */
export const SPRITE_FRAMES = 20;

/** 每段点击回应动画包含的帧数；播完即止。 */
export const CLICK_FRAMES = 24;

/** 偏好设置在 localStorage 中的存储键。 */
export const STORAGE_KEY = 'dsh.taskNotify.settings.v1';

/** 大肥鱼位置在 localStorage 中的存储键。 */
export const POS_KEY = 'dsh.taskNotify.spritePos.v1';

/** 大肥鱼缩放比例在 localStorage 中的存储键。 */
export const SCALE_KEY = 'dsh.taskNotify.spriteScale.v1';

/** 大肥鱼首次显示时的默认缩放比例；0.5 即动画规格的一半，之后由用户拖手柄调整。 */
export const DEFAULT_SPRITE_SCALE = 0.5;

/** 大肥鱼允许的最小缩放比例；1 表示与动画规格一致的基准尺寸。 */
export const MIN_SPRITE_SCALE = 0.5;

/** 大肥鱼允许的最大缩放比例；1 表示与动画规格一致的基准尺寸。 */
export const MAX_SPRITE_SCALE = 2;

/** “停止生成”按钮的无障碍文案特征，用于识别用户手动中止（覆盖中英文与其它语言的 Stop）。 */
export const STOP_LABEL = /停止|stop/i;

/** 手动中止标记的有效期，单位：毫秒；超过后视为普通结束。 */
export const ABORT_TTL = 8000;

/** 连按 Esc 判定为停止的最大间隔，单位：毫秒。 */
export const ESC_GAP = 1200;
