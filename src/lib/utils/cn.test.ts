import { cn } from '@/lib/utils/cn'

describe('cn utility', () => {
  it('joins class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('handles conditional classes', () => {
    expect(cn('base', true && 'conditional')).toBe('base conditional')
    expect(cn('base', false && 'conditional')).toBe('base')
  })

  it('handles tailwind merge', () => {
    expect(cn('p-2 p-4')).toBe('p-4')
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500')
  })

  it('handles empty and falsy values', () => {
    expect(cn('', null, undefined, 'valid')).toBe('valid')
    expect(cn()).toBe('')
  })
})
