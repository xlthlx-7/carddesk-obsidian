import {test} from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';
const out=await build({entryPoints:['src/chat-markdown.ts'],bundle:true,write:false,format:'esm'});
const {displayMarkdown}=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
test('answer Markdown keeps structure and code but neutralizes active HTML and embedded resources',()=>{
 const text='### 标题\n**重点**\n- 列表\n![远端图片](https://example.com/a.png)\n![[私有卡]]\n<img src="https://example.com/a.png">\n`<img>`\n```html\n<img src="code-only">\n```';
 const result=displayMarkdown(text);assert.match(result,/### 标题\n\*\*重点\*\*\n- 列表/);assert.ok(!result.includes('![远端'));assert.ok(!result.includes('![[私有'));assert.match(result,/&lt;img src="https/);assert.match(result,/`<img>`/);assert.match(result,/```\n<img src="code-only">\n```/);
});

test('model code fences stay inert instead of invoking query or third-party code processors',()=>{
 const value=displayMarkdown('```query\npath:"private"\n```\n\n```dataviewjs\nconsole.log("sample");\n```');assert.ok(!value.includes('```query'));assert.ok(!value.includes('```dataviewjs'));assert.match(value,/```\npath:"private"\n```/);assert.match(value,/console.log/);
});
