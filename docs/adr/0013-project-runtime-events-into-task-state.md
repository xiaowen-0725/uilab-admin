# Project Runtime events into Task state

Agent Runtime 与 Workbench 通过 Runtime Command 和不可变、只追加的 Agent Runtime Event 协作；Task Module 使用 Reducer/Projection 从 Snapshot 与后续事件生成 Task Projection，重进任务时先恢复 Snapshot 再续接事件。Renderer 不承担完整 Event Sourcing 或权威事件存储，只把事件协议作为稳定 Seam，从而统一流式输出、工具调用、批准、取消、重试和断线恢复的状态演进。
