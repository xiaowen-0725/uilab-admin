import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

export function ProfileSettings() {
  const [name, setName] = useState("演示用户")
  const [bio, setBio] = useState("这是一个可替换的个人资料示例。")

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">个人资料</h3>
        <p className="text-sm text-muted-foreground">
          更新公开显示的名称与简介。
        </p>
      </div>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">显示名称</Label>
          <Input
            id="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="bio">简介</Label>
          <Textarea
            id="bio"
            value={bio}
            onChange={(event) => setBio(event.target.value)}
            rows={4}
          />
        </div>
        <Button
          onClick={() => toast.success("已保存个人资料（示例，未请求后端）")}
        >
          保存更改
        </Button>
      </div>
    </div>
  )
}
