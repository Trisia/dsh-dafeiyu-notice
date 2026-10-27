/**
 * 大肥鱼与偏好设置行的样式。
 *
 * 只引用宿主主题令牌（--dsw-alias-*），保证浅色与深色主题下都能融入界面。
 * 大肥鱼尺寸随 {@link PET_WIDTH} / {@link SPRITE_FRAMES} 计算，与逐帧位移保持同一来源；
 * 待机与点击回应两层叠放，靠透明度切换。
 */
import { CLICK_FADE_MS, PET_HEIGHT, PET_WIDTH, SPRITE_FRAMES } from './constants.js';
import { SPRITE_SHEET } from './sprite-sheet.js';

export const CSS = `

.dshtn-pet{position:fixed;right:16px;bottom:16px;z-index:2147483000;pointer-events:auto;cursor:grab;border:0;background:transparent;padding:0;display:block;filter:drop-shadow(0 8px 16px rgba(0,0,0,.24));-webkit-tap-highlight-color:transparent;touch-action:none;user-select:none;}
.dshtn-pet[data-placed="true"]{right:auto;bottom:auto;}
.dshtn-pet[data-dragging="true"]{cursor:grabbing;transform:none;filter:drop-shadow(0 12px 22px rgba(0,0,0,.3));}
.dshtn-pet-canvas:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4d6bfe);outline-offset:4px;border-radius:10px;}
.dshtn-pet-canvas{position:relative;width:${PET_WIDTH}px;height:${PET_HEIGHT}px;}
.dshtn-pet-img,.dshtn-pet-click{position:absolute;inset:0;width:${PET_WIDTH}px;height:${PET_HEIGHT}px;background-repeat:no-repeat;transition:opacity ${CLICK_FADE_MS}ms ease;}
.dshtn-pet-img{background-image:url(${SPRITE_SHEET});background-size:${PET_WIDTH * SPRITE_FRAMES}px ${PET_HEIGHT}px;}
.dshtn-pet-click{opacity:0;}
.dshtn-pet[data-phase="click"] .dshtn-pet-img{opacity:0;}
.dshtn-pet[data-phase="click"] .dshtn-pet-click{opacity:1;}
.dshtn-pet-bubble{position:absolute;right:calc(100% - 12px);bottom:96px;width:max-content;max-width:176px;padding:7px 26px 7px 10px;border-radius:10px;background:var(--dsw-alias-bg-overlay,#fff);border:.5px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));box-shadow:0 4px 14px rgba(0,0,0,.16);color:var(--dsw-alias-label-primary,#1f1f1f);font-size:12px;line-height:1.4;text-align:left;white-space:normal;}
.dshtn-pet-bubble::after{content:"";position:absolute;right:-5px;bottom:14px;width:9px;height:9px;background:inherit;border-right:.5px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));border-top:.5px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));transform:rotate(45deg);}
.dshtn-pet-title{display:block;}
.dshtn-pet-who{display:block;margin-top:2px;font-size:11px;opacity:.62;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dshtn-pet-more{display:block;margin-top:2px;font-size:11px;color:var(--dsw-alias-brand-primary,#1e8ef7);}
.dshtn-pet-close{position:absolute;top:2px;right:2px;display:flex;align-items:center;justify-content:center;width:18px;height:18px;padding:0;border:0;border-radius:5px;background:transparent;color:var(--dsw-alias-label-secondary,#5c5c5c);font:inherit;font-size:14px;line-height:16px;cursor:pointer;}
.dshtn-pet-close:hover{background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.08));}
.dshtn-pet-close:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4d6bfe);outline-offset:1px;}
@media (prefers-reduced-motion: reduce){
  .dshtn-pet-img,.dshtn-pet-click{transition:none;}
}
.dshtn-row{border-bottom:.5px solid var(--dsw-alias-border-l2,rgba(0,0,0,.12));display:flex;align-items:center;gap:24px;justify-content:space-between;padding:16px 0;}
.dshtn-rowText{display:flex;flex-direction:column;gap:4px;min-width:0;flex:1;}
.dshtn-rowTitle{font-size:14px;line-height:20px;color:var(--dsw-alias-label-primary,#1f1f1f);}
.dshtn-rowDesc{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,#5c5c5c);}
.dshtn-rowActions{display:flex;align-items:center;gap:8px;flex:none;}
.dshtn-toggle{height:26px;min-width:56px;border-radius:13px;border:none;cursor:pointer;font:inherit;font-size:12px;padding:0 10px;background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.12));color:var(--dsw-alias-label-secondary,#5c5c5c);}
.dshtn-toggle:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.08));}
.dshtn-toggle[aria-checked="true"]{background:var(--dsw-alias-brand-primary,#1e8ef7);color:#fff;}
`;
