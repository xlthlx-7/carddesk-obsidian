import {App, TFile, TFolder} from 'obsidian';
import {CardTask, validateTask} from './card-task-model';
export async function ensureTaskFolder(app:App,path:string):Promise<void>{
 let current='';for(const part of path.split('/').slice(0,-1)){current=current?current+'/'+part:part;const found=app.vault.getAbstractFileByPath(current);if(found&&!(found instanceof TFolder))throw Error('目录被文件占用：'+current);if(!found){try{await app.vault.createFolder(current);}catch(error){if(!(app.vault.getAbstractFileByPath(current) instanceof TFolder))throw error;}}}
}
/** One queue for task writes. Expected bytes prevent overwriting an externally changed job. */
export class CardTaskStore {
 private queue=Promise.resolve();private expected=new Map<string,string>();
 constructor(private app:App){}
 path(id:string){return 'Carddesk/tasks/'+id+'.json';}
 async load(path:string):Promise<CardTask>{
  const file=this.app.vault.getAbstractFileByPath(path);if(!(file instanceof TFile))throw Error('任务文件不存在');const text=await this.app.vault.read(file),task=validateTask(JSON.parse(text));if(path!==this.path(task.id))throw Error('任务路径与身份不符');this.expected.set(path,text);return task;
 }
 async save(value:CardTask):Promise<void>{
  const task=validateTask(value),path=this.path(task.id),text=JSON.stringify(task,null,2)+'\n';
  const next=this.queue.then(async()=>{const existing=this.app.vault.getAbstractFileByPath(path),expected=this.expected.get(path);if(existing){if(!(existing instanceof TFile)||expected===undefined)throw Error('任务目标已存在，未覆盖');await this.app.vault.process(existing,current=>{if(current!==expected)throw Error('任务文件已被外部修改，请重新打开任务核对');return text;});}else{if(expected!==undefined)throw Error('任务文件已被移走，未自动重建');await ensureTaskFolder(this.app,path);await this.app.vault.create(path,text);}this.expected.set(path,text);});
  this.queue=next.catch(()=>{});return next;
 }
 list():TFile[]{return this.app.vault.getFiles().filter(f=>f.path.startsWith('Carddesk/tasks/')&&f.path.split('/').length===3&&f.extension==='json').sort((a,b)=>b.stat.mtime-a.stat.mtime);}
}
