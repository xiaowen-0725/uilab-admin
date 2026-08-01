import { Link, useNavigate, useSearch } from "@tanstack/react-router"
import { useState } from "react"
import { toast } from "sonner"
import { AuthLayout } from "@/features/auth/auth-layout"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function SignIn() {
  const navigate = useNavigate()
  const { redirect } = useSearch({ from: "/(auth)/sign-in" })
  const [email, setEmail] = useState("demo@uilab.dev")
  const [password, setPassword] = useState("password")
  const [loading, setLoading] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    await new Promise((resolve) => setTimeout(resolve, 600))
    setLoading(false)
    toast.success(`欢迎回来，${email}`)
    navigate({ to: redirect || "/", replace: true })
  }

  return (
    <AuthLayout>
      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-lg tracking-tight">登录</CardTitle>
          <CardDescription>
            输入邮箱和密码登录模板后台。还没有账号？{" "}
            <Link
              to="/sign-up"
              className="underline underline-offset-4 hover:text-primary"
            >
              注册
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email">邮箱</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
            <Button type="submit" className="mt-1" disabled={loading}>
              {loading ? "登录中..." : "登录"}
            </Button>
          </form>
        </CardContent>
        <CardFooter>
          <p className="text-center text-sm text-muted-foreground">
            第一期为前端演示登录，不会请求真实认证服务。
          </p>
        </CardFooter>
      </Card>
    </AuthLayout>
  )
}
