import {App, Modal, Notice, TFile} from 'obsidian';
import {CardTask, newTask, sourceUnits, buildTask, taskEntryPath, TaskCard} from './card-task-model';
import {CardTaskEngine} from './card-task-engine';
import {ensureTaskFolder} from './card-task-store';
import {Choose} from './path-dialogs';
import {Validation} from './protocol-validator';
import {displayMarkdown} from './chat-markdown';
export class CardTaskModal extends Modal {
 private task:CardTask|null=null;private working=false;private closed=false;private error='';private preview:Validation|null=null;private cancelRequested=false;private disclosures=new Map<string,boolean>();
 private form={title:'',text:'',originalPath:'',cardsRoot:'Cards/Generated',searchRoot:'',focus:''};
 constructor(app:App,private engine:CardTaskEngine,private openReading:(file:TFile)=>Promise<void>,private ended:()=>void,private initial?:TFile){super(app);}
 async onOpen(){this.closed=false;this.modalEl.addClass('carddesk-task-modal');this.render();if(this.initial)await this.run(()=>this.importFile(this.initial!));}
 private button(host:HTMLElement,text:string,work:()=>Promise<void>,primary=false){const b=host.createEl('button',{text,cls:primary?'mod-cta':''});b.disabled=this.working;b.onclick=()=>{void this.run(work);};return b;}
 private async run(work:()=>Promise<void>){if(this.working||this.closed)return;this.working=true;this.cancelRequested=false;this.error='';this.render();try{await work();}catch(e){this.error=String(e);}finally{this.working=false;if(!this.closed)this.render();}}
 private field(host:HTMLElement,label:string,value:string,change:(value:string)=>void,rows=0,disabled=false){
  const row=host.createDiv({cls:'carddesk-task-field'});row.createEl('label',{text:label});const input=rows?row.createEl('textarea'):row.createEl('input',{type:'text'});input.value=value;input.setAttribute('aria-label',label);input.disabled=this.working||disabled;if(input.tagName==='TEXTAREA')(input as HTMLTextAreaElement).rows=rows;input.oninput=()=>change(input.value);return input;
 }
 private async saveEdits(task:CardTask){await this.engine.store.save(task);if(this.cancelRequested)throw Error('已停止');}
 private edit(change:()=>void,invalidate=true){const task=this.task;if(!task||this.working||task.status!=='draft')return;change();if(invalidate){task.candidates=[];task.searchWarnings=[];for(const card of task.cards)if(card.mode==='reuse'){card.mode='create';delete card.reusePath;}}this.preview=null;task.error='';task.updatedAt=new Date().toISOString();}
 private async importFile(file:TFile){if(!['md','txt'].includes(file.extension)||file.stat.size>90000)throw Error('请选择不超过约90 KB的 Markdown/TXT，正文最多30000字符');const text=await this.app.vault.read(file);sourceUnits(text);this.form.title=file.basename;this.form.text=text;this.form.originalPath=file.path;}
 private async create(){
  const f=this.form,task=newTask(f.title,f.text,f.originalPath,f.cardsRoot,f.searchRoot,f.focus);if(this.engine.store.list().length>=100)throw Error('任务已达100个，请先在文件中整理旧任务');
  await ensureTaskFolder(this.app,task.source.path);if(this.app.vault.getAbstractFileByPath(task.source.path))throw Error('来源快照目标已存在，请重试创建任务');await this.app.vault.create(task.source.path,task.source.text);await this.engine.store.save(task);this.task=task;this.preview=null;
 }
 private render(){
  if(this.closed)return;const el=this.contentEl,scrollTop=el.scrollTop;for(const detail of Array.from(el.querySelectorAll<HTMLDetailsElement>('details[data-task-key]')))this.disclosures.set(detail.dataset.taskKey!,detail.open);try{el.empty();el.addClass('carddesk-task');
  const header=el.createDiv({cls:'carddesk-task-heading'});header.createEl('h2',{text:'知识整理'});
  if(this.task)this.button(header,'返回任务列表',async()=>{await this.engine.store.save(this.task!);this.task=null;this.preview=null;});
  el.createEl('p',{text:'在接页里规划、拆卡和检查关联，确认后进入渐进阅读。',cls:'carddesk-chat-muted'});
  if(this.working){const status=el.createDiv({cls:'carddesk-task-progress'});status.setAttribute('role','status');status.createEl('span',{text:'正在处理，请保留任务窗口；关闭会停止模型请求，已保存批次可恢复。'});if(this.task){const stop=status.createEl('button',{text:'停止当前操作'});stop.onclick=()=>{this.cancelRequested=true;this.engine.stop(this.task!.id);};}}
  const error=this.error||this.task?.error;if(error){const status=el.createEl('p',{text:error,cls:'carddesk-task-error'});status.setAttribute('role','alert');}
  if(!this.task){this.renderStart(el);return;}const t=this.task,frozen=t.status!=='draft';
  el.createEl('h3',{text:t.title});el.createEl('p',{text:'已生成 '+t.generated.length+' / '+t.plan.length+' 批 · '+t.cards.length+' 张草稿'+(frozen?' · 已写入 '+t.written.length+' / '+t.artifacts.length+' 个文件':''),cls:'carddesk-chat-muted'});
  const source=el.createEl('details');source.dataset.taskKey='source';source.createEl('summary',{text:'原文快照与处理范围'});source.createEl('p',{text:t.source.path+(t.source.originalPath?'（导入自 '+t.source.originalPath+'）':'（粘贴材料）')});source.createEl('p',{text:'快照创建后不改原文件；模型会接收所处理批次的原文。已有卡片目录：'+(t.searchRoot||'未指定，不扫描全库')});source.createEl('pre',{text:t.source.text});
  if(!t.plan.length){el.createEl('p',{text:'先生成知识结构；这一步将原文和整理重点发送给 Codex。'});this.button(el,'生成结构建议',()=>this.engine.plan(t),true);return;}
  const structure=el.createEl('details');structure.dataset.taskKey='structure';structure.open=!t.generated.length;structure.createEl('summary',{text:'1. 确认知识结构'});
  for(const section of t.plan){const row=structure.createDiv({cls:'carddesk-task-section'});row.createEl('strong',{text:section.id});const disabled=frozen||!!t.generated.length;
   const title=this.field(row,'主题标题 '+section.id,section.title,v=>this.edit(()=>section.title=v),0,disabled);
   const question=this.field(row,'核心问题 '+section.id,section.question,v=>this.edit(()=>section.question=v),2,disabled);
   const ids=this.field(row,'来源片段 '+section.id,section.unitIds.join(','),v=>this.edit(()=>section.unitIds=v.split(',').map(x=>Number(x.trim()))),0,disabled);
   const count=this.field(row,'卡片数量 '+section.id,String(section.count),v=>this.edit(()=>section.count=Number(v)),0,disabled);
   for(const input of [title,question,ids,count])input.onchange=()=>{void this.run(()=>this.engine.store.save(t));};
  }
  if(!t.generated.length){const units=structure.createEl('details');units.dataset.taskKey='units';units.createEl('summary',{text:'核对片段编号（必须覆盖全部原文，不能重复分配）'});for(const u of sourceUnits(t.source.text)){units.createEl('h4',{text:'片段 '+u.id+' · 第'+u.startLine+'～'+u.endLine+'行'});units.createEl('pre',{text:u.text});}}
  el.createEl('h3',{text:'2. 分批生成与编辑'});const next=t.plan.find(p=>!t.generated.includes(p.id));
  if(next&&!frozen)this.button(el,'确认结构并生成下一批：'+next.title+'（'+next.count+'张）',async()=>{await this.saveEdits(t);await this.engine.generate(t);this.preview=null;},true);
  if(t.generated.length&&!next)el.createEl('p',{text:'全部批次已生成。可编辑或排除卡片，再检查关联。'});
  for(const card of t.cards)this.renderCard(el,t,card,frozen);
  if(!t.cards.length||next)return;
  el.createEl('h3',{text:'3. 已有卡片关联检查'});
  if(!frozen){const scope=this.field(el,'已有卡片目录（留空不检索）',t.searchRoot,v=>this.edit(()=>t.searchRoot=v));scope.onchange=()=>{void this.run(()=>this.engine.store.save(t));};el.createEl('p',{text:'关键词检索只在此目录本地执行。每张新卡最多展示3个候选；勾选后点击“检查候选关联”才会发送候选全文。每次最多8个候选对。',cls:'carddesk-chat-muted'});
   this.button(el,'本地关键词检索',async()=>{await this.saveEdits(t);await this.engine.findCandidates(t);this.preview=null;});
   this.button(el,'检查选中候选的关联（发送给 Codex）',async()=>{await this.saveEdits(t);await this.engine.inspectRelations(t);this.preview=null;});
  }
  for(const warning of t.searchWarnings)el.createEl('p',{text:warning,cls:'carddesk-chat-muted'});
  for(const c of t.candidates){const row=el.createDiv({cls:'carddesk-task-candidate'});row.createEl('strong',{text:(t.cards.find(card=>card.id===c.cardId)?.title??c.cardId)+' ↔ '+c.path});
   const selection=row.createEl('label');const check=selection.createEl('input',{type:'checkbox'});check.checked=c.selected;check.disabled=this.working||frozen;selection.appendText('选择正文进行关联检查');check.onchange=()=>{if(check.checked&&t.candidates.filter(c=>c.selected).length>=8){check.checked=false;new Notice('每次最多8个候选对');return;}c.selected=check.checked;void this.run(()=>this.engine.store.save(t));};
   const body=row.createEl('details');body.dataset.taskKey='candidate:'+c.cardId+':'+c.path;body.createEl('summary',{text:'查看候选全文（关键词得分 '+c.score+'）'});body.createEl('pre',{text:c.body});
   if(c.kind){const names={extends:'补充解释',prerequisite:'前提',example:'例子',duplicate:'内容重复',none:'无明确关系'};row.createEl('p',{text:names[c.kind]+'：'+c.reason});
    if(c.kind==='duplicate'&&!frozen)this.button(row,'复用这张已有卡（不新建重复卡）',async()=>{const card=t.cards.find(card=>card.id===c.cardId)!;card.mode='reuse';card.reusePath=c.path;this.preview=null;await this.engine.store.save(t);});
    else if(c.kind!=='none'&&c.kind!=='duplicate'){const label=row.createEl('label'),approval=label.createEl('input',{type:'checkbox'});approval.checked=!!c.approved;approval.disabled=this.working||frozen;label.appendText('采用此关联：'+c.linkText);approval.onchange=()=>{c.approved=approval.checked;this.preview=null;void this.run(()=>this.engine.store.save(t));};}
   }
  }
  if(next)return;
  el.createEl('h3',{text:'4. 校验、预览并确认写入'});
  if(t.status==='complete'){el.createEl('p',{text:'任务已完成，入口和卡片文件已保存。'});this.button(el,'打开渐进阅读入口',async()=>{const f=this.app.vault.getAbstractFileByPath(taskEntryPath(t));if(!(f instanceof TFile))throw Error('入口文件已移动或删除');await this.openReading(f);this.close();},true);return;}
  if(!frozen)this.button(el,'保存编辑并预览写入计划',async()=>{await this.engine.store.save(t);this.preview=await this.engine.validate(t);});
  if(this.preview||frozen){
   if(this.preview)for(const issue of this.preview.issues)el.createEl('p',{text:(issue.level==='error'?'错误':'提示')+' · '+issue.path+'：'+issue.message,cls:issue.level==='error'?'carddesk-task-error':'carddesk-chat-muted'});
   try{const artifacts=t.artifacts.length?t.artifacts:buildTask(t).artifacts.map(a=>a.path.endsWith('.md')?{...a,text:displayMarkdown(a.text)}:a);el.createEl('p',{text:'将创建 '+artifacts.length+' 个文件。仅写新卡、入口及清单，不改写已有卡和原文件。原文快照与任务记录此前已保存。'});
    for(const a of artifacts){const detail=el.createEl('details');detail.dataset.taskKey='artifact:'+a.path;detail.createEl('summary',{text:a.path+(t.written.includes(a.path)?'（已写入）':'')});detail.createEl('pre',{text:a.text});}
    if(!this.preview?.issues.some(i=>i.level==='error'))this.button(el,frozen?'确认继续未完成写入':'确认创建卡片包',async()=>{await this.engine.publish(t);this.preview=null;},true);
   }catch(e){el.createEl('p',{text:String(e),cls:'carddesk-task-error'});}
  }
  }finally{for(const detail of Array.from(el.querySelectorAll<HTMLDetailsElement>('details[data-task-key]')))if(this.disclosures.has(detail.dataset.taskKey!))detail.open=this.disclosures.get(detail.dataset.taskKey!)!;el.scrollTop=scrollTop;}
 }
 private renderCard(el:HTMLElement,t:CardTask,c:TaskCard,frozen:boolean){
  const row=el.createEl('details',{cls:'carddesk-task-card'});row.dataset.taskKey='card:'+c.id;row.createEl('summary',{text:c.id+' · '+c.title+(c.mode==='skip'?'（已排除）':c.mode==='reuse'?'（复用已有卡）':'')});
  const include=row.createEl('label'),check=include.createEl('input',{type:'checkbox'});check.checked=c.mode!=='skip';check.disabled=this.working||frozen;include.appendText('保留在阅读入口');check.onchange=()=>{c.mode=check.checked?'create':'skip';delete c.reusePath;this.preview=null;void this.run(()=>this.engine.store.save(t));};
  if(c.mode==='reuse')row.createEl('p',{text:'复用：'+c.reusePath+'。取消再勾选“保留”可恢复新建。'});
  const title=this.field(row,'卡片标题 '+c.id,c.title,v=>this.edit(()=>c.title=v),0,frozen),body=this.field(row,'卡片正文 '+c.id,c.body,v=>this.edit(()=>c.body=v),8,frozen);
  for(const input of [title,body])input.onchange=()=>{void this.run(()=>this.engine.store.save(t));};row.createEl('small',{text:'来源：'+c.unitIds.map(id=>{const u=sourceUnits(t.source.text).find(u=>u.id===id)!;return '片段'+id+' 第'+u.startLine+'～'+u.endLine+'行';}).join('；')});
  for(const link of c.links){const label=row.createEl('label'),check=label.createEl('input',{type:'checkbox'});check.checked=link.approved;check.disabled=this.working||frozen;label.appendText(link.text+' → '+(t.cards.find(other=>other.id===link.targetId)?.title??link.targetId)+'（'+link.reason+'）');check.onchange=()=>{link.approved=check.checked;this.preview=null;void this.run(()=>this.engine.store.save(t));};}
 }
 private renderStart(el:HTMLElement){
  const actions=el.createDiv({cls:'carddesk-task-actions'});
  this.button(actions,'导入 Markdown / TXT',async()=>{new Choose(this.app,this.app.vault.getFiles().filter(f=>['md','txt'].includes(f.extension)).map(f=>({id:f.path,name:f.path})),path=>{void this.run(async()=>{const f=this.app.vault.getAbstractFileByPath(path);if(f instanceof TFile)await this.importFile(f);});},'选择单篇材料').open();});
  this.button(actions,'继续已保存任务',async()=>{const items=await Promise.all(this.engine.store.list().map(async f=>{let title=f.basename;try{const raw=JSON.parse(await this.app.vault.read(f));if(typeof raw.title==='string')title=raw.title.slice(0,120);}catch{}return {id:f.path,name:title+' · '+new Date(f.stat.mtime).toLocaleString()};}));new Choose(this.app,items,path=>{void this.run(async()=>{const id=path.split('/').pop()!.replace(/\.json$/,'');if(this.engine.busy(id))throw Error('该任务正在停止，请稍后再打开');this.task=await this.engine.store.load(path);this.preview=null;});},'选择已保存拆卡任务').open();});
  this.field(el,'任务标题',this.form.title,v=>this.form.title=v);
  this.field(el,'原文（可直接粘贴，最多30000字符）',this.form.text,v=>{this.form.text=v;this.form.originalPath='';},12);
  this.field(el,'整理重点（可选）',this.form.focus,v=>this.form.focus=v,2);
  this.field(el,'新卡根目录',this.form.cardsRoot,v=>this.form.cardsRoot=v);
  this.field(el,'已有卡片目录（可选，关键词搜索范围）',this.form.searchRoot,v=>this.form.searchRoot=v);
  el.createEl('p',{text:'创建任务会保存原文快照和任务文件；不会改写导入的原文件。单任务最多60个片段、30张卡，每批1～10张。模型调用仍通过本机 Codex；结构、批次原文与前批草稿会发送给模型，关联候选需另行勾选。PDF/OCR、整本书自动处理和向量检索不在本版范围。',cls:'carddesk-chat-muted'});
  this.button(el,'保存材料并开始规划',()=>this.create(),true);
 }
 onClose(){this.closed=true;if(this.task){if(this.engine.busy(this.task.id))this.engine.stop(this.task.id);else void this.engine.store.save(this.task).catch(e=>new Notice('任务保存失败：'+String(e)));}this.contentEl.empty();this.ended();}
}
