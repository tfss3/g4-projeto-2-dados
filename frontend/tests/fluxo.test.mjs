import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,makeRecord,parseState,csvCell} from '../model.mjs';
const areas=[{district:'IV',name:'VÁRZEA'}], day='2026-11-07';
const ovt={code:'ovt-00123',district:'IV',neighborhood:'VÁRZEA',latitude:'-8.052',longitude:'-34.954',installed_on:'2026-10-01',responsible:'Agente de teste',status:'Ativa'};
const collection={ovt_id:'trap-1',sample_code:'am-00123-c01',cycle:'1',collected_on:'2026-11-01',delivered_on:'2026-11-02',responsible:'Agente de teste'};
const reading={collection_id:'sample-1',read_on:'2026-11-03',responsible:'Laboratório de teste',examination:'Examinada',egg_count:'0'};
const create=(type,data,state,id)=>makeRecord(type,data,state,areas,id,day+'T12:00:00.000Z',day);
function sampleState(){const s=emptyState();s.ovt.push(create('ovt',ovt,s,'trap-1').record);s.collection.push(create('collection',collection,s,'sample-1').record);return s;}
test('cadastro territorial impede códigos duplicados e coordenadas fora da faixa',()=>{
 const s=sampleState(),result=create('ovt',{...ovt,latitude:'-9.1',neighborhood:'OUTRO'},s,'trap-2');
 assert.deepEqual(Object.keys(result.errors).sort(),['code','latitude','neighborhood']);
 assert.equal(s.ovt[0].code,'OVT-00123');
});
test('EDL possui instalação e manutenção, sem contagem de ovos',()=>{
 const s=emptyState();
 const data={...ovt,code:'EDL-0456',maintenance_on:'2026-11-25',egg_count:12};
 const {record}=create('edl',data,s,'edl-1');
 assert.equal(record.maintenance_on,'2026-11-25');
 assert.equal(Object.hasOwn(record,'egg_count'),false);
 assert.ok(create('edl',{...data,maintenance_on:'2026-09-01'},s,'edl-2').errors.maintenance_on);
});
test('coleta de campo registra a amostra sem ovos e admite nova coleta da mesma OVT em outro ciclo',()=>{
 const s=sampleState();
 assert.equal(Object.hasOwn(s.collection[0],'egg_count'),false);
 const result=create('collection',{...collection,cycle:'2',sample_code:'am-00123-c02',egg_count:81},s,'sample-2');
 assert.equal(result.record.ovt_id,'trap-1');
 assert.equal(Object.hasOwn(result.record,'egg_count'),false);
 assert.ok(create('collection',{...collection,sample_code:'am-00123-b'},s,'sample-3').errors.cycle);
});
test('leitura distingue zero de ausência de contagem e exige motivo quando não examinada',()=>{
 const s=sampleState();
 assert.equal(create('reading',reading,s,'reading-1').record.egg_count,0);
 assert.ok(create('reading',{...reading,egg_count:''},s,'reading-1').errors.egg_count);
 assert.ok(create('reading',{...reading,examination:'Não examinada'},s,'reading-1').errors.reason);
 const {record}=create('reading',{...reading,examination:'Não examinada',reason:'Amostra danificada'},s,'reading-1');
 assert.equal(record.egg_count,null);
 assert.equal(record.reason,'Amostra danificada');
});
test('leitura requer coleta existente, data coerente e uma só leitura por amostra',()=>{
 const s=sampleState();
 assert.ok(create('reading',{...reading,collection_id:'ausente'},s,'reading-1').errors.collection_id);
 assert.ok(create('reading',{...reading,read_on:'2026-11-01'},s,'reading-1').errors.read_on);
 s.reading.push(create('reading',{...reading,egg_count:'312'},s,'reading-1').record);
 assert.equal(s.reading[0].egg_count,312);
 assert.ok(create('reading',reading,s,'reading-2').errors.collection_id);
 assert.deepEqual(parseState(JSON.stringify(s)),s);
});
test('CSV preserva coordenadas numéricas e neutraliza fórmulas em campos de texto',()=>{
 assert.equal(csvCell(-8.052),'"-8.052"');
 assert.equal(csvCell('=1+1'),'"\'=1+1"');
 assert.equal(csvCell('A "b"'),'"A ""b"""');
 assert.equal(csvCell(null),'""');
});
