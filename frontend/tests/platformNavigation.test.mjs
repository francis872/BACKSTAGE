import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CORE_NAVIGATION,selectedPage} from '../src/lib/navigationRegistry.mjs';
const manifest=JSON.parse(fs.readFileSync(new URL('../../shared/modules.json',import.meta.url)));
test('four primary destinations integrate existing capabilities and retain deep links',()=>{
 const global=CORE_NAVIGATION.map(p=>p.key),modulePages=manifest.modules.flatMap(m=>m.pages.map(p=>p.key));
 assert.deepEqual(global,['territorial-explorer','feed','profile','organization-settings']);assert(!global.includes('soi'));assert(modulePages.includes('soi'));assert(modulePages.includes('clean-com'));
 assert.equal(new Set([...global,...modulePages]).size,global.length+modulePages.length);
 for(const page of [...global,...modulePages])assert.equal(selectedPage(`?page=${encodeURIComponent(page)}`),page);
 for(const legacy of ['mission-control','portfolio-assets','portfolio-projects','portfolio-comparator','earthart'])assert.equal(selectedPage(`?page=${legacy}`),legacy);
 assert.equal(selectedPage(''),'territorial-explorer');
});
test('neutral views consume platform contracts while historical comparison algorithm imports remain compatible',async()=>{
 for(const file of ['pages/NativeTerritorialExplorer.jsx','pages/AdvancedComparator.jsx','pages/AssetsWorkspace.jsx','components/LiveTerritoryOverview.jsx']){const source=fs.readFileSync(new URL('../src/'+file,import.meta.url),'utf8');assert(!source.includes('/soi/'),file);assert(!/import .*SoiWorkspace/.test(source),file);}
 const core=await import('../../shared/comparison.mjs'),legacy=await import('../../shared/soiComparison.mjs');assert.equal(core.evaluateComparison,legacy.evaluateComparison);
});
