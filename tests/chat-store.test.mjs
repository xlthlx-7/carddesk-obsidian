import {test} from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';
const code=await build({entryPoints:['src/path-store.ts'],bundle:true,write:false,format:'esm'});const {PathStore}=await import('data:text/javascript;base64,'+Buffer.from(code.outputFiles[0].text).toString('base64'));
const snapshot={schemaVersion:1,id:'old',name:'旧路径',rootNodeId:'a',activeNodeId:'a',nodes:[{nodeId:'a',parentId:null,filePath:'原卡.md'}]};
const agent=()=>({settings:{codexPath:'/bin/codex',model:'',cards:'Cards/Chat'},activeId:'s',sessions:[{id:'s',title:'对话',updatedAt:'now',messages:[{id:'m',role:'assistant',text:'部分',status:'pending'}]}]});
test('0.3.4 reading data round trips while chat and reading writes are serialized together',async()=>{
 const writes=[];let release;const store=new PathStore(async d=>{writes.push(d);if(writes.length===1)await new Promise(r=>release=r);},()=>{});
 store.load({schemaVersion:1,lastSession:snapshot,paths:[snapshot]});const first=store.setAgent(agent());await new Promise(r=>setImmediate(r));store.update({...snapshot,name:'新进度'});const second=store.flush();release();await first;await second;
 assert.equal(writes.at(-1).lastSession.name,'新进度');assert.equal(writes.at(-1).paths[0].name,'旧路径');assert.equal(writes.at(-1).agent.sessions[0].messages[0].text,'部分');
 const loaded=new PathStore(async()=>{},()=>{});loaded.load(writes.at(-1));assert.equal(loaded.data.agent.sessions[0].messages[0].status,'interrupted');assert.deepEqual(loaded.data.paths,[snapshot]);
});
test('damaged/unknown storage blocks chat writes as well as reading writes',async()=>{let writes=0;const store=new PathStore(async()=>writes++,()=>{});store.load({schemaVersion:99});await assert.rejects(store.setAgent(agent()));assert.equal(writes,0);});
test('edit drafts persist alongside chat and snapshots and can be removed without changing either',async()=>{
 let saved;const store=new PathStore(async d=>saved=d,()=>{});store.load({schemaVersion:1,lastSession:snapshot,paths:[snapshot],agent:agent()});const draft={id:'edit',path:'原卡.md',base:'原文',text:'未保存'};await store.setDraft(draft);store.update(snapshot);await store.flush();const restored=new PathStore(async()=>{},()=>{});restored.load(saved);assert.deepEqual(restored.data.drafts,[draft]);assert.equal(restored.data.paths[0].name,'旧路径');assert.equal(restored.data.agent.sessions[0].title,'对话');await store.deleteDraft('edit');assert.deepEqual(saved.drafts,[]);assert.equal(saved.paths.length,1);await assert.rejects(store.setDraft({...draft,path:'../secret.md'}));
});
