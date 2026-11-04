import {mkdir,cp,rm,writeFile} from 'node:fs/promises';
await rm('dist',{recursive:true,force:true});await mkdir('dist');
for(const name of ['index.html','assets','css','js','demo','privacy','research','review'])await cp(name,'dist/'+name,{recursive:true});
await mkdir('dist/investors');await cp('investors/index.html','dist/investors/index.html');
await writeFile('dist/.nojekyll','');
