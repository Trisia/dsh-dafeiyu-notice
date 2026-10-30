#!/usr/bin/env python3
"""点击回应动画与待机动画共用的雪碧图规格、解码、取景与编码。

两种动画的规格必须完全一致，这里集中定义，避免各写一份慢慢跑偏：

- 单帧 216x228，横向拼接，20~24 帧；
- 取样帧率 12fps（与 `src/constants.ts` 的 80ms/帧 对应）；
- 解码时强制走 libvpx-vp9 解码器（原生 vp9 解码器读不出 alpha）；
- 抠像统一交给 `build-alpha.py`；
- 取景统一：按每帧角色本体（最大连通区域）的 90 分位高度定缩放，按本体并集居中；
- 编码统一为 WebP（quality 90、alpha_quality 100、不保留 RGB 无损）。

用法：被 `build-click-sheets.py` 与 `build-idle-sheet.py` 导入，不单独运行。
依赖：ffmpeg（libvpx-vp9）、Python 3、Pillow、numpy、scipy。
"""

import importlib.util
import io
import os

import numpy as np
from PIL import Image
from scipy import ndimage

# 雪碧图单帧尺寸，单位：像素；src/constants.ts 里 FRAME_WIDTH/FRAME_HEIGHT 同此值，待机与点击共用。
FRAME_WIDTH = 216
FRAME_HEIGHT = 228
# 取样帧率，单位：帧/秒；对应前端 80ms/帧 的播放节奏。
FPS = 12
# 输出 WebP 质量参数。
WEBP_QUALITY = 90
# 主体在画布内占用的最大比例。
BODY_FILL = 0.98
# 取景缩放所依据的角色高度分位：整段共用一个比例，跳跃/趴下的极端帧允许轻微贴边。
HEIGHT_PERCENTILE = 90


def load_alpha():
    """导入同目录下的 build-alpha.py，解码与抠像共用一份实现。

    @returns: 已加载的模块对象。
    """
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'build-alpha.py')
    spec = importlib.util.spec_from_file_location('build_alpha', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def largest_region(mask):
    """取最大连通区域（排除尾鳍、星星、粒子等分离碎块）。

    @param mask: 布尔掩码。
    @returns: 只保留最大连通区域后的布尔掩码。
    """
    labels, count = ndimage.label(mask, structure=np.ones((3, 3)))
    if count == 0:
        return np.zeros_like(mask)
    sizes = ndimage.sum(mask, labels, range(1, count + 1))
    return labels == int(np.argmax(sizes)) + 1


def decode_keyed(source, start, frames, workdir, key, alpha):
    """解码一段素材并完成抠像。

    @param source: webm 文件路径。
    @param start: 起始时间，单位：秒。
    @param frames: 需要的帧数。
    @param workdir: 存放中间 PNG 的临时目录。
    @param key: 动画 id，用于中间文件命名。
    @param alpha: build-alpha 模块。
    @returns: TxHxWx4 uint8，抠像后的帧序列。
    """
    raw = alpha.decode_frames(source, start, frames, FPS, workdir, key)
    return alpha.clean_frames(raw)


def build_sheet(keyed, alpha):
    """按统一规格把抠像后的帧拼成横向雪碧图。

    整段共用一个缩放比例，并让角色本体在画布内居中，播放时不会漂移。

    @param keyed: TxHxWx4 uint8，抠像后的帧序列。
    @param alpha: build-alpha 模块，提供 ALPHA_MIN。
    @returns: 横向 RGBA 雪碧图。
    """
    solid = np.zeros(keyed[..., 3].shape, dtype=bool)
    for index, frame in enumerate(keyed):
        solid[index] = largest_region(frame[..., 3] > alpha.ALPHA_MIN)
    ys, xs = np.where(solid.any(axis=0))
    top, left = int(ys.min()), int(xs.min())
    body_height = int(ys.max()) - top + 1
    body_width = int(xs.max()) - left + 1
    heights = []
    for index in range(len(solid)):
        rows = np.where(solid[index].any(axis=1))[0]
        heights.append(int(rows.max()) - int(rows.min()) + 1)
    typical_height = float(np.percentile(heights, HEIGHT_PERCENTILE))
    scale = min(FRAME_HEIGHT * BODY_FILL / typical_height, FRAME_WIDTH * BODY_FILL / body_width)
    # 素材角色高约 270 像素、画布 228 像素，缩小用 LANCZOS 保留发丝细节。
    scaled_width = max(1, round(keyed.shape[2] * scale))
    scaled_height = max(1, round(keyed.shape[1] * scale))
    paste_x = round((FRAME_WIDTH - body_width * scale) / 2 - left * scale)
    paste_y = round((FRAME_HEIGHT - body_height * scale) / 2 - top * scale)

    sheet = Image.new('RGBA', (FRAME_WIDTH * len(keyed), FRAME_HEIGHT), (0, 0, 0, 0))
    for index, frame in enumerate(keyed):
        tile = Image.fromarray(frame, 'RGBA').resize((scaled_width, scaled_height), Image.LANCZOS)
        sheet.alpha_composite(tile, (index * FRAME_WIDTH + paste_x, paste_y))
    return sheet


def encode_webp(sheet):
    """把雪碧图编码为保留透明通道的 WebP 字节。

    @param sheet: 横向 RGBA 雪碧图。
    @returns: WebP 文件字节。
    """
    buffer = io.BytesIO()
    sheet.save(buffer, format='WEBP', quality=WEBP_QUALITY, method=6,
               alpha_quality=100, exact=False)
    return buffer.getvalue()


def render(source, start, frames, workdir, key, alpha):
    """从素材一路生成到最终 WebP 字节。

    @param source: webm 文件路径。
    @param start: 起始时间，单位：秒。
    @param frames: 需要的帧数。
    @param workdir: 存放中间 PNG 的临时目录。
    @param key: 动画 id，用于中间文件命名。
    @param alpha: build-alpha 模块。
    @returns: (webp 字节, 帧数)。
    """
    keyed = decode_keyed(source, start, frames, workdir, key, alpha)
    return encode_webp(build_sheet(keyed, alpha)), len(keyed)
