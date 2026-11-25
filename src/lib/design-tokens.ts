/**
 * JavaScript access to the CSS design tokens.
 *
 * The CSS variables in `src/styles/theme.css` remain the source of truth.
 * Use this object for charts or libraries that cannot consume CSS classes.
 */
export const designTokens = {
  color: {
    background: 'var(--background)',
    foreground: 'var(--foreground)',
    card: 'var(--card)',
    primary: 'var(--primary)',
    muted: 'var(--muted)',
    mutedForeground: 'var(--muted-foreground)',
    border: 'var(--border)',
    success: 'var(--success)',
    warning: 'var(--warning)',
    danger: 'var(--destructive)',
    chart: [
      'var(--chart-1)',
      'var(--chart-2)',
      'var(--chart-3)',
      'var(--chart-4)',
      'var(--chart-5)',
    ],
  },
  chart: {
    grid: 'var(--border)',
    tooltip: 'var(--popover)',
  },
  radius: {
    sm: 'calc(var(--radius) - 0.25rem)',
    md: 'calc(var(--radius) - 0.125rem)',
    lg: 'var(--radius)',
    xl: 'calc(var(--radius) + 0.35rem)',
  },
  motion: {
    fast: 0.16,
    normal: 0.24,
    slow: 0.4,
  },
} as const
