#!/usr/bin/env python3
"""抠像效果的本地对比工具：同一帧分别画在深色和浅色背景上，检查杂边与发丝。

用法：
    python3 scripts/key-preview.py --src .devcache/webm/点击回应-元气挥手.webm --at 3.4
"""

import argparse
import importlib.util
import os
import sys
import tempfile

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('build_alpha', os.path.join(HERE, 'build-alpha.py'))
build_alpha = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build_alpha)

# 对比用的背景色：深色主题与浅色主题，取值 0-255。
BACKGROUNDS = [(18, 20, 26), (246, 247, 250)]


def compose(frame, color):
    """把一帧画在纯色背景上。

    @param frame: HxWx4 uint8，RGBA 帧。
    @param color: 三元素元组，背景色，取值 0-255。
    @returns: PIL.Image 的 RGB 图像。
    """
    canvas = Image.new('RGBA', (frame.shape[1], frame.shape[0]), color + (255,))
    canvas.alpha_composite(Image.fromarray(frame, 'RGBA'))
    return canvas.convert('RGB')


def build_sheet(raw, keyed, zoom):
    """拼出「原始 / 抠像」×「深色 / 浅色」的对比图。

    @param raw: 原始帧序列。
    @param keyed: 抠像后的帧序列。
    @param zoom: 放大倍数，1 表示原尺寸。
    @returns: PIL.Image 的 RGB 对比图。
    """
    rows = []
    for stack in (raw, keyed):
        rows += [[compose(frame, color) for frame in stack] for color in BACKGROUNDS]
    width, height = rows[0][0].size
    sheet = Image.new('RGB', (width * len(rows[0]), height * len(rows)), (128, 128, 128))
    for r, row in enumerate(rows):
        for c, tile in enumerate(row):
            sheet.paste(tile, (c * width, r * height))
    if zoom > 1:
        sheet = sheet.resize((sheet.width * zoom, sheet.height * zoom), Image.NEAREST)
    return sheet


def main():
    """解析参数，输出原始与抠像后的深/浅色背景对比图。"""
    parser = argparse.ArgumentParser(description='抠像效果对比')
    parser.add_argument('--src', required=True, help='webm 文件路径')
    parser.add_argument('--at', type=float, default=3.0, help='取样时间，单位：秒')
    parser.add_argument('--count', type=int, default=3, help='取样帧数')
    parser.add_argument('--box', default='', help='裁剪框 x0,y0,x1,y1，单位：像素')
    parser.add_argument('--zoom', type=int, default=1, help='放大倍数')
    parser.add_argument('--out', default='.devcache/insp/key-compare.png', help='输出路径')
    args = parser.parse_args()

    with tempfile.TemporaryDirectory(prefix='key-preview-') as workdir:
        raw = build_alpha.decode_frames(args.src, args.at, args.count, 4, workdir, 'preview')
        keyed = build_alpha.clean_frames(raw)

    if args.box:
        x0, y0, x1, y1 = (int(value) for value in args.box.split(','))
        raw = raw[:, y0:y1, x0:x1]
        keyed = keyed[:, y0:y1, x0:x1]

    sheet = build_sheet(raw, keyed, args.zoom)
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    sheet.save(args.out)
    print(args.out)


if __name__ == '__main__':
    main()
