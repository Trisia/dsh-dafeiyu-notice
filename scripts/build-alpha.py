#!/usr/bin/env python3
"""从 dsh-pet 的 webm 素材里抠出干净的前景，供待机动画与点击回应动画共用。

素材是「白底 + 色度抠像」的 VP9 alpha 视频，有几处对深色主题合成很不利：

- 背景自带一圈半透明灰边（alpha 0.1~0.5、颜色发灰），深色主题下就是一层雾；
- 发丝、头饰花边这类细节的 alpha 普遍低于 0.5，并且 RGB 里混着白底；
- 轮廓内侧还有实色的细描边，清灰边时不能顺手把它一起削掉。

直接使用素材 alpha 会露出灰绿杂边，按固定 alpha 阈值清理又会把发丝和花边一并削掉。
处理流程：

1. 用 libvpx-vp9 解码器读出带 alpha 的 RGBA 帧；
2. 把二值轮廓外扩几像素、再回缩 1 像素，圈出轮廓外压着的那圈灰带（不碰内侧斜面）；
3. 灰带里逐像素估前景色：锚点取局部 alpha 极大值的平滑池，再加远处同量级的
   颜色变化（同一段丝、同一块花边），发丝之间的抬头空隙不会被旁边的白底带偏；
4. 灰带里按素材 alpha 一刀切：高的按实色、低的按透明，不再输出半透明的中间值，
   深色主题下不会浮出灰绿描边；星光粒子这些素材里本来就半透明的特效保持原样；
5. 灰带里浅色的薄边（爱心、星星、花边的外圈）直接清掉，避免在深色底上泛出白色描边光。

依赖：ffmpeg（libvpx-vp9 解码透明通道）、Python 3、Pillow、numpy、scipy。
"""

import glob
import os
import subprocess
import tempfile

import numpy as np
from PIL import Image
from scipy import ndimage

# 解码器必须显式指定：ffmpeg 会优先用原生 vp9 解码器，它读不出 alpha 平面。
DECODER = 'libvpx-vp9'
# alpha 大于该值（0-255）视为「有内容」，与雪碧图的取景阈值一致。
ALPHA_MIN = 20
# 灰带上素材 alpha 高于该值视为实色、低于该值视为灰边，单位：0-1 的归一化 alpha。
SOLID_CUT = 0.9
# 灰带判定的外扩半径，需覆盖素材轮廓外的半透明灰边宽度，单位：像素（素材原始分辨率）。
EDGE_OUT_PX = 4
# 浅色外缘的判定阈值：RGB 三通道都高于该值（0-1）才算浅色。
WHITE_EDGE_RGB = 0.62
# 灰带里浅色像素的 alpha 低于该值时直接清掉：再高就会在深色底上泛出白色描边。
RIM_ALPHA_CAP = 0.85
# 远处配色半径，覆盖同一段丝发被灰带整体吃掉的相邻区域，单位：像素（素材原始分辨率）。
FAR_PX = 16
# 前景锚点合并半径：窗口内 alpha 的局部极大值处的颜色代表该片区域，单位：像素。
MERGE_PX = 3
# 前景色平滑池半径：发丝之间的抬头空隙靠池化补色，单位：像素。
POOL_PX = 4


def decode_frames(source, start, frames, fps, workdir, key):
    """用 ffmpeg 解出带 alpha 的 RGBA 帧。

    @param source: webm 文件路径。
    @param start: 起始时间，单位：秒。
    @param frames: 需要的帧数。
    @param fps: 取样帧率，单位：帧/秒。
    @param workdir: 存放中间 PNG 的临时目录。
    @param key: 动画 id，用于中间文件命名。
    @returns: TxHxWx4 uint8 帧序列。
    """
    for old in glob.glob(os.path.join(workdir, f'{key}-*.png')):
        os.remove(old)
    pattern = os.path.join(workdir, f'{key}-%03d.png')
    subprocess.run([
        'ffmpeg', '-v', 'error', '-c:v', DECODER,
        '-ss', f'{start:g}', '-t', f'{frames / fps:g}', '-i', source,
        '-vf', f'fps={fps:g}', '-vsync', '0', '-pix_fmt', 'rgba', pattern,
    ], check=True)
    files = sorted(glob.glob(os.path.join(workdir, f'{key}-*.png')))[:frames]
    if len(files) != frames:
        raise SystemExit(f'{os.path.basename(source)} 解出 {len(files)} 帧，预期 {frames} 帧')
    return np.stack([np.asarray(Image.open(path).convert('RGBA')) for path in files])


def disk(radius):
    """生成圆形结构元。

    @param radius: 半径，单位：像素；小于 0.5 时只取中心点。
    @returns: 布尔结构元。
    """
    if radius < 0.5:
        return np.ones((1, 1), dtype=bool)
    size = radius * 2 + 1
    yy, xx = np.mgrid[0:size, 0:size]
    return (yy - radius) ** 2 + (xx - radius) ** 2 <= radius * radius


def edge_band(alpha, out_px):
    """求轮廓外侧那圈半透明灰带。

    素材轮廓外压着一圈很浅的灰边（宽 2~3 像素、alpha 0.1~0.5、颜色被白底冲淡），
    二值轮廓外扩 out_px 再回缩 1 像素，正好把这圈灰边框出来。
    只往外侧扩，不碰内侧斜面——内侧的实色描边（头发外沿那条深蓝细线）必须保留。

    @param alpha: HxW 数组，素材 alpha，取值 0-1。
    @param out_px: 外扩半径，需覆盖灰边宽度，单位：像素。
    @returns: HxW 布尔数组，True 表示该像素处在轮廓外侧的灰带里。
    """
    solid = alpha > 0.4
    wide = ndimage.binary_dilation(solid, structure=disk(out_px))
    return wide & ~ndimage.binary_dilation(solid, structure=disk(1))


def anchor_weight(alpha, band):
    """评估每个像素作为前景锚点的可信度：取局部 alpha 极大值，排除灰带。

    @param alpha: HxW 数组，素材 alpha，取值 0-1。
    @param band: HxW 布尔数组，轮廓灰带。
    @returns: HxW 数组，锚点权重，取值 0-1。
    """
    return np.where(band, 0.0, ndimage.maximum_filter(alpha, size=MERGE_PX)) * (alpha >= 0.5)


def foreground_anchor(values, weight):
    """对没有可用邻居的像素，取最近的可用像素颜色。

    @param values: HxWxC 数组，取值 0-1。
    @param weight: HxW 数组，可用邻居的权重，越大越优先。
    @returns: HxWxC 数组，取值 0-1。
    """
    index = ndimage.distance_transform_edt(weight < 0.5, return_distances=False, return_indices=True)
    return values[tuple(index)]


def fill_holes(values, weight, radius):
    """先用半径内的加权平均补一遍，没有可用邻居的像素退到最近邻。

    半径内可能还没有可用锚点（补出来的空隙）：平均值会被白底拉向灰色，
    所以第二遍用最近邻兜底，避免出现灰斑。

    @param values: HxWxC 数组，取值 0-1。
    @param weight: HxW 数组，可用邻居的权重，越大越优先。
    @param radius: 平均半径，单位：像素。
    @returns: HxWxC 数组，取值 0-1。
    """
    kernel = disk(radius).astype(np.float32)
    weighted = ndimage.correlate(values * weight[..., None], kernel[..., None], mode='constant')
    total = ndimage.correlate(weight, kernel, mode='constant')
    pooled = weighted / np.maximum(total, 1e-3)[..., None]
    return np.where((total > 0.5)[..., None], pooled, foreground_anchor(values, weight))


def estimate_fg(rgb, alpha, band):
    """估计前景色：锚点的平滑池做底色，远处同量级的颜色做配色。

    锚点不能只看最近邻：发丝之间常有一个像素的抬头空隙，最近邻会取到旁边的白底。

    @param rgb: HxWx3 数组，观察色，取值 0-1。
    @param alpha: HxW 数组，素材 alpha，取值 0-1。
    @param band: HxW 布尔数组，轮廓灰带。
    @returns: HxWx3 数组，前景色，取值 0-1。
    """
    weight = anchor_weight(alpha, band)
    near = fill_holes(rgb, weight, POOL_PX)
    far = fill_holes(rgb, weight, FAR_PX)
    return np.clip(0.6 * near + 0.4 * far, 0.0, 1.0)


def refine_fringe(rgb, alpha, band):
    """在轮廓的灰带上还原前景色，并把灰带按素材 alpha 一刀切掉。

    灰带里的像素只分两种：接近实色的保留为不透明，其余全部清掉，
    不输出半透明的中间值，深色主题下就不会浮出灰绿描边。

    @param rgb: HxWx3 数组，观察色，取值 0-1。
    @param alpha: HxW 数组，素材 alpha，取值 0-1。
    @param band: HxW 布尔数组，轮廓灰带。
    @returns: (fg, new_alpha)，颜色与 alpha 均取值 0-1。
    """
    fg = estimate_fg(rgb, alpha, band)
    cut = np.where(alpha > SOLID_CUT, 1.0, 0.0)
    return fg, np.where(band, cut, alpha)


def clamp_white_edge(rgb, alpha, band):
    """收起轮廓最外侧的浅色描边，去掉深色主题下的一圈白光。

    爱心、星星、花边这些浅色对象在轮廓最外侧只有一层薄 alpha，颜色却接近白底：
    合成到深色底上就是一道白色描边。把灰带里 alpha 偏低的浅色像素直接压成透明，
    轮廓退回实色部位；主角内部的浅色区域照常保留。

    @param rgb: HxWx3 数组，前景色，取值 0-1。
    @param alpha: HxW 数组，修正后的 alpha，取值 0-1。
    @param band: HxW 布尔数组，轮廓灰带。
    @returns: HxW 数组，压低后的 alpha，取值 0-1。
    """
    pale = rgb.min(axis=-1) > WHITE_EDGE_RGB
    return np.where(band & pale & (alpha < RIM_ALPHA_CAP), 0.0, alpha)


def key_frame(frame):
    """还原一帧：灰带重估前景色并按透明度一刀切，其余像素保持素材原样。

    @param frame: HxWx4 uint8，素材帧。
    @returns: HxWx4 uint8，前景色已还原、背景为全透明的帧。
    """
    rgb = frame[..., :3].astype(np.float32) / 255.0
    alpha = frame[..., 3].astype(np.float32) / 255.0
    band = edge_band(alpha, EDGE_OUT_PX)
    fg, new_alpha = refine_fringe(rgb, alpha, band)
    out = np.zeros_like(frame)
    # 灰带用还原后的颜色；主体部分保留素材原色。
    color = np.where(band[..., None], fg, rgb)
    new_alpha = clamp_white_edge(color, new_alpha, band)
    out[..., :3] = (np.clip(color, 0.0, 1.0) * 255.0).round().astype(np.uint8)
    out[..., 3] = (new_alpha * 255.0).round().astype(np.uint8)
    out[out[..., 3] == 0] = 0
    return out


def clean_frames(stack):
    """逐帧还原并清理，输出可直接用于缩放的 RGBA 序列。

    @param stack: TxHxWx4 uint8 帧序列，帧数在第一维。
    @returns: TxHxWx4 uint8 帧序列，背景已清空。
    """
    return np.stack([key_frame(frame) for frame in stack])
