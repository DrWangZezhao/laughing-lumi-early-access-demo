import {mkdir,cp,rm,writeFile} from 'node:fs/promises';
const output=process.env.LUMI_BUILD_DIR||'dist';
await rm(output,{recursive:true,force:true});await mkdir(output,{recursive:true});
for(const name of ['index.html','assets','css','js','demo','privacy','research'])await cp(name,output+'/'+name,{recursive:true});
// The legacy investor attachments are retained in Git but excluded until separately reviewed.
await mkdir(output+'/investors');await cp('investors/index.html',output+'/investors/index.html');
await writeFile(output+'/.nojekyll','');
