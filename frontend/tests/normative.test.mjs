import test from 'node:test';
import assert from 'node:assert/strict';
import {normativeFact} from '../src/lib/normativeFacts.mjs';
const document={record_id:10,revision:2,review:{decision:'accepted_for_facts'}};
test('normative UI requires an explicit evidenced value and preserves false rather than inventing an answer',()=>{
 assert.throws(()=>normativeFact({type:'boolean'},'',document,'p1'));
 assert.throws(()=>normativeFact({type:'boolean'},'true',{...document,review:null},'p1'));
 assert.throws(()=>normativeFact({type:'boolean'},'true',document,''));
 assert.deepEqual(normativeFact({type:'boolean'},'false',document,' p1 '),{value:false,document_id:10,document_revision:2,locator:'p1'});
});
test('normative UI preserves exact money, coefficient units and scoped document revisions',()=>{
 assert.equal(normativeFact({type:'money'},'900719925474099300001',document,'p2').value,'900719925474099300001');
 assert.equal(normativeFact({type:'integer',max:1000000},'700000',document,'p2').value,700000);
 assert.throws(()=>normativeFact({type:'integer',max:1000000},'1000001',document,'p2'));
 assert.throws(()=>normativeFact({type:'money'},'1.01',document,'p2'));
 assert.throws(()=>normativeFact({type:'choice',values:['ordinary']},'execute this text',document,'p2'));
});
