import { cn } from '@/lib/cn'

import { getInitial } from '../lib/format'

const sizeClasses = {
  sm: 'size-9 text-xs',
  md: 'size-11 text-sm',
  lg: 'size-14 text-lg',
  xl: 'size-20 text-2xl sm:size-24 sm:text-3xl',
}

export function CharacterAvatar({
  name,
  tone,
  size = 'md',
  className,
}: {
  name: string
  tone: number
  size?: keyof typeof sizeClasses
  className?: string
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        `avatar-tone-${tone}`,
        'flex shrink-0 items-center justify-center rounded-2xl font-display font-semibold text-white shadow-sm ring-1 ring-black/5',
        sizeClasses[size],
        className,
      )}
    >
      {getInitial(name)}
    </div>
  )
}
