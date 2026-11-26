import {safePath, Manifest, CardInfo} from './protocol-validator';
export interface SourceUnit {id:number;startLine:number;endLine:number;text:string;}
export interface TaskSection {id:string;title:string;question:string;unitIds:number[];count:number;}
export interface TaskLink {targetId:string;text:string;reason:string;approved:boolean;}
export interface TaskCard {id:string;sectionId:string;title:string;body:string;unitIds:number[];links:TaskLink[];mode:'create'|'skip'|'reuse';reusePath?:string;}
export interface TaskCandidate {cardId:string;path:string;body:string;score:number;selected:boolean;kind?:'extends'|'prerequisite'|'example'|'duplicate'|'none';reason?:string;linkText?:string;approved?:boolean;}
export interface TaskArtifact {path:string;text:string;}
export interface CardTask {schemaVersion:1;id:string;title:string;focus:string;cardsRoot:string;searchRoot:string;source:{path:string;originalPath:string;text:string;};plan:TaskSection[];generated:string[];cards:TaskCard[];candidates:TaskCandidate[];searchWarnings:string[];artifacts:TaskArtifact[];written:string[];status:'draft'|'writing'|'complete';updatedAt:string;error:string;}
const idPattern=/^[a-zA-Z0-9-]{1,80}$/;
export function taskJson(text:string):any {return JSON.parse(text.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));}
export function bounded(value:unknown,label:string,max:number,empty=false):asserts value is string {
 if(typeof value!=='string'||(!empty&&!value.trim())||value.length>max)throw Error(label+'无效或超过 '+max+' 字符');
}
export function plainLabel(value:unknown,label:string,max=120):asserts value is string {bounded(value,label,max);if(/[\[\]|\r\n\x00-\x1f]/.test(value))throw Error(label+'不能包含换行、内链或控制符');}
export function sourceUnits(text:string):SourceUnit[]{
 bounded(text,'原文',30000);const lines=text.split('\n'),units:SourceUnit[]=[];let start=0,buffer='';
 const flush=(end:number)=>{if(buffer.trim()){units.push({id:units.length+1,startLine:start+1,endLine:end,text:buffer});}buffer='';start=end;};
 for(let i=0;i<lines.length;i++){
  if(lines[i].length>5000)throw Error('原文单行超过 5000 字符，请先按段落换行');
  if(buffer.length+lines[i].length>5000)flush(i);
  buffer+=lines[i]+(i<lines.length-1?'\n':'');
  if(!lines[i].trim()&&buffer.trim())flush(i+1);
 }
 flush(lines.length);if(!units.length||units.length>60)throw Error('原文需为 1～60 个有效片段，请合并过碎段落或分篇处理');return units;
}
function unitIds(value:unknown,allowed:Set<number>):asserts value is number[]{if(!Array.isArray(value)||!value.length||new Set(value).size!==value.length||value.some(v=>!Number.isInteger(v)||!allowed.has(v)))throw Error('来源片段编号无效');}
export function parseTaskPlan(text:string,units:SourceUnit[]):TaskSection[]{
 const raw=taskJson(text);if(!Array.isArray(raw.sections)||!raw.sections.length||raw.sections.length>10)throw Error('结构需包含 1～10 个主题');
 const allowed=new Set(units.map(u=>u.id)),seen=new Set<number>();let total=0;
 const plan=raw.sections.map((s:any,i:number)=>{plainLabel(s.title,'主题标题');plainLabel(s.question,'核心问题',500);unitIds(s.unitIds,allowed);if(!Number.isInteger(s.count)||s.count<1||s.count>10)throw Error('每批需为 1～10 张卡');total+=s.count;for(const id of s.unitIds){if(seen.has(id))throw Error('结构重复分配原文片段 '+id);seen.add(id);}return {id:'p'+(i+1),title:s.title,question:s.question,unitIds:s.unitIds,count:s.count};});
 if(total>30||seen.size!==allowed.size)throw Error('单任务最多 30 张卡，结构必须覆盖全部原文片段');return plan;
}
export function parseTaskBatch(text:string,section:TaskSection,prior:TaskCard[]):TaskCard[]{
 const raw=taskJson(text);if(!Array.isArray(raw.cards)||raw.cards.length!==section.count)throw Error('返回卡片数应为 '+section.count+'，请重试该批');
 const ids=new Set([...prior.map(c=>c.id),...raw.cards.map((_:unknown,i:number)=>section.id+'-c'+(i+1))]);
 const cards:TaskCard[]=raw.cards.map((c:any,i:number)=>{plainLabel(c.title,'卡片标题');bounded(c.body,'卡片正文',4000);if(/\[\[|!?\[[^\]]*\]\s*\(|^\s{0,3}\[[^\]]+\]:/m.test(c.body))throw Error('正文链接须通过结构化 links 提供，不接受猜测路径');unitIds(c.unitIds,new Set(section.unitIds));if(!Array.isArray(c.links)||c.links.length>8)throw Error('每卡最多 8 条关联');
  const id=section.id+'-c'+(i+1),targets=new Set<string>();const links=c.links.map((l:any)=>{if(!ids.has(l.targetId)||l.targetId===id||targets.has(l.targetId))throw Error('关联卡片编号无效或重复');targets.add(l.targetId);plainLabel(l.text,'链接文字');bounded(l.reason,'关联理由',500);return {targetId:l.targetId,text:l.text,reason:l.reason,approved:true};});
  return {id,sectionId:section.id,title:c.title,body:c.body,unitIds:c.unitIds,links,mode:'create'};
 });
 const covered=new Set(cards.flatMap(c=>c.unitIds));if(section.unitIds.some(id=>!covered.has(id)))throw Error('本批遗漏原文片段，未保存该批，请重试');return cards;
}
export function taskEntryPath(task:CardTask){return task.cardsRoot+'/'+task.id+'/入口.md';}
export function taskCardPath(task:CardTask,card:TaskCard){return card.mode==='reuse'?card.reusePath!:task.cardsRoot+'/'+task.id+'/'+card.id+'.md';}
export function validateTask(raw:unknown):CardTask {
 const t=raw as CardTask;if(!t||t.schemaVersion!==1||typeof t.id!=='string'||!idPattern.test(t.id)||!safePath(t.cardsRoot)||!(t.searchRoot===''||safePath(t.searchRoot)))throw Error('拆卡任务格式或目录无效');
 plainLabel(t.title,'任务标题');bounded(t.focus,'整理重点',1000,true);if(!t.source||t.source.path!=='Sources/Carddesk/'+t.id+'.md')throw Error('任务来源快照路径无效');bounded(t.source.originalPath,'原文件路径',1000,true);const units=sourceUnits(t.source.text);
 if(!Array.isArray(t.plan)||!Array.isArray(t.generated)||!Array.isArray(t.cards)||!Array.isArray(t.candidates)||!Array.isArray(t.artifacts)||!Array.isArray(t.written)||!Array.isArray(t.searchWarnings)||t.cards.length>30||t.candidates.length>90||t.artifacts.length>32)throw Error('拆卡任务内容或上限无效');
 if(t.plan.length){const checked=parseTaskPlan(JSON.stringify({sections:t.plan}),units);if(checked.some((s,i)=>s.id!==t.plan[i].id))throw Error('结构编号无效');}
 const pids=new Set(t.plan.map(s=>s.id));if(t.generated.some(id=>!pids.has(id))||new Set(t.generated).size!==t.generated.length)throw Error('批次记录无效');
 const ids=new Set<string>();for(const c of t.cards){if(ids.has(c.id))throw Error('卡片编号重复');ids.add(c.id);const section=t.plan.find(s=>s.id===c.sectionId);if(!section||!t.generated.includes(c.sectionId)||!new RegExp('^'+section.id+'-c([1-9]|10)$').test(c.id))throw Error('卡片不属于已完成批次');plainLabel(c.title,'卡片标题');bounded(c.body,'卡片正文',4000);unitIds(c.unitIds,new Set(section.unitIds));if(!['create','skip','reuse'].includes(c.mode)||c.mode==='reuse'&&(!safePath(c.reusePath)||!c.reusePath.endsWith('.md')))throw Error('卡片处理方式无效');if(!Array.isArray(c.links)||c.links.length>8)throw Error('卡片关联无效');}
 for(const id of t.generated){const cards=t.cards.filter(c=>c.sectionId===id),section=t.plan.find(s=>s.id===id)!;if(cards.length!==section.count)throw Error('已完成批次的卡片数不一致');const covered=new Set(cards.flatMap(c=>c.unitIds));if(section.unitIds.some(id=>!covered.has(id)))throw Error('已完成批次遗漏来源片段');}
 for(const c of t.cards)for(const l of c.links){if(!ids.has(l.targetId)||l.targetId===c.id||typeof l.approved!=='boolean')throw Error('内部关联无效');plainLabel(l.text,'链接文字');bounded(l.reason,'关联理由',500);}
 const pairs=new Set<string>();for(const c of t.candidates){const pair=c.cardId+'|'+c.path;if(!ids.has(c.cardId)||!safePath(c.path)||!c.path.endsWith('.md')||pairs.has(pair)||typeof c.selected!=='boolean'||!Number.isFinite(c.score))throw Error('候选关联无效');pairs.add(pair);bounded(c.body,'候选正文',12000);if(c.kind!==undefined&&!['extends','prerequisite','example','duplicate','none'].includes(c.kind))throw Error('候选关系类型无效');if(c.reason!==undefined)bounded(c.reason,'关系依据',500);if(c.linkText!==undefined)plainLabel(c.linkText,'关联入口');if(c.approved!==undefined&&typeof c.approved!=='boolean')throw Error('关联确认无效');}
 if(!['draft','writing','complete'].includes(t.status))throw Error('任务状态无效');bounded(t.error,'任务错误',3000,true);bounded(t.updatedAt,'更新时间',100);for(const warning of t.searchWarnings)bounded(warning,'检索提示',1000);
 if(new Set(t.artifacts.map(a=>a.path)).size!==t.artifacts.length||new Set(t.written).size!==t.written.length)throw Error('重复写入目标');
 for(const a of t.artifacts){if(!(a.path.startsWith(t.cardsRoot+'/'+t.id+'/')&&safePath(a.path)&&a.path.endsWith('.md')||a.path==='Carddesk/packages/'+t.id+'.json'))throw Error('任务写入目标越界');bounded(a.text,'输出文件',100000);}
 if(t.written.some(p=>!t.artifacts.some(a=>a.path===p))||t.status!=='draft'&&!t.artifacts.length||t.status==='complete'&&t.written.length!==t.artifacts.length)throw Error('写入进度无效');
 if(JSON.stringify(t).length>4000000)throw Error('任务超过 4 MB，请拆分材料');return JSON.parse(JSON.stringify(t));
}
export function newTask(title:string,text:string,originalPath:string,cardsRoot:string,searchRoot:string,focus:string):CardTask {
 const id=crypto.randomUUID();return validateTask({schemaVersion:1,id,title,focus,cardsRoot,searchRoot,source:{path:'Sources/Carddesk/'+id+'.md',originalPath,text},plan:[],generated:[],cards:[],candidates:[],searchWarnings:[],artifacts:[],written:[],status:'draft',updatedAt:new Date().toISOString(),error:''});
}
export interface BuiltTask {artifacts:TaskArtifact[];manifest:Manifest;cards:Map<string,CardInfo>;}
export function buildTask(task:CardTask):BuiltTask {
 const t=validateTask(task);if(!t.plan.length||t.generated.length!==t.plan.length)throw Error('请先完成所有批次');
 const selected=t.cards.filter(c=>c.mode!=='skip');if(!selected.length)throw Error('至少保留或复用一张卡片');
 const units=sourceUnits(t.source.text),cards=new Map<string,CardInfo>(),artifacts:TaskArtifact[]=[];const source=t.source.path;
 const add=(path:string,id:string,role:string,title:string,body:string,locator:string,targets:string[])=>{
  const frontmatter={carddesk_schema:1,card_id:id,card_role:role,source_path:source,source_locator:locator};
  const yaml=Object.entries({...frontmatter,carddesk_origin:'material',verification_status:'unverified',task_id:t.id}).map(([key,value])=>key+': '+JSON.stringify(value)).join('\n');
  const text='---\n'+yaml+'\n---\n# '+title+'\n\n> AI 整理，待核对。来源定位对应本任务原文快照。\n\n'+body+'\n';
  artifacts.push({path,text});cards.set(path,{frontmatter,body,links:targets.map(target=>({link:target,target,markdown:true,fragment:false,embedded:false}))});
 };
 for(const c of selected.filter(c=>c.mode==='create')){
  if(/\[\[|!?\[[^\]]*\]\s*\(|^\s{0,3}\[[^\]]+\]:/m.test(c.body))throw Error(c.title+'：请在关联列表配置链接，正文不能自行加入内链');
  const links:string[]=[],targets:string[]=[];
  for(const l of c.links.filter(l=>l.approved)){const target=t.cards.find(other=>other.id===l.targetId)!;if(target.mode==='skip')throw Error(c.title+' 仍关联已排除的卡片，请取消该关联');const path=taskCardPath(t,target);targets.push(path);links.push('[['+path.slice(0,-3)+'|'+l.text+']]');}
  for(const relation of t.candidates.filter(r=>r.cardId===c.id&&r.approved&&r.kind&&r.kind!=='none'&&r.kind!=='duplicate')){if(!relation.reason||!relation.linkText)throw Error('关联检查尚未完成');targets.push(relation.path);links.push('[['+relation.path.slice(0,-3)+'|'+relation.linkText+']]');}
  const locator=c.unitIds.map(id=>{const u=units.find(u=>u.id===id)!;return '片段 '+id+'，第 '+u.startLine+'～'+u.endLine+' 行';}).join('；');
  add(taskCardPath(t,c),'task-'+t.id+'-'+c.id,'explanation',c.title,c.body+(links.length?'\n\n'+links.join('\n\n'):''),locator,targets);
 }
 const entry=taskEntryPath(t),targets=selected.map(c=>taskCardPath(t,c));
 const body='这组卡片围绕“'+t.title+'”整理。先选择要理解的问题，再沿解释中的关联逐层展开。原文作为独立快照保留，卡片与关系均需人工核对。\n\n'+selected.map(c=>{const p=t.plan.find(s=>s.id===c.sectionId)!;return p.question+'：[['+taskCardPath(t,c).slice(0,-3)+'|'+c.title+']]';}).join('\n\n');
 add(entry,'task-'+t.id+'-entry','entry',t.title,body,'全文，第 1～'+t.source.text.split('\n').length+' 行',targets);
 const manifest:Manifest={schemaVersion:1,packageId:'task-'+t.id,title:t.title,entry,files:[entry,...selected.filter(c=>c.mode==='create').map(c=>taskCardPath(t,c))],sources:[source]};
 artifacts.push({path:'Carddesk/packages/'+t.id+'.json',text:JSON.stringify(manifest,null,2)+'\n'});return {artifacts,manifest,cards};
}
export function keywordTerms(text:string):string[]{
 const terms=text.toLowerCase().match(/[a-z0-9]{2,}|[\u3400-\u9fff]{2,}/g)??[],out:string[]=[];
 for(const term of terms){if(/^[a-z0-9]/.test(term))out.push(term);else for(let i=0;i<term.length-1;i++)out.push(term.slice(i,i+2));}
 return [...new Set(out)].filter(t=>!['可以','一个','什么','我们','这个','以及','如何','需要','通过','进行','这些','就是','的是'].includes(t)).slice(0,48);
}
