/**
 * 常规设置行：提醒总开关、声音开关与子智能体完成提醒开关。
 */
import React from 'react';

const h = React.createElement;

/**
 * 常规设置行：提醒总开关、声音开关与子智能体完成提醒开关。
 * @param {object} props - 槽位注入的渲染属性与插件注入面。
 * @returns {object} 设置行元素。
 */
export function NotifySettingsRow({ t, useTaskNotifySettings, setEnabled, setSound, setNotifySubagent, playPreview }) {
  const settings = useTaskNotifySettings((value) => value);
  return h(
    'div',
    { className: 'dshtn-row' },
    h(
      'div',
      { className: 'dshtn-rowText' },
      h('div', { className: 'dshtn-rowTitle' }, t('setting.title')),
      h('div', { className: 'dshtn-rowDesc' }, t('setting.description')),
      h('div', { className: 'dshtn-rowDesc' }, t('setting.subagentHint')),
    ),
    h(
      'div',
      { className: 'dshtn-rowActions' },
      h(
        'button',
        {
          type: 'button',
          className: 'dshtn-toggle',
          role: 'switch',
          'aria-checked': settings.notifySubagent,
          'aria-label': t('setting.subagent'),
          onClick: () => setNotifySubagent(!settings.notifySubagent),
        },
        `${t('setting.subagent')} ${settings.notifySubagent ? t('setting.on') : t('setting.off')}`,
      ),
      h(
        'button',
        {
          type: 'button',
          className: 'dshtn-toggle',
          role: 'switch',
          'aria-checked': settings.sound,
          onClick: () => {
            setSound(!settings.sound);
            if (!settings.sound) playPreview();
          },
        },
        t('setting.sound'),
      ),
      h(
        'button',
        {
          type: 'button',
          className: 'dshtn-toggle',
          role: 'switch',
          'aria-checked': settings.enabled,
          onClick: () => setEnabled(!settings.enabled),
        },
        settings.enabled ? t('setting.on') : t('setting.off'),
      ),
    ),
  );
}
