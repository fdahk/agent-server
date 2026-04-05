# resource-organizer-agent

这是当前项目中“资源整理 Agent”业务模块，对外提供资源整理任务的创建、进度流式推送、结果查询与产物生成能力。

## 职责

- 接收前端提交的整理任务。
- 采集本地目录和网页资源。
- 调用模型进行规划、摘要、记忆聚合和最终报告生成。
- 通过 SSE 持续向前端推送运行进度。
- 把最终整理结果输出为 Markdown/JSON 文件。

## 当前子结构

- `controller.ts`：HTTP/SSE 接口入口。
- `service.ts`：模块主业务编排层。
- `services`：拆分后的子服务实现。
- `providers`：模型或外部能力提供者。
- `types`：该模块专属类型定义。
- `module.ts`：Nest 模块装配入口。
