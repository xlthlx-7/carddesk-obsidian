import {test} from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';
const code=await build({entryPoints:['src/chat-model.ts'],bundle:true,write:false,format:'esm'});
const {defaultAgentState,validateAgentState,conversationPrompt,parseDraft}=await import('data:text/javascript;base64,'+Buffer.from(code.outputFiles[0].text).toString('base64'));
const session=()=>({id:'s',title:'问题',updatedAt:'now',messages:[{id:'u',role:'user',text:'解释',status:'complete',contexts:[{path:'卡片.md',body:'内容'}]},{id:'a',role:'assistant',text:'未完成',status:'interrupted'},{id:'b',role:'assistant',text:'完整回复',status:'complete'}]});
test('history includes only completed messages and explicit context; bounds fail without silent truncation',()=>{
 const s=session(),prompt=conversationPrompt(s);assert.ok(prompt.includes('内容'));assert.ok(!prompt.includes('未完成'));assert.ok(prompt.includes('完整回复'));
 s.messages[0].contexts[0].body='x'.repeat(160000);assert.throws(()=>conversationPrompt(s),/超过/);
 const state=defaultAgentState();state.sessions=[session()];assert.deepEqual(validateAgentState(state),state);
 state.sessions[0].messages[0].contexts[0].path='../private.md';assert.throws(()=>validateAgentState(state));
});
test('rejects malformed persisted chat, unsafe directory, duplicate message ids, and malformed draft',()=>{
 for(const mutate of [s=>s.settings.cards='../Cards',s=>s.sessions=[session(),session()],s=>{const v=session();v.messages[1].id='u';s.sessions=[v];}]){const s=defaultAgentState();mutate(s);assert.throws(()=>validateAgentState(s));}
 assert.deepEqual(parseDraft('```json\n{"title":"标题","body":"解释","linkText":"继续理解"}\n```'),{title:'标题',body:'解释',linkText:'继续理解'});assert.throws(()=>parseDraft('{"title":"x"}'));
});
