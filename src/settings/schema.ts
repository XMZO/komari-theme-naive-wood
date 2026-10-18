/**
 * Naive 主题设置的唯一定义来源。
 *
 * 主题清单改为 raw 类型后，Komari 不再按清单注入默认值；前台与设置页都以这里的默认值为准。
 * 默认值与旧版 managed 清单保持一致，存储格式也保持不变（如列表列配置仍为 JSON 字符串），
 * 以便新旧版本主题读写同一份配置。本文件不依赖任何运行时模块，前台和设置页都可直接引用。
 */

export type SettingValue = string | number | boolean
export type SettingsRecord = Record<string, unknown>

export interface SelectOption {
  value: string
  label: string
  description?: string
  disabled?: (settings: SettingsRecord) => boolean
}

interface FieldBase<T extends SettingValue> {
  key: string
  label: string
  help?: string
  default: T
  /** 依赖其他设置时才显示 */
  visible?: (settings: SettingsRecord) => boolean
  /** 只在页面加载时读取，实时预览无法体现，保存后刷新页面才生效 */
  reloadRequired?: boolean
  /** 由组合编辑器负责渲染，不单独占一行 */
  hidden?: boolean
  /** 额外的搜索关键词 */
  keywords?: string
}

export type SettingField
  = | (FieldBase<boolean> & { type: 'switch' })
    | (FieldBase<number> & {
      type: 'number'
      min: number
      max: number
      step?: number
      unit?: string
      slider?: boolean
      /** 特殊取值，例如 -1 表示跟随其他设置 */
      special?: { value: number, label: string }
    })
    | (FieldBase<string> & {
      type: 'select'
      options: SelectOption[]
      display?: 'segmented' | 'dropdown' | 'cards'
    })
    | (FieldBase<string> & {
      type: 'text'
      placeholder?: string
      format?: 'cssLength' | 'url'
      allowEmpty?: boolean
    })
    | (FieldBase<string> & { type: 'color' })
    | (FieldBase<string> & { type: 'font', sample: string })
    | (FieldBase<string> & { type: 'markdown' })
    | (FieldBase<string> & { type: 'urlList' })
    | (FieldBase<string> & { type: 'listColumns' })
    | (FieldBase<string> & { type: 'json' })

export interface SettingSection {
  title?: string
  description?: string
  keys: string[]
  layout?: 'rows' | 'grid'
  /** 附加在分区末尾的辅助内容 */
  extra?: 'lightColors' | 'darkColors' | 'byteSample'
}

export interface SettingGroup {
  id: string
  title: string
  icon: string
  description: string
  sections: SettingSection[]
}

/** List 视图可用的列，顺序即为编辑器中的默认排列 */
export const LIST_VIEW_COLUMNS = [
  { key: 'status', label: '状态' },
  { key: 'region', label: '地区' },
  { key: 'name', label: '名称' },
  { key: 'tags', label: '标签' },
  { key: 'uptime', label: '运行时间' },
  { key: 'os', label: '系统' },
  { key: 'cpu', label: 'CPU' },
  { key: 'mem', label: '内存' },
  { key: 'disk', label: '硬盘' },
  { key: 'traffic', label: '流量' },
  { key: 'rate', label: '速率' },
] as const

export type ListViewColumn = typeof LIST_VIEW_COLUMNS[number]['key']
export const LIST_VIEW_COLUMN_KEYS: readonly ListViewColumn[] = LIST_VIEW_COLUMNS.map(column => column.key)

/** 列宽留空时使用的宽度 */
export const LIST_COLUMN_FALLBACK_WIDTHS: Readonly<Record<ListViewColumn, string>> = {
  status: '76px',
  region: '32px',
  name: 'minmax(200px, 1fr)',
  tags: '200px',
  uptime: 'minmax(180px, 0.6fr)',
  os: '120px',
  cpu: '180px',
  mem: '180px',
  disk: '180px',
  traffic: '180px',
  rate: '140px',
}

/** 由列编辑器一并管理的设置项 */
export const LIST_COLUMN_SETTING_KEYS = ['listViewColumns', 'listColumnWidths', 'listColumnPadding', 'listColumnMargin'] as const

const is = (key: string, value: unknown) => (settings: SettingsRecord) => settings[key] === value
const isOn = (key: string) => is(key, true)

const viewModeOptions: SelectOption[] = [
  { value: 'card', label: '卡片' },
  { value: 'list', label: '列表' },
  { value: 'earth', label: '地球', disabled: settings => settings.enableEarthView === false },
]

const tagStyleOptions: SelectOption[] = [
  { value: 'tag', label: '标签' },
  { value: 'badge', label: '徽章' },
]

export const SETTING_FIELDS: SettingField[] = [
  // 首页
  { key: 'defaultViewMode', type: 'select', display: 'segmented', label: '默认视图', help: '访客首次打开首页时的节点视图；访客自行切换后会记住自己的选择。关闭地球视图时会回退为卡片', default: 'card', options: viewModeOptions },
  { key: 'enableEarthView', type: 'switch', label: '启用地球视图', help: '关闭后隐藏地球视图入口，也不再渲染地球', default: true },
  { key: 'showGeneralCards', type: 'switch', label: '数据总览', help: '在首页顶部显示当前时间、在线节点、区域、总流量和实时速率', default: true },
  { key: 'hideSingleGroupTab', type: 'switch', label: '单分组时隐藏分组标签', help: '只有一个分组时不显示分组切换', default: true },
  { key: 'offlineNodesLast', type: 'switch', label: '离线节点置底', help: '在线节点优先显示，同状态内保留原有排序', default: false },
  { key: 'enableNodeFlagOverride', type: 'switch', label: '节点标签覆盖国旗', help: '在节点标签中添加 flag:US、flag:JP 等即可指定国旗；未设置或代码无效时仍自动识别', default: false, keywords: 'flag 国旗' },
  { key: 'showRenewalStats', type: 'switch', label: '续费与到期', help: '在首页显示到期风险、到期日程和按币种折算的周期预算', default: true },
  { key: 'allowGuestRenewalStats', type: 'switch', label: '允许访客查看', help: '未登录访客也能看到节点价格、预算与到期信息，这些可能属于敏感财务数据', default: false, visible: isOn('showRenewalStats') },

  // 交互
  { key: 'showLoginButton', type: 'switch', label: '显示登录按钮', help: '未登录时在顶栏显示登录入口', default: true },
  { key: 'showPingChartButton', type: 'switch', label: '显示延迟图表按钮', help: '在节点卡片和列表中提供查看延迟图表的按钮', default: true },
  { key: 'nodeDetailAsLink', type: 'switch', label: '节点详情使用链接', help: '节点卡片和列表使用真实链接，可用中键或 Ctrl/⌘ + 点击在新标签页打开；左键仍在当前页跳转', default: false },
  { key: 'openNodeInNewTab', type: 'switch', label: '左键在新标签打开详情', help: '左键点击节点卡片、列表或地球视图时直接在新标签页打开详情', default: false },
  { key: 'adminPageAsLink', type: 'switch', label: '后台入口使用链接', help: '首页的后台管理按钮使用真实 /admin 链接，可在新标签页打开', default: false },

  // 外观
  { key: 'lightPrimaryColor', type: 'color', label: '主色', default: '#18a058' },
  { key: 'lightPrimaryColorHover', type: 'color', label: '悬停色', default: '#36ad6a' },
  { key: 'lightPrimaryColorPressed', type: 'color', label: '按下色', default: '#0c7a43' },
  { key: 'darkPrimaryColor', type: 'color', label: '主色', default: '#63e2b6' },
  { key: 'darkPrimaryColorHover', type: 'color', label: '悬停色', default: '#7fe7c4' },
  { key: 'darkPrimaryColorPressed', type: 'color', label: '按下色', default: '#5acea7' },
  { key: 'fullWidth', type: 'switch', label: '占满屏幕宽度', help: '页面内容铺满整个窗口宽度', default: false },
  { key: 'maxPageWidth', type: 'text', format: 'cssLength', label: '最大页面宽度', help: '例如 1800px、100rem', default: '1800px', placeholder: '1800px', visible: is('fullWidth', false) },
  { key: 'borderRadius', type: 'text', format: 'cssLength', label: '圆角大小', help: '全局圆角，例如 3px、0.5rem', default: '3px', placeholder: '3px' },
  { key: 'fontFamily', type: 'font', label: '界面字体', help: '多个字体用逗号分隔，靠前的优先', default: '"MiSans VF", sans-serif', sample: 'Komari 服务器监控面板 Aa' },
  { key: 'numberFontFamily', type: 'font', label: '数字字体', help: '用于 CPU、内存、流量等数值', default: '"TCloud Number VF", "MiSans VF", sans-serif', sample: '0123456789 · 98.6% · 12.34 GB' },

  // 卡片
  { key: 'cardMinWidth', type: 'number', slider: true, label: '卡片最小宽度', help: '决定自动分栏的列数，数值越小同屏卡片越多；移动端始终单列', default: 340, min: 260, max: 640, step: 10, unit: 'px' },
  { key: 'cardProgressLayout', type: 'select', display: 'segmented', label: '进度条布局', default: '2col', options: [{ value: '1col', label: '单列' }, { value: '2col', label: '双列' }] },
  { key: 'tagsInSeparateRow', type: 'switch', label: '标签单独一行', help: '自定义标签和价格标签常驻显示在运行时间上方，而不是悬停时才出现', default: false },
  { key: 'uptimeTagWrap', type: 'switch', label: '运行时间使用标签样式', help: '用紫色标签包裹运行时间', default: false },
  { key: 'trafficSplitColor', type: 'switch', label: '流量分色显示', help: '流量统计用绿色表示上行、蓝色表示下行', default: true },
  { key: 'lightCardContrast', type: 'switch', label: '亮色高对比度', help: '亮色模式下为卡片添加阴影和边框', default: false },
  {
    key: 'cardMaterial',
    type: 'select',
    display: 'cards',
    label: '卡片材质',
    default: 'auto',
    options: [
      { value: 'auto', label: '自动', description: '启用背景时用半透明，否则用实色' },
      { value: 'solid', label: '实色', description: '普通不透明卡片' },
      { value: 'translucent', label: '半透明', description: '透出背景但不模糊' },
      { value: 'acrylic', label: '亚克力', description: '半透明并模糊背景' },
      { value: 'liquid-glass', label: '液态玻璃', description: '高光、厚边与色散效果' },
    ],
  },
  { key: 'cardBlurRadius', type: 'number', slider: true, label: '亚克力模糊', help: '与背景模糊相互独立，0 表示半透明但不模糊', default: -1, min: 0, max: 48, unit: 'px', special: { value: -1, label: '跟随背景模糊' }, visible: is('cardMaterial', 'acrylic') },
  {
    key: 'liquidGlassTint',
    type: 'select',
    display: 'segmented',
    label: '玻璃底色',
    default: 'auto',
    options: [{ value: 'auto', label: '自动' }, { value: 'transparent', label: '透明' }, { value: 'white', label: '白色' }, { value: 'black', label: '黑色' }],
    visible: is('cardMaterial', 'liquid-glass'),
  },
  { key: 'liquidGlassStrength', type: 'number', slider: true, label: '材质强度', help: '高光与透明感，建议 36–72', default: 48, min: 0, max: 120, visible: is('cardMaterial', 'liquid-glass') },
  { key: 'liquidGlassDepth', type: 'number', slider: true, label: '边缘厚度', help: '厚边高光与内凹阴影，建议 8–18', default: 10, min: 0, max: 32, visible: is('cardMaterial', 'liquid-glass') },
  { key: 'liquidGlassBlur', type: 'number', slider: true, label: '玻璃模糊', help: '建议 0–6，过高会更吃性能', default: 0, min: 0, max: 24, unit: 'px', visible: is('cardMaterial', 'liquid-glass') },
  { key: 'liquidGlassChromaticAberration', type: 'number', slider: true, label: '色散强度', help: '边缘色散偏移，0 表示关闭，建议 2–5', default: 2, min: 0, max: 24, visible: is('cardMaterial', 'liquid-glass') },

  // 列表
  { key: 'listViewColumns', type: 'listColumns', label: '显示列', help: '勾选要显示的列，调整顺序与宽度', default: '["status","region","name","uptime","tags","os","cpu","mem","disk","traffic"]' },
  { key: 'listColumnWidths', type: 'json', hidden: true, label: '列宽度', default: '{"status":"76px","region":"32px","name":"minmax(200px, 1fr)","uptime":"minmax(180px, 0.6fr)","tags":"minmax(220px, 0.6fr)","os":"120px","cpu":"180px","mem":"180px","disk":"180px","traffic":"180px"}' },
  { key: 'listColumnPadding', type: 'json', hidden: true, label: '列内边距', default: '{}' },
  { key: 'listColumnMargin', type: 'json', hidden: true, label: '列外边距', default: '{}' },
  { key: 'listRowHeight', type: 'text', format: 'cssLength', allowEmpty: true, label: '行高', help: '例如 60px、4rem，留空使用默认高度', default: '', placeholder: '默认' },
  { key: 'listColumnGap', type: 'text', format: 'cssLength', label: '列间距', help: '例如 12px、1rem', default: '12px', placeholder: '12px' },
  { key: 'listStatusStyle', type: 'select', display: 'segmented', label: '状态样式', default: 'tag', options: tagStyleOptions },
  { key: 'listTagsStyle', type: 'select', display: 'segmented', label: '标签样式', default: 'tag', options: tagStyleOptions },

  // 背景
  { key: 'backgroundEnabled', type: 'switch', label: '启用自定义背景', help: '使用图片或视频作为页面背景', default: false },
  { key: 'backgroundType', type: 'select', display: 'segmented', label: '背景类型', default: 'image', options: [{ value: 'image', label: '图片' }, { value: 'video', label: '视频' }], visible: isOn('backgroundEnabled') },
  { key: 'lightBackgroundUrl', type: 'urlList', label: '亮色模式背景', help: '可添加多个地址，每次打开页面随机使用一个，加载失败时自动换下一个', default: '', visible: isOn('backgroundEnabled') },
  { key: 'darkBackgroundUrl', type: 'urlList', label: '暗色模式背景', help: '留空时暗色模式不显示自定义背景', default: '', visible: isOn('backgroundEnabled') },
  { key: 'backgroundBlur', type: 'number', slider: true, label: '背景模糊', default: 0, min: 0, max: 50, unit: 'px', visible: isOn('backgroundEnabled') },
  { key: 'backgroundOverlay', type: 'number', slider: true, label: '背景遮罩', help: '在背景上叠加一层黑色遮罩，数值越大越暗', default: 0, min: 0, max: 100, unit: '%', visible: isOn('backgroundEnabled') },
  { key: 'showSaveBackgroundButton', type: 'switch', label: '保存背景按钮', help: '在右下角显示按钮，保存当前显示的这一张背景', default: false, visible: isOn('backgroundEnabled') },

  // 格式
  {
    key: 'uptimeFormat',
    type: 'select',
    display: 'segmented',
    label: '运行时间精度',
    default: 'day',
    options: [{ value: 'day', label: '天' }, { value: 'hour', label: '小时' }, { value: 'minute', label: '分钟' }, { value: 'second', label: '秒' }],
  },
  { key: 'uptimeShortUnit', type: 'switch', label: '运行时间短单位', help: '使用 d/h/m/s，例如 2d 20h', default: false },
  { key: 'byteDecimalsB', type: 'number', label: 'B', default: 0, min: 0, max: 4, special: { value: -1, label: '不使用' } },
  { key: 'byteDecimalsKB', type: 'number', label: 'KB', default: 0, min: 0, max: 4, special: { value: -1, label: '不使用' } },
  { key: 'byteDecimalsMB', type: 'number', label: 'MB', default: 1, min: 0, max: 4, special: { value: -1, label: '不使用' } },
  { key: 'byteDecimalsGB', type: 'number', label: 'GB', default: 1, min: 0, max: 4, special: { value: -1, label: '不使用' } },
  { key: 'byteDecimalsTB', type: 'number', label: 'TB+', default: 2, min: 0, max: 4, special: { value: -1, label: '不使用' } },

  // 公告
  { key: 'alertEnabled', type: 'switch', label: '显示公告', help: '在首页顶部显示一条公告', default: false },
  {
    key: 'alertType',
    type: 'select',
    display: 'segmented',
    label: '公告类型',
    default: 'info',
    options: [{ value: 'default', label: '默认' }, { value: 'info', label: '信息' }, { value: 'success', label: '成功' }, { value: 'warning', label: '警告' }, { value: 'error', label: '错误' }],
    visible: isOn('alertEnabled'),
  },
  { key: 'alertTitle', type: 'text', label: '标题', default: '', placeholder: '可选', allowEmpty: true, visible: isOn('alertEnabled') },
  { key: 'alertContent', type: 'markdown', label: '内容', help: '支持粗体、斜体、链接等简单 Markdown', default: '', visible: isOn('alertEnabled') },

  // 备案
  { key: 'icpEnabled', type: 'switch', label: '显示 ICP 备案', default: false },
  { key: 'icpNumber', type: 'text', label: 'ICP 备案号', default: '', placeholder: '京ICP备12345678号', allowEmpty: true, visible: isOn('icpEnabled') },
  { key: 'icpUrl', type: 'text', format: 'url', label: 'ICP 跳转链接', default: 'https://beian.miit.gov.cn/', allowEmpty: true, visible: isOn('icpEnabled') },
  { key: 'policeEnabled', type: 'switch', label: '显示公安备案', default: false },
  { key: 'policeNumber', type: 'text', label: '公安备案号', default: '', placeholder: '京公网安备 11010502000000号', allowEmpty: true, visible: isOn('policeEnabled') },
  { key: 'policeUrl', type: 'text', format: 'url', label: '公安备案跳转链接', help: '留空则不跳转', default: '', allowEmpty: true, visible: isOn('policeEnabled') },

  // 连接
  { key: 'dataUpdateInterval', type: 'number', slider: true, label: '数据刷新间隔', help: '实时数据的刷新频率，建议 1–10 秒', default: 3, min: 1, max: 60, unit: '秒', reloadRequired: true },
  {
    key: 'rpcTransportMode',
    type: 'select',
    display: 'cards',
    label: '连接方式',
    default: 'websocket',
    reloadRequired: true,
    options: [
      { value: 'websocket', label: 'WebSocket', description: '实时推送，推荐' },
      { value: 'http', label: 'HTTP 轮询', description: '无法使用 WebSocket 时选择' },
    ],
  },
]

export const SETTING_GROUPS: SettingGroup[] = [
  {
    id: 'home',
    title: '首页',
    icon: 'i-icon-park-outline-home',
    description: '首页的视图、模块与节点排序',
    sections: [
      { title: '视图', keys: ['defaultViewMode', 'enableEarthView'] },
      { title: '模块', keys: ['showGeneralCards', 'hideSingleGroupTab', 'showRenewalStats', 'allowGuestRenewalStats'] },
      { title: '节点', keys: ['offlineNodesLast', 'enableNodeFlagOverride'] },
    ],
  },
  {
    id: 'interaction',
    title: '交互',
    icon: 'i-icon-park-outline-click',
    description: '按钮与链接的打开方式',
    sections: [
      { title: '按钮', keys: ['showLoginButton', 'showPingChartButton'] },
      { title: '链接', keys: ['nodeDetailAsLink', 'openNodeInNewTab', 'adminPageAsLink'] },
    ],
  },
  {
    id: 'appearance',
    title: '外观',
    icon: 'i-icon-park-outline-platte',
    description: '主题色、页面宽度、圆角与字体',
    sections: [
      { title: '亮色主题色', keys: ['lightPrimaryColor', 'lightPrimaryColorHover', 'lightPrimaryColorPressed'], layout: 'grid', extra: 'lightColors' },
      { title: '暗色主题色', keys: ['darkPrimaryColor', 'darkPrimaryColorHover', 'darkPrimaryColorPressed'], layout: 'grid', extra: 'darkColors' },
      { title: '布局', keys: ['fullWidth', 'maxPageWidth', 'borderRadius'] },
      { title: '字体', keys: ['fontFamily', 'numberFontFamily'] },
    ],
  },
  {
    id: 'card',
    title: '卡片',
    icon: 'i-icon-park-outline-view-grid-card',
    description: '卡片视图的布局与材质',
    sections: [
      { title: '布局', keys: ['cardMinWidth', 'cardProgressLayout', 'tagsInSeparateRow', 'uptimeTagWrap', 'trafficSplitColor', 'lightCardContrast'] },
      { title: '材质', keys: ['cardMaterial', 'cardBlurRadius', 'liquidGlassTint', 'liquidGlassStrength', 'liquidGlassDepth', 'liquidGlassBlur', 'liquidGlassChromaticAberration'] },
    ],
  },
  {
    id: 'list',
    title: '列表',
    icon: 'i-icon-park-outline-view-list',
    description: '列表视图的列与样式',
    sections: [
      { title: '列', keys: ['listViewColumns', 'listColumnWidths', 'listColumnPadding', 'listColumnMargin'] },
      { title: '样式', keys: ['listRowHeight', 'listColumnGap', 'listStatusStyle', 'listTagsStyle'] },
    ],
  },
  {
    id: 'background',
    title: '背景',
    icon: 'i-icon-park-outline-pic',
    description: '自定义背景图片或视频',
    sections: [
      { keys: ['backgroundEnabled', 'backgroundType', 'lightBackgroundUrl', 'darkBackgroundUrl'] },
      { title: '效果', keys: ['backgroundBlur', 'backgroundOverlay', 'showSaveBackgroundButton'] },
    ],
  },
  {
    id: 'format',
    title: '格式',
    icon: 'i-icon-park-outline-text',
    description: '运行时间与流量数值的显示方式',
    sections: [
      { title: '运行时间', keys: ['uptimeFormat', 'uptimeShortUnit'] },
      { title: '流量小数位', description: '每个单位保留的小数位数；选择「不使用」后会直接用更大的单位显示', keys: ['byteDecimalsB', 'byteDecimalsKB', 'byteDecimalsMB', 'byteDecimalsGB', 'byteDecimalsTB'], layout: 'grid', extra: 'byteSample' },
    ],
  },
  {
    id: 'announcement',
    title: '公告',
    icon: 'i-icon-park-outline-volume-notice',
    description: '首页顶部的公告',
    sections: [
      { keys: ['alertEnabled', 'alertType', 'alertTitle', 'alertContent'] },
    ],
  },
  {
    id: 'footer',
    title: '备案',
    icon: 'i-icon-park-outline-certificate',
    description: '页脚的 ICP 备案与公安备案',
    sections: [
      { title: 'ICP 备案', keys: ['icpEnabled', 'icpNumber', 'icpUrl'] },
      { title: '公安备案', keys: ['policeEnabled', 'policeNumber', 'policeUrl'] },
    ],
  },
  {
    id: 'connection',
    title: '连接',
    icon: 'i-icon-park-outline-connection',
    description: '实时数据的连接方式与刷新频率',
    sections: [
      { keys: ['rpcTransportMode', 'dataUpdateInterval'] },
    ],
  },
]

export const SETTING_FIELD_MAP: ReadonlyMap<string, SettingField> = new Map(SETTING_FIELDS.map(field => [field.key, field]))

export const THEME_SETTING_DEFAULTS: Readonly<Record<string, SettingValue>> = Object.freeze(
  Object.fromEntries(SETTING_FIELDS.map(field => [field.key, field.default])),
)

/** 补齐缺失的设置项，效果等同于旧版 managed 清单由 Komari 注入默认值 */
export function withThemeSettingDefaults(settings: SettingsRecord | null | undefined): SettingsRecord {
  return { ...THEME_SETTING_DEFAULTS, ...settings }
}
