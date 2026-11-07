import {TYPES, emptyState, today, isDate, makeRecord, parseState, csvCell, nextCollectionDate, isPlannedCollectionDate} from './model.mjs';
const $ = (s,root=document)=>root.querySelector(s);
const $$ = (s,root=document)=>[...root.querySelectorAll(s)];
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const iconPaths={
 pin:'<path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
 ovitrap:'<path d="M4 9h16M6 9l1.4 10.4A2 2 0 0 0 9.4 21h5.2a2 2 0 0 0 2-1.6L18 9M11 9V4a1 1 0 0 1 2 0v5M9 15c1.1-1 2-1 3 0s2 1 3 0"/>',
 station:'<path d="M9 4h6M10 4v4l-4 4v7a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-7l-4-4V4M6 13h12M9 16h6M9 18.5h6M4 7h.01M20 7h.01M6 3h.01M18 3h.01"/>',
 field:'<rect x="5" y="5" width="14" height="16" rx="2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="m8 13 2 2 5-5M8 18h6"/>',
 microscope:'<path d="m10 3 5 2-2 5-5-2 2-5Zm0 6-1 2m7-3a6 6 0 0 1 2 8c-1.2 2-3.3 3-6 3H5m1 2h14M6 15h7m-6 0v4M11 2l3 1"/>',
 layers:'<path d="m12 3 10 6-10 6L2 9l10-6ZM3 14l9 5 9-5M5 19l7 4 7-4"/>',
 download:'<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',
 clipboard:'<rect x="5" y="5" width="14" height="16" rx="2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/>',
 edit:'<path d="m16 3 5 5-12 12-6 1 1-6L16 3Zm-2 2 5 5"/>',
 info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
 device:'<rect x="3" y="3" width="18" height="13" rx="2"/><path d="M12 16v5M8 21h8"/>',
 search:'<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>',
 save:'<path d="M4 3h13l4 4v14H3V3h1ZM7 3v6h9V3M7 21v-8h10v8"/>',
 arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',
 calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18m-11 5 2 2 4-4"/>',
 chevronLeft:'<path d="m15 6-6 6 6 6"/>',
 chevronRight:'<path d="m9 6 6 6-6 6"/>'
};
const icon = name => '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">'+(iconPaths[name]||iconPaths.info)+'</svg>';
function hydrate(root=document){$$('[data-icon]',root).forEach(el=>el.innerHTML=icon(el.dataset.icon));}
const titleCase=s=>s.toLocaleLowerCase('pt-BR').replace(/(^|[ -])\p{L}/gu,l=>l.toLocaleUpperCase('pt-BR'));
const dateLabel = value => value ? value.slice(0,10).split('-').reverse().join('/') : '—';
const names={ovt:'OVT',edl:'EDL',collection:'Coleta',reading:'Leitura'};
const config={
 ovt:{title:'Cadastrar ovitrampa',subtitle:'Identifique a OVT e o seu ponto de instalação.',icon:'ovitrap',button:'Cadastrar OVT'},
 edl:{title:'Cadastrar estação disseminadora',subtitle:'Registre a EDL e o início da sua operação em campo.',icon:'station',button:'Cadastrar EDL'},
 collection:{title:'Registrar coleta de campo',subtitle:'Identifique a amostra retirada e a OVT de origem.',icon:'field',button:'Registrar coleta'},
 reading:{title:'Registrar contagem de ovos',subtitle:'Selecione uma coleta e registre a leitura do laboratório.',icon:'microscope',button:'Salvar leitura'}
};
let state=emptyState(), active='ovt', areas=[], storageOk=true, toastTimer;
const KEY='argos.operacional.v1';
try {const raw=localStorage.getItem(KEY);if(raw) state=parseState(raw);} catch {storageOk=false;$('#storage-error').hidden=false;$('#storage-error').textContent='Não foi possível acessar os registros locais. O salvamento está indisponível para preservar os dados existentes. Verifique as permissões de armazenamento do navegador.';}
function field(name,label,control,hint='',full=false){return '<label class="field'+(full?' full':'')+'"><span>'+label+'</span>'+control+(hint?'<small class="hint">'+hint+'</small>':'')+'</label>';}
function input(name,placeholder='',extra=''){return '<input name="'+name+'" placeholder="'+placeholder+'" '+extra+'>';}
function dateInput(name,required=true,future=false){return input(name,'','type="date" '+(required?'required ':'')+(future?'':'max="'+today()+'"'));}
function select(name,content,extra=''){return '<select name="'+name+'" '+extra+'>'+content+'</select>';}
const option=(value,label=value)=>'<option value="'+esc(value)+'">'+esc(label)+'</option>';
const required=' <b>*</b>';
const section=(name,ico)=>'<h3 class="section-title">'+icon(ico)+' '+name+'</h3>';
function territoryFields(){
 return field('district','Distrito sanitário'+required,select('district',option('','Selecione o distrito')+[...new Set(areas.map(a=>a.district))].map(d=>option(d,'DS '+d)).join(''),'required'))+
 field('neighborhood','Bairro'+required,select('neighborhood',option('','Selecione o distrito'),'required disabled'))+
 field('address','Endereço ou ponto de referência',input('address','Ex.: próximo à unidade de saúde','maxlength="200"'),'',true)+
 field('latitude','Latitude'+required,input('latitude','Ex.: -8,0476','type="text" inputmode="decimal" required maxlength="18"'),'Coordenada decimal no território do Recife.')+
 field('longitude','Longitude'+required,input('longitude','Ex.: -34,8770','type="text" inputmode="decimal" required maxlength="18"'));
}
function trapForm(type){
 return section('Identificação e instalação',config[type].icon)+'<div class="form-grid">'+
 field('code','Código da '+type.toUpperCase()+required,input('code',type==='ovt'?'Ex.: OVT-00123':'Ex.: EDL-00456','required maxlength="40" autocomplete="off" spellcheck="false"'),'Identificador único da armadilha.')+
 field('installed_on','Data de instalação'+required,dateInput('installed_on'))+
 field('responsible','Responsável pela instalação'+required,input('responsible','Nome do responsável','required maxlength="100" autocomplete="name"'))+
 field('status','Situação'+required,select('status',option('Ativa',type==='edl'?'Em operação':'Ativa')+option('Inativa'),'required'))+'</div>'+
 section('Localização no território','pin')+'<div class="form-grid">'+territoryFields()+'</div>'+
 section(type==='edl'?'Acompanhamento da estação':'Informações adicionais','clipboard')+'<div class="form-grid">'+
 (type==='edl'?field('maintenance_on','Próxima manutenção',dateInput('maintenance_on',false,true),'Opcional. Informe a data planejada pela equipe.' ,true):'')+
 field('notes','Observações','<textarea name="notes" maxlength="500" placeholder="Condições do ponto, acesso ou informações para a equipe…"></textarea>','Até 500 caracteres.',true)+'</div>';
}
function collectionForm(){
 return '<div class="inline-info">'+icon('info')+'<p>Este é o registro da coleta. A contagem de ovos é feita posteriormente pelo laboratório.</p></div>'+
 '<div id="collection-prerequisite" class="inline-info" hidden>'+icon('pin')+'<p>Cadastre uma OVT ativa para registrar a primeira coleta. <button type="button" data-view="ovt">Cadastrar OVT</button></p></div>'+
 section('Origem da amostra','pin')+'<div class="form-grid">'+
 field('ovt_id','OVT de origem'+required,select('ovt_id',option('','Selecione a OVT'),'required'),'',true)+
 field('sample_code','Código da amostra / palheta'+required,input('sample_code','Ex.: AM-00123-C01','required maxlength="60" autocomplete="off" spellcheck="false"'),'Identificador único para rastrear a amostra.')+
 field('cycle','Ciclo de coleta'+required,input('cycle','Ex.: 1','type="number" min="1" step="1" inputmode="numeric" required'),'O ciclo é informado conforme o planejamento da equipe.')+'</div>'+
 section('Dados da coleta','calendar')+'<div class="form-grid">'+
 field('collected_on','Data da coleta'+required,dateInput('collected_on'))+
 field('delivered_on','Entrega ao laboratório',dateInput('delivered_on',false),'Preencha somente quando a entrega já ocorreu.')+
 '<p class="collection-date-hint" id="collection-date-hint" aria-live="polite" hidden>Primeira coleta prevista em <strong id="collection-next-hint"></strong>. <button type="button" data-view="calendar">Ver calendário</button></p>'+
 field('responsible','Agente responsável'+required,input('responsible','Nome do agente','required maxlength="100" autocomplete="name"'),'',true)+
 field('notes','Observações de campo','<textarea name="notes" maxlength="500" placeholder="Condição da armadilha ou da amostra, dificuldade de acesso…"></textarea>','Até 500 caracteres.',true)+'</div>';
}
function readingForm(){
 return '<div id="reading-prerequisite" class="inline-info" hidden>'+icon('field')+'<p>Não há coletas aguardando leitura. <button type="button" data-view="collection">Registrar coleta de campo</button></p></div>'+
 section('Identificação da coleta','field')+'<div class="form-grid">'+
 field('collection_id','Amostra / OVT'+required,select('collection_id',option('','Selecione uma coleta pendente'),'required'),'',true)+
 field('read_on','Data da leitura'+required,dateInput('read_on'))+
 field('responsible','Responsável pela leitura'+required,input('responsible','Nome do profissional','required maxlength="100" autocomplete="name"'))+'</div>'+
 section('Resultado laboratorial','microscope')+'<div class="form-grid">'+
 field('examination','Condição da leitura'+required,select('examination',option('Examinada')+option('Não examinada'),'required'))+
 field('egg_count','Quantidade de ovos'+required,'<div class="input-prefix">'+input('egg_count','Informe a contagem','type="number" min="0" step="1" max="9007199254740991" inputmode="numeric" required')+'<span>ovos</span></div>','Aceita zero. Apenas números inteiros.')+
 '<div class="field full" id="reason-field" hidden>'+field('reason','Motivo da não realização'+required,select('reason',option('','Selecione o motivo')+['Amostra danificada','Amostra não recebida','Outro'].map(x=>option(x)).join(''),'disabled'))+'</div>'+
 field('notes','Observações do laboratório','<textarea name="notes" maxlength="500" placeholder="Condição da amostra ou informação complementar da leitura…"></textarea>','Até 500 caracteres.',true)+'</div>'+
 '<div class="inline-info warning" id="high-count" hidden>'+icon('info')+'<p>Contagem acima de 300 ovos. Confira o valor antes de salvar. Uma contagem alta pode ser válida.</p></div>';
}
function renderForms(){
 $('#form-panels').innerHTML=TYPES.map(type=>'<section id="panel-'+type+'" class="panel form-panel" aria-labelledby="form-title-'+type+'" '+(type==='ovt'?'':'hidden')+'><header class="form-heading"><span class="heading-icon">'+icon(config[type].icon)+'</span><div><h2 id="form-title-'+type+'" tabindex="-1">'+config[type].title+'</h2><p>'+config[type].subtitle+'</p></div>'+(type==='collection' ? '<button class="button secondary calendar-shortcut" type="button" data-view="calendar">'+icon('calendar')+'Ver calendário</button>' : '<span class="required-note"><b>*</b> Campos obrigatórios</span>')+'</header><form id="form-'+type+'" data-type="'+type+'" novalidate><div class="form-body"><div class="form-error" role="alert" tabindex="-1" hidden></div>'+(type==='ovt'||type==='edl'?trapForm(type):type==='collection'?collectionForm():readingForm())+'</div><div class="form-footer"><span>'+icon('device')+'Salvo neste navegador</span><div><button class="button secondary" type="reset">Limpar</button><button class="button primary" type="submit">'+icon('save')+config[type].button+'</button></div></div></form></section>').join('');
 for(const type of TYPES){
  const form=$('#form-'+type);
  form.addEventListener('input',()=>{clearErrors(form);updateSummary();updateConditional();});
  form.addEventListener('change',e=>{
    if(e.target.name==='district') setNeighborhood(form);
    clearErrors(form);updateConditional();updateSummary();
  });
  form.addEventListener('reset',()=>setTimeout(()=>{clearErrors(form);if(['ovt','edl'].includes(type))setNeighborhood(form);updateConditional();updateSummary();},0));
  form.addEventListener('invalid', event => event.target.setAttribute('aria-invalid', 'true'), true);
  form.addEventListener('submit',e=>submit(e,type));
 }
}
function setNeighborhood(form){
 const control=form.elements.neighborhood, district=form.elements.district.value;
 control.innerHTML=option('',district?'Selecione o bairro':'Selecione o distrito')+areas.filter(a=>a.district===district).map(a=>option(a.name,titleCase(a.name))).join('');
 control.disabled=!district;
}
function updateOptions(){
 const ovtSelect=$('#form-collection').elements.ovt_id, previousOvt=ovtSelect.value;
 const activeTraps=state.ovt.filter(r=>r.status==='Ativa');
 ovtSelect.innerHTML=option('','Selecione a OVT')+activeTraps.map(r=>option(r.id,r.code+' · '+titleCase(r.neighborhood))).join('');
 if(activeTraps.some(r=>r.id===previousOvt))ovtSelect.value=previousOvt;
 ovtSelect.disabled=!activeTraps.length;$('#collection-prerequisite').hidden=!!activeTraps.length;
 const pending=state.collection.filter(c=>!state.reading.some(r=>r.collection_id===c.id));
 const readSelect=$('#form-reading').elements.collection_id, previousCollection=readSelect.value;
 readSelect.innerHTML=option('','Selecione uma coleta pendente')+pending.map(c=>option(c.id,c.sample_code+' · '+state.ovt.find(t=>t.id===c.ovt_id)?.code+' · ciclo '+c.cycle)).join('');
 if(pending.some(c=>c.id===previousCollection))readSelect.value=previousCollection;
 readSelect.disabled=!pending.length;$('#reading-prerequisite').hidden=!!pending.length;
}
function updateConditional(){
 const form=$('#form-reading'), examined=form.elements.examination.value==='Examinada';
 form.elements.egg_count.disabled=!examined;form.elements.egg_count.required=examined;
 form.elements.reason.disabled=examined;form.elements.reason.required=!examined;
 $('#reason-field').hidden=examined;
 $('#high-count').hidden=!(examined && Number(form.elements.egg_count.value)>300);
}
function clearErrors(form){$$('input,select,textarea',form).forEach(c=>{c.setCustomValidity('');c.removeAttribute('aria-invalid');});$('.form-error',form).hidden=true;}
function announce(message){clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').hidden=false;toastTimer=setTimeout(()=>$('#toast').hidden=true,5500);}
function switchView(view) {
  const calendarView = view === "calendar";
  if (!calendarView && !TYPES.includes(view)) return;
  active = view;
  for (const button of $$(".nav-item")) {
    const current = button.dataset.view === view;
    button.classList.toggle("active", current);
    if (current) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }
  $(".entry-layout").hidden = calendarView;
  $("#collection-calendar").hidden = !calendarView;
  for (const type of TYPES) $("#panel-" + type).hidden = type !== view;
  if (!calendarView) {
    updateConditional();
    updateSummary();
  }
  renderCollectionCalendar();
}
function trapFor(type,record){
 if(['ovt','edl'].includes(type))return record;
 const collection=type==='collection'?record:state.collection.find(c=>c.id===record.collection_id);
 return state.ovt.find(t=>t.id===collection?.ovt_id);
}
function updateSummary(){
 const f = $('#form-' + active);
 if (!f) return;
 const data = Object.fromEntries(new FormData(f));
 let code=data.code?.toUpperCase()||'Nova '+names[active], subtitle='Preencha os dados para começar', rows=[];
 if(['ovt','edl'].includes(active)){
  rows=[['Distrito',data.district?'DS '+data.district:'—'],['Bairro',data.neighborhood?titleCase(data.neighborhood):'—'],['Instalação',dateLabel(data.installed_on)],['Responsável',data.responsible||'—']];
 }else{
  const collection=active==='reading'?state.collection.find(c=>c.id===data.collection_id):null;
  const trap=state.ovt.find(t=>t.id===(collection?.ovt_id||data.ovt_id));
  code=collection?.sample_code||data.sample_code?.toUpperCase()||(active==='reading'?'Nova leitura':'Nova coleta');
  subtitle=trap?.code||'Selecione a OVT de origem';
  rows=[['OVT',trap?.code||'—'],['Bairro',trap?titleCase(trap.neighborhood):'—'],['Ciclo',collection?.cycle||data.cycle||'—'],[active==='reading'?'Leitura':'Coleta',dateLabel(active==='reading'?data.read_on:data.collected_on)]];
  if(active==='reading') rows.push(['Ovos',data.examination==='Não examinada'?'Não examinada':data.egg_count!==undefined && data.egg_count!==''?Number(data.egg_count).toLocaleString('pt-BR'):'—']);
 }
 $('#summary-type').textContent={ovt:'Ovitrampa',edl:'Estação disseminadora',collection:'Coleta de campo',reading:'Leitura laboratorial'}[active];
 $('#summary-code').textContent=code;$('#summary-subtitle').textContent=subtitle;
 $('#summary-fields').innerHTML=rows.map(([k,v])=>'<div><dt>'+esc(k)+'</dt><dd>'+esc(v)+'</dd></div>').join('');
}
function submit(event,type){
 event.preventDefault();const form=event.currentTarget;clearErrors(form);
 if(!storageOk){$('.form-error',form).textContent='O armazenamento local está indisponível. Nenhum registro foi salvo.';$('.form-error',form).hidden=false;$('.form-error',form).focus();return;}
 if(!form.reportValidity())return;
 const data=Object.fromEntries(new FormData(form));
 try {const raw=localStorage.getItem(KEY);if(raw)state=parseState(raw);}
 catch {const box=$('.form-error',form);box.textContent='Não foi possível consultar os registros salvos antes de gravar.';box.hidden=false;box.focus();return;}
 for(const key of ['latitude','longitude']) if(data[key]!==undefined)data[key]=data[key].replace(',','.');
 const result=makeRecord(type,data,state,areas,crypto.randomUUID(),new Date().toISOString());
 if(result.errors){
  for(const [name,message] of Object.entries(result.errors)) if(form.elements[name]){form.elements[name].setCustomValidity(message);form.elements[name].setAttribute('aria-invalid','true');}
  const box=$('.form-error',form);box.textContent=Object.values(result.errors)[0];box.hidden=false;form.reportValidity();return;
 }
 const next={...state,[type]:[...state[type],result.record]};
 try{localStorage.setItem(KEY,JSON.stringify(next));}
 catch {const box=$('.form-error',form);box.textContent='Não foi possível salvar neste navegador. Verifique o espaço e as permissões de armazenamento. Seus campos foram mantidos.';box.hidden=false;box.focus();return;}
 state=next;
 if (type === 'collection') calendarTrapId = result.record.ovt_id;
 form.reset();updateOptions();renderRecords();
 announce({ovt:'OVT cadastrada. Você já pode registrar uma coleta.',edl:'EDL cadastrada com sucesso.',collection:'Coleta registrada. A amostra está aguardando leitura no laboratório.',reading:'Leitura laboratorial salva com sucesso.'}[type]);
}
function recordInfo(type,row){
 const trap=trapFor(type,row);
 const collection=type==='reading'?state.collection.find(c=>c.id===row.collection_id):type==='collection'?row:null;
 let status=type==='edl'?(row.status==='Ativa'?'Em operação':'Inativa'):row.status;
 if(type==='collection')status=state.reading.some(r=>r.collection_id===row.id)?'Leitura registrada':'Aguardando leitura';
 if(type==='reading')status=row.examination==='Não examinada'?'Não examinada':row.egg_count===0?'Sem ovos':row.egg_count.toLocaleString('pt-BR')+' ovos';
 return {trap,collection,code:type==='reading'||type==='collection'?collection.sample_code:row.code,date:row.installed_on||row.collected_on||row.read_on,status,secondary:type==='reading'||type==='collection'?trap.code+' · ciclo '+collection.cycle:row.responsible};
}
function allRows(){return TYPES.flatMap(type=>state[type].map(row=>({type,row}))).sort((a,b)=>b.row.createdAt.localeCompare(a.row.createdAt));}
function renderRecords(){
 const query=$('#search').value.trim().toLocaleLowerCase('pt-BR'), filter=$('#record-filter').value;
 const all=allRows(),rows=all.filter(({type,row})=>{const info=recordInfo(type,row);return (filter==='all'||type===filter) && [info.code,info.trap?.code,info.trap?.neighborhood,row.responsible].some(v=>v?.toLocaleLowerCase('pt-BR').includes(query));});
 $('#records-count').textContent=all.length;
 $('#records-body').innerHTML=rows.map(({type,row})=>{const i=recordInfo(type,row),pending=i.status==='Aguardando leitura',muted=['Inativa','Não examinada'].includes(i.status);return '<tr><td><strong>'+esc(i.code)+'</strong><small>'+esc(i.secondary)+'</small></td><td>'+names[type]+'</td><td>'+esc(titleCase(i.trap.neighborhood))+'<small>DS '+esc(i.trap.district)+'</small></td><td>'+dateLabel(i.date)+'</td><td><span class="badge '+(pending?'pending':muted?'muted':'')+'">'+esc(i.status)+'</span></td><td><button class="row-link" data-detail="'+esc(row.id)+'" data-kind="'+type+'" aria-label="Ver detalhes de '+esc(i.code)+'">'+icon('arrow')+'</button></td></tr>';}).join('');
 $('#empty').hidden=rows.length>0;
 $('#empty h4').textContent=all.length?'Nenhum registro encontrado':'Nenhum registro por aqui ainda';
 $('#empty p').textContent=all.length?'Tente outro código, bairro ou tipo de registro.':'Comece cadastrando uma OVT ou uma EDL. Seus registros aparecerão nesta lista.';
 $('#records-footer').textContent=all.length?rows.length+' de '+all.length+' registros':'Nenhum registro salvo';
}
function showDetails(type,id){
 const row=state[type].find(r=>r.id===id);if(!row)return;
 const info=recordInfo(type,row);
 const details=[['Código',info.code],['Distrito','DS '+info.trap.district],['Bairro',titleCase(info.trap.neighborhood)],['Responsável',row.responsible],['Situação',info.status]];
 if(['ovt','edl'].includes(type))details.push(['Instalação',dateLabel(row.installed_on)],['Latitude',row.latitude],['Longitude',row.longitude],['Endereço / referência',row.address||'—']);
 if(type==='edl')details.push(['Próxima manutenção',dateLabel(row.maintenance_on)]);
 if(info.collection)details.push(['OVT de origem',info.trap.code],['Ciclo',info.collection.cycle],['Data da coleta',dateLabel(info.collection.collected_on)],['Entrega ao laboratório',dateLabel(info.collection.delivered_on)]);
 if(type==='reading')details.push(['Data da leitura',dateLabel(row.read_on)],['Condição',row.examination],['Quantidade de ovos',row.egg_count===null?'Não examinada':row.egg_count],['Motivo',row.reason||'—']);
 details.push(['Observações',row.notes||'—']);
 $('#detail-title').textContent=info.code;$('#detail-type').textContent=names[type];
 $('#detail-fields').innerHTML=details.map(([k,v])=>'<div><dt>'+esc(k)+'</dt><dd>'+esc(v)+'</dd></div>').join('');
 $('#details-dialog').showModal();
}
function exportRecords(){
 const all=allRows();if(!all.length){announce('Cadastre um registro antes de exportar.');return;}
 const header=['id','tipo','codigo','ovt','distrito','bairro','responsavel','data_instalacao','latitude','longitude','endereco','proxima_manutencao','ciclo','data_coleta','entrega_laboratorio','data_leitura','condicao_leitura','quantidade_ovos','motivo','situacao','observacoes','criado_em'];
 const lines=all.map(({type,row})=>{const i=recordInfo(type,row);return [row.id,names[type],i.code,type==='edl'?'':i.trap.code,i.trap.district,i.trap.neighborhood,row.responsible,row.installed_on, i.trap.latitude,i.trap.longitude,i.trap.address,row.maintenance_on,i.collection?.cycle,i.collection?.collected_on,i.collection?.delivered_on,row.read_on,row.examination,row.egg_count,row.reason,i.status,row.notes,row.createdAt].map(csvCell).join(';');});
 const url=URL.createObjectURL(new Blob(['\uFEFF'+[header.map(csvCell).join(';'),...lines].join('\r\n')],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download='argos-registros-'+today()+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);announce('Exportação dos registros locais gerada.');
}

const monthLabel = new Intl.DateTimeFormat('pt-BR', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
let calendarTrapId = '';
let calendarMonth = '';
let calendarReferenceKey = '';

function renderCollectionCalendar() {
  if (active !== 'collection' && active !== 'calendar') return;

  const form = $('#form-collection');
  const enteredDate = form.elements.collected_on.value;
  const currentDate = today();
  const previewing = isDate(enteredDate) && enteredDate <= currentDate;
  const savedCollections = [...state.collection].sort((a, b) =>
    b.collected_on.localeCompare(a.collected_on)
  );
  calendarTrapId ||= savedCollections[0]?.ovt_id ?? '';
  const saved = savedCollections.find(row => row.ovt_id === calendarTrapId);
  const reference = previewing ? enteredDate : saved?.collected_on;
  const ovtSelect = $('#calendar-ovt');

  $('#calendar-ovt-field').hidden = state.ovt.length === 0;
  ovtSelect.disabled = previewing;
  ovtSelect.innerHTML = option('', 'Selecione a OVT') +
    state.ovt.map(ovt => option(ovt.id, ovt.code)).join('');
  ovtSelect.value = calendarTrapId;
  $('#calendar-next').hidden = !reference;
  $('#calendar-month').hidden = !reference;
  $('#collection-date-hint').hidden = !previewing;

  if (!reference) {
    $('#calendar-description').textContent = 'Informe uma data em Coleta de campo para gerar as previsões.';
    calendarReferenceKey = '';
    return;
  }

  const next = nextCollectionDate(reference, previewing ? reference : currentDate);
  $('#calendar-description').textContent = (previewing ? 'Prévia a partir de ' : 'Última coleta registrada em ') +
    dateLabel(reference) + '.';
  $('#calendar-next-label').textContent = previewing ? 'Primeira coleta prevista' : 'Próxima coleta prevista';
  $('#calendar-next-date').textContent = dateLabel(next);
  $('#collection-next-hint').textContent = dateLabel(nextCollectionDate(reference));

  const referenceKey = [calendarTrapId, reference, previewing].join('/');
  if (referenceKey !== calendarReferenceKey) {
    calendarMonth = next.slice(0, 7);
    calendarReferenceKey = referenceKey;
  }
  renderCalendarMonth(reference, currentDate);
}

function renderCalendarMonth(reference, currentDate) {
  const start = new Date(calendarMonth + '-01T00:00:00Z');
  const firstWeekday = start.getUTCDay();
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1, 0);
  const lastDay = end.getUTCDate();
  const weeks = [];

  for (let offset = 0; offset < firstWeekday + lastDay; offset += 7) {
    const cells = [];
    for (let weekday = 0; weekday < 7; weekday++) {
      const day = offset + weekday - firstWeekday + 1;
      if (day < 1 || day > lastDay) {
        cells.push('<td></td>');
        continue;
      }
      const date = calendarMonth + '-' + String(day).padStart(2, '0');
      const isReference = date === reference;
      const planned = isPlannedCollectionDate(reference, date);
      const statusClass = isReference ? ' calendar-reference' : planned ? ' calendar-planned' : '';
      const statusLabel = isReference ? ', data de referência' : planned ? ', coleta prevista' : '';
      const current = date === currentDate ? ' aria-current="date"' : '';
      cells.push('<td><span class="calendar-day' + statusClass + '"' + current +
        '><span aria-hidden="true">' + day + '</span><span class="sr-only">' +
        dateLabel(date) + statusLabel + '</span></span></td>');
    }
    weeks.push('<tr>' + cells.join('') + '</tr>');
  }

  $('#calendar-month-title').textContent = monthLabel.format(start);
  $('#calendar-days').innerHTML = weeks.join('');
  $('#calendar-prev').disabled = calendarMonth <= reference.slice(0, 7);
  $('#calendar-forward').disabled = calendarMonth === '9999-12';
}

function moveCalendarMonth(offset) {
  const date = new Date(calendarMonth + '-01T00:00:00Z');
  date.setUTCMonth(date.getUTCMonth() + offset);
  calendarMonth = date.toISOString().slice(0, 7);
  renderCollectionCalendar();
}

function initCollectionCalendar() {
  const form = $('#form-collection');
  function updateFromForm(event) {
    if (event.target.name === 'ovt_id') calendarTrapId = event.target.value;
    if (event.target.name === 'ovt_id' || event.target.name === 'collected_on') {
      renderCollectionCalendar();
    }
  }
  form.addEventListener('input', updateFromForm);
  form.addEventListener('change', updateFromForm);
  form.addEventListener('reset', () => queueMicrotask(renderCollectionCalendar));

  $('#calendar-ovt').addEventListener('change', event => {
    calendarTrapId = event.target.value;
    renderCollectionCalendar();
  });
  $('#calendar-prev').addEventListener('click', () => moveCalendarMonth(-1));
  $('#calendar-forward').addEventListener('click', () => moveCalendarMonth(1));
}

async function start(){
 try{const response=await fetch('./territorios.json');if(!response.ok)throw Error();areas=await response.json();}
 catch{$('#storage-error').hidden=false;$('#storage-error').textContent='Não foi possível carregar os territórios. Abra este protótipo pelo servidor local indicado no README.';return;}
 renderForms();hydrate();initCollectionCalendar();updateOptions();updateConditional();updateSummary();renderRecords();
 document.addEventListener('click', event => {
   const navigation = event.target.closest('[data-view]');
   if (navigation) {
     const view = navigation.dataset.view;
     switchView(view);
     if (!navigation.classList.contains('nav-item')) {
       const heading = view === 'calendar' ? '#collection-calendar-title' : '#form-title-' + view;
       $(heading).focus({preventScroll: true});
     }
     window.scrollTo(0, 0);
     return;
   }
   const detail = event.target.closest('[data-detail]');
   if (detail) showDetails(detail.dataset.kind, detail.dataset.detail);
 });
 $('#search').addEventListener('input',renderRecords);$('#record-filter').addEventListener('change',renderRecords);
 $('#export').addEventListener('click',exportRecords);
 $('#close-dialog').onclick=$('#dialog-done').onclick=()=>$('#details-dialog').close();
}
start();
