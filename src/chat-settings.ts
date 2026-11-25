import {App, Plugin, PluginSettingTab, Setting} from 'obsidian';
import {ChatSettings} from './chat-model';
import {safePath} from './protocol-validator';
export class ChatSettingsTab extends PluginSettingTab {
 constructor(app:App,plugin:Plugin,private get:()=>ChatSettings,private save:(s:ChatSettings)=>Promise<void>){super(app,plugin);}
 display():void {
  const el=this.containerEl;el.empty();el.createEl('h2',{text:'接页 · Codex 聊天'});
  el.createEl('p',{text:'先在终端安装并登录 Codex CLI。聊天会把你选中的笔记与历史对话发送给 Codex 的模型服务，不是离线模型。不会把整个 Vault 交给 Agent。'});
  const value={...this.get()};
  new Setting(el).setName('Codex 可执行文件').setDesc('绝对路径，不填命令参数。终端用 command -v codex 或 where codex 查找。').addText(t=>t.setValue(value.codexPath).onChange(v=>value.codexPath=v.trim()));
  new Setting(el).setName('模型（可选）').setDesc('留空使用 Codex 默认模型；不会读取用户 config.toml。').addText(t=>t.setValue(value.model).onChange(v=>value.model=v.trim()));
  new Setting(el).setName('对话卡片目录').setDesc('Vault 相对目录；默认 Cards/Chat。').addText(t=>t.setValue(value.cards).onChange(v=>value.cards=v.trim()));
  const status=el.createEl('p');
  new Setting(el).addButton(b=>b.setButtonText('保存配置').onClick(async()=>{try{if(!safePath(value.cards))throw Error('卡片目录必须为安全的 Vault 相对路径');await this.save(value);status.setText('配置已保存');}catch(e){status.setText('保存失败：'+String(e));}}));
  el.createEl('p',{text:'配置和聊天保存在插件 data.json，与阅读路径共用串行写入。升级前备份；降回 0.3.4 会忽略并在下次保存时移除聊天字段，因此回退前另行备份。'});
 }
}
