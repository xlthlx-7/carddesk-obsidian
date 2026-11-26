import {test} from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import {JSDOM} from 'jsdom';
const mock=`export class Component{load(){}unload(){this.unloaded=true;}};export class MarkdownRenderer{static async render(app,text,el,path,component){globalThis.markdownCalls.push({text,el,path,component});el.createEl('p',{text});}};export class TFile {constructor(path){this.path=path;this.extension='md';this.stat={size:20};}};globalThis.ChatTestFile=TFile;export class TFolder{};export class Notice{constructor(s){globalThis.notices.push(s);}};export class ItemView{constructor(leaf){this.app=leaf.app;this.contentEl=document.createElement('div');document.body.append(this.contentEl);}};export class Modal{constructor(app){this.app=app;this.contentEl=document.createElement('div');}open(){document.body.append(this.contentEl);this.onOpen?.();}close(){this.onClose?.();this.contentEl.remove();}};`;
const out=await build({entryPoints:['src/chat-view.ts'],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'mock',setup(b){b.onResolve({filter:/^obsidian$/},()=>({path:'host',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:mock}));}}]});
const {ChatView}=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
function setup(agent,persist=async()=>{}){const dom=new JSDOM('<body></body>');globalThis.document=dom.window.document;globalThis.notices=[];globalThis.markdownCalls=[];const p=dom.window.HTMLElement.prototype;p.createEl=function(tag,o={}){const e=document.createElement(tag);if(o.text)e.textContent=o.text;if(o.cls)e.className=o.cls;if(o.value)e.value=o.value;if(o.type)e.type=o.type;this.append(e);return e;};p.createDiv=function(o){return this.createEl('div',o)};p.addClass=function(c){this.classList.add(c)};p.empty=function(){this.replaceChildren()};p.setText=function(s){this.textContent=s};p.appendText=function(s){this.append(document.createTextNode(s));};
const state={settings:{codexPath:'/fake/codex',model:'',cards:'Cards/Chat'},sessions:[],activeId:null};const file=new globalThis.ChatTestFile('原卡.md');const app={vault:{getAbstractFileByPath:p=>p===file.path?file:null,read:async()=> '原创卡片正文'}};const view=new ChatView({app},()=>state,persist,agent);return {view,state,dom};}
test('current-card chat streams and saves a session with explicit body context; layout controls stay in chat',async()=>{let prompt;const {view,state}=setup({run:async r=>{prompt=r.prompt;r.onText('部分');assert.match(view.contentEl.textContent,/部分/);return '完整中文回答';}});await view.onOpen();await view.setContext('原卡.md',['原卡.md','其他.md']);view.input='问题';await view.send();const s=state.sessions[0];assert.equal(s.messages.length,2);assert.deepEqual(s.messages[0].contexts,[{path:'原卡.md',body:'原创卡片正文'}]);assert.ok(!prompt.includes('其他.md'));assert.equal(s.messages[1].status,'complete');assert.equal(s.messages[1].text,'完整中文回答');assert.match(view.contentEl.textContent,/整理为关联卡片/);await view.onClose();});
test('rapid duplicate send during asynchronous context read produces one user turn',async()=>{let calls=0,release;const gate=new Promise(r=>release=r);const {view,state}=setup({run:async()=>{calls++;return '回复';}});await view.onOpen();await view.setContext('原卡.md',[]);view.app.vault.read=async()=>{await gate;return '正文';};view.input='问题';const first=view.send();await view.send();release();await first;assert.equal(calls,1);assert.equal(state.sessions[0].messages.length,2);await view.onClose();});
test('close during preparation does not launch a hidden model request',async()=>{let calls=0,release;const gate=new Promise(r=>release=r);const {view}=setup({run:async()=>{calls++;return '回复';}});await view.onOpen();await view.setContext('原卡.md',[]);view.app.vault.read=async()=>{await gate;return '正文';};view.input='问题';const pending=view.send();await view.onClose();release();await pending;assert.equal(calls,0);assert.equal(view.contentEl.textContent,'');});
test('closing a streaming view aborts and persists interrupted partial text without later rendering',async()=>{let started;const ready=new Promise(r=>started=r);const {view,state}=setup({run:r=>new Promise((_,reject)=>{r.onText('未完成');started();r.signal.addEventListener('abort',()=>reject(Error('已停止')),{once:true});})});await view.onOpen();await view.setContext('原卡.md',[]);view.input='问题';const request=view.send();await ready;await view.onClose();await request;assert.equal(state.sessions[0].messages[1].status,'interrupted');assert.equal(state.sessions[0].messages[1].text,'未完成');assert.equal(view.contentEl.textContent,'');});
test('different card starts isolated history; same card continues; old sessions remain selectable after reopen',async()=>{
 const prompts=[];const {view,state}=setup({run:async r=>{prompts.push(r.prompt);return '上一张卡的专属回答';}});
 view.app.vault.getAbstractFileByPath=p=>new globalThis.ChatTestFile(p);
 await view.onOpen();await view.setContext('原卡.md',[]);view.input='上一张卡的专属问题';await view.send();
 const first=state.activeId;await view.setContext('原卡.md',[]);assert.equal(state.activeId,first);assert.equal(state.sessions.length,1);
 view.input='尚未发送的旧输入';await view.setContext('新卡.md',['原卡.md']);const second=state.activeId;
 assert.notEqual(second,first);assert.equal(state.sessions.length,2);assert.equal(state.sessions[1].messages.length,0);assert.equal(view.input,'');
 assert.equal(state.sessions[1].cardPath,'新卡.md');
 await view.onClose();await view.onOpen();await view.setContext('新卡.md',[]);assert.equal(state.activeId,second);
 view.input='新问题';await view.send();assert.ok(!prompts[1].includes('上一张卡的专属'));assert.ok(!prompts[1].includes('原卡.md'));assert.equal(state.sessions[0].messages.length,2);
 const select=view.contentEl.querySelector('select');select.value=first;select.onchange();await new Promise(r=>setTimeout(r,0));
 assert.equal(view.primary,'原卡.md');await view.setContext('原卡.md',[]);assert.equal(state.activeId,first);assert.equal(state.sessions.length,2);await view.onClose();
});
test('failed save and session limit preserve existing card, messages and unsent input',async()=>{
 let fail=false;const {view,state}=setup({run:async()=> '回复'},async()=>{if(fail)throw Error('磁盘错误');});
 await view.onOpen();await view.setContext('原卡.md',[]);const first=state.activeId;view.input='保留输入';fail=true;
 await assert.rejects(view.setContext('新卡.md',[]),/磁盘错误/);assert.equal(state.activeId,first);assert.equal(state.sessions.length,1);assert.equal(view.primary,'原卡.md');assert.equal(view.input,'保留输入');
 fail=false;while(state.sessions.length<20)state.sessions.push({id:String(state.sessions.length),title:'已有',messages:[],updatedAt:'now'});
 await assert.rejects(view.setContext('新卡.md',[]),/20/);assert.equal(state.activeId,first);assert.equal(view.primary,'原卡.md');await view.onClose();
});
test('switch while saving or replying cannot replace the current discussion',async()=>{
 let release;let gate=new Promise(r=>release=r);const {view,state}=setup({run:async()=> '回复'},()=>gate);
 await view.onOpen();const opening=view.setContext('原卡.md',[]);await view.setContext('新卡.md',[]);assert.equal(state.sessions.length,1);release();await opening;
 let started;const ready=new Promise(r=>started=r);gate=new Promise(r=>release=r);
 view.agent={run:async()=>{started();await gate;return '回复';}};view.persist=async()=>{};view.input='问题';const sending=view.send();await ready;
 await view.setContext('新卡.md',[]);assert.equal(state.sessions.length,1);assert.equal(view.primary,'原卡.md');release();await sending;await view.onClose();
});
test('legacy sessions infer their card from stored context without discarding history',async()=>{
 const {view,state}=setup({run:async()=> '回复'});state.sessions=[{id:'legacy',title:'旧讨论',updatedAt:'now',messages:[{id:'u',role:'user',text:'旧问题',status:'complete',contexts:[{path:'原卡.md',body:'正文'}]}]}];state.activeId='legacy';
 await view.onOpen();await view.setContext('原卡.md',[]);assert.equal(state.activeId,'legacy');assert.equal(state.sessions[0].messages.length,1);await view.setContext('新卡.md',[]);assert.equal(state.sessions.length,2);await view.onClose();
});
test('sidebar separates messages and composer; selected conversation identifies its own card',async()=>{
 const {view,state}=setup({run:async()=> '### 说明\n**重点**'});await view.onOpen();await view.setContext('原卡.md',[]);
 const composer=view.contentEl.querySelector('.carddesk-chat-composer'),messages=view.contentEl.querySelector('.carddesk-chat-messages');
 assert.ok(composer.querySelector('textarea'));assert.ok(!messages.contains(composer));assert.match(view.contentEl.querySelector('.carddesk-chat-target').textContent,/原卡/);
 assert.ok(view.contentEl.querySelector('.carddesk-chat-menu button').textContent.includes('删除'));assert.equal(view.contentEl.querySelector('button.mod-cta').disabled,true);
 const suggestion=view.contentEl.querySelector('.carddesk-chat-empty button');suggestion.click();assert.equal(view.input,'用一个例子解释这张卡');assert.equal(state.sessions[0].messages.length,0);
 await view.send();assert.ok(globalThis.markdownCalls.some(c=>c.text.includes('### 说明')&&c.path==='原卡.md'));
 const component=globalThis.markdownCalls.at(-1).component;await view.onClose();assert.equal(component.unloaded,true);
});
test('Enter sends, Shift+Enter and Chinese composition do not send; pending response offers stop',async()=>{
 let started,release;const ready=new Promise(r=>started=r),gate=new Promise(r=>release=r);
 const {view,state,dom}=setup({run:async()=>{started();await gate;return '回答';}});await view.onOpen();await view.setContext('原卡.md',[]);
 const input=view.contentEl.querySelector('textarea');input.value='测试';input.dispatchEvent(new dom.window.Event('input'));
 input.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',shiftKey:true,bubbles:true}));input.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true}));assert.equal(state.sessions[0].messages.length,0);
 input.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await ready;
 assert.ok([...view.contentEl.querySelectorAll('.carddesk-chat-compose-actions button')].some(b=>b.textContent==='停止'&&!b.disabled));
 release();await new Promise(r=>setTimeout(r,0));assert.equal(state.sessions[0].messages.length,2);await view.onClose();
});
test('streaming preserves the position when reading above; follows only near the end',async()=>{
 const {view}=setup({run:async r=>{
  const el=view.messagesEl;Object.defineProperty(el,'scrollHeight',{value:1000,configurable:true});Object.defineProperty(el,'clientHeight',{value:200,configurable:true});el.scrollTop=100;
  r.onText('新增文本');assert.equal(el.scrollTop,100);el.scrollTop=800;r.onText('继续新增');assert.equal(el.scrollTop,1000);return '完整回答';
 }});await view.onOpen();await view.setContext('原卡.md',[]);view.input='问题';await view.send();await view.onClose();
});

test('context and more buttons expose explicit keyboard-accessible disclosure state',async()=>{
 const {view}=setup({run:async()=> '回复'});await view.onOpen();await view.setContext('原卡.md',[]);
 const button=view.contentEl.querySelector('.carddesk-chat-context > button'),panel=view.contentEl.querySelector('.carddesk-chat-context-content');assert.equal(panel.hidden,true);button.click();assert.equal(panel.hidden,false);assert.equal(button.getAttribute('aria-expanded'),'true');view.render();assert.equal(view.contentEl.querySelector('.carddesk-chat-context-content').hidden,false);
 const more=view.contentEl.querySelector('.carddesk-chat-more > button'),menu=view.contentEl.querySelector('.carddesk-chat-menu');assert.equal(menu.hidden,true);more.click();assert.equal(menu.hidden,false);assert.equal(more.getAttribute('aria-expanded'),'true');more.click();assert.equal(menu.hidden,true);await view.onClose();
});
test('draft preparation locks context switching and duplicate generation before asynchronous source read',async()=>{
 let calls=0,release;const gate=new Promise(r=>release=r);const {view,state}=setup({run:async()=>{calls++;return '{"title":"标题","body":"解释","linkText":"继续理解"}';}});
 await view.onOpen();await view.setContext('原卡.md',[]);const s=state.sessions[0],answer={id:'answer',role:'assistant',text:'回答',status:'complete'};s.messages.push({id:'u',role:'user',text:'问题',status:'complete',contexts:[{path:'原卡.md',body:'正文'}]},answer);
 view.app.vault.read=async()=>{await gate;return '正文';};const making=view.makeDraft(answer,'回答');await view.setContext('新卡.md',[]);await view.makeDraft(answer,'回答');assert.equal(state.sessions.length,1);assert.equal(view.primary,'原卡.md');release();await making;assert.equal(calls,1);await view.onClose();
});
test('an answer from another session cannot be drafted with the current source card',async()=>{
 let calls=0;const {view}=setup({run:async()=>{calls++;return '';}});await view.onOpen();await view.setContext('原卡.md',[]);
 await assert.rejects(view.makeDraft({id:'old',role:'assistant',text:'旧回复',status:'complete'},'旧回复'),/对话已切换/);assert.equal(calls,0);await view.onClose();
});
test('closing during draft preparation makes no hidden model request',async()=>{
 let calls=0,release;const gate=new Promise(r=>release=r);const {view,state}=setup({run:async()=>{calls++;return '';}});await view.onOpen();await view.setContext('原卡.md',[]);
 const answer={id:'answer',role:'assistant',text:'回答',status:'complete'};state.sessions[0].messages.push({id:'u',role:'user',text:'问题',status:'complete',contexts:[{path:'原卡.md',body:'正文'}]},answer);view.app.vault.read=async()=>{await gate;return '正文';};const making=view.makeDraft(answer,'回答');await view.onClose();release();await making;assert.equal(calls,0);
});
