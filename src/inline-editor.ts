import {App, Notice, TFile} from 'obsidian';
import {EditDraft} from './edit-drafts';
export interface EditorCallbacks {
 persist:(draft:EditDraft)=>Promise<void>;
 discard:(id:string)=>Promise<void>;
 saved:()=>Promise<void>;
 close:()=>void;
 file:()=>TFile|null;
}
/** An isolated plain Markdown editor; the reading subtree stays mounted underneath. */
export class InlineEditor {
 private timer:ReturnType<typeof setTimeout>|undefined;
 private disposed=false;
 private saving=false;
 private textarea:HTMLTextAreaElement;
 private status:HTMLElement;
 private save:HTMLButtonElement;
 private cancel:HTMLButtonElement;
 constructor(private app:App,private host:HTMLElement,private draft:EditDraft,private callbacks:EditorCallbacks){
  host.addClass('carddesk-inline-editor');
  host.createEl('p',{text:'原地编辑 Markdown（含顶部属性）· 保存后恢复阅读。未保存内容保留为本地草稿。'});
  this.textarea=host.createEl('textarea');this.textarea.value=draft.text;this.textarea.setAttribute('aria-label','卡片 Markdown 编辑内容');this.textarea.rows=16;this.textarea.spellcheck=false;
  const actions=host.createDiv({cls:'carddesk-editor-actions'});
  this.save=actions.createEl('button',{text:'保存修改'});this.cancel=actions.createEl('button',{text:'取消编辑（放弃草稿）'});
  this.status=host.createEl('p');this.status.setAttribute('role','status');
  this.textarea.oninput=()=>{clearTimeout(this.timer);this.status.setText('有未保存修改');this.timer=setTimeout(()=>{void this.persist().catch(error=>this.failed(error));},250);};
  this.textarea.onkeydown=event=>{if(event.key==='s'&&(event.metaKey||event.ctrlKey)){event.preventDefault();void this.commit();}};
  this.save.onclick=()=>{void this.commit();};this.cancel.onclick=()=>{void this.cancelEdit();};
  this.textarea.focus({preventScroll:true});
 }
 private latest():EditDraft{return {...this.draft,text:this.textarea.value};}
 private async persist(){clearTimeout(this.timer);await this.callbacks.persist(this.latest());}
 private failed(error:unknown){if(!this.disposed)this.status.setText(String(error));else new Notice('编辑草稿保存失败：'+String(error));}
 private controls(disabled:boolean){this.saving=disabled;this.save.disabled=disabled;this.cancel.disabled=disabled;this.textarea.disabled=disabled;}
 changed(){if(!this.disposed&&!this.saving)this.status.setText('文件可能已在其他位置修改。草稿保留，保存时将核对版本；请勿直接覆盖。');}
 get id(){return this.draft.id;}
 focus(){this.textarea.focus({preventScroll:true});}
 private async commit(){
  if(this.saving||this.disposed)return;clearTimeout(this.timer);this.controls(true);
  const draft=this.latest();
  try{
   // Persist before disk mutation; a failed process or closed view still leaves a recovery copy.
   await this.callbacks.persist(draft);
   if(this.disposed)return;
   const file=this.callbacks.file();
   if(!file||file.path!==draft.path||this.app.vault.getAbstractFileByPath(draft.path)!==file)throw Error('文件已移动或删除，草稿保留；请核对原卡后再保存');
   await this.app.vault.process(file,current=>{
    if(file.path!==draft.path)throw Error('文件已移动，未覆盖');
    if(current!==draft.base&&current!==draft.text)throw Error('文件内容已被其他位置修改，未覆盖。请复制草稿与最新原文核对，或取消后重新编辑');
    return draft.text;
   });
   this.draft={...draft,base:draft.text};
   await this.callbacks.discard(draft.id);
   if(!this.disposed){this.finish();await this.callbacks.saved();}
  }catch(error){this.failed(error);}
  finally{if(!this.disposed)this.controls(false);}
 }
 private async cancelEdit(){if(this.saving||this.disposed)return;clearTimeout(this.timer);this.controls(true);try{await this.callbacks.discard(this.draft.id);if(!this.disposed){this.finish();await this.callbacks.saved();}}catch(error){this.failed(error);}finally{if(!this.disposed)this.controls(false);}}
 private finish(){this.disposed=true;clearTimeout(this.timer);this.host.remove();this.callbacks.close();}
 async dispose():Promise<void>{
  if(this.disposed)return;this.disposed=true;clearTimeout(this.timer);
  try{if(this.textarea.value!==this.draft.base)await this.persist();else await this.callbacks.discard(this.draft.id);}
  catch(error){this.failed(error);}finally{this.host.remove();}
 }
}
