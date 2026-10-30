#!/usr/bin/env python3
"""把 dsh-pet 的「点击回应」webm 素材转成雪碧图 WebP。

处理流程（每段动画）：

1. ffmpeg 解码出 12fps、24 帧的 RGBA 帧；
2. 交给 `build-alpha.py` 抠像：边缘软边重估前景色、灰边按透明度一刀切，
   深色主题下不再浮出灰绿描边（详见该脚本的说明）；
3. 取景、拼图与编码统一交给 `sheet-spec.py`（与待机动画同一套规格与实现），单帧 216x228，
   横向拼成 WebP 后写入 `assets/web/<id>.webp`。

每段动画输出一个独立 WebP（默认 `assets/web/<id>.webp`），构建时由
`scripts/embed-web-assets.mjs` 内联进客户端包；新增动作只需在 `CLIPS`
里加一行，并在 `src/clips/` 补一个同名模块。

依赖：ffmpeg（libvpx-vp9 解码透明通道）、Python 3、Pillow、numpy、scipy。

用法：
    python3 scripts/build-click-sheets.py --src /path/to/webm [--outdir assets/web]
    python3 scripts/build-click-sheets.py --src .devcache/webm --only wave happy

`--src` 目录需要包含 CLIPS 里列出的素材文件名（与 dsh-pet 仓库一致）。
素材来源：https://github.com/PC2005-cloud/dsh-pet（assets/webm）
"""

import argparse
import importlib.util
import os
import tempfile

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

# 每段动画的帧数，与 src/constants.ts 的 CLICK_FRAMES 一致；其余规格见 sheet-spec.py。
FRAMES = 24


def load_spec():
    """导入同目录下的 sheet-spec.py，规格、取景与编码与待机动画共用一份。

    @returns: 已加载的模块对象。
    """
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sheet-spec.py')
    spec = importlib.util.spec_from_file_location('sheet_spec', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    """解析命令行参数并生成按段拆分的雪碧图 WebP。

    @returns: 无返回值；失败时抛出 SystemExit。
    """
    parser = argparse.ArgumentParser(description='生成点击回应动画雪碧图')
    parser.add_argument('--src', required=True, help='包含 dsh-pet webm 素材的目录')
    parser.add_argument('--outdir', default='assets/web', help='雪碧图 WebP 输出目录')
    parser.add_argument('--only', nargs='*', help='只生成指定 id 的动画，其余素材保持不变')
    args = parser.parse_args()

    spec = load_spec()
    alpha = spec.load_alpha()
    os.makedirs(args.outdir, exist_ok=True)

    total = 0
    with tempfile.TemporaryDirectory(prefix='click-sheets-') as workdir:
        for key, file_name, start, name in CLIPS:
            if args.only and key not in args.only:
                continue
            source = os.path.join(args.src, f'{file_name}.webm')
            if not os.path.exists(source):
                raise SystemExit(f'缺少素材：{source}')
            encoded, frames = spec.render(source, start, FRAMES, workdir, key, alpha)
            total += len(encoded)
            path = os.path.join(args.outdir, f'{key}.webp')
            with open(path, 'wb') as handle:
                handle.write(encoded)
            print(f'{key}: {frames} 帧 {spec.FRAME_WIDTH}x{spec.FRAME_HEIGHT}，{len(encoded)} 字节 -> {path}',
                  flush=True)

    print(f'本次生成素材合计 {total} 字节')


if __name__ == '__main__':
    main()