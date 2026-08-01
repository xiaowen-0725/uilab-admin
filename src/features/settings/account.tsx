import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

export function AccountSettings() {
  const [email, setEmail] = useState("demo@uilab.dev")
  const [marketing, setMarketing] = useState(true)

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">账户</h3>
        <p className="text-sm text-muted-foreground">
          管理登录邮箱与通知偏好。
        </p>
      </div>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">邮箱</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div className="space-y-0.5">
            <Label htmlFor="marketing">产品更新通知</Label>
            <p className="text-sm text-muted-foreground">
              接收版本更新与模板变更提醒。
            </p>
          </div>
          <Switch
            id="marketing"
            checked={marketing}
            onCheckedChange={setMarketing}
          />
        </div>
        <Button
          onClick={() => toast.success("账户设置已更新（示例）")}
        >
          更新账户
        </Button>
      </div>
    </div>
  )
}
