import { build } from 'esbuild';
import { readFile,writeFile } from 'node:fs/promises';
// Keep vendor CSS in Lit's stylesheet as well: HA/card-mod can recreate style
// elements and discard the CSSOM-only rules FullCalendar injects at runtime.
const paths=['core/internal-common.js','daygrid/internal.js','timegrid/internal.js'];
const vendor=[];
for(const path of paths){
  const source=await readFile(`node_modules/@fullcalendar/${path}`,'utf8');
  const matches=[...source.matchAll(/(?:var|const) css_\w+ = ("(?:[^"\\]|\\.)*");/g)];
  if(!matches.length)throw new Error(`FullCalendar CSS missing: ${path}`);
  vendor.push(...matches.map(match=>JSON.parse(match[1])));
}
await writeFile('src/vendor-calendar.css',vendor.join('\n'));
await build({entryPoints:['src/card.js'],outfile:'belovodie-calendar-card.js',bundle:true,format:'esm',target:'es2022',minify:true,legalComments:'eof',loader:{'.css':'text'},define:{__VERSION__:'"0.1.0"'}});
