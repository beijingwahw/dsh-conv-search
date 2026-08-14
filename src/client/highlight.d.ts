// Minimal ambient types for the CSS Custom Highlight API. Modern evergreen
// browsers ship it (Chrome 105+, Safari 17.2+, Firefox 132+); declared here so
// the strict typecheck passes regardless of the DOM lib version in use.

declare class Highlight {
  constructor(...ranges: Range[])
  add(range: Range): void
  clear(): void
  readonly size: number
}

interface HighlightRegistry {
  set(name: string, highlight: Highlight): void
  get(name: string): Highlight | undefined
  delete(name: string): void
  clear(): void
}
