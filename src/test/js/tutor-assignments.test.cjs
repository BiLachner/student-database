const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');

const root=path.join(__dirname,'../../main/resources');
const dashboard=fs.readFileSync(path.join(root,'html/admin/dashboard.html'),'utf8');
const script=fs.readFileSync(path.join(root,'js/admin/tutor-assignments.js'),'utf8');
const tick=()=>new Promise(resolve=>setTimeout(resolve,30));

function domWithFetch(fetchImpl) {
  const dom=new JSDOM(`<!doctype html><body>${dashboard}</body>`,{url:'https://school.example.invalid/dashboard#schuljahr',runScripts:'outside-only'});
  dom.window.fetch=fetchImpl;
  dom.window.console.error=()=>{};
  dom.window.eval(script);
  return dom;
}

const catalog={
  semesters:[{id:11,label:'2026_27_HJ1'}],
  classes:[{id:0,label:'Klasse 0',grade:0,active:true},{id:1,label:'6a',grade:6,active:true},{id:2,label:'6b',grade:6,active:true}],
  teachers:[{id:21,first_name:'Ada',last_name:'Admin'},{id:22,first_name:'Tina',last_name:'Tutor'}],
  teaching:[{semesterId:11,classId:1,teacherId:21},{semesterId:11,classId:1,teacherId:22}]
};

test('compact semester and tutor controls are wired into the admin dashboard',()=>{
  assert.equal(dashboard.includes('id="admin-enrollment"'),false);
  assert.match(dashboard,/data-global-semester/);
  assert.match(dashboard,/data-create-next-semester/);
  assert.match(dashboard,/id="admin-tutors"/);
  assert.match(dashboard,/src="\/tutor-assignments\.js"/);
});

test('renders normal classes, existing assignments, and sends tutor assignment payload',async()=>{
  const requests=[];
  const dom=domWithFetch(async(path,options={})=>{
    requests.push({path,options});
    if(path==='/curriculum-enrollment-catalog') return {ok:true,json:async()=>catalog};
    if(path==='/curriculum-tutor-assignments') return {ok:true,json:async()=>[{classId:1,tutorSlot:1,teacherId:21}]};
    if(path==='/assign-class-tutors') return {ok:true,json:async()=>({ok:true})};
    throw Error(path);
  });
  await tick();
  const block=dom.window.document.querySelector('#admin-tutors');
  assert.match(block.textContent,/Tutor:innen je Klasse/);
  assert.equal(block.querySelectorAll('tbody tr').length,2);
  assert.equal(block.textContent.includes('Klasse 0'),false);
  const selects=block.querySelectorAll('tbody tr:first-child select');
  assert.equal(selects.length,2);
  assert.equal(selects[0].value,'21');
  assert.equal(selects[1].value,'');
  selects[1].value='22';
  selects[1].dispatchEvent(new dom.window.Event('change'));
  await tick();
  const save=requests.find(request=>request.path==='/assign-class-tutors');
  assert.ok(save);
  assert.deepEqual(JSON.parse(save.options.body),{semesterId:11,classId:1,tutor1Id:21,tutor2Id:22});
  dom.window.close();
});

test('shows a visible error instead of silently leaving an empty block',async()=>{
  const dom=domWithFetch(async()=>({ok:false,status:500,json:async()=>({})}));
  await tick();
  const block=dom.window.document.querySelector('#admin-tutors');
  assert.match(block.textContent,/Tutorzuordnungen konnten nicht geladen werden/);
  dom.window.close();
});

test('semester selection autosaves once, locks the dropdown, and rolls back on failure',async()=>{
  let resolveActivation;
  const activation=new Promise(resolve=>{resolveActivation=resolve;});
  const requests=[];
  const dom=domWithFetch(async(path,options={})=>{
    requests.push({path,options});
    if(path==='/curriculum-enrollment-catalog')return {ok:true,json:async()=>({...catalog,semesters:[{id:11,label:'2026/27 HJ1',active:true},{id:12,label:'2026/27 HJ2',active:false}]})};
    if(path==='/curriculum-tutor-assignments')return {ok:true,json:async()=>[]};
    if(path==='/activate-curriculum-semester'){await activation;return {ok:false,status:409,json:async()=>({})};}
    throw Error(path);
  });
  await tick();
  const select=dom.window.document.querySelector('[data-global-semester]');
  select.value='12';select.dispatchEvent(new dom.window.Event('change'));
  await tick();assert.equal(select.disabled,true);assert.equal(requests.filter(r=>r.path==='/activate-curriculum-semester').length,1);
  resolveActivation();await tick();await tick();
  assert.equal(select.value,'11');assert.equal(select.disabled,false);
  dom.window.close();
});

test('creating the next semester is single-shot and reloads the activated semester',async()=>{
  let created=false;const requests=[];
  const dom=domWithFetch(async(path,options={})=>{
    requests.push({path,options});
    if(path==='/curriculum-enrollment-catalog')return {ok:true,json:async()=>({...catalog,semesters:created?[{id:11,label:'2026/27 HJ1',active:false},{id:12,label:'2026/27 HJ2',active:true}]:[{id:11,label:'2026/27 HJ1',active:true}],classes:catalog.classes})};
    if(path==='/curriculum-tutor-assignments')return {ok:true,json:async()=>[]};
    if(path==='/create-curriculum-semester'){created=true;return {ok:true,json:async()=>({id:12,label:'2026/27 HJ2',active:true})};}
    throw Error(path);
  });
  await tick();const button=dom.window.document.querySelector('[data-create-next-semester]');
  button.click();button.click();await tick();await tick();
  assert.equal(requests.filter(r=>r.path==='/create-curriculum-semester').length,1);
  assert.equal(dom.window.document.querySelector('[data-global-semester]').value,'12');
  dom.window.close();
});

test('archived semesters stay out of the activation dropdown',async()=>{
  const dom=domWithFetch(async path=>{
    if(path==='/curriculum-enrollment-catalog')return {ok:true,json:async()=>({...catalog,semesters:[{id:11,label:'HJ1',active:true},{id:12,label:'HJ2',active:false,archived:true}]})};
    if(path==='/curriculum-tutor-assignments')return {ok:true,json:async()=>[]};
    throw Error(path);
  });
  await tick();const select=dom.window.document.querySelector('[data-global-semester]');
  assert.deepEqual([...select.options].map(option=>option.value),['11']);
  dom.window.close();
});

test('class grade filter uses structured grade and every class has two tutor slots',async()=>{
  const data={...catalog,classes:[{id:1,label:'5a',grade:5,active:true},{id:2,label:'6a',grade:6,active:true}],teaching:[]};
  const dom=domWithFetch(async path=>{
    if(path==='/curriculum-enrollment-catalog')return {ok:true,json:async()=>data};
    if(path==='/curriculum-tutor-assignments')return {ok:true,json:async()=>[]};
    throw Error(path);
  });
  await tick();const grade=dom.window.document.querySelector('[data-tutor-grade]');grade.value='5';grade.dispatchEvent(new dom.window.Event('change'));await tick();
  const block=dom.window.document.querySelector('#admin-tutors');assert.equal(block.querySelectorAll('tbody tr').length,1);assert.match(block.textContent,/5a/);assert.doesNotMatch(block.textContent,/6a/);assert.equal(block.querySelectorAll('tbody tr select').length,2);
  dom.window.close();
});

test('tutor autosave sends the complete pair, clears independently, and rejects duplicates',async()=>{
  const requests=[];const dom=domWithFetch(async(path,options={})=>{
    requests.push({path,options});
    if(path==='/curriculum-enrollment-catalog')return {ok:true,json:async()=>({...catalog,teaching:[{semesterId:11,classId:1,teacherId:21},{semesterId:11,classId:1,teacherId:22}]})};
    if(path==='/curriculum-tutor-assignments')return {ok:true,json:async()=>[{classId:1,tutorSlot:1,teacherId:21},{classId:1,tutorSlot:2,teacherId:22}]};
    if(path==='/assign-class-tutors')return {ok:true,json:async()=>({ok:true})};
    throw Error(path);
  });
  await tick();const selects=dom.window.document.querySelectorAll('#admin-tutors tbody tr:first-child select');
  selects[0].value='';selects[0].dispatchEvent(new dom.window.Event('change'));await tick();
  assert.deepEqual(JSON.parse(requests.find(r=>r.path==='/assign-class-tutors').options.body),{semesterId:11,classId:1,tutor1Id:null,tutor2Id:22});
  selects[0].value='22';selects[0].dispatchEvent(new dom.window.Event('change'));await tick();
  assert.equal(requests.filter(r=>r.path==='/assign-class-tutors').length,1);assert.match(dom.window.document.querySelector('.admin-tutor-row-status').textContent,/darf nicht beide/);
  dom.window.close();
});

test('stale tutor assignment remains visible and same-class race disables both controls',async()=>{
  let resolveSave;const save=new Promise(resolve=>{resolveSave=resolve});const requests=[];
  const dom=domWithFetch(async(path,options={})=>{
    requests.push({path,options});
    if(path==='/curriculum-enrollment-catalog')return {ok:true,json:async()=>({...catalog,teaching:[]})};
    if(path==='/curriculum-tutor-assignments')return {ok:true,json:async()=>[{classId:1,tutorSlot:1,teacherId:21}]};
    if(path==='/assign-class-tutors'){await save;return {ok:false,status:409,json:async()=>({})};}
    throw Error(path);
  });
  await tick();const row=dom.window.document.querySelector('#admin-tutors tbody tr');
  assert.match(row.querySelector('select').options[1].textContent,/aktuell zugeordnet/);
  const first=row.querySelectorAll('select')[0];first.value='';first.dispatchEvent(new dom.window.Event('change'));await tick();
  assert.equal(row.querySelectorAll('select')[0].disabled,true);assert.equal(row.querySelectorAll('select')[1].disabled,true);
  resolveSave();await tick();await tick();assert.equal(first.value,'21');assert.equal(first.disabled,false);assert.equal(row.querySelectorAll('select')[1].disabled,false);
  assert.equal(requests.filter(r=>r.path==='/assign-class-tutors').length,1);dom.window.close();
});
