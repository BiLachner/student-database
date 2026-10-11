const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');

const resources=path.join(__dirname,'../../main/resources');
const dashboard=fs.readFileSync(path.join(resources,'html/admin/dashboard.html'),'utf8')
  .replace('%[site;title=Dashboard;content=!FOLLOWS]','').replace('%[admin_nav]','');
const studentScript=fs.readFileSync(path.join(resources,'js/admin/student-individual-matrix.js'),'utf8');
const curriculumScript=fs.readFileSync(path.join(resources,'js/site/curriculum.js'),'utf8');
const tick=()=>new Promise(resolve=>setTimeout(resolve,40));

function fixture({subjects5=[{id:11,name:'Ethik01',assignmentGroup:'RELIGION_ETHIK'}],subjects6=[{id:11,name:'Ethik01',assignmentGroup:'RELIGION_ETHIK'},{id:21,name:'WPF Technik',assignmentGroup:'WPF'}],students=true}={}) {
  const classes=[{id:51,label:'5a',grade:5,active:true},{id:61,label:'6a',grade:6,active:true}];
  const catalog={admin:true,enrollmentEnabled:true,semesters:[{id:1,label:'HJ1',schoolYearLabel:'2026/27',active:true,archived:false}],classes,subjects:[{id:1,name:'Mathe',mode:'REGULAR'},{id:11,name:'Ethik01',mode:'INDIVIDUAL',assignmentGroup:'RELIGION_ETHIK'},{id:21,name:'WPF Technik',mode:'INDIVIDUAL',assignmentGroup:'WPF'}],teachers:[{id:7,first_name:'Tina',last_name:'Tutor'}],teaching:[],gradeSubjects:[],activeSubjectIdsByGrade:{'5':[1,11],'6':[1,11,21]}};
  const matrix=(grade)=>({semesterId:1,grade,classId:grade===5?51:61,classLabel:grade===5?'5a':'6a',subjects:grade===5?subjects5:subjects6,students:students?[{id:grade,first_name:'Ada',last_name:'Alpha'}]:[]});
  return {catalog,classes,matrix};
}

async function load({withCurriculum=true,...options}={}) {
  const data=fixture(options);
  const dom=new JSDOM(`<!doctype html><body>${dashboard}</body>`,{url:'https://school.invalid/dashboard#schuljahr',runScripts:'outside-only'});
  const calls=[];
  dom.window.fetch=async(url,request={})=>{
    let body={}; try { body=JSON.parse(request.body||'{}'); } catch {}
    calls.push({url,body});
    if(url==='/curriculum-catalog'||url==='/curriculum-enrollment-catalog') return {ok:true,status:200,json:async()=>data.catalog,text:async()=>JSON.stringify(data.catalog)};
    if(url==='/curriculum-individual-student-matrix') return {ok:true,status:200,json:async()=>data.matrix(Number(body.grade)),text:async()=>''};
    if(url==='/curriculum-tutor-assignments') return {ok:true,status:200,json:async()=>[],text:async()=>''};
    if(url==='/curriculum-structure') return {ok:true,status:200,json:async()=>({topics:[],tasks:[],centralTokens:0,regularLimit:100,hardLimit:105}),text:async()=>''};
    if(url==='/central-curriculum-overview') return {ok:true,status:200,json:async()=>({subjects:[],rows:[]}),text:async()=>''};
    return {ok:true,status:200,json:async()=>({}),text:async()=>''};
  };
  dom.window.eval(studentScript);
  if(withCurriculum) dom.window.eval(curriculumScript);
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
  await tick(); await tick();
  return {dom,calls};
}

test('real dashboard mounts B4/B5/B6 in order and keeps old enrollment UI absent',async()=>{
  const {dom}=await load();
  try {
    const section=dom.window.document.querySelector('#schuljahr');
    assert.ok(section.querySelector('[data-global-semester]'));
    assert.ok(section.querySelector('#admin-tutors'));
    assert.ok(section.querySelector('#admin-enrollment .admin-teacher-matrix'));
    assert.ok(section.querySelector('#admin-student-individual-matrix .student-individual-matrix'));
    const order=[...section.children].map(node=>node.id||node.querySelector('section')?.className||'');
    assert.ok(order.indexOf('admin-enrollment')<order.indexOf('admin-student-individual-matrix'));
    assert.equal(section.querySelector('.admin-regular-assignments'),null);
    assert.equal(section.querySelector('.admin-individual-teachers'),null);
    assert.equal(section.querySelector('.semester-landing'),null);
  } finally { dom.window.close(); }
});

test('Grade 5 renders class selector, students and Religion/Ethik without WPF',async()=>{
  const {dom,calls}=await load({withCurriculum:false});
  try {
    const root=dom.window.document.querySelector('#admin-student-individual-matrix');
    assert.ok(root.querySelector('select[aria-label="Klasse"]'));
    assert.match(root.textContent,/Eth1/);
    assert.match(root.textContent,/Ada/);
    assert.doesNotMatch(root.textContent,/WPF Technik/);
    assert.ok(calls.some(call=>call.url==='/curriculum-individual-student-matrix'&&call.body.grade===5));
  } finally { dom.window.close(); }
});

test('Grade 6 renders both individual subject groups',async()=>{
  const {dom}=await load({withCurriculum:false});
  try {
    const root=dom.window.document.querySelector('#admin-student-individual-matrix');
    const grade=root.querySelector('select[aria-label="Jahrgang"]'); grade.value='6'; grade.dispatchEvent(new dom.window.Event('change'));
    await tick();
    assert.match(root.textContent,/Eth1/);
    assert.match(root.textContent,/Technik/);
  } finally { dom.window.close(); }
});

test('empty individual subjects and empty class keep the B6 section visible',async()=>{
  let env=await load({withCurriculum:false,subjects5:[],subjects6:[]});
  try { assert.match(env.dom.window.document.querySelector('#admin-student-individual-matrix').textContent,/keine individuellen Fächer aktiviert/); }
  finally { env.dom.window.close(); }
  env=await load({withCurriculum:false,students:false});
  try { assert.match(env.dom.window.document.querySelector('#admin-student-individual-matrix').textContent,/keine Schüler vorhanden/); }
  finally { env.dom.window.close(); }
});
