/** Render answers as text Markdown, without fetching model-supplied images or embeds. */
export function displayMarkdown(text:string):string {
 let fence:{char:string;length:number}|null=null;
 return text.split('\n').map(line=>{
  const marker=line.match(/^\s{0,3}(`{3,}|~{3,})/);
  if(marker){const run=marker[1];if(!fence){fence={char:run[0],length:run.length};return line.slice(0,marker[0].length);}else if(run[0]===fence.char&&run.length>=fence.length&&line.slice(marker[0].length).trim()==='')fence=null;return line;}
  if(fence)return line;
  return line.split(/(`+[^`]*`+)/g).map((part,i)=>i%2?part:part.replace(/</g,'&lt;').replace(/!\s*(?=\[)/g,'')).join('');
 }).join('\n');
}
