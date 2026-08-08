# S15 sidecar unavailable

{
  "wrong_port_error": "URLError: <urlopen error [Errno 61] Connection refused>",
  "connection_error": "[Errno 61] Connection refused",
  "honest_failure": "connection refused / unreachable — product must surface this not fake success",
  "expected_ui": "侧车 HTTP error or 侧车未返回 / 连接失败; not run.completed success"
}

Method: probe non-listening port 3199 → connection error.
Product path: VoltAgentRuntimeAdapter.failRun emits run.failed with Chinese message (HTTP/stream error).
Live UI verification follows with Playwright against stopped proxy path if needed.

## UI live (2026-08-08)

1. Stopped sidecar :3141.
2. Submitted message「侧车已停测试」via Workbench UI (VITE_RUNTIME_ADAPTER=voltagent).
3. Observed Timeline:
   - 回复失败
   - 运行失败
   - 侧车 HTTP 502: Bad Gateway
4. Not a fake success.
5. Evidence: `S15-sidecar-down.png`
