import test from 'node:test';
import assert from 'node:assert/strict';
import {economicMinorUnits,displayMinorUnits,toMinorUnits} from '../src/lib/monetaryUnits.mjs';
import {economicOverlay,economicOwner,scopedEconomicOverlay} from '../src/lib/economicOverlay.mjs';
test('economic UI supports zero, signed openings and exact large string money without changing payment validation',()=>{
 assert.equal(economicMinorUnits('0',2),'0');assert.equal(economicMinorUnits('-0.29',2,true),'-29');assert.equal(economicMinorUnits('9007199254740993.01',2),'900719925474099301');assert.equal(displayMinorUnits('900719925474099301',2),'9007199254740993.01');
 assert.equal(displayMinorUnits('-29',2),'-0.29');assert.throws(()=>economicMinorUnits('1.001',2));assert.throws(()=>economicMinorUnits('-1',2));assert.throws(()=>toMinorUnits('0',2));
});
test('economic map uses only own geometries and clears private overlay for another object, organization or role',()=>{
 const evidence={result:{currency:'COP',scale:2,current:{receivables:{entities:[{entity_id:'1',outstanding_minor:'4001'},{entity_id:'2',outstanding_minor:'0'}]}}},snapshot:{captured_at:'2026-10-26T00:00:00Z',entities:[{id:'1',geometry:{type:'Point',coordinates:[0,0]}},{id:'2',geometry:null}]}};
 const data=economicOverlay(evidence);assert.equal(data.geojson.features.length,1);assert.equal(data.omitted_unlocated,1);assert.deepEqual(data.geojson.features[0].geometry.coordinates,[0,0]);assert.equal(data.geojson.features[0].properties.has_balance,true);
 const user={user_id:1,organization_id:10,role:'admin'},value={owner:economicOwner(user,9),data};assert.equal(scopedEconomicOverlay(value,user,9,true),data);assert.equal(scopedEconomicOverlay(value,user,8,true),null);assert.equal(scopedEconomicOverlay(value,{...user,organization_id:20},9,true),null);assert.equal(scopedEconomicOverlay(value,{...user,role:'viewer'},9,true),null);assert.equal(scopedEconomicOverlay(value,user,9,false),null);
});
