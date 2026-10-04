import { build } from 'esbuild';
await build({entryPoints:['src/card.js'],outfile:'belovodie-calendar-card.js',bundle:true,format:'esm',target:'es2022',minify:true,legalComments:'eof',loader:{'.css':'text'},define:{__VERSION__:'"0.1.0"'}});
