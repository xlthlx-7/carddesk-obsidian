import {InlineEditor} from './inline-editor';
import {EditDraft} from './edit-drafts';
import {readingMarkdown} from './card-metadata';
import {Component, getLinkpath, ItemView, MarkdownRenderer, Notice, setIcon, setTooltip, TFile, WorkspaceLeaf} from 'obsidian';
import {internalLink} from './link-events';
import {Snapshot, validateSnapshot} from './path-store';
import {ReadingTree, TreeNode} from './reading-tree';

export const VIEW_TYPE = 'carddesk-reading';
interface ReadingNode {
  file: TFile;
  state: TreeNode;
  cardId?: string;
  missing?: boolean;
  renderVersion: number;
  renderComponent?: Component;
  parent: ReadingNode | null;
  children: ReadingNode[];
  section: HTMLElement;
  body: HTMLElement;
  panel: HTMLElement;
  component: Component;
  disposed: boolean;
  pending: Set<string>;
  editor?:InlineEditor;
  editing?:boolean;
}

export interface ReadingActions {persistDraft?:(draft:EditDraft)=>Promise<void>; discardDraft?:(id:string)=>Promise<void>;discuss:(file:TFile,choices:string[])=>Promise<void>;}
export class ReadingView extends ItemView {
  private root: ReadingNode | null = null;
  private generation = 0;
  private tree = new ReadingTree();
  private rendered = new Map<number, ReadingNode>();
  private get count(): number { return this.tree.nodes.size; }
  private draftWrites=new Set<Promise<void>>();
  private rootPath = '';
  private active: ReadingNode | null = null;
  private restoring = false;
  private refreshQueue = Promise.resolve();
  getViewType(): string { return VIEW_TYPE; }
  getDisplayText(): string { return '接页 · ' + (this.root?.file.basename ?? '渐进阅读'); }
  getIcon(): string { return 'book-open'; }
  constructor(leaf: WorkspaceLeaf, private changed?: (s:Snapshot)=>void, private actions?:ReadingActions) { super(leaf); }

  async onOpen(): Promise<void> {
    this.contentEl.addClass('carddesk-reading');
    this.contentEl.createEl('p', {text:'打开一篇笔记，再执行“以接页渐进阅读当前笔记”。'});
  }

  async openRoot(file: TFile): Promise<void> {
    const generation = ++this.generation;
    this.restoring=false;
    this.clear();
    this.rootPath = file.path;
    this.contentEl.empty();
    const hint = this.contentEl.createEl('p', {cls:'carddesk-hint', text:'点击链接原地展开，再次点击收起 · 返回上层保留分支 · 阅读进度自动保存'});
    try {
      const root = this.append(file, null, this.contentEl, generation);
      this.root = root;
      await this.render(root, generation);
      if (!root.disposed && generation === this.generation) { this.active=root; this.emit(); }
    } catch (error) {
      if (generation === this.generation) hint.setText('读取失败：' + String(error));
    }
  }

  private async editInline(node:ReadingNode,recovery?:EditDraft):Promise<void>{
    if(node.disposed||node.missing)return;if(node.editor){node.editor.focus();return;}if(node.editing)return;
    node.editing=true;const generation=this.generation;
    try{
      const path=node.file.path;
      if(node.file.stat?.size>1024*1024)throw Error('卡片超过 1 MiB，请在原生编辑器处理');
      const text=await this.app.vault.read(node.file);
      if(node.disposed||generation!==this.generation)return;
      if(path!==node.file.path)throw Error('读取期间文件已移动，请重试');
      const draft=recovery??{id:crypto.randomUUID(),path,base:text,text};
      if(draft.path!==path)throw Error('草稿与卡片路径不符');
      await this.actions?.persistDraft?.(draft);
      if(node.disposed||generation!==this.generation){if(!recovery)await this.actions?.discardDraft?.(draft.id);return;}
      const host=node.section.createDiv();node.body.before(host);node.body.hidden=true;
      this.active=node;this.emit();
      node.editor=new InlineEditor(this.app,host,draft,{
        file:()=>node.disposed||node.missing?null:node.file,
        persist:d=>this.actions?.persistDraft?.(d)??Promise.resolve(),
        discard:id=>this.actions?.discardDraft?.(id)??Promise.resolve(),
        close:()=>{node.editor=undefined;node.body.hidden=false;},
        saved:async()=>{if(!node.disposed){await this.render(node,this.generation);this.focus(node);}}
      });
    }finally{node.editing=false;}
  }
  focusEdit(id:string):boolean {for(const node of this.rendered.values())if(node.editor?.id===id){this.active=node;this.emit();node.editor.focus();return true;}return false;}
  async restoreEdit(draft:EditDraft):Promise<void>{if(!this.root||this.root.file.path!==draft.path)throw Error('请先打开草稿对应卡片');await this.editInline(this.root,draft);}

  private focus(node: ReadingNode): void {
    if (node.disposed) return;
    this.active=node; this.emit();
    node.section.focus({preventScroll:true});
    node.section.scrollIntoView({block:'nearest'});
  }

  private append(file: TFile, parent: ReadingNode | null, host: HTMLElement, generation: number): ReadingNode {
    const state = this.tree.add(file.path, parent?.state ?? null);
    const section = host.createEl('section', {cls:'carddesk-branch'});
    section.tabIndex = -1;
    const header = section.createDiv({cls:'carddesk-heading'});
    header.createEl(parent ? 'h3' : 'h2', {text:file.basename});
    const iconButton=(label:string,icon:string)=>{const button=header.createEl('button',{cls:'clickable-icon carddesk-card-action'});button.setAttribute('aria-label',label);setIcon(button,icon);setTooltip(button,label);return button;};
    const edit = iconButton('编辑','pencil');
    edit.addEventListener('click', () => {
      if(node.disposed||node.missing)return;
      void this.editInline(node).catch(error=>new Notice('编辑失败：'+String(error)));
    });
    const discuss = iconButton('与 Agent 讨论','messages-square');
    discuss.addEventListener('click', () => {
      if(node.disposed||node.missing)return;
      if(node.editor||node.editing){new Notice('请先保存或取消当前编辑，再与 Agent 讨论');return;}
      const choices=[...new Set([...this.rendered.values()].filter(n=>!n.missing&&!n.disposed).map(n=>n.file.path))];
      if(!this.actions){new Notice('聊天入口尚未就绪');return;}
      void this.actions.discuss(node.file,choices).catch(error=>new Notice('打开聊天失败：'+String(error)));
    });
    const body = section.createDiv({cls:'markdown-rendered carddesk-body'});
    const panel = section.createDiv({cls:'carddesk-children'});
    const component = this.addChild(new Component());
    const node: ReadingNode = {file, state, parent, children:[], section, body, panel, component, disposed:false, pending:new Set(), renderVersion:0};
    this.rendered.set(state.id, node);
    node.cardId=this.cardId(file);
    body.setAttribute('aria-busy', 'true');
    body.setText('正在读取…');
    if (parent) {
      parent.children.push(node);
      const back = iconButton('返回上层','corner-left-up');
      back.addEventListener('click', () => this.focus(parent));
      const close = iconButton('收起','chevron-up');
      close.addEventListener('click', () => { this.remove(node); this.focus(parent); });
    }
    const activate = (event: MouseEvent | KeyboardEvent) => {
      const link = internalLink(event, body);
      if (!link) return;
      const reference = link.getAttribute('data-href') ?? link.getAttribute('href') ?? '';
      // Heading/block links, attachments and missing files keep native behavior.
      if (!reference || reference.includes('#') || /^\w[\w+.-]*:/.test(reference)) return;
      const target = this.app.metadataCache.getFirstLinkpathDest(getLinkpath(reference), node.file.path);
      if (!target || target.extension !== 'md') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      void this.toggle(node, target, generation).catch(error => new Notice('展开失败：' + String(error)));
    };
    // Capture before MarkdownRenderer's delegated/default link navigation.
    component.registerDomEvent(body, 'click', activate, {capture:true});
    component.registerDomEvent(body, 'keydown', activate, {capture:true});
    return node;
  }

  private async render(node: ReadingNode, generation: number): Promise<void> {
    const version=++node.renderVersion;
    const alive = () => !node.disposed && generation === this.generation && version===node.renderVersion;
    if(node.missing){if(node.renderComponent){node.component.removeChild(node.renderComponent);node.renderComponent=undefined;}node.body.setText(`文件缺失或身份不明：${node.state.path}。保留分支，可收起或使用“重新关联缺失卡片”命令。`);node.body.setAttribute('aria-busy','false');return;}
    let rendering:Component|undefined;
    try {
      const markdown = await this.app.vault.cachedRead(node.file);
      if (!alive()) return;
      rendering=node.component.addChild(new Component());
      const staging=node.body.ownerDocument.createElement('div');
      await MarkdownRenderer.render(this.app, readingMarkdown(markdown), staging, node.file.path, rendering);
      if (!alive()) {node.component.removeChild(rendering);return;}
      if(node.renderComponent)node.component.removeChild(node.renderComponent);
      node.renderComponent=rendering;
      node.body.replaceChildren(...Array.from(staging.childNodes));
      node.body.setAttribute('aria-busy','false');
      node.cardId=this.cardId(node.file) ?? node.cardId;
      this.sync(node);
      this.updateWarning(node);
    } catch (error) {
      if (!alive()) {if(rendering)node.component.removeChild(rendering);return;}
      node.missing=true;node.body.setText('读取失败，分支已保留：'+String(error));node.body.setAttribute('aria-busy','false');
      throw error;
    }
  }

  private async toggle(node: ReadingNode, target: TFile, generation: number): Promise<void> {
    if (node.disposed || generation !== this.generation || node.pending.has(target.path)) return;
    const ancestor = this.tree.ancestor(node.state, target.path);
    if (ancestor) { this.focus(this.rendered.get(ancestor.id)!); return; }
    const existing = node.children.find(child => child.file.path === target.path);
    if (existing) { this.remove(existing); this.focus(node); return; }
    if (this.count >= 100) { new Notice('最多展开 100 张卡片'); return; }
    node.pending.add(target.path);
    try {
      const child = this.append(target, node, node.panel, generation);
      this.sync(node);
      try { await this.render(child, generation); } catch(error) { this.remove(child);this.emit();throw error; }
      if (!child.disposed) this.focus(child);
      this.sync(node);
    } finally { node.pending.delete(target.path); }
  }

  private sync(node: ReadingNode): void {
    node.body.querySelectorAll<HTMLAnchorElement>('a.internal-link').forEach(link => {
      const ref = link.getAttribute('data-href') ?? link.getAttribute('href') ?? '';
      const target = this.app.metadataCache.getFirstLinkpathDest(getLinkpath(ref), node.file.path);
      link.setAttribute('aria-expanded', String(node.children.some(child => child.file.path === target?.path)));
    });
  }

  private updateWarning(node:ReadingNode):void {
    node.section.querySelector(':scope > .carddesk-link-warning')?.remove();
    if(node.missing || node.disposed)return;
    const targets=new Set(Array.from(node.body.querySelectorAll<HTMLAnchorElement>('a.internal-link')).map(link=>this.app.metadataCache.getFirstLinkpathDest(getLinkpath(link.getAttribute('data-href')??link.getAttribute('href')??''),node.file.path)?.path));
    if(node.children.some(child=>!targets.has(child.state.path)))node.body.after(Object.assign(node.body.ownerDocument.createElement('p'),{className:'carddesk-link-warning',textContent:'原链接已变更，已展开分支仍保留。'}));
  }

  private remove(node: ReadingNode): void {
    if (node.disposed) return;
    node.disposed = true;
    if(node.editor){const pending=node.editor.dispose();this.draftWrites.add(pending);void pending.finally(()=>this.draftWrites.delete(pending));node.editor=undefined;}
    for (const child of [...node.children]) this.remove(child);
    this.removeChild(node.component);
    node.body.empty();
    node.section.remove();
    this.rendered.delete(node.state.id);
    this.tree.remove(node.state);
    if (node.parent) {
      node.parent.children = node.parent.children.filter(child => child !== node);
      this.sync(node.parent);
    }
  }
  private clear(): void { if (this.root) this.remove(this.root); this.root = null; }
  async onClose(): Promise<void> { this.emit(); ++this.generation; this.clear(); this.contentEl.empty();await Promise.allSettled([...this.draftWrites]); }
  private cardId(file:TFile):string|undefined {
    const id=this.app.metadataCache.getFileCache?.(file)?.frontmatter?.card_id;
    return typeof id==='string' && id ? id : undefined;
  }
  snapshot():Snapshot|null {
    if(!this.root || this.root.disposed)return null;
    const nodes:Snapshot['nodes']=[];
    const walk=(n:ReadingNode)=>{nodes.push({nodeId:String(n.state.id),parentId:n.parent?String(n.parent.state.id):null,filePath:n.state.path,...(n.cardId?{cardId:n.cardId}:{})});n.children.forEach(walk);};walk(this.root);
    return {schemaVersion:1,id:'session',name:this.root.file.basename,rootNodeId:String(this.root.state.id),activeNodeId:String(this.active&&!this.active.disposed?this.active.state.id:this.root.state.id),nodes};
  }
  private emit():void {if(!this.restoring){const s=this.snapshot();if(s)this.changed?.(s);}}
  getState():Record<string,unknown>{return {snapshot:this.snapshot()};}
  async setState(state:Record<string,unknown>):Promise<void>{if(state.snapshot)await this.restore(validateSnapshot(state.snapshot));}
  private resolve(path:string,id?:string):TFile|null {
    const file=this.app.vault.getAbstractFileByPath(path);
    if(!id)return file instanceof TFile && file.extension==='md'?file:null;
    const matches=this.app.vault.getMarkdownFiles().filter(f=>this.cardId(f)===id);
    return matches.length===1?matches[0]:null;
  }
  async restore(value:Snapshot):Promise<void>{
    const s=validateSnapshot(value);const generation=++this.generation;this.restoring=true;this.clear();this.contentEl.empty();
    const map=new Map<string,ReadingNode>();
    try {
      for(const entry of s.nodes){
        if(generation!==this.generation)return;
        const parent=entry.parentId?map.get(entry.parentId)!:null;
        const resolved=this.resolve(entry.filePath,entry.cardId);
        const file=resolved ?? ({path:entry.filePath,basename:entry.filePath.split('/').pop()!.replace(/\.md$/,''),extension:'md'} as TFile);
        const n=this.append(file,parent,parent?.panel??this.contentEl,generation);n.cardId=entry.cardId;n.missing=!resolved;
        if(!parent){this.root=n;this.rootPath=file.path;}map.set(entry.nodeId,n);
        try {await this.render(n,generation);}catch(error){new Notice(String(error));}
      }
      if(generation===this.generation)this.focus(map.get(s.activeNodeId)??this.root!);
    } finally {if(generation===this.generation){this.restoring=false;this.emit();}}
  }
  async fileChanged(path:string,kind:'modify'|'delete'|'rename',oldPath?:string):Promise<void>{
    const generation=this.generation;
    this.refreshQueue=this.refreshQueue.catch(()=>{}).then(async()=>{
      if(generation!==this.generation)return;
      for(const node of [...this.rendered.values()]){
        if(node.disposed)continue;
        if(kind==='rename' && oldPath && (node.state.path===oldPath || node.state.path.startsWith(oldPath+'/'))){
          node.state.path=path+node.state.path.slice(oldPath.length);const f=this.app.vault.getAbstractFileByPath(node.state.path);if(f instanceof TFile)node.file=f;
          node.section.querySelector('h2,h3')!.textContent=node.file.basename;
        }
        let recovered=false;
        if(kind==='modify' && node.missing && node.cardId){
          const candidate=this.resolve(node.state.path,node.cardId);
          if(candidate){node.file=candidate;node.state.path=candidate.path;node.missing=false;recovered=true;node.section.querySelector('h2,h3')!.textContent=candidate.basename;}
        }
        if(!recovered && node.state.path!==path && !(kind==='delete' && node.state.path.startsWith(path+'/')))continue;
        node.editor?.changed();
        if(kind==='delete')node.missing=true;
        else {const current=this.app.vault.getAbstractFileByPath(node.state.path);const f=kind==='modify'&&!node.missing&&current===node.file?node.file:this.resolve(node.state.path,node.cardId);node.missing=!f;if(f){node.file=f;node.cardId=this.cardId(f);}}
        try {await this.render(node,generation);}catch(error){new Notice(String(error));}
      }
      if(generation===this.generation){for(const node of this.rendered.values()){this.sync(node);this.updateWarning(node);}this.emit();}
    });return this.refreshQueue;
  }
  missingPaths():{id:string;name:string}[]{return [...this.rendered.values()].filter(n=>n.missing).map(n=>({id:String(n.state.id),name:n.state.path}));}
  async relink(id:string,file:TFile):Promise<void>{const n=this.rendered.get(Number(id));if(!n)return;
    if(n.parent?.children.some(c=>c!==n&&c.state.path===file.path))throw new Error('父级下已存在该卡片');
    if(n.parent&&this.tree.ancestor(n.parent.state,file.path))throw new Error('不能重新关联到祖先');
    n.file=file;n.state.path=file.path;n.cardId=this.cardId(file);n.missing=false;n.section.querySelector('h2,h3')!.textContent=file.basename;
    await this.render(n,this.generation);this.emit();}
  getRootPath(): string { return this.rootPath; }
}
