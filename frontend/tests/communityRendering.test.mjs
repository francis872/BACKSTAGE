import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(new URL('../package.json',import.meta.url)),{build}=require('esbuild'),React=require('react'),{renderToString}=require('react-dom/server'),Module=require('node:module');
const filename=fileURLToPath(new URL('../community-rendering-check.cjs',import.meta.url)),built=await build({entryPoints:[fileURLToPath(new URL('../src/components/CommunityKnowledgePanel.jsx',import.meta.url))],bundle:true,platform:'node',format:'cjs',write:false,jsx:'automatic',loader:{'.css':'empty'},external:['react','react-dom'],logLevel:'silent'}),m=new Module(filename);m.filename=filename;m.paths=require.resolve.paths('react');m._compile(built.outputFiles[0].text,filename);const Panel=m.exports.default;
test('Community is contextual and initially closed, and private controls are absent for viewers',()=>{for(const role of ['admin','analyst']){const markup=renderToString(React.createElement(Panel,{locationId:9,user:{user_id:1,organization_id:10,role}}));assert(markup.includes('Documentos y conocimiento de este lugar'));assert(!markup.includes('form'));assert(!markup.includes('<nav'));}assert.equal(renderToString(React.createElement(Panel,{locationId:9,user:{user_id:1,organization_id:10,role:'viewer'}})),'');});
