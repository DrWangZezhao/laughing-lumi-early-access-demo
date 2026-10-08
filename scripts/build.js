import {mkdir,cp,rm,writeFile} from 'node:fs/promises';
await rm('dist',{recursive:true,force:true});await mkdir('dist');
for(const name of ['index.html','assets','css','js','demo','privacy'])await cp(name,'dist/'+name,{recursive:true});
await writeFile('dist/.nojekyll','');
