/**
 * Tiny self-contained i18n for the search bar. The bar renders outside the
 * slot render tree (fixed overlay), so it carries its own dictionaries and
 * picks the language from the document/navigator instead of the locale
 * service — zero extra service dependencies.
 */
/** Simplified Chinese dictionary (key-set source of truth). */
declare const zh: {
    'action.label': string;
    'action.aria': string;
    'action.hint': string;
    'input.placeholder': string;
    'count.none': string;
    'count.of': string;
    'button.prev': string;
    'button.next': string;
    'button.close': string;
    'toggle.case': string;
    'toggle.word': string;
};
/** Dictionary key union. */
export type SearchKey = keyof typeof zh;
/**
 * Translate one key.
 * @param key - dictionary key.
 * @returns the localized text.
 */
export declare function t(key: SearchKey): string;
/**
 * Fill `{name}`-style placeholders in a dictionary template.
 * @param template - dictionary text.
 * @param params - placeholder values.
 * @returns the filled text.
 */
export declare function fmt(template: string, params: Record<string, string | number>): string;
export {};
