import {App, Modal, Notice, TFile, TFolder, parseYaml, stringifyYaml} from 'obsidian';
import {MetadataPlan, planMetadataMigration} from './card-metadata';
import {safePath} from './protocol-validator';
export async function migrateMetadata(app:App,path:string,plan:MetadataPlan):Promise<string>{
 if(!safePath(path)||!path.endsWith('.md'))throw Error('文件路径不安全');
 const file=app.vault.getAbstractFileByPath(path);if(!(file instanceof TFile))throw Error('卡片不存在');
 if(await app.vault.read(file)!==plan.before)throw Error('卡片已变化，请关闭后重新预览');
 let directory='';for(const part of ['Carddesk','backups','metadata']){directory=directory?directory+'/'+part:part;const f=app.vault.getAbstractFileByPath(directory);if(f&&!(f instanceof TFolder))throw Error('备份目录被文件占用');if(!f)await app.vault.createFolder(directory);}
 // .bak prevents duplicated frontmatter card_id from entering the Markdown metadata index.
 const backup=directory+'/'+crypto.randomUUID()+'.md.bak';
 await app.vault.create(backup,plan.before);
 try{await app.vault.process(file,current=>{if(current!==plan.before)throw Error('卡片在写入前已变化');return plan.after;});}
 catch(error){throw Error('转换未完成，备份保留于 '+backup+'：'+String(error));}
 return backup;
}
export async function previewMetadataMigration(app:App,file:TFile):Promise<void>{
 if(file.stat.size>1024*1024)throw Error('卡片超过 1 MiB，需手工整理');
 const plan=planMetadataMigration(await app.vault.read(file),parseYaml,stringifyYaml);
 new MetadataModal(app,file.path,plan).open();
}
class MetadataModal extends Modal {
 private busy=false;
 private closed=false;
 constructor(app:App,private path:string,private plan:MetadataPlan){super(app);}
 onOpen(){
  this.contentEl.createEl('h2',{text:'预览元信息迁移'});
  this.contentEl.createEl('p',{text:this.path+'：只将标题后的三行元信息移到顶部属性；正文、原有属性和链接不变。确认前不写文件。'});
  this.contentEl.createEl('p',{text:'确认后先在 Carddesk/backups/metadata 创建完整 .md.bak 备份，再检查版本并写入。备份不作为知识卡片参与索引。'});
  for(const [label,text] of [['修改前',this.plan.before],['修改后',this.plan.after]]){const detail=this.contentEl.createEl('details');detail.createEl('summary',{text:label});detail.createEl('pre',{text}).style.whiteSpace='pre-wrap';}
  const status=this.contentEl.createEl('p'),button=this.contentEl.createEl('button',{text:'确认备份并转换当前卡片'});
  button.onclick=async()=>{if(this.busy)return;this.busy=true;button.disabled=true;try{const backup=await migrateMetadata(this.app,this.path,this.plan);new Notice('元信息已转换；备份：'+backup);if(!this.closed){status.setText('已完成，原文件备份于：'+backup);button.setText('已转换');}}catch(error){new Notice(String(error));if(!this.closed)status.setText(String(error));}};
 }
 onClose(){this.closed=true;this.contentEl.empty();}
}
