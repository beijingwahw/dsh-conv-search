/**
 * Tiny self-contained i18n for the search bar. The bar renders outside the
 * slot render tree (fixed overlay), so it carries its own dictionaries and
 * picks the language from the document/navigator instead of the locale
 * service — zero extra service dependencies.
 */

/** Simplified Chinese dictionary (key-set source of truth). */
const zh = {
  'action.label': '会话内搜索',
  'action.aria': '在当前会话中搜索文本 (Ctrl+F)',
  'action.hint': '会话内搜索 (Ctrl+F)',
  'input.placeholder': '搜索当前会话…',
  'count.none': '无结果',
  'count.of': '{index} / {total}',
  'button.prev': '上一个 (Shift+Enter)',
  'button.next': '下一个 (Enter)',
  'button.close': '关闭 (Esc)',
  'toggle.case': '区分大小写',
  'toggle.word': '全词匹配',
} satisfies Record<string, string>

/** Dictionary key union. */
export type SearchKey = keyof typeof zh

/** English dictionary, complete against the zh key set. */
const en: Record<SearchKey, string> = {
  'action.label': 'Search in conversation',
  'action.aria': 'Search text in this conversation (Ctrl+F)',
  'action.hint': 'Search in conversation (Ctrl+F)',
  'input.placeholder': 'Search this conversation…',
  'count.none': 'No results',
  'count.of': '{index} / {total}',
  'button.prev': 'Previous (Shift+Enter)',
  'button.next': 'Next (Enter)',
  'button.close': 'Close (Esc)',
  'toggle.case': 'Match case',
  'toggle.word': 'Whole word',
}

/**
 * Detect the UI language once: the document lang attribute wins, then the
 * navigator; anything Chinese-prefixed maps to zh, everything else to en.
 * @returns the active dictionary.
 */
function detectDict(): Record<SearchKey, string> {
  const lang = (document.documentElement.lang || navigator.language || 'en').toLowerCase()
  return lang.startsWith('zh') ? zh : en
}

let active: Record<SearchKey, string> | undefined

/**
 * Translate one key.
 * @param key - dictionary key.
 * @returns the localized text.
 */
export function t(key: SearchKey): string {
  active ??= detectDict()
  return active[key]
}

/**
 * Fill `{name}`-style placeholders in a dictionary template.
 * @param template - dictionary text.
 * @param params - placeholder values.
 * @returns the filled text.
 */
export function fmt(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => String(params[name] ?? `{${name}}`))
}
