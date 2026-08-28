// SE373 brand mark. Upstream's file here is DeepSeek's fish logo, an exact
// extract from their Figma; theirs is not ours to ship, and a page carrying
// their mark would misrepresent whose work it is. Everything else about the
// component is untouched -- name, props, sizing ratio, and `currentColor` ink --
// because every call site is upstream's and none of them should have to know.
//
// The mark is one node fanning into two: a meta-agent and the agents it emits.

import type { IconProps } from './icons/props.ts'

/**
 * Render the brand mark.
 * @param props.size - width in px (default 24; height keeps the 23.16:17.04 ratio).
 * @param props.className - extra class for layout placement.
 * @returns the mark svg (aria-hidden; pair with the wordmark for accessibility).
 */
export function FishLogo({ size = 24, className }: IconProps) {
  return (
    <svg
      width={size}
      height={(size * 17.04) / 23.16}
      className={className}
      viewBox="0 0 23.16 17.04"
      fill="none"
      aria-hidden="true"
    >
      <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <path d="M5.9 7.2 17.4 4.1" />
        <path d="M5.9 9.9 17.4 13.0" />
      </g>
      <g fill="currentColor">
        <circle cx="3.5" cy="8.52" r="2.9" />
        <circle cx="19.7" cy="3.5" r="2.3" />
        <circle cx="19.7" cy="13.6" r="2.3" />
      </g>
    </svg>
  )
}
