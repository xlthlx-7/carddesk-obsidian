# 安装与操作

插件尚未上架社区市场。最低 Obsidian 1.8.7，已实测 macOS 1.9.14；其他平台尚未完成验证。

## 从源码构建

需要 Node.js 20+ 和 npm；首次安装开发依赖需要联网。Python 3 只用于打包。

```sh
npm ci
npm test
npm run build
python3 scripts/package.py
```

输出 `dist/carddesk/` 中的 main.js、manifest.json、styles.css 及两个 ZIP。

## 安装与阅读

1. 创建独立的 Obsidian 测试库。
2. 将三个程序文件复制到 `<测试库>/.obsidian/plugins/carddesk/`。macOS 用 Command+Shift+. 显示隐藏目录。
3. 将 `fixtures/vault/` 的内容复制到测试库根目录，或将示例 ZIP 解压到根目录。
4. 设置 → 第三方插件中关闭受限模式，刷新或重启后启用“接页 Carddesk”。
5. 原生打开 `P0/A.md`，Command+P / Ctrl+P 执行“以接页渐进阅读当前笔记”。
6. 点击 A→B、A→C，再分别展开 D，检查多分支。再次点击内链或“收起”关闭分支；“返回上层”保留分支并聚焦父卡。

命令面板可执行“继续上次阅读”“保存当前阅读路径”“打开已保存的阅读路径”和“删除已保存的阅读路径”。没有新增顶部路径按钮。

## Agent 拆卡

执行“导出 Agent 说明”，配置目录并确认预览。将导出的拆卡说明、原文路径和任务交给本地 Agent。完成后执行“检查 Agent 卡片包”，通过后打开入口。

插件不启动 Agent、不连接模型。PDF 提取或 OCR 由外部工具完成。可选检索须另外安装 [原项目检索工具](https://github.com/xlthlx-7/carddesk/tree/main/search)，导出说明中的检索脚本路径属于该工具项目，不属于本插件仓库。

## 升级与卸载

升级前备份库及 `.obsidian/plugins/carddesk/data.json`。禁用插件，只替换三个程序文件，保留 data.json，然后启用或重启。插件 ID 沿用 carddesk，可继续使用原版阅读路径；同一库不能同时安装两份同 ID 插件。

禁用不会删除状态。卸载时先备份 data.json，再禁用并删除插件目录，Markdown 笔记保留。恢复状态前先关闭或禁用插件，不修改运行中的 data.json。状态损坏或版本不支持时，插件会停止写入并提示；先备份，再修复或移走损坏文件。

示例为原创说明材料。`p3-invalid-path.json` 与 `p3-missing-file.json` 故意用于失败测试；有效示例 `p3-example.json` 应为 0 错误、0 警告。
