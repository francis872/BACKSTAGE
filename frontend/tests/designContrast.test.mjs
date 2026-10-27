import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=fs.readFileSync(new URL('../src/styles/theme.css',import.meta.url),'utf8').match(/:root\s*\{([\s\S]*?)\}/)[1];
const tokens=new Map([...root.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(match=>[match[1],match[2].trim()]));
function color(name,visited=[]){
 assert(!visited.includes(name),`Cyclic token ${name}`);
 const value=tokens.get(name);assert(value,`Missing token ${name}`);
 const alias=value.match(/^var\((--[\w-]+)\)$/);
 if(alias)return color(alias[1],[...visited,name]);
 assert.match(value,/^#[0-9a-f]{6}$/i,`${name} must resolve to a color`);
 return value;
}
function luminance(hex){return [1,3,5].map(start=>parseInt(hex.slice(start,start+2),16)/255).map(channel=>channel<=.04045?channel/12.92:((channel+.055)/1.055)**2.4).reduce((sum,channel,index)=>sum+channel*[.2126,.7152,.0722][index],0);}
function contrast(a,b){const values=[luminance(color(a)),luminance(color(b))].sort((a,b)=>b-a);return (values[0]+.05)/(values[1]+.05);}

test('shared controls retain readable contrast in normal, hover, pressed and semantic states',()=>{
 for(const [foreground,background] of [['--action-ink','--brand'],['--action-ink','--brand-hover'],['--action-ink','--brand-pressed'],['--ink','--accent-red'],['--ink-secondary','--surface-panel'],['--ink-muted','--surface-panel'],['--status-error','--surface-panel'],['--action-ink','--status-success'],['--action-ink','--status-warning']])assert(contrast(foreground,background)>=4.5,`${foreground}/${background}: ${contrast(foreground,background).toFixed(2)} < 4.5`);
 assert(contrast('--focus-ring','--surface-panel')>=3,'Focus indicator contrast');
});

test('legacy consumers resolve to the authorized Origin monochrome identity',()=>{
 assert.equal(color('--primary'),'#08090B');assert.equal(color('--accent-cyan'),'#E5E7EB');assert.equal(color('--accent-blue'),'#9298A2');assert.equal(color('--text-primary'),'#ffffff');
});
