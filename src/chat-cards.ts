import {localDate} from './card-metadata';
import {App, TFile, TFolder} from 'obsidian';
import {DraftContent} from './chat-model';
import {safePath} from './protocol-validator';
export interface CardDraft extends DraftContent {id:string;sessionId:string;messageId:string;sourcePath:string;expectedSource:string;targetPath:string;createdDate?:string;}
function validate(d:CardDraft):void {
 if(!safePath(d.sourcePath)||!d.sourcePath.endsWith('.md')||!safePath(d.targetPath)||!d.targetPath.endsWith('.md')||d.targetPath===d.sourcePath)throw Error('草稿路径无效');
 for(const value of [d.id,d.sessionId,d.messageId])if(!/^[a-zA-Z0-9-]+$/.test(value))throw Error('草稿标识无效');
 if(!d.title.trim()||/[\r\n]/.test(d.title)||d.title.length>100||!d.body.trim()||d.body.length>20000||!d.linkText.trim()||/[\[\]|\r\n]/.test(d.linkText)||d.linkText.length>100)throw Error('标题、正文或链接文字无效');
}
export function draftText(d:CardDraft):string {
 validate(d);
 return `---\ncarddesk_schema: 1\nsources: ["Codex 对话补充（待核对）"]\nraw: ${JSON.stringify("[["+d.sourcePath.slice(0,-3)+"]]")}\nupdated: ${JSON.stringify(d.createdDate??localDate())}\ncard_id: ${JSON.stringify('chat-'+d.id)}\ncard_role: explanation\nsource_path: ${JSON.stringify(d.sourcePath)}\nsource_locator: ${JSON.stringify('对话补充，非原文证据')}\ncarddesk_origin: conversation\nverification_status: unverified\nchat_session_id: ${JSON.stringify(d.sessionId)}\nchat_message_id: ${JSON.stringify(d.messageId)}\n---\n# ${d.title.trim()}\n\n> 对话补充，待核对。下方内容不代表原卡来源已支持这些结论。\n\n${d.body.trim()}\n\n相关阅读：[[${d.sourcePath.slice(0,-3)}|回到提问卡片]]\n`;
}
export function draftLink(d:CardDraft):string {validate(d);return `[[${d.targetPath.slice(0,-3)}|${d.linkText.trim()}]] <!-- carddesk-chat:${d.id} -->`;}
export async function commitDraft(app:App,d:CardDraft):Promise<string>{
 const text=draftText(d),link=draftLink(d),source=app.vault.getAbstractFileByPath(d.sourcePath);
 if(!(source instanceof TFile))throw Error('提问卡片不存在，请重新选择并预览');
 const current=await app.vault.read(source);
 const linked=(body:string)=>body.includes(link);
 if(current.includes(`<!-- carddesk-chat:${d.id} -->`)&&!linked(current))throw Error('这条回复已有的关联链接已变化，请手动核对；未重复追加');
 if(current!==d.expectedSource&&!linked(current))throw Error('提问卡片已变化，请重新预览后确认');
 const existing=app.vault.getAbstractFileByPath(d.targetPath);
 if(existing){if(!(existing instanceof TFile)||await app.vault.read(existing)!==text)throw Error('目标文件已存在且内容不同，未覆盖');}
 else {
  let directory='';for(const part of d.targetPath.split('/').slice(0,-1)){directory=directory?directory+'/'+part:part;const f=app.vault.getAbstractFileByPath(directory);if(f&&!(f instanceof TFolder))throw Error('输出目录被文件占用');if(!f)await app.vault.createFolder(directory);}
  await app.vault.create(d.targetPath,text);
 }
 try {
  await app.vault.process(source,body=>{if(linked(body))return body;if(body!==d.expectedSource)throw Error('提问卡片在写入前已变化，请重新预览');return body.trimEnd()+'\n\n'+link+'\n';});
 }catch(error){throw Error(`新卡已保留在 ${d.targetPath}，关联尚未完成：${String(error)}。请勿删除卡片，可重新预览后重试。`);}
 return d.targetPath;
}
