#!/usr/bin/env python3
"""把待机动画（“等待”状态那个抱胸打瞌睡的大肥鱼）也纳入与点击回应动画相同的抠像与拼接流程。

输入是 `assets/web/idle.webp` 里现有的 20 帧雪碧图——原始 webm 已不在仓库里，
所以脚本把雪碧图拆回单帧，再按与点击动画相同的规范重新输出：
同一套边缘清理（`build-alpha.py` 的 refine_fringe / clamp_white_edge）、
按角色本体统一取景、单帧 216x227，并写回 `assets/web/idle.webp`。
构建时再由 `scripts/embed-web-assets.mjs` 内联进客户端包。

幂等：输出尺寸与输入一致（216x227），重复运行只会把边缘再清理一遍。

用法：
    python3 scripts/build-idle-sheet.py [--src assets/web/idle.webp] [--out assets/web/idle.webp]

依赖：Python 3、Pillow、numpy、scipy。
"""

import argparse
import importlib.util
import os

import numpy as np
from PIL import Image

# 单帧尺寸，单位：像素；与 src/constants.ts 的 PET_WIDTH / PET_HEIGHT 的 2 倍密度一致。
FRAME_WIDTH = 216
FRAME_HEIGHT = 227
# 帧数，与 src/constants.ts 的 SPRITE_FRAMES 一致。
FRAMES = 20
# 输出 WebP 质量，与点击回应动画一致。
WEBP_QUALITY = 90
# 主体在画布内占用的最大比例。
BODY_FILL = 0.98


def load_alpha():
    """导入同目录下的 build-alpha.py，抠像逻辑与点击回应动画共用一份。

    @returns: 已加载的模块对象。
    """
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'build-alpha.py')
    spec = importlib.util.spec_from_file_location('build_alpha', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def read_frames(source):
    """从待机雪碧图文件里解出每一帧。

    @param source: `assets/web/idle.webp` 的路径。
    @returns: RGBA 帧列表。
    """
    sheet = Image.open(source).convert('RGBA')
    width = sheet.size[0] // FRAMES
    return [np.asarray(sheet.crop((index * width, 0, (index + 1) * width, sheet.size[1]))).copy()
            for index in range(FRAMES)]


def clean_frame(frame, alpha):
    """按点击回应动画同一套规范清理一帧的边缘。

    @param frame: HxWx4 uint8，雪碧图里的一帧。
    @param alpha: build-alpha 模块。
    @returns: HxWx4 uint8，边缘清理后的帧。
    """
    rgb = frame[..., :3].astype(np.float32) / 255.0
    a = frame[..., 3].astype(np.float32) / 255.0
    band = alpha.edge_band(a, alpha.EDGE_OUT_PX)
    fg, new_alpha = alpha.refine_fringe(rgb, a, band)
    new_alpha = alpha.clamp_white_edge(np.where(band[..., None], fg, rgb), new_alpha, band)
    out = np.zeros_like(frame)
    out[..., :3] = (np.clip(np.where(band[..., None], fg, rgb), 0.0, 1.0) * 255.0).round().astype(np.uint8)
    out[..., 3] = (new_alpha * 255.0).round().astype(np.uint8)
    out[out[..., 3] == 0] = 0
    return out


def build_sheet(frames, alpha):
    """整段共用一套取景，把每帧居中放到 216x227 画布上。

    @param frames: RGBA 帧列表。
    @param alpha: build-alpha 模块。
    @returns: 横向 RGBA 雪碧图。
    """
    union = np.zeros(frames[0].shape[:2], dtype=bool)
    for frame in frames:
        union |= frame[..., 3] > alpha.ALPHA_MIN
    ys, xs = np.where(union)
    top, left = int(ys.min()), int(xs.min())
    height = int(ys.max()) - top + 1
    width = int(xs.max()) - left + 1
    scale = min(FRAME_HEIGHT * BODY_FILL / height, FRAME_WIDTH * BODY_FILL / width)
    paste_x = round((FRAME_WIDTH - width * scale) / 2 - left * scale)
    paste_y = round((FRAME_HEIGHT - height * scale) / 2 - top * scale)
    tile_width = max(1, round(frames[0].shape[1] * scale))
    tile_height = max(1, round(frames[0].shape[0] * scale))
    sheet = Image.new('RGBA', (FRAME_WIDTH * len(frames), FRAME_HEIGHT), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        tile = Image.fromarray(frame, 'RGBA').resize((tile_width, tile_height), Image.LANCZOS)
        sheet.alpha_composite(tile, (index * FRAME_WIDTH + paste_x, paste_y))
    return sheet


def write_sheet(sheet, path):
    """把雪碧图写成保留透明通道的 WebP 文件。

    @param sheet: 横向 RGBA 雪碧图。
    @param path: 输出的 WebP 路径。
    @returns: 写入的字节数。
    """
    sheet.save(path, format='WEBP', quality=WEBP_QUALITY, method=6, alpha_quality=100, exact=False)
    return os.path.getsize(path)


def main():
    """解析参数，重建待机雪碧图素材。"""
    parser = argparse.ArgumentParser(description='生成待机动画雪碧图素材')
    parser.add_argument('--src', default='assets/web/idle.webp', help='待机雪碧图 WebP 路径')
    parser.add_argument('--out', default='assets/web/idle.webp', help='输出 WebP 路径')
    args = parser.parse_args()
    alpha = load_alpha()
    frames = [clean_frame(frame, alpha) for frame in read_frames(args.src)]
    size = write_sheet(build_sheet(frames, alpha), args.out)
    print(f'{args.out}: {FRAMES} 帧 {FRAME_WIDTH}x{FRAME_HEIGHT}，{size} 字节')


if __name__ == '__main__':
    main()