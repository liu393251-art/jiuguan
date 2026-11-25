import { ArrowLeft, Compass } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="max-w-md p-8 text-center">
        <div className="bg-muted mx-auto flex size-14 items-center justify-center rounded-2xl">
          <Compass className="text-muted-foreground size-6" />
        </div>
        <p className="text-muted-foreground mt-5 text-xs font-semibold tracking-[0.18em] uppercase">
          404
        </p>
        <h1 className="font-display mt-2 text-2xl font-semibold">这扇门后面没有房间</h1>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          地址可能写错了，或者这段内容已经被删除。回到对话列表，灯还亮着。
        </p>
        <Button className="mt-6" asChild>
          <Link to="/">
            <ArrowLeft />
            回到对话
          </Link>
        </Button>
      </Card>
    </div>
  )
}
