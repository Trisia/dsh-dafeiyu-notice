#!/usr/bin/env python3
"""把待机动画（“等待”状态抱着双臂、用鲸鱼尾巴拍地的那段）从原始 webm 转成雪碧图 WebP。

与点击回应动画完全同一套流程与规格（见 `sheet-spec.py`）：解码带 alpha 的原始视频 →
`build-alpha.py` 抠像 → 按角色本体统一取景 → 横向拼成单帧 FRAME_WIDTH x FRAME_HEIGHT 的 WebP，
写入 `assets/web/idle.webp`，构建时再由 `scripts/embed-web-assets.mjs` 内联进客户端包。

素材来自 dsh-pet 的 `dsh-pet/assets/webm/用鲸鱼尾巴拍打地面.webm`：

    https://github.com/PC2005-cloud/dsh-pet

用法：
    python3 scripts/build-idle-sheet.py --src .devcache/webm/用鲸鱼尾巴拍打地面.webm

依赖：ffmpeg（libvpx-vp9 解码透明通道）、Python 3、Pillow、numpy、scipy。
"""

import argparse
import importlib.util
import os
import tempfile

# 帧数与起始时间；帧数对应 src/constants.ts 的 SPRITE_FRAMES，其余规格见 sheet-spec.py。
FRAMES = 20
# 起始时间，单位：秒；取自尾巴拍地的一个完整循环（按尾鳍质心自相关挑选），首尾衔接最顺。
START = 0.83
# 素材文件名（与 dsh-pet 仓库一致），用于提示默认路径。
SOURCE_NAME = '用鲸鱼尾巴拍打地面.webm'
# 默认输出路径。
DEFAULT_OUT = os.path.join('assets', 'web', 'idle.webp')


def load_spec():
    """导入同目录下的 sheet-spec.py，规格、取景与编码与点击回应动画共用一份。

    @returns: 已加载的模块对象。
    """
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sheet-spec.py')
    spec = importlib.util.spec_from_file_location('sheet_spec', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    """解析参数，从原始视频重建待机雪碧图素材。"""
    parser = argparse.ArgumentParser(description='生成待机动画雪碧图素材')
    parser.add_argument('--src', default=os.path.join('.devcache', 'webm', SOURCE_NAME),
                        help=f'原始素材 webm（dsh-pet 的 {SOURCE_NAME}）')
    parser.add_argument('--out', default=DEFAULT_OUT, help='输出 WebP 路径')
    parser.add_argument('--start', type=float, default=START, help='起始时间，单位：秒')
    args = parser.parse_args()

    if not os.path.exists(args.src):
        raise SystemExit(f'缺少素材：{args.src}\n可从 dsh-pet 下载：'
                         'https://github.com/PC2005-cloud/dsh-pet (dsh-pet/assets/webm)')
    spec = load_spec()
    alpha = spec.load_alpha()
    with tempfile.TemporaryDirectory(prefix='idle-sheet-') as workdir:
        encoded, frames = spec.render(args.src, args.start, FRAMES, workdir, 'idle', alpha)
    os.makedirs(os.path.dirname(args.out) or '.', exist_ok=True)
    with open(args.out, 'wb') as handle:
        handle.write(encoded)
    print(f'{args.out}: {frames} 帧 {spec.FRAME_WIDTH}x{spec.FRAME_HEIGHT}，{len(encoded)} 字节')


if __name__ == '__main__':
    main()
