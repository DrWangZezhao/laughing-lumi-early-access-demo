import {readFile,writeFile,mkdir} from 'node:fs/promises';
const core=await readFile(new URL('./sheets-core.js',import.meta.url),'utf8');
const adapter=await readFile(new URL('./apps-script.gs',import.meta.url),'utf8');
const target=new URL('../work/apps-script/Code.gs',import.meta.url);
await mkdir(new URL('.',target),{recursive:true});
await writeFile(target,core.replace(/^export /gm,'')+'\n'+adapter);
console.log('Generated work/apps-script/Code.gs (server deployment only).');
