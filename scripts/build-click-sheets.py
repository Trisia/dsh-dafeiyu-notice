#!/usr/bin/env python3
"""把 dsh-pet 的「点击回应」webm 素材转成内联雪碧图模块。

处理流程（每段动画）：

1. ffmpeg 解码出 12fps、24 帧的 RGBA 帧；
2. 交给 `build-alpha.py` 抠像：边缘软边重估前景色、灰边按透明度一刀切，
   深色主题下不再浮出灰绿描边（详见该脚本的说明）；
3. 整段共用一个缩放比例（按每帧角色本体的 90 分位高度，让各段角色看起来一样大），
   并让角色在 FRAME_WIDTH x FRAME_HEIGHT 画布内居中，播放时不漂移；
4. 横向拼成 WebP（保留透明通道），写入 `src/clips/<id>.ts`，并重建 `src/clips/index.ts`。

每段动画输出一个独立模块（默认 `src/clips/<id>.ts`），供客户端包直接内联使用；
新增动作只需在 `CLIPS` 里加一行，然后只生成这一段。

依赖：ffmpeg（libvpx-vp9 解码透明通道）、Python 3、Pillow、numpy、scipy。

用法：
    python3 scripts/build-click-sheets.py --src /path/to/webm [--outdir src/clips]
    python3 scripts/build-click-sheets.py --src .devcache/webm --only wave happy

`--src` 目录需要包含 CLIPS 里列出的素材文件名（与 dsh-pet 仓库一致）。
素材来源：https://github.com/PC2005-cloud/dsh-pet（assets/webm）
"""

import argparse
import base64
import glob
import importlib.util
import io
import os
import re
import tempfile

import numpy as np
from PIL import Image
from scipy import ndimage

# 每段动画：(id, 素材文件名（不含扩展名）, 起始时间（秒）, 展示名)。
CLIPS = [
    ('wave', '点击回应-元气挥手', 3.0, '元气挥手'),
    ('happy', '点击回应-开心跃动', 3.5, '开心跃动'),
    ('shy', '点击回应-害羞惊讶', 4.75, '害羞惊讶'),
    ('tickle', '点击回应-挠痒咯咯笑', 6.5, '挠痒咯咯笑'),
    ('angry', '点击回应-傲娇生气', 2.5, '傲娇生气'),
    ('scared', '被吓一跳', 1.4, '被吓一跳'),
    ('meet', '原地跳跃抓碎头顶物品', 5.4, '头顶开光'),
    ('wake', '打瞌睡被惊醒', 2.3, '惊醒'),
    ('tumble', '原地左转奔跑', 2.0, '原地左转奔跑'),
]

FPS = 12
FRAMES = 24
# 单帧尺寸，单位：像素；与 src/constants.ts 的 CLICK_WIDTH / CLICK_HEIGHT 保持一致。
FRAME_WIDTH = 216
FRAME_HEIGHT = 228
WEBP_QUALITY = 90
# 超分前在角色包围盒外留的像素，保证描边与特效不被裁掉。
CROP_PAD = 12
# 主体在画布内占用的最大比例：留出边缘柔和过渡的位置。
BODY_FILL = 0.98


def load_alpha():
    """导入同目录下的 build-alpha.py，抠像逻辑与待机动画共用一份。

    @returns: 已加载的模块对象。
    """
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'build-alpha.py')
    spec = importlib.util.spec_from_file_location('build_alpha', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def largest_region(mask):
    """取最大连通区域（排除蝴蝶结、星星等分离小碎块）。

    @param mask: 布尔掩码。
    @returns: 只保留最大连通区域后的布尔掩码。
    """
    labels, count = ndimage.label(mask, structure=np.ones((3, 3)))
    if count == 0:
        return np.zeros_like(mask)
    sizes = ndimage.sum(mask, labels, range(1, count + 1))
    return labels == int(np.argmax(sizes)) + 1


def build_sheet(source, start, workdir, key, alpha):
    """把一段动画拼成单帧 FRAME_WIDTH x FRAME_HEIGHT 的横向雪碧图。

    @param source: webm 文件路径。
    @param start: 起始时间，单位：秒。
    @param workdir: 存放中间 PNG 的临时目录。
    @param key: 动画 id，用于中间文件命名。
    @param alpha: build-alpha 模块，负责解码与抠像。
    @returns: 横向 RGBA 雪碧图。
    """
    cleaned = alpha.clean_frames(alpha.decode_frames(source, start, FRAMES, FPS, workdir, key))

    # 整段共用一个缩放比例，并让角色在画布内居中，播放时不会漂移。
    # 取景按"每帧最大连通区域"（角色本体）的并集：星星、粒子等分离特效不参与，
    # 否则特效一大，角色就被缩得忽大忽小。
    solid = np.zeros(cleaned[..., 3].shape, dtype=bool)
    for index, frame in enumerate(cleaned):
        solid[index] = largest_region(frame[..., 3] > alpha.ALPHA_MIN)
    ys, xs = np.where(solid.any(axis=0))
    top, left = int(ys.min()), int(xs.min())
    body_height = int(ys.max()) - top + 1
    body_width = int(xs.max()) - left + 1
    # 有跳跃/趴下的动作，并集高度会明显大于单帧体高；按 90 分位体高定缩放，
    # 让各段角色看起来一样大，极端帧允许轻微贴边。
    heights = []
    for index in range(len(solid)):
        rows = np.where(solid[index].any(axis=1))[0]
        heights.append(int(rows.max()) - int(rows.min()) + 1)
    typical_height = float(np.percentile(heights, 90))
    scale = min(FRAME_HEIGHT * BODY_FILL / typical_height, FRAME_WIDTH * BODY_FILL / body_width)
    # 素材角色高约 270 像素、画布 228 像素，缩小用 LANCZOS 保留发丝细节。
    scaled_width = max(1, round(cleaned.shape[2] * scale))
    scaled_height = max(1, round(cleaned.shape[1] * scale))
    paste_x = round((FRAME_WIDTH - body_width * scale) / 2 - left * scale)
    paste_y = round((FRAME_HEIGHT - body_height * scale) / 2 - top * scale)

    sheet = Image.new('RGBA', (FRAME_WIDTH * FRAMES, FRAME_HEIGHT), (0, 0, 0, 0))
    for index, frame in enumerate(cleaned):
        tile = Image.fromarray(frame, 'RGBA').resize((scaled_width, scaled_height), Image.LANCZOS)
        sheet.alpha_composite(tile, (index * FRAME_WIDTH + paste_x, paste_y))
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


def const_name(key):
    """把动画 id 转成导出常量名，例如 scared -> SCARED_SHEET。

    @param key: 动画 id。
    @returns: 常量名。
    """
    return key.upper() + '_SHEET'


def render_clip_module(key, name, file_name, start, sheet):
    """生成单段动画的模块源码（一个文件一段，方便独立新增与回溯）。

    @param key: 动画 id。
    @param name: 展示名。
    @param file_name: 素材文件名（不含扩展名）。
    @param start: 截取起始时间，单位：秒。
    @param sheet: WebP 字节。
    @returns: 模块源码文本。
    """
    data = base64.b64encode(sheet).decode()
    return (
        '/**\n'
        f' * 点击回应动画「{name}」：{FRAMES} 帧，单帧 {FRAME_WIDTH}x{FRAME_HEIGHT}。\n'
        ' *\n'
        f' * 素材：dsh-pet《{file_name}.webm》第 {start} 秒起的 {FRAMES / FPS:g} 秒。\n'
        ' * 由 scripts/build-click-sheets.py 离线转换并内联为 data URL，请勿手改。\n'
        ' * 素材来源：https://github.com/PC2005-cloud/dsh-pet\n'
        ' */\n'
        '\n'
        f"export const {const_name(key)} = {{\n"
        f"  id: '{key}',\n"
        f"  name: '{name}',\n"
        f"  sheet: 'data:image/webp;base64,{data}',\n"
        '};\n'
    )


def rebuild_index(outdir):
    """扫描已有动画模块并重建索引文件，顺序优先跟随 CLIPS 表。

    @param outdir: 动画模块所在目录。
    @returns: 索引里登记的动画 id 列表。
    """
    pattern = re.compile(
        r"export const (\w+) = \{\n  id: '([^']+)',\n  name: '([^']+)',")
    found = {}
    for path in sorted(glob.glob(os.path.join(outdir, '*.ts'))):
        if os.path.basename(path) == 'index.ts':
            continue
        match = pattern.search(open(path, encoding='utf-8').read())
        if match:
            found[match.group(2)] = (match.group(1), match.group(3), os.path.basename(path)[:-3])
    order = [key for key, _, _, _ in CLIPS if key in found]
    order += [key for key in sorted(found) if key not in order]

    lines = [
        '/**',
        ' * 点击回应动画索引：每段动画独立一个模块，新增动作只需新增文件并重跑生成脚本。',
        ' * 顺序即随机池顺序。由 scripts/build-click-sheets.py 维护，请勿手改。',
        ' */',
    ]
    for key in order:
        symbol, _, module = found[key]
        lines.append(f"import {{ {symbol} }} from './{module}.js';")
    lines += [
        '',
        '/** @type {Array<{id: string, name: string, sheet: string}>} */',
        'export const CLICK_SHEETS = [',
    ]
    for key in order:
        lines.append(f'  {found[key][0]},')
    lines += ['];', '']
    with open(os.path.join(outdir, 'index.ts'), 'w', encoding='utf-8') as handle:
        handle.write('\n'.join(lines))
    return order


def main():
    """解析命令行参数并生成按段拆分的动画模块。

    @returns: 无返回值；失败时抛出 SystemExit。
    """
    parser = argparse.ArgumentParser(description='生成点击回应动画模块')
    parser.add_argument('--src', required=True, help='包含 dsh-pet webm 素材的目录')
    parser.add_argument('--outdir', default='src/clips', help='动画模块输出目录')
    parser.add_argument('--only', nargs='*', help='只生成指定 id 的动画，其余模块保持不变')
    args = parser.parse_args()

    alpha = load_alpha()
    os.makedirs(args.outdir, exist_ok=True)

    total = 0
    with tempfile.TemporaryDirectory(prefix='click-sheets-') as workdir:
        for key, file_name, start, name in CLIPS:
            if args.only and key not in args.only:
                continue
            source = os.path.join(args.src, f'{file_name}.webm')
            if not os.path.exists(source):
                raise SystemExit(f'缺少素材：{source}')
            sheet = build_sheet(source, start, workdir, key, alpha)
            encoded = encode_webp(sheet)
            total += len(encoded)
            path = os.path.join(args.outdir, f'{key}.ts')
            with open(path, 'w', encoding='utf-8') as handle:
                handle.write(render_clip_module(key, name, file_name, start, encoded))
            print(f'{key}: {FRAMES} 帧 {FRAME_WIDTH}x{FRAME_HEIGHT}，{len(encoded)} 字节 -> {path}',
                  flush=True)

    order = rebuild_index(args.outdir)
    print(f'索引 {args.outdir}/index.ts：{len(order)} 段（{", ".join(order)}）')
    print(f'本次生成素材合计 {total} 字节')


if __name__ == '__main__':
    main()
