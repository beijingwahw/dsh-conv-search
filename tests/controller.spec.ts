/**
 * Controller integration tests (jsdom): bar lifecycle, search flow, and
 * wrap-around navigation. Timers are faked to drive the input debounce.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { controller } from '../src/client/controller.ts'

/** Build a transcript with two "deepseek" matches. */
function fixture(): void {
  const scroll = document.createElement('div')
  scroll.setAttribute('data-conversation-scroll', '')
  const msg1 = document.createElement('div')
  msg1.textContent = 'Hello DeepSeek world'
  const msg2 = document.createElement('div')
  msg2.textContent = 'deepseek is deep'
  scroll.append(msg1, msg2)
  document.body.appendChild(scroll)
}

describe('controller', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    document.body.innerHTML = ''
    controller.install()
  })

  afterEach(() => {
    controller.uninstall()
    vi.useRealTimers()
  })

  it('mounts a hidden bar and ignores open without a conversation', () => {
    const bar = document.querySelector('[data-dsh-conv-search-bar]')
    expect(bar).not.toBeNull()
    expect((bar as HTMLElement).hidden).toBe(true)
    controller.open()
    expect((bar as HTMLElement).hidden).toBe(true)
  })

  it('opens, searches, and counts matches', () => {
    fixture()
    controller.open()
    const bar = document.querySelector('[data-dsh-conv-search-bar]') as HTMLElement
    const input = bar.querySelector('input') as HTMLInputElement
    const count = bar.querySelector('[data-dsh-conv-search-count]') as HTMLElement
    expect(bar.hidden).toBe(false)

    input.value = 'deepseek'
    input.dispatchEvent(new Event('input'))
    vi.advanceTimersByTime(200)
    expect(count.textContent).toBe('1 / 2')
  })

  it('wraps navigation forward and backward', () => {
    fixture()
    controller.open()
    const bar = document.querySelector('[data-dsh-conv-search-bar]') as HTMLElement
    const input = bar.querySelector('input') as HTMLInputElement
    const count = bar.querySelector('[data-dsh-conv-search-count]') as HTMLElement

    input.value = 'deepseek'
    input.dispatchEvent(new Event('input'))
    vi.advanceTimersByTime(200)
    expect(count.textContent).toBe('1 / 2')

    controller.next()
    expect(count.textContent).toBe('2 / 2')
    controller.next()
    expect(count.textContent).toBe('1 / 2')
    controller.prev()
    expect(count.textContent).toBe('2 / 2')
  })

  it('navigates via real Enter / Shift+Enter keys on the input', () => {
    fixture()
    controller.open()
    const bar = document.querySelector('[data-dsh-conv-search-bar]') as HTMLElement
    const input = bar.querySelector('input') as HTMLInputElement
    const count = bar.querySelector('[data-dsh-conv-search-count]') as HTMLElement

    input.value = 'deepseek'
    input.dispatchEvent(new Event('input'))
    vi.advanceTimersByTime(200)
    expect(count.textContent).toBe('1 / 2')

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(count.textContent).toBe('2 / 2')
    // Shift+Enter walks backward; at 2/2 it lands on 1/2.
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }),
    )
    expect(count.textContent).toBe('1 / 2')
    // And wraps: 1/2 -> 2/2.
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }),
    )
    expect(count.textContent).toBe('2 / 2')
  })

  it('reports no results for an absent query', () => {
    fixture()
    controller.open()
    const bar = document.querySelector('[data-dsh-conv-search-bar]') as HTMLElement
    const input = bar.querySelector('input') as HTMLInputElement
    const count = bar.querySelector('[data-dsh-conv-search-count]') as HTMLElement

    input.value = 'zzz'
    input.dispatchEvent(new Event('input'))
    vi.advanceTimersByTime(200)
    expect(count.textContent).not.toBe('')
    expect(count.textContent).not.toContain('/')
  })

  it('closes on Escape from outside the input', () => {
    fixture()
    controller.open()
    const bar = document.querySelector('[data-dsh-conv-search-bar]') as HTMLElement
    expect(bar.hidden).toBe(false)
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(bar.hidden).toBe(true)
  })

  it('closes on Escape even while the input holds focus', () => {
    fixture()
    controller.open()
    const bar = document.querySelector('[data-dsh-conv-search-bar]') as HTMLElement
    const input = bar.querySelector('input') as HTMLInputElement
    input.focus()
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(bar.hidden).toBe(true)
  })

  it('navigates with F3 and Ctrl+G while open', () => {
    fixture()
    controller.open()
    const bar = document.querySelector('[data-dsh-conv-search-bar]') as HTMLElement
    const input = bar.querySelector('input') as HTMLInputElement
    const count = bar.querySelector('[data-dsh-conv-search-count]') as HTMLElement

    input.value = 'deepseek'
    input.dispatchEvent(new Event('input'))
    vi.advanceTimersByTime(200)
    expect(count.textContent).toBe('1 / 2')

    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'F3', bubbles: true }))
    expect(count.textContent).toBe('2 / 2')
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'g', ctrlKey: true, shiftKey: true, bubbles: true }),
    )
    expect(count.textContent).toBe('1 / 2')
  })

  it('marks the no-result state and re-shakes on repeated navigation', () => {
    fixture()
    controller.open()
    const bar = document.querySelector('[data-dsh-conv-search-bar]') as HTMLElement
    const input = bar.querySelector('input') as HTMLInputElement

    input.value = 'zzz'
    input.dispatchEvent(new Event('input'))
    vi.advanceTimersByTime(200)
    expect(bar.hasAttribute('data-no-result')).toBe(true)
    expect(bar.classList.contains('dsh-conv-search-shake')).toBe(true)

    // Repeated Enter on zero results retriggers the shake cue.
    bar.classList.remove('dsh-conv-search-shake')
    controller.next()
    expect(bar.classList.contains('dsh-conv-search-shake')).toBe(true)

    // Typing again clears the state.
    input.value = 'deepseek'
    input.dispatchEvent(new Event('input'))
    expect(bar.hasAttribute('data-no-result')).toBe(false)
  })

  it('mirrors the open state onto the header action button', () => {
    fixture()
    const btn = document.createElement('button')
    btn.className = 'dsh-conv-search-action'
    document.body.appendChild(btn)

    controller.open()
    expect(btn.getAttribute('aria-pressed')).toBe('true')
    controller.close()
    expect(btn.getAttribute('aria-pressed')).toBe('false')
  })

  it('opens on Ctrl+F when a conversation is rendered', () => {
    fixture()
    const bar = document.querySelector('[data-dsh-conv-search-bar]') as HTMLElement
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true }))
    expect(bar.hidden).toBe(false)
  })

  it('toggles case-sensitive matching from the Aa button', () => {
    fixture()
    controller.open()
    const bar = document.querySelector('[data-dsh-conv-search-bar]') as HTMLElement
    const input = bar.querySelector('input') as HTMLInputElement
    const count = bar.querySelector('[data-dsh-conv-search-count]') as HTMLElement
    const toggles = bar.querySelectorAll('[data-dsh-conv-search-toggle]')
    const caseBtn = toggles[0] as HTMLButtonElement

    input.value = 'DeepSeek'
    input.dispatchEvent(new Event('input'))
    vi.advanceTimersByTime(200)
    expect(count.textContent).toBe('1 / 2')

    caseBtn.click()
    expect(caseBtn.getAttribute('aria-pressed')).toBe('true')
    expect(count.textContent).toBe('1 / 1')

    caseBtn.click()
    expect(caseBtn.getAttribute('aria-pressed')).toBe('false')
    expect(count.textContent).toBe('1 / 2')
  })

  it('toggles whole-word matching from the ab button', () => {
    fixture()
    controller.open()
    const bar = document.querySelector('[data-dsh-conv-search-bar]') as HTMLElement
    const input = bar.querySelector('input') as HTMLInputElement
    const count = bar.querySelector('[data-dsh-conv-search-count]') as HTMLElement
    const toggles = bar.querySelectorAll('[data-dsh-conv-search-toggle]')
    const wordBtn = toggles[1] as HTMLButtonElement

    input.value = 'deep'
    input.dispatchEvent(new Event('input'))
    vi.advanceTimersByTime(200)
    expect(count.textContent).toBe('1 / 3')

    wordBtn.click()
    expect(count.textContent).toBe('1 / 1')
  })

  it('browses query history with ArrowUp / ArrowDown', () => {
    fixture()
    controller.open()
    const bar = document.querySelector('[data-dsh-conv-search-bar]') as HTMLElement
    const input = bar.querySelector('input') as HTMLInputElement

    // Commit two queries via Enter.
    input.value = 'deepseek'
    input.dispatchEvent(new Event('input'))
    vi.advanceTimersByTime(200)
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    input.value = 'world'
    input.dispatchEvent(new Event('input'))
    vi.advanceTimersByTime(200)
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

    // ArrowUp walks newest -> older; ArrowDown returns to the parked draft.
    input.value = 'draft'
    input.dispatchEvent(new Event('input'))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    expect(input.value).toBe('world')
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    expect(input.value).toBe('deepseek')
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    expect(input.value).toBe('world')
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    expect(input.value).toBe('draft')
  })

  it('keeps the active match anchored while the transcript mutates', async () => {
    const scroll = document.createElement('div')
    scroll.setAttribute('data-conversation-scroll', '')
    const msg1 = document.createElement('div')
    msg1.textContent = 'first deepseek here'
    const msg2 = document.createElement('div')
    msg2.textContent = 'second deepseek there'
    scroll.append(msg1, msg2)
    document.body.appendChild(scroll)

    controller.open()
    const bar = document.querySelector('[data-dsh-conv-search-bar]') as HTMLElement
    const input = bar.querySelector('input') as HTMLInputElement
    const count = bar.querySelector('[data-dsh-conv-search-count]') as HTMLElement

    input.value = 'deepseek'
    input.dispatchEvent(new Event('input'))
    vi.advanceTimersByTime(200)
    // Move to the second match.
    controller.next()
    expect(count.textContent).toBe('2 / 2')

    // A new match appears BEFORE the active one (e.g. a paged-in older page).
    const older = document.createElement('div')
    older.textContent = 'paged deepseek history'
    scroll.prepend(older)
    // jsdom MutationObserver callbacks are microtasks; the async timer API
    // flushes them so the debounced re-sync runs.
    await vi.advanceTimersByTimeAsync(400)

    // The cursor must still point at the SAME (second message) match,
    // now index 3 of 3 — not jump to the newly prepended one.
    expect(count.textContent).toBe('3 / 3')
  })
})
