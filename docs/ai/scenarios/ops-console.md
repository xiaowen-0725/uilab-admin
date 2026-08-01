# Scenario: ops-console

运营 / 内部中后台。

## 适合

- 工单、设备、车场、客服队列、审核后台
- 用户主要在“列表处理 + 详情操作”

## 默认构成

- Shell：`sidebar + compact + system`
- 必装模块：仪表盘、数据列表、设置、认证、错误页
- 推荐：队列型列表（tasks-like）

## 初始导航建议

- 概览 / 业务 / 系统

## 裁剪建议

- 不需要的多团队切换可简化
- 过多 auth 变体页可只留 sign-in / sign-up

## Extend 常见下一步

- `data-table-list` 加业务实体列表
- `settings-section` 加系统参数
