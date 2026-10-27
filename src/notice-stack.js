/**
 * 提示卡片堆栈：渲染等待回答 / 等待确认 / 任务完成的浮层提示。
 */
import React from 'react';

const h = React.createElement;

/**
 * 按提示类别取图标字符。
 * @param {'turnEnd'|'question'|'approval'} kind - 提示类别。
 * @returns {string} 图标字符。
 */
function iconOf(kind) {
  if (kind === 'turnEnd') return '✓';
  if (kind === 'question') return '?';
  return '!';
}

/**
 * 提示卡片：读取仓库中的活动提示并渲染为页面浮层。
 * @param {object} props - 槽位注入的渲染属性与插件注入面。
 * @returns {object|null} 卡片堆栈元素；没有提示时为 null。
 */
export function NoticeStack({ useNotifications, openSession, dismiss }) {
  const notices = useNotifications((value) => value);
  if (!Array.isArray(notices) || notices.length === 0) return null;
  return h(
    'div',
    { className: 'dshtn-stack', role: 'status', 'aria-live': 'polite' },
    notices.map((notice) =>
      h(
        'div',
        {
          key: notice.id,
          className: 'dshtn-card',
          'data-kind': notice.kind,
          role: 'button',
          tabIndex: 0,
          onClick: () => openSession(notice.sessionId),
          onKeyDown: (event) => {
            if (event.key === 'Enter') openSession(notice.sessionId);
          },
        },
        h('div', { className: 'dshtn-icon', 'aria-hidden': true }, iconOf(notice.kind)),
        h(
          'div',
          { className: 'dshtn-main' },
          h('div', { className: 'dshtn-title' }, notice.title),
          h('div', { className: 'dshtn-body' }, notice.body),
          h('div', { className: 'dshtn-session', title: notice.sessionLabel }, notice.sessionLabel),
          h('div', { className: 'dshtn-action' }, notice.openLabel),
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'dshtn-close',
            'aria-label': notice.closeLabel,
            onClick: (event) => {
              event.stopPropagation();
              dismiss(notice.id);
            },
          },
          '×',
        ),
      ),
    ),
  );
}
