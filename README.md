# 接页 Carddesk · Obsidian 插件

当前开发版 **0.4.0**：在卡片中渐进阅读，向 Codex 提问，再把有价值的回答整理为关联卡片。保持原有嵌套布局、内链原地展开、多分支、收起与返回上层。

[聊天与转卡操作说明](docs/CHAT_GUIDE.md) · [安装说明](docs/INSTALL.md) · [已知限制](docs/KNOWN_LIMITATIONS.md)

## 构建与安装

开发需要 Node.js 20+；Python 3 仅用于生成 ZIP。

```sh
npm ci
npm test
npm run build
python3 scripts/package.py
```

将 `dist/carddesk/` 的 main.js、manifest.json、styles.css 复制到测试库 `.obsidian/plugins/carddesk/`，在 Obsidian 第三方插件设置中启用接页。尚未上架社区市场，最低 Obsidian 1.8.7。

将 `fixtures/vault/` 的内容复制到独立测试库根目录。打开 `P0/A.md`，执行“以接页渐进阅读当前笔记”；也可打开 `Chat/入口.md` 尝试聊天。

## 阅读与路径

- 点击整卡内链原地展开，再次点击或“收起”关闭分支。
- 多条分支可以独立展开同一张卡，祖先链接返回已有卡，不无限递归。
- “返回上层”聚焦父卡并保留分支。
- Cmd/Ctrl 点击、标题/块链接、附件、外链、缺失链接沿用宿主行为。
- 命令面板可继续上次阅读、命名保存/恢复/删除阅读路径，或重新关联缺失卡片。
- 正文变化保留分支并刷新，改名更新路径；唯一 card_id 可帮助恢复移动后的身份。

## Codex 聊天与关联卡片

每张卡片右上角可直接“编辑”或“与 Agent 讨论”。编辑打开对应卡片的原生源码标签，阅读隐藏 sources/raw/updated 等属性；旧卡可通过命令预览、备份后整理。

在设置 → 接页 Carddesk 填写本机已登录 Codex CLI 的绝对路径，配置新卡目录并保存。从笔记或接页执行“向 Agent 提问当前卡片”，在右侧聊天。默认只发送当前卡，可明确增加已展开卡片；本会话历史也会发送至模型服务。

选取完整回复中的内容 → 整理为草稿 → 编辑和预览 → 确认创建卡片并关联。新卡标记为“对话补充，待核对”，在原卡末尾加入内链；点击后沿用渐进阅读。聊天不会自主修改笔记或自动检索。

首版只支持 Codex CLI，实际验证版本 0.169.0-alpha.11.1 / macOS。模型服务需要联网和账户额度；阅读不依赖 CLI 或模型。完整边界、停止重试、上下文限额和登录方式见 [操作说明](docs/CHAT_GUIDE.md)。

## 外部 Agent 文件协作

现有“导出 Agent 说明”“检查 Agent 卡片包”继续保留。这条工作流由用户把导出路径和原文交给外部 Agent，插件只导出和校验，不执行其批量任务。

[Agent 文件协议](docs/AGENT_CARD_PROTOCOL.md) · [可选外部检索工具](https://github.com/xlthlx-7/carddesk/tree/main/search)。检索脚本属于原项目，不包含在本插件中。

有效示例 p3-example.json 应为 0 错误、0 警告；p3-invalid-path.json 和 p3-missing-file.json 是刻意失败案例。示例均为原创，不代表模型质量评测。

## 数据与项目

阅读状态、聊天和设置位于 `.obsidian/plugins/carddesk/data.json`。升级前备份；0.3.4 的阅读状态可继续读取。降回 0.3.4 会在保存时移除聊天字段，回退前另存该文件。卸载插件不删除笔记，但删除插件目录前应备份 data.json。

项目从 [Carddesk](https://github.com/xlthlx-7/carddesk) 拆出，插件 ID 仍为 carddesk，不能在同一库同时安装两份。[来源记录](docs/PROVENANCE.md)。0.3.4 Release 保留，尚未发布 0.4.0 Release。

[开发计划](docs/PLAN_0.4.0.md) · [待办](docs/TODO.md) · [测试决策日志](docs/TEST_OPTIMIZATION_LOG.md) · [开发版验证](docs/VALIDATION_0.4.0.md)
