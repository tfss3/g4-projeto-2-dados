export const TYPES = ['ovt', 'edl', 'collection', 'reading'];
export const emptyState = () => ({version:1, ovt:[], edl:[], collection:[], reading:[]});
export const today = () => new Intl.DateTimeFormat('en-CA', {timeZone:'America/Fortaleza', year:'numeric', month:'2-digit', day:'2-digit'}).format(new Date());
export function isDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const d = new Date(value + 'T12:00:00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === value;
}
export function validate(type, data, state, areas, currentDay=today()) {
  const errors = {};
  const require = (key, label) => {if (String(data[key] ?? '').trim() === '') errors[key] = label + ' é obrigatório.';};
  const date = (key, label, required=true) => {
    if (!data[key] && !required) return;
    if (!isDate(data[key])) errors[key] = 'Informe uma data válida para ' + label.toLowerCase() + '.';
    else if (data[key] > currentDay) errors[key] = label + ' não pode estar no futuro.';
  };
  require('responsible','Responsável');
  if (['ovt','edl'].includes(type)) {
    ['code','district','neighborhood','latitude','longitude'].forEach(k=>require(k, {code:'Código',district:'Distrito',neighborhood:'Bairro',latitude:'Latitude',longitude:'Longitude'}[k]));
    const prefix = type.toUpperCase() + '-';
    if (!new RegExp('^' + prefix + '[A-Z0-9-]+$').test(data.code || '')) errors.code = 'Use o prefixo ' + prefix + ' seguido do identificador da armadilha.';
    if (state[type].some(row=>row.code === data.code)) errors.code = 'Este código já foi cadastrado.';
    if (!areas.some(a=>a.district===data.district && a.name===data.neighborhood)) errors.neighborhood = 'Selecione um bairro do distrito informado.';
    for (const [key,min,max] of [['latitude',-8.2,-7.8],['longitude',-35.1,-34.8]]) {
      if (data[key] === '' || !Number.isFinite(Number(data[key])) || Number(data[key])<min || Number(data[key])>max) errors[key] = 'Coordenada fora da área esperada do Recife (' + min + ' a ' + max + ').';
    }
    date('installed_on','Data de instalação');
    if (!['Ativa','Inativa'].includes(data.status)) errors.status = 'Selecione uma situação válida.';
    if (type==='edl' && data.maintenance_on && (!isDate(data.maintenance_on) || data.maintenance_on < data.installed_on)) errors.maintenance_on = 'A manutenção deve ser igual ou posterior à instalação.';
  } else if (type==='collection') {
    const trap=state.ovt.find(row=>row.id===data.ovt_id);
    if (!trap || trap.status !== 'Ativa') errors.ovt_id='Selecione uma OVT ativa.';
    require('sample_code','Código da amostra');
    if (state.collection.some(row=>row.sample_code===data.sample_code)) errors.sample_code='Este código de amostra já foi utilizado.';
    if (!/^\d+$/.test(String(data.cycle)) || !Number.isSafeInteger(Number(data.cycle)) || Number(data.cycle)<1) errors.cycle='Informe um ciclo inteiro maior que zero.';
    date('collected_on','Data da coleta');
    date('delivered_on','Entrega ao laboratório',false);
    if (trap && data.collected_on<trap.installed_on) errors.collected_on='A coleta não pode ocorrer antes da instalação da OVT.';
    if (data.delivered_on && data.delivered_on<data.collected_on) errors.delivered_on='A entrega não pode ocorrer antes da coleta.';
    if (state.collection.some(row=>row.ovt_id===data.ovt_id && Number(row.cycle)===Number(data.cycle) && row.collected_on.slice(0,4)===String(data.collected_on ?? '').slice(0,4))) errors.cycle='Já existe uma coleta desta OVT neste ciclo e ano.';
  } else if (type==='reading') {
    const collection=state.collection.find(row=>row.id===data.collection_id);
    if (!collection) errors.collection_id='Selecione uma coleta cadastrada.';
    else if (state.reading.some(row=>row.collection_id===data.collection_id)) errors.collection_id='Esta coleta já possui uma leitura.';
    date('read_on','Data da leitura');
    if (collection && data.read_on<(collection.delivered_on || collection.collected_on)) errors.read_on='A leitura não pode ocorrer antes da coleta ou da entrega ao laboratório.';
    if (!['Examinada','Não examinada'].includes(data.examination)) errors.examination='Selecione a condição da leitura.';
    if (data.examination==='Examinada' && (!/^\d+$/.test(String(data.egg_count)) || !Number.isSafeInteger(Number(data.egg_count)))) errors.egg_count='Informe uma quantidade inteira de ovos igual ou maior que zero.';
    if (data.examination==='Não examinada') require('reason','Motivo da não realização');
  } else errors.type='Tipo de registro inválido.';
  return errors;
}
export function makeRecord(type, data, state, areas, id, createdAt, currentDay=today()) {
  const clean = Object.fromEntries(Object.entries(data).map(([k,v])=>[k,typeof v==='string'?v.trim():v]));
  if (clean.code) clean.code=clean.code.toUpperCase();
  if (clean.sample_code) clean.sample_code=clean.sample_code.toUpperCase();
  const errors=validate(type,clean,state,areas,currentDay);
  if (Object.keys(errors).length) return {errors};
  const common={id,createdAt,responsible:clean.responsible,notes:clean.notes || ''};
  let record;
  if (['ovt','edl'].includes(type)) {
    record={...common,code:clean.code,district:clean.district,neighborhood:clean.neighborhood,address:clean.address || '',latitude:Number(clean.latitude),longitude:Number(clean.longitude),installed_on:clean.installed_on,status:clean.status};
    if (type==='edl') record.maintenance_on=clean.maintenance_on || '';
  } else if (type==='collection') {
    record={...common,ovt_id:clean.ovt_id,sample_code:clean.sample_code,cycle:Number(clean.cycle),collected_on:clean.collected_on,delivered_on:clean.delivered_on || ''};
  } else {
    record={...common,collection_id:clean.collection_id,read_on:clean.read_on,examination:clean.examination,egg_count:clean.examination==='Examinada'?Number(clean.egg_count):null,reason:clean.examination==='Não examinada'?clean.reason:''};
  }
  return {record};
}
export function parseState(raw) {
  const s=JSON.parse(raw);
  if (s?.version!==1 || TYPES.some(type=>!Array.isArray(s[type]))) throw new Error('Formato de armazenamento inválido.');
  const ids=new Set();
  for (const type of TYPES) for (const row of s[type]) {
    if (!row || typeof row.id!=='string' || ids.has(row.id) || typeof row.createdAt!=='string' || typeof row.responsible!=='string') throw new Error('Registro local inválido.');
    ids.add(row.id);
    if (['ovt','edl'].includes(type) && (typeof row.code!=='string' || !isDate(row.installed_on) || typeof row.neighborhood!=='string' || typeof row.district!=='string')) throw new Error('Cadastro local inválido.');
    if (type==='collection' && (typeof row.sample_code!=='string' || !isDate(row.collected_on) || !Number.isSafeInteger(row.cycle) || row.cycle<1 || !s.ovt.some(t=>t.id===row.ovt_id))) throw new Error('Coleta local inválida.');
    if (type==='reading' && (!s.collection.some(c=>c.id===row.collection_id) || !isDate(row.read_on) || !['Examinada','Não examinada'].includes(row.examination) || (row.examination==='Examinada' && (!Number.isSafeInteger(row.egg_count) || row.egg_count<0)) || (row.examination==='Não examinada' && row.egg_count!==null))) throw new Error('Leitura local inválida.');
  }
  return s;
}
export function csvCell(value) {
  let text=String(value ?? '');
  if (typeof value==='string' && /^[\s]*[=+\-@\t\r]/.test(text)) text="'"+text;
  return '"' + text.replaceAll('"','""') + '"';
}

export const COLLECTION_INTERVAL_DAYS = 15;

const DAY_MS = 24 * 60 * 60 * 1000;
const utcDay = date => Date.parse(date + 'T00:00:00Z');

export function nextCollectionDate(reference, from = reference) {
  const daysSinceReference = (utcDay(from) - utcDay(reference)) / DAY_MS;
  const interval = Math.max(1, Math.ceil(daysSinceReference / COLLECTION_INTERVAL_DAYS));
  const next = utcDay(reference) + interval * COLLECTION_INTERVAL_DAYS * DAY_MS;
  return new Date(next).toISOString().slice(0, 10);
}

export function isPlannedCollectionDate(reference, day) {
  const daysSinceReference = (utcDay(day) - utcDay(reference)) / DAY_MS;
  return daysSinceReference > 0 && daysSinceReference % COLLECTION_INTERVAL_DAYS === 0;
}
