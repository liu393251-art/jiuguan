import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/cn'

import { createCharacter, getErrorMessage, updateCharacter } from '../api'
import type { Character } from '../types'

const characterFormSchema = z.object({
  name: z.string().min(1, '请填写角色名。').max(40, '角色名不超过 40 个字。'),
  tagline: z.string().max(60, '一句话介绍不超过 60 个字。'),
  description: z.string().min(1, '请填写人物背景。'),
  personality: z.string(),
  scenario: z.string(),
  firstMessage: z.string().min(1, '请填写开场白。'),
  exampleDialogue: z.string(),
  tagsText: z.string(),
})

type CharacterFormValues = z.infer<typeof characterFormSchema>

const tones = [0, 1, 2, 3, 4]

function toDefaults(character?: Character | null): CharacterFormValues {
  return {
    name: character?.name ?? '',
    tagline: character?.tagline ?? '',
    description: character?.description ?? '',
    personality: character?.personality ?? '',
    scenario: character?.scenario ?? '',
    firstMessage: character?.firstMessage ?? '',
    exampleDialogue: character?.exampleDialogue ?? '',
    tagsText: character?.tags.join('，') ?? '',
  }
}

export function CharacterFormDialog({
  open,
  onOpenChange,
  character,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  character?: Character | null
  onSaved: (character: Character) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[calc(var(--safe-top)+0.75rem)] bottom-[calc(var(--safe-bottom)+0.75rem)] flex max-h-none max-w-2xl translate-y-0 flex-col gap-0 overflow-hidden p-0 sm:top-1/2 sm:bottom-auto sm:max-h-[calc(100dvh-2rem)] sm:-translate-y-1/2 sm:gap-5 sm:p-6">
        <div className="shrink-0 px-5 pt-5 sm:px-0 sm:pt-0">
          <DialogHeader>
            <DialogTitle>{character ? '编辑角色' : '新建角色'}</DialogTitle>
            <DialogDescription>
              这些资料只用于当前原型。开场白会作为新对话的第一条消息。
            </DialogDescription>
          </DialogHeader>
        </div>
        {open && (
          <CharacterForm
            key={character?.id ?? 'new'}
            character={character}
            onOpenChange={onOpenChange}
            onSaved={onSaved}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function CharacterForm({
  character,
  onOpenChange,
  onSaved,
}: {
  character?: Character | null
  onOpenChange: (open: boolean) => void
  onSaved: (character: Character) => void
}) {
  const [tone, setTone] = useState(character?.avatarTone ?? 0)
  const form = useForm<CharacterFormValues>({
    resolver: zodResolver(characterFormSchema),
    defaultValues: toDefaults(character),
  })

  async function onSubmit(values: CharacterFormValues) {
    const tags = values.tagsText
      .split(/[,，、]/)
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 8)
    const input = {
      ...values,
      tags,
      avatarTone: tone,
    }

    try {
      const saved = character
        ? await updateCharacter(character.id, input)
        : await createCharacter(input)
      toast.success(character ? '角色资料已更新' : '角色已创建', {
        description: `${saved.name} 已保存在本地。`,
      })
      onSaved(saved)
      onOpenChange(false)
    } catch (error) {
      toast.error('保存角色失败', { description: getErrorMessage(error) })
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
      <div
        data-testid="character-form-scroll"
        className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-0 sm:py-0"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="角色名" error={form.formState.errors.name?.message}>
            <Input {...form.register('name')} placeholder="输入角色名" />
          </Field>
          <Field label="一句话介绍" error={form.formState.errors.tagline?.message}>
            <Input {...form.register('tagline')} placeholder="一句话介绍" />
          </Field>
        </div>

        <Field label="头像色调">
          <div className="flex items-center gap-2">
            {tones.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setTone(value)}
                aria-label={`头像色调 ${value + 1}`}
                aria-pressed={tone === value}
                className={cn(
                  `avatar-tone-${value}`,
                  'size-9 rounded-xl ring-1 ring-black/5 transition-transform',
                  tone === value && 'ring-primary scale-110 ring-2',
                )}
              />
            ))}
          </div>
        </Field>

        <Field label="人物背景" error={form.formState.errors.description?.message}>
          <Textarea {...form.register('description')} className="min-h-24" />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="性格与说话方式">
            <Textarea {...form.register('personality')} className="min-h-24" />
          </Field>
          <Field label="场景设定">
            <Textarea {...form.register('scenario')} className="min-h-24" />
          </Field>
        </div>

        <Field label="开场白" error={form.formState.errors.firstMessage?.message}>
          <Textarea {...form.register('firstMessage')} className="min-h-28" />
        </Field>

        <Field label="示例对白（可选）">
          <Textarea {...form.register('exampleDialogue')} className="min-h-20" />
        </Field>

        <Field label="标签" hint="用逗号分隔，最多 8 个">
          <Input {...form.register('tagsText')} placeholder="治愈，慢热，都市" />
        </Field>
      </div>

      <DialogFooter className="mt-0 shrink-0 px-5 pb-4 sm:px-0 sm:pb-5">
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={form.formState.isSubmitting}
        >
          取消
        </Button>
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
          {character ? '保存修改' : '创建角色'}
        </Button>
      </DialogFooter>
    </form>
  )
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string
  hint?: string
  error?: string
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label>{label}</Label>
        {hint && <span className="text-muted-foreground text-[10px]">{hint}</span>}
      </div>
      {children}
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  )
}
