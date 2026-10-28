#!/usr/bin/env python3
"""把 dsh-pet 的「点击回应」webm 素材转成内联雪碧图模块。

处理流程（每段动画）：

1. ffmpeg 解码出 12fps、24 帧的 RGBA 帧；
2. Real-ESRGAN（animevideov3 x4）把 RGB 超分后缩小回 108x114，alpha 用三次插值放大后
   合成，避免白底抠像烘进 RGB 的暗边被二次放大；
3. 去色度抠像残留：按"与背景色接近"清掉主体外的一切像素，只在外轮廓留 1px 柔和过渡，
   主体内部 alpha 保持不透明（旧流程整体缩小时会在深色主题下显出灰绿毛边）；
4. 整段共用一个缩放比例，并让整段包围盒在 108x114 画布内居中，播放时不漂移。

每段动画输出一个独立模块（默认 `src/clips/<id>.ts`），并重建 `src/clips/index.ts` 汇总，
供客户端包直接内联使用；新增动作只需在 `CLIPS` 里加一行并用 `--only` 单独生成该段。

依赖：ffmpeg（libvpx-vp9 解码透明通道）、Python 3、Pillow、numpy、scipy；
加 `--upscale` 时额外需要 torch、torchvision、basicsr、realesrgan 与模型文件
`realesr-animevideov3.pth`。

用法：
    python3 scripts/build-click-sheets.py --src /path/to/webm [--outdir src/clips]
    python3 scripts/build-click-sheets.py --src .devcache/webm --upscale \\
        --model .devcache/models/realesr-animevideov3.pth --cache scripts/mask-cache

`--src` 目录需要包含 CLIPS 里列出的素材文件名（与 dsh-pet 仓库一致）：

    点击回应-元气挥手.webm
    点击回应-开心跃动.webm
    点击回应-害羞惊讶.webm
    点击回应-挠痒咯咯笑.webm
    点击回应-傲娇生气.webm
    被吓一跳.webm
    打瞌睡被惊醒.webm
    原地跳跃抓碎头顶物品.webm
    原地左转奔跑.webm

素材来源：https://github.com/PC2005-cloud/dsh-pet（assets/webm）
"""

import argparse
import base64
import glob
import io
import os
import re
import subprocess
import sys
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
FRAME_WIDTH = 108
FRAME_HEIGHT = 114
WEBP_QUALITY = 88
# 超分前在角色包围盒外留的像素，保证描边与特效不被裁掉。
CROP_PAD = 12
# 主体在画布内占用的最大比例：留出边缘柔和过渡的位置。
BODY_FILL = 0.98
# alpha 视为"有内容"的阈值，对应 0-255 中的 20。
ALPHA_MIN = 20

_upsampler = None
_model_path = None


def get_upsampler(model_path):
    """惰性加载 Real-ESRGAN 的 animevideov3 x4 模型。

    @param model_path: 模型权重路径（realesr-animevideov3.pth）。
    @returns: 已加载并切到推理模式的 SRVGGNetCompact 模型。
    """
    global _upsampler, _model_path
    if _upsampler is not None and _model_path == model_path:
        return _upsampler
    import types

    # basicsr 1.4 依赖 torchvision.transforms.functional_tensor，新版 torchvision 已移除该模块。
    fake = types.ModuleType('torchvision.transforms.functional_tensor')
    import torchvision.transforms.functional as tv_functional
    fake.rgb_to_grayscale = tv_functional.rgb_to_grayscale
    sys.modules['torchvision.transforms.functional_tensor'] = fake

    import torch
    from basicsr.archs.srvgg_arch import SRVGGNetCompact

    model = SRVGGNetCompact(num_in_ch=3, num_out_ch=3, num_feat=64, num_conv=16,
                            upscale=4, act_type='prelu')
    state = torch.load(model_path, map_location='cpu')
    model.load_state_dict(state.get('params_ema', state.get('params')), strict=True)
    model.eval()
    torch.set_num_threads(max(1, (os.cpu_count() or 4) // 2))
    _upsampler = model
    _model_path = model_path
    return model


def decode_frames(source, start, frames, workdir, key):
    """用 ffmpeg 解码一段固定帧数的 RGBA 帧。

    @param source: webm 文件路径。
    @param start: 起始时间，单位：秒。
    @param frames: 需要的帧数。
    @param workdir: 存放中间 PNG 的临时目录。
    @param key: 动画 id，用于中间文件命名。
    @returns: numpy RGBA 帧列表，长度固定为 frames。
    """
    for old in glob.glob(os.path.join(workdir, f'{key}-*.png')):
        os.remove(old)
    pattern = os.path.join(workdir, f'{key}-%03d.png')
    subprocess.run([
        'ffmpeg', '-v', 'error', '-c:v', 'libvpx-vp9',
        '-ss', str(start), '-t', str(frames / FPS), '-i', source,
        '-vf', f'fps={FPS}', '-vsync', '0', '-pix_fmt', 'rgba', pattern,
    ], check=True)
    files = sorted(glob.glob(os.path.join(workdir, f'{key}-*.png')))[:frames]
    if len(files) != frames:
        raise SystemExit(f'{os.path.basename(source)} 解出 {len(files)} 帧，预期 {frames} 帧')
    return [np.asarray(Image.open(path).convert('RGBA')) for path in files]


def union_box(frames, pad):
    """取整段所有帧 alpha 的并集包围盒（用于统一裁剪，避免逐帧坐标漂移）。

    @param frames: numpy RGBA 帧列表。
    @param pad: 向外扩展的像素数。
    @returns: (top, bottom, left, right)，单位：像素。
    """
    union = np.zeros(frames[0].shape[:2], dtype=bool)
    for frame in frames:
        union |= frame[..., 3] > ALPHA_MIN
    ys, xs = np.where(union)
    height, width = frames[0].shape[:2]
    return (max(0, int(ys.min()) - pad), min(height, int(ys.max()) + 1 + pad),
            max(0, int(xs.min()) - pad), min(width, int(xs.max()) + 1 + pad))


def upscale_frame(frame, box, model):
    """把一帧 RGB 超分 4 倍，alpha 用三次插值放大后合成。

    白底抠像会把暗边烘进 RGB，因此只对 RGB 推理、再用原始 alpha 抠回轮廓。

    @param frame: 原始 RGBA 帧。
    @param box: 统一裁剪框 (top, bottom, left, right)，单位：原视频像素。
    @param model: 已加载的超分模型。
    @returns: 4 倍尺寸的 RGBA 帧。
    """
    import torch

    top, bottom, left, right = box
    body = frame[top:bottom, left:right]
    rgb = torch.from_numpy(body[..., :3].astype(np.float32) / 255.0).permute(2, 0, 1).unsqueeze(0)
    with torch.no_grad():
        out = model(rgb).clamp(0, 1)
    big_rgb = (out[0].permute(1, 2, 0).numpy() * 255.0).round().clip(0, 255).astype(np.uint8)
    big_a = np.asarray(Image.fromarray(body[..., 3], 'L').resize(
        (big_rgb.shape[1], big_rgb.shape[0]), Image.BICUBIC))
    return np.dstack([big_rgb, big_a])


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


def background_color(stack):
    """估计背景色：取最外圈像素 RGB 的中位数。

    @param stack: TxHxWx4 uint8 帧序列。
    @returns: RGB 三元素数组，取值 0-255。
    """
    edge = np.concatenate([stack[:4].reshape(-1, 4), stack[:, :4].reshape(-1, 4),
                           stack[:, -4:].reshape(-1, 4)])
    return np.median(edge[:, :3], axis=0)


def matte_clean(stack):
    """清掉色度抠像残留，只改背景侧，不动角色本体与白色特效。

    素材自带的 alpha 已经把背景压到接近 0，真正的残留有两类：

    - 背景区域的雾状低 alpha 噪点（编码误差，深色主题下会浮出一层灰雾）；
    - 主体外圈 alpha 偏低、颜色又贴近背景色的灰绿毛边。

    因此这里只清这两类，白色星星、爆闪这类"颜色接近背景但本身不透明"的特效必须保留。

    @param stack: TxHxWx4 uint8 帧序列。
    @returns: TxHxWx4 uint8 帧序列，背景已清空。
    """
    rgb = stack[..., :3].astype(np.float32) / 255.0
    alpha = stack[..., 3].astype(np.float32) / 255.0
    bg = background_color(stack) / 255.0
    dist = np.linalg.norm(rgb - bg, axis=-1)
    # 雾状噪点：alpha 低到不值一提；灰绿毛边：alpha 偏低且颜色贴近背景。
    haze = alpha <= 0.06
    fringe = (alpha <= 0.42) & (dist < 0.16)
    out_alpha = np.where(haze | fringe, 0.0, alpha)
    # 整帧几乎透明（素材的淡入/淡出帧）时保持整帧透明，避免放大出鬼影。
    empty = alpha.reshape(len(alpha), -1).max(axis=1) < 0.5
    out_alpha[empty] = 0
    cleaned = stack.copy()
    cleaned[..., 3] = (out_alpha * 255).round().astype(np.uint8)
    # 全透明像素的 RGB 清零，缩小插值时不会把底色混到边缘。
    cleaned[..., :3][cleaned[..., 3] < 8] = 0
    return cleaned


def build_sheet(source, start, workdir, key, model, cache_dir):
    """把一段动画拼成单帧 FRAME_WIDTH x FRAME_HEIGHT 的横向雪碧图。

    @param source: webm 文件路径。
    @param start: 起始时间，单位：秒。
    @param workdir: 存放中间 PNG 的临时目录。
    @param key: 动画 id，用于中间文件命名与掩码缓存。
    @param model: 已加载的超分模型；为 None 时跳过超分。
    @param cache_dir: 掩码缓存目录，用来跳过耗时的超分与去残留计算。
    @returns: 横向 RGBA 雪碧图。
    """
    raws = decode_frames(source, start, FRAMES, workdir, key)
    box = union_box(raws, CROP_PAD)
    os.makedirs(cache_dir, exist_ok=True)
    cache_path = os.path.join(cache_dir, f'{key}-{FRAMES}-{FRAME_WIDTH}x{FRAME_HEIGHT}.npz')
    if model is None:
        # 不超分时直接去残留再放大，避免把色度残留一起放大。
        cleaned = matte_clean(np.stack([Image.fromarray(f, 'RGBA').resize(
            (round(f.shape[1] * 2), round(f.shape[0] * 2)), Image.LANCZOS) for f in raws]))
    elif os.path.exists(cache_path):
        cleaned = np.load(cache_path)['frames']
    else:
        cleaned = matte_clean(np.stack([upscale_frame(f, box, model) for f in raws]))
        np.savez_compressed(cache_path, frames=cleaned)

    # 整段共用一个缩放比例，并让角色在画布内居中，播放时不会漂移。
    # 取景按"每帧最大连通区域"（角色本体）的并集：星星、粒子等分离特效不参与，
    # 否则特效一大，角色就被缩得忽大忽小。
    solid = np.zeros(cleaned[..., 3].shape, dtype=bool)
    for index, frame in enumerate(cleaned):
        solid[index] = largest_region(frame[..., 3] > ALPHA_MIN)
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
    parser.add_argument('--upscale', action='store_true', help='启用 Real-ESRGAN 超分辨率')
    parser.add_argument('--model', help='超分模型路径（realesr-animevideov3.pth）')
    parser.add_argument('--cache', help='超分结果的缓存目录，重复生成时跳过超分')
    parser.add_argument('--only', nargs='*', help='只生成指定 id 的动画，其余模块保持不变')
    args = parser.parse_args()

    model = None
    if args.upscale:
        if not args.model or not os.path.exists(args.model):
            raise SystemExit(f'缺少超分模型：{args.model}')
        model = get_upsampler(args.model)
    cache_dir = args.cache or os.path.join(tempfile.gettempdir(), 'click-sheets-cache')
    os.makedirs(args.outdir, exist_ok=True)

    total = 0
    with tempfile.TemporaryDirectory(prefix='click-sheets-') as workdir:
        for key, file_name, start, name in CLIPS:
            if args.only and key not in args.only:
                continue
            source = os.path.join(args.src, f'{file_name}.webm')
            if not os.path.exists(source):
                raise SystemExit(f'缺少素材：{source}')
            sheet = build_sheet(source, start, workdir, key, model, cache_dir)
            encoded = encode_webp(sheet)
            total += len(encoded)
            path = os.path.join(args.outdir, f'{key}.ts')
            with open(path, 'w', encoding='utf-8') as handle:
                handle.write(render_clip_module(key, name, file_name, start, encoded))
            print(f'{key}: {FRAMES} 帧，{len(encoded)} 字节 -> {path}', flush=True)

    order = rebuild_index(args.outdir)
    print(f'索引 {args.outdir}/index.ts：{len(order)} 段（{", ".join(order)}）')
    print(f'本次生成素材合计 {total} 字节')


if __name__ == '__main__':
    main()
