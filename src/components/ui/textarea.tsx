import type { ComponentProps } from 'react'

import { cn } from '@/lib/cn'

function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'border-input placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-ring/20 flex min-h-20 w-full rounded-xl border bg-transparent px-3 py-2.5 text-sm leading-relaxed shadow-sm transition-colors outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
