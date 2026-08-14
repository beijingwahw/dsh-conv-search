/**
 * Engine unit tests: match location, scope exclusions, and navigation math.
 * jsdom provides Range/TreeWalker; the CSS Custom Highlight API is absent, so
 * paint/clearPaint are exercised only as no-ops here.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  BAR_SELECTOR, COMPOSER_SELECTOR, SCROLL_SELECTOR,
  DEFAULT_MATCH_OPTIONS, findMatches, resolveScope,
} from '../src/client/engine.ts'

/** Build a minimal transcript fixture. */
function fixture(): HTMLElement {
  document.body.innerHTML = ''
  const scroll = document.createElement('div')
  scroll.setAttribute('data-conversation-scroll', '')
  const msg1 = document.createElement('div')
  msg1.textContent = 'Hello DeepSeek world'
  const msg2 = document.createElement('div')
  msg2.textContent = 'deepseek is deep'
  const composerSeat = document.createElement('div')
  composerSeat.setAttribute('data-composer-seat', '')
  const draftHint = document.createElement('span')
  draftHint.textContent = 'deepseek draft hint'
  composerSeat.appendChild(draftHint)
  const bar = document.createElement('div')
  bar.setAttribute('data-dsh-conv-search-bar', '')
  bar.textContent = 'deepseek bar'
  scroll.append(msg1, msg2, composerSeat, bar)
  document.body.appendChild(scroll)
  return scroll
}

describe('engine', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('resolves the conversation scrollport', () => {
    fixture()
    expect(resolveScope()).not.toBeNull()
  })

  it('returns null scope when no conversation is rendered', () => {
    expect(resolveScope()).toBeNull()
  })

  it('finds every case-insensitive match in document order', () => {
    const scope = fixture()
    const result = findMatches(scope, 'DEEPSEEK')
    expect(result.total).toBe(2)
    expect(result.matches[0]?.range.toString()).toBe('DeepSeek')
    expect(result.matches[1]?.range.toString()).toBe('deepseek')
  })

  it('finds multiple matches across text nodes', () => {
    const scope = fixture()
    const result = findMatches(scope, 'deep')
    // msg1 "Hello DeepSeek world" -> "Deep" (1); msg2 "deepseek is deep" -> 2.
    expect(result.total).toBe(3)
  })

  it('excludes the composer seat and the plugin bar', () => {
    const scope = fixture()
    const result = findMatches(scope, 'draft')
    expect(result.total).toBe(0)
    const barResult = findMatches(scope, 'bar')
    // 'bar' also appears nowhere in the transcript messages.
    expect(barResult.total).toBe(0)
  })

  it('returns zero matches for an empty query', () => {
    const scope = fixture()
    expect(findMatches(scope, '').total).toBe(0)
    expect(findMatches(scope, '   ').total).toBe(0)
  })

  it('returns zero matches for an absent query', () => {
    const scope = fixture()
    expect(findMatches(scope, 'zzz-not-there').total).toBe(0)
  })

  it('honors case-sensitive matching', () => {
    const scope = fixture()
    // 'DeepSeek' appears once (msg1); 'deepseek' once (msg2).
    const sensitive = findMatches(scope, 'DeepSeek', { caseSensitive: true, wholeWord: false })
    expect(sensitive.total).toBe(1)
    expect(sensitive.matches[0]?.range.toString()).toBe('DeepSeek')
    // Case-insensitive still finds both.
    const insensitive = findMatches(scope, 'DeepSeek', DEFAULT_MATCH_OPTIONS)
    expect(insensitive.total).toBe(2)
  })

  it('honors whole-word matching', () => {
    const scope = fixture()
    // 'deep' is a substring of 'deepseek' twice plus the standalone 'deep'.
    expect(findMatches(scope, 'deep', DEFAULT_MATCH_OPTIONS).total).toBe(3)
    // Whole word: only the standalone 'deep' in msg2 qualifies.
    const whole = findMatches(scope, 'deep', { caseSensitive: false, wholeWord: true })
    expect(whole.total).toBe(1)
    expect(whole.matches[0]?.range.toString()).toBe('deep')
  })

  it('combines case sensitivity with whole word', () => {
    const scope = fixture()
    // 'DeepSeek' whole-word + case-sensitive: only msg1.
    const both = findMatches(scope, 'DeepSeek', { caseSensitive: true, wholeWord: true })
    expect(both.total).toBe(1)
    // 'deep' whole-word + case-sensitive: only the lowercase standalone.
    const lower = findMatches(scope, 'deep', { caseSensitive: true, wholeWord: true })
    expect(lower.total).toBe(1)
  })
})

describe('selectors', () => {
  it('keeps the documented harness anchors', () => {
    expect(SCROLL_SELECTOR).toBe('[data-conversation-scroll]')
    expect(COMPOSER_SELECTOR).toBe('[data-composer-seat]')
    expect(BAR_SELECTOR).toBe('[data-dsh-conv-search-bar]')
  })
})
