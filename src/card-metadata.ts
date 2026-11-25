/** Presentation helpers never modify files. Legacy recognition is intentionally narrow. */
export interface FrontmatterParts {yaml:string;body:string;prefix:string;}
export function splitFrontmatter(text:string):FrontmatterParts {
 const match=/^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
 return match?{yaml:match[1],body:text.slice(match[0].length),prefix:match[0]}:{yaml:'',body:text,prefix:''};
}
export interface LegacyMetadata {sources:string;raw:string;updated:string;start:number;end:number;}
export function legacyMetadata(body:string):LegacyMetadata|null {
 const title=/^(?:[ \t]*\r?\n)*#[ \t]+[^\r\n]+\r?\n(?:[ \t]*\r?\n)*/.exec(body);
 if(!title)return null;
 const start=title[0].length;
 const fields=/^>[ \t]*Sources:[ \t]*([^\r\n]+)\r?\n>[ \t]*Raw:[ \t]*([^\r\n]+)\r?\n>[ \t]*Updated:[ \t]*(\d{4}-\d{2}-\d{2})[ \t]*(?:\r?\n|$)(?![ \t]*>)/i.exec(body.slice(start));
 if(!fields||!fields[1].trim()||!fields[2].trim())return null;
 return {sources:fields[1].trim(),raw:fields[2].trim(),updated:fields[3],start,end:start+fields[0].length};
}
export function readingMarkdown(text:string):string {
 const {body}=splitFrontmatter(text),legacy=legacyMetadata(body);
 return legacy?body.slice(0,legacy.start)+body.slice(legacy.end):body;
}
export interface MetadataPlan {before:string;after:string;fields:{sources:string[];raw:string;updated:string};}
export function planMetadataMigration(text:string,parse:(yaml:string)=>unknown,stringify:(data:Record<string,unknown>)=>string):MetadataPlan {
 const parts=splitFrontmatter(text),legacy=legacyMetadata(parts.body);
 if(!legacy)throw Error('没有可转换的标题后 Sources / Raw / Updated 三行元信息；未修改文件');
 const parsed=parts.prefix?parse(parts.yaml):{};
 if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error('顶部属性不是有效映射，需手工核对');
 const frontmatter=parsed as Record<string,unknown>;
 if(Object.keys(frontmatter).some(k=>['sources','raw','updated'].includes(k.toLowerCase())))throw Error('顶部已有 sources、raw 或 updated，存在合并歧义，未覆盖');
 const fields={sources:[legacy.sources],raw:legacy.raw,updated:legacy.updated};
 // Append to the existing YAML bytes so comments, field order and source identity remain intact.
 const ending=text.includes('\r\n')?'\r\n':'\n';
 const additions=stringify(fields).trimEnd().replace(/\r?\n/g,ending);
 const yaml=parts.prefix?parts.yaml+ending+additions:additions;
 const checked=parse(yaml) as Record<string,unknown>;
 if(!checked||JSON.stringify(checked.sources)!==JSON.stringify(fields.sources)||checked.raw!==fields.raw||checked.updated!==fields.updated)throw Error('合并后的属性无法无损解析，未修改文件');
 const body=parts.body.slice(0,legacy.start)+parts.body.slice(legacy.end);
 return {before:text,after:'---'+ending+yaml+ending+'---'+ending+body,fields};
}
export function localDate():string {const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');}
