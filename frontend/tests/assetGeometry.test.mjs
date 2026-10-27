import test from 'node:test';
import assert from 'node:assert/strict';
import {assetMapTarget,assetsToGeoJSON} from '../src/lib/assetGeometry.mjs';
import {coordinatesOf,mergeOperationalContext} from '../src/lib/territory.js';
import {toCandidate,existingLocationCandidate} from '../src/lib/comparisonCandidates.mjs';

test('map retains composite identity and real line/polygon geometry; camera centers are not point observations',()=>{
 const point={asset_id:'platform:1',location_id:1,longitude:0,latitude:0};
 const line={asset_id:'soi:1',location_id:null,geometry:{type:'LineString',coordinates:[[1,2],[3,4]]}};
 const polygon={asset_id:'soi:2',geometry:{type:'Polygon',coordinates:[[[0,0],[2,0],[2,2],[0,0]]]}};
 const collection=assetsToGeoJSON([point,line,polygon,{asset_id:'missing'},{asset_id:'invalid',geometry:{type:'Point',coordinates:[200,0]}}]);
 assert.deepEqual(collection.features.map(f=>f.id),['platform:1','soi:1','soi:2']);
 assert.deepEqual(collection.features[1].geometry,line.geometry);assert.equal(collection.features[1].properties.location_id,null);
 assert.deepEqual(assetMapTarget(line).center,[2,3]);assert.equal(coordinatesOf(line),null);
 assert.deepEqual(collection.features[0].geometry.coordinates,[0,0]);
});

test('candidate selection keeps sanitary and general identities separate and never converts missing coordinates to zero',()=>{
 assert.equal(existingLocationCandidate({asset_id:'soi:1',location_id:null,latitude:0,longitude:0}).id,'soi:1');
 assert.equal(existingLocationCandidate({asset_id:'platform:1',location_id:1,latitude:0,longitude:0}).id,'platform:1');
 assert.equal(toCandidate({latitude:null,longitude:null},'missing').lat,null);
 assert.equal(toCandidate({geometry:{type:'LineString',coordinates:[[0,0],[1,1]]}},'line').lng,null);
});

test('context distinguishes assets at the same point and clears asset identity when selecting a new territory',()=>{
 const old={organization_id:7,asset_id:'platform:1',location_id:1,territory:{asset_id:'platform:1',location_id:1,coordinates:[0,0]}};
 const sanitary=mergeOperationalContext(old,{territory:{asset_id:'soi:1',location_id:null,coordinates:[0,0]}},7);
 assert.equal(sanitary.asset_id,'soi:1');assert.equal(sanitary.location_id,null);
 const point=mergeOperationalContext(sanitary,{...sanitary,territory:{id:'chosen',coordinates:[1,1]}},7);
 assert.equal(point.asset_id,null);assert.equal(point.location_id,null);
});
