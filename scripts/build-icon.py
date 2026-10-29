#!/usr/bin/env python3
"""从待机雪碧图截取大肥鱼头像，生成插件图标 `icon.svg`。

宿主把插件的 `./icon` 导出当作图片渲染，图标因此按“竖向头像”设计：
蓝色圆角底板上放大肥鱼的头肩特写，胸前的鲸鱼围裙露在画面下缘，
缩到 48px 时仍能看清发色、脸和围裙，而不是一整只看不清五官的小人。

处理流程：

1. 从 `assets/web/idle.webp` 解出待机雪碧图的第 0 帧（216x227，2 倍图）；
2. 裁掉四周空白，只保留头部到胸口的一段；
3. 按固定宽度缩放后贴到 64x64 的圆角底板上，超出底板的部分由 clipPath 裁掉；
4. PNG 以 base64 内联进 SVG，写出 `icon.svg`（低于宿主 256 KiB 的图标上限）。

依赖：Python 3、Pillow。

用法：
    python3 scripts/build-icon.py [--out icon.svg]
"""

import argparse
import base64
import io
import os

from PIL import Image

# 待机雪碧图的帧数与单帧尺寸，单位：像素；与 src/constants.ts 保持一致。
SHEET_FRAMES = 20
# 使用的帧下标：第 0 帧是正面待机表情，也是提醒出现时用户看到的样子。
FRAME_INDEX = 0
# 裁切范围（左、上、右、下），单位：像素，相对单帧；保留头部到胸口。
CROP_BOX = (0, 0, 216, 200)
# 输出的 SVG 画布边长，单位：像素。
CANVAS = 64
# 底板圆角半径，单位：像素。
CORNER_RADIUS = 14
# 头像在画布内的宽度，单位：像素；大于画布宽度，左右两侧由圆角底板裁掉。
ART_WIDTH = 80
# 底板渐变：上方浅海蓝、下方深海蓝。
BG_TOP = '#a8cfef'
BG_BOTTOM = '#4b82bd'
# 宿主允许的图标文件上限，单位：字节。
MAX_ICON_BYTES = 256 * 1024


def sheet_frame(path):
    """读取待机雪碧图并返回指定帧。

    @param path: `assets/web/idle.webp` 的路径。
    @returns: 第 {@link FRAME_INDEX} 帧的 RGBA 图像。
    """
    sheet = Image.open(path).convert('RGBA')
    frame_width = sheet.width // SHEET_FRAMES
    left = FRAME_INDEX * frame_width
    return sheet.crop((left, 0, left + frame_width, sheet.height))


def art_data_url(frame):
    """裁出图标用的头肩特写并编码成 PNG data URL。

    @param frame: 待机雪碧图的单帧图像。
    @returns: (data URL 字符串, 图片宽度, 图片高度)，尺寸单位：像素。
    """
    art = frame.crop(CROP_BOX)
    buffer = io.BytesIO()
    art.save(buffer, 'PNG', optimize=True)
    encoded = base64.b64encode(buffer.getvalue()).decode('ascii')
    return f'data:image/png;base64,{encoded}', art.width, art.height


def render_svg(data_url, width, height):
    """把头像贴到圆角底板上，拼出 64x64 的 SVG。

    @param data_url: 头像的 PNG data URL。
    @param width: 头像原始宽度，单位：像素，用于保持宽高比。
    @param height: 头像原始高度，单位：像素，用于保持宽高比。
    @returns: SVG 文本。
    """
    art_width = ART_WIDTH
    art_height = art_width * height / width
    # 水平居中、底边与画布底边对齐，胸口正好被圆角底板裁掉。
    x = (CANVAS - art_width) / 2
    y = CANVAS - art_height
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {CANVAS} {CANVAS}" '
        f'width="{CANVAS}" height="{CANVAS}">\n'
        f'  <defs>\n'
        f'    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">\n'
        f'      <stop offset="0" stop-color="{BG_TOP}"/>\n'
        f'      <stop offset="1" stop-color="{BG_BOTTOM}"/>\n'
        f'    </linearGradient>\n'
        f'    <clipPath id="frame">\n'
        f'      <rect width="{CANVAS}" height="{CANVAS}" rx="{CORNER_RADIUS}"/>\n'
        f'    </clipPath>\n'
        f'  </defs>\n'
        f'  <rect width="{CANVAS}" height="{CANVAS}" rx="{CORNER_RADIUS}" fill="url(#bg)"/>\n'
        f'  <image x="{x:.2f}" y="{y:.2f}" width="{art_width:.2f}" height="{art_height:.2f}" '
        f'clip-path="url(#frame)" href="{data_url}"/>\n'
        f'</svg>\n'
    )


def main():
    """解析命令行参数并生成图标文件。

    @returns: 无返回值；图标超过宿主上限时抛出 SystemExit。
    """
    parser = argparse.ArgumentParser(description='生成大肥鱼插件图标')
    parser.add_argument('--sheet', default='assets/web/idle.webp', help='待机雪碧图 WebP 路径')
    parser.add_argument('--out', default='icon.svg', help='图标输出路径')
    args = parser.parse_args()

    frame = sheet_frame(args.sheet)
    data_url, width, height = art_data_url(frame)
    svg = render_svg(data_url, width, height)
    encoded = svg.encode('utf-8')
    if len(encoded) > MAX_ICON_BYTES:
        raise SystemExit(f'图标 {len(encoded)} 字节，超过宿主上限 {MAX_ICON_BYTES} 字节')

    out_dir = os.path.dirname(os.path.abspath(args.out))
    os.makedirs(out_dir, exist_ok=True)
    with open(args.out, 'w', encoding='utf-8') as handle:
        handle.write(svg)
    print(f'{args.out}: {CANVAS}x{CANVAS}，{len(encoded)} 字节')


if __name__ == '__main__':
    main()