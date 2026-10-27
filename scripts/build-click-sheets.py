#!/usr/bin/env python3
"""把 dsh-pet 的「点击回应」webm 素材转成内联雪碧图模块。

每段动画取 2 秒（24 帧 @ 12fps，播放 80ms/帧，对应 src/constants.ts 的
CLICK_FRAMES / CLICK_FRAME_MS），按角色本体（最大连通区域）
的 90 分位高度统一取景，缩放到 108x114 后横向拼成一张 WebP，最后写成
`src/click-sheets.ts`，供客户端包直接内联使用。

依赖：ffmpeg（libvpx-vp9 解码透明通道）、Pillow、numpy、scipy。

用法：
    python3 scripts/build-click-sheets.py --src /path/to/webm [--out src/click-sheets.ts]

`--src` 目录需要包含以下文件（文件名与 dsh-pet 仓库一致）：
    点击回应-元气挥手.webm
    点击回应-开心跃动.webm
    点击回应-害羞惊讶.webm
    点击回应-挠痒咯咯笑.webm
    点击回应-傲娇生气.webm

素材来源：https://github.com/PC2005-cloud/dsh-pet（assets/webm）
"""

import argparse
import base64
import glob
import io
import os
import subprocess
import tempfile

import numpy as np
from PIL import Image
from scipy import ndimage

# 动画 id、素材文件名、起始时间（秒）、展示名。
ANIMATIONS = [
    ('wave', '点击回应-元气挥手', 3.0, '元气挥手'),
    ('happy', '点击回应-开心跃动', 3.5, '开心跃动'),
    ('shy', '点击回应-害羞惊讶', 4.75, '害羞惊讶'),
    ('tickle', '点击回应-挠痒咯咯笑', 6.5, '挠痒咯咯笑'),
    ('angry', '点击回应-傲娇生气', 2.5, '傲娇生气'),
]

FPS = 12
FRAMES = 24
FRAME_WIDTH = 108
FRAME_HEIGHT = 114
WEBP_QUALITY = 88


def body_box(image):
    """取角色本体的包围盒，排除爱心等分离特效。

    @param image: 单帧 RGBA 图像。
    @returns: (left, top, right, bottom) 像素坐标；没有可用像素时返回 None。
    """
    alpha = np.asarray(image.getchannel('A'))
    mask = alpha > 24
    labels, count = ndimage.label(mask, structure=np.ones((3, 3)))
    if count == 0:
        return None
    sizes = ndimage.sum(mask, labels, range(1, count + 1))
    index = int(np.argmax(sizes)) + 1
    ys, xs = np.where(labels == index)
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def decode_frames(source, start, workdir, key):
    """用 ffmpeg 解码一段固定时长的 RGBA 帧。

    @param source: webm 文件路径。
    @param start: 起始时间，单位：秒。
    @param workdir: 存放中间 PNG 的临时目录。
    @param key: 动画 id，用于中间文件命名。
    @returns: PIL RGBA 图像列表，长度固定为 FRAMES。
    """
    pattern = os.path.join(workdir, f'{key}-%03d.png')
    subprocess.run([
        'ffmpeg', '-v', 'error', '-c:v', 'libvpx-vp9',
        '-ss', str(start), '-t', str(FRAMES / FPS), '-i', source,
        '-vf', f'fps={FPS}', '-vsync', '0', '-pix_fmt', 'rgba', pattern,
    ], check=True)
    files = sorted(glob.glob(os.path.join(workdir, f'{key}-*.png')))[:FRAMES]
    if len(files) != FRAMES:
        raise RuntimeError(f'{os.path.basename(source)} 解出 {len(files)} 帧，预期 {FRAMES} 帧')
    return [Image.open(path).convert('RGBA') for path in files]


def build_sheet(source, start, workdir, key):
    """把一段动画拼成横向雪碧图。

    @param source: webm 文件路径。
    @param start: 起始时间，单位：秒。
    @param workdir: 存放中间 PNG 的临时目录。
    @param key: 动画 id，用于中间文件命名。
    @returns: 单帧 FRAME_WIDTH x FRAME_HEIGHT 的横向 RGBA 雪碧图。
    """
    frames = decode_frames(source, start, workdir, key)
    boxes = [box for box in (body_box(frame) for frame in frames) if box]
    if not boxes:
        raise RuntimeError(f'{os.path.basename(source)} 没有可用的角色像素')

    centers_x = np.array([(box[0] + box[2]) / 2 for box in boxes])
    centers_y = np.array([(box[1] + box[3]) / 2 for box in boxes])
    heights = np.array([box[3] - box[1] for box in boxes])

    center_x = float(np.median(centers_x))
    center_y = float(np.median(centers_y))
    # 取 90 分位高度，避免个别抬手的帧把取景拉大；+4 像素留出描边余量。
    height = float(np.percentile(heights, 90)) + 4
    width = height * FRAME_WIDTH / FRAME_HEIGHT
    left = int(round(center_x - width / 2))
    top = int(round(center_y - height / 2))
    crop = (left, top, left + int(round(width)), top + int(round(height)))

    sheet = Image.new('RGBA', (FRAME_WIDTH * FRAMES, FRAME_HEIGHT), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        tile = frame.crop(crop).resize((FRAME_WIDTH, FRAME_HEIGHT), Image.LANCZOS)
        sheet.alpha_composite(tile, (index * FRAME_WIDTH, 0))
    return sheet


def encode_webp(sheet):
    """把雪碧图编码为保留透明通道的 WebP。

    @param sheet: 横向 RGBA 雪碧图。
    @returns: WebP 文件字节。
    """
    buffer = io.BytesIO()
    sheet.save(buffer, format='WEBP', quality=WEBP_QUALITY, method=6,
               alpha_quality=100, exact=False)
    return buffer.getvalue()


def render_module(entries):
    """生成可直接被打包器引用的 ES 模块。

    @param entries: (id, 展示名, WebP 字节) 三元组列表。
    @returns: 模块源码文本。
    """
    lines = [
        '/**',
        ' * 点击回应动画雪碧图：5 段，每段 24 帧，单帧 108x114。',
        ' *',
        ' * 由 scripts/build-click-sheets.py 从 dsh-pet 的 webm 素材离线转换，',
        ' * 内联为 data URL 以免依赖宿主的资源路由。请勿手改。',
        ' * 素材来源：https://github.com/PC2005-cloud/dsh-pet',
        ' */',
        '',
        '/** @type {Array<{id: string, name: string, sheet: string}>} */',
        'export const CLICK_SHEETS = [',
    ]
    for key, name, sheet in entries:
        lines.append('  {')
        lines.append(f"    id: '{key}',")
        lines.append(f"    name: '{name}',")
        lines.append(f"    sheet: 'data:image/webp;base64,{base64.b64encode(sheet).decode()}',")
        lines.append('  },')
    lines.append('];')
    lines.append('')
    return '\n'.join(lines)


def main():
    """解析命令行参数并生成 click-sheets.ts。

    @returns: 无返回值；失败时抛出 SystemExit。
    """
    parser = argparse.ArgumentParser(description='生成点击回应雪碧图模块')
    parser.add_argument('--src', required=True, help='包含 dsh-pet webm 素材的目录')
    parser.add_argument('--out', default='src/click-sheets.ts', help='输出模块路径')
    args = parser.parse_args()

    entries = []
    with tempfile.TemporaryDirectory(prefix='click-sheets-') as workdir:
        for key, file_name, start, name in ANIMATIONS:
            source = os.path.join(args.src, f'{file_name}.webm')
            if not os.path.exists(source):
                raise SystemExit(f'缺少素材：{source}')
            sheet = build_sheet(source, start, workdir, key)
            entries.append((key, name, encode_webp(sheet)))
            print(f'{key}: 24 帧，{len(entries[-1][2])} 字节')

    with open(args.out, 'w', encoding='utf-8') as handle:
        handle.write(render_module(entries))
    total = sum(len(sheet) for _, _, sheet in entries)
    print(f'写入 {args.out}，素材合计 {total} 字节')


if __name__ == '__main__':
    main()