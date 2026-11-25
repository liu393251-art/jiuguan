import { Activity, ChevronDown } from 'lucide-react'
import { useId, useState } from 'react'

import { cn } from '@/lib/cn'

import type { StateCardData, StateParticipant, StateStat } from '../lib/state-card'

const STAT_TONES: Record<string, { bar: string; chip: string; text: string }> = {
  favor: { bar: 'bg-chart-1', chip: 'bg-chart-1/10', text: 'text-chart-1' },
  desire: { bar: 'bg-chart-4', chip: 'bg-chart-4/10', text: 'text-chart-4' },
  corruption: { bar: 'bg-chart-3', chip: 'bg-chart-3/15', text: 'text-chart-3' },
  hatred: { bar: 'bg-destructive', chip: 'bg-destructive/10', text: 'text-destructive' },
  trust: { bar: 'bg-chart-2', chip: 'bg-chart-2/10', text: 'text-chart-2' },
  guard: { bar: 'bg-chart-5', chip: 'bg-chart-5/10', text: 'text-chart-5' },
}

const DEFAULT_TONE = {
  bar: 'bg-primary',
  chip: 'bg-primary/10',
  text: 'text-primary',
}

function toneFor(key: string) {
  return STAT_TONES[key] ?? DEFAULT_TONE
}

function genderLabel(gender: StateParticipant['gender']) {
  if (gender === 'female') return '女'
  if (gender === 'male') return '男'
  return '其他'
}

function participantMeta(participant: StateParticipant) {
  return [
    genderLabel(participant.gender),
    participant.age === null ? '' : `${participant.age} 岁`,
    participant.role,
  ]
    .filter(Boolean)
    .join(' · ')
}

function deltaLabel(delta: number | null) {
  if (delta === null || delta === 0) return ''
  return delta > 0 ? `+${delta}` : String(delta)
}

function StatMeter({ stat }: { stat: StateStat }) {
  const tone = toneFor(stat.key)
  const delta = deltaLabel(stat.delta)

  return (
    <div data-testid={`state-stat-${stat.key}`}>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-muted-foreground text-[11px] font-medium">{stat.label}</span>
        <span className="flex items-baseline gap-1 tabular-nums">
          <span className={cn('text-sm font-semibold', tone.text)}>{stat.value}</span>
          <span className="text-muted-foreground/60 text-[9px]">/100</span>
          {delta && (
            <span
              className={cn('rounded px-1 py-0.5 text-[9px] font-semibold', tone.chip, tone.text)}
            >
              {delta}
            </span>
          )}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={stat.label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={stat.value}
        aria-valuetext={`${stat.value} / 100`}
        className="bg-muted h-1.5 overflow-hidden rounded-full"
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-500', tone.bar)}
          style={{ width: `${stat.value}%` }}
        />
      </div>
    </div>
  )
}

function ParticipantDetail({ participant }: { participant: StateParticipant }) {
  return (
    <div
      className="border-border/70 bg-card min-w-0 rounded-xl border p-3"
      data-testid={`state-participant-${participant.name}`}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="bg-secondary text-secondary-foreground flex size-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold">
          {participant.name.slice(0, 1)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold">{participant.name}</p>
          <p className="text-muted-foreground truncate text-[10px]">
            {participantMeta(participant)}
          </p>
        </div>
      </div>

      <div className="mt-3 space-y-2.5">
        {participant.stats.map((stat) => (
          <StatMeter key={stat.key} stat={stat} />
        ))}
      </div>

      {participant.note && (
        <p className="text-muted-foreground border-border/60 mt-3 border-t pt-2 text-[10px] leading-relaxed">
          <span className="text-foreground/80 font-medium">近况 </span>
          {participant.note}
        </p>
      )}
    </div>
  )
}

export function StateCard({ data }: { data: StateCardData }) {
  const [expanded, setExpanded] = useState(false)
  const panelId = useId()
  const statCount = data.participants.reduce(
    (total, participant) => total + participant.stats.length,
    0,
  )

  return (
    <section
      className="border-border/80 bg-card overflow-hidden rounded-2xl border text-left shadow-sm"
      aria-label={data.title}
      data-testid="state-card"
      data-state={expanded ? 'expanded' : 'collapsed'}
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        data-testid="state-card-toggle"
        onClick={() => setExpanded((current) => !current)}
        className="hover:bg-muted/35 flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors sm:px-4"
      >
        <span className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-lg">
          <Activity className="size-4" aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block text-[12px] font-semibold">{data.title}</span>
          <span className="text-muted-foreground block text-[10px]">
            {data.participants.length} 位角色 · {statCount} 项数值
          </span>
        </span>
        <span className="text-muted-foreground ml-auto flex shrink-0 items-center gap-1 text-[10px] font-medium">
          {expanded ? '收起' : '展开'}
          <ChevronDown
            className={cn('size-3.5 transition-transform', expanded && 'rotate-180')}
            aria-hidden="true"
          />
        </span>
      </button>

      <div className="border-border/60 flex flex-wrap gap-1.5 border-t px-3 py-2 sm:px-4">
        {data.participants.map((participant) => (
          <span
            key={participant.name}
            className="bg-muted/55 text-muted-foreground inline-flex max-w-full flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-lg px-2 py-1 text-[10px]"
          >
            <span className="text-foreground/85 font-medium">{participant.name}</span>
            {participant.stats.length === 0 ? (
              <span>待记录</span>
            ) : (
              participant.stats.map((stat) => (
                <span key={stat.key} className="whitespace-nowrap tabular-nums">
                  {stat.label.replace(/[值度]$/, '')} {stat.value}
                </span>
              ))
            )}
          </span>
        ))}
      </div>

      <div
        id={panelId}
        hidden={!expanded}
        className="border-border/60 bg-muted/15 border-t px-3 py-3 sm:px-4"
      >
        <div className="grid gap-2.5 md:grid-cols-2">
          {data.participants.map((participant) => (
            <ParticipantDetail key={participant.name} participant={participant} />
          ))}
        </div>
      </div>
    </section>
  )
}
