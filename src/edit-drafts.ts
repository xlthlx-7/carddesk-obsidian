import {safePath} from './protocol-validator';
export interface EditDraft {id:string;path:string;base:string;text:string;}
export function validateEditDraft(raw:unknown):EditDraft {
 const d=raw as EditDraft;
 if(!d||typeof d.id!=='string'||!d.id||!safePath(d.path)||!d.path.endsWith('.md')||typeof d.base!=='string'||typeof d.text!=='string'||d.base.length>1000000||d.text.length>1000000)throw Error('编辑草稿格式或长度无效');
 return {...d};
}
