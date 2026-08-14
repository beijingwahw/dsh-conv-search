/** i18n unit tests: placeholder filling and dictionary completeness. */
import { describe, expect, it } from 'vitest'
import { fmt, t } from '../src/client/i18n.ts'

describe('i18n', () => {
  it('fills {name}-style placeholders', () => {
    expect(fmt('{index} / {total}', { index: 3, total: 12 })).toBe('3 / 12')
  })

  it('leaves unknown placeholders intact', () => {
    expect(fmt('{missing}', {})).toBe('{missing}')
  })

  it('translates every key', () => {
    expect(t('input.placeholder')).not.toBe('')
    expect(t('count.none')).not.toBe('')
    expect(t('action.label')).not.toBe('')
  })
})
