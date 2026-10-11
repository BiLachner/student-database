'use strict';

document.addEventListener('DOMContentLoaded', () => {
    const root=document.querySelector('#admin-enrollment');
    const semester=document.querySelector('[data-global-semester]');
    if(!root || !semester) return;
    const el=(tag,text)=>{const node=document.createElement(tag);if(text!=null)node.textContent=text;return node;};
    const rows=value=>Array.isArray(value)?value:[];
    const post=async(path,body)=>{const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});let data=null;try{data=await response.json();}catch{}if(!response.ok){const error=new Error(data?.message||'Die Änderung konnte nicht gespeichert werden.');error.status=response.status;error.body=data;throw error;}return data;};
    const shortLabel=new Map([
        ['Ethik01','Eth1'],['Ethik02','Eth2'],['Reli01','Rel1'],['Reli02','Rel2'],['Reli03','Rel3'],
        ['WPF Französisch','F'],['WPF Ökologie','Öko'],['WPF Technologie und Wirtschaft','TuW'],
        ['WPF Soziales und Familie','HuS'],['WPF Sport und Gesundheit','SuG'],['WPF Darstellendes Spiel','DS']
    ]);
    const labelFor=subject=>shortLabel.get(subject.name)||(()=>{const name=String(subject.name||'').replace(/^WPF\s+/,'');return name.length>8?name.slice(0,7)+'…':name;})();
    const nameFor=student=>`${student.last_name||''}, ${student.first_name||''}`.trim().replace(/^,\s*/,'');
    let catalog=null, gradeSelect=null, classSelect=null, status=null, matrix=null, generation=0;
    const groupLabel={RELIGION_ETHIK:'Religion/Ethik',WPF:'WPF'};
    const gradeClasses=grade=>rows(catalog?.classes).filter(item=>Number(item.grade)===Number(grade)&&Number(item.id)!==0&&item.active!==false&&item.active!==0);
    const activeSemesters=()=>rows(catalog?.semesters).filter(item=>!item.archived);
    const setStatus=(message,kind='')=>{if(status){status.textContent=message;status.dataset.state=kind;}};
    const selectedSemester=()=>Number(semester.value);
    const currentGrade=()=>Number(gradeSelect?.value||0);
    const currentClass=()=>Number(classSelect?.value||0);
    const assignmentKey=group=>group==='WPF'?'wpfSubjectId':'religionEthikSubjectId';
    const renderSubjects=(subjects,group)=>rows(subjects).filter(subject=>subject.assignmentGroup===group);
    const setButtonState=(button,selected)=>{button.classList.toggle('is-selected',selected);button.setAttribute('aria-pressed',selected?'true':'false');button.textContent=selected?'●':'○';};
    const choice=async(student,subject,group,buttons,studentStatus)=>{
        const busyKey=`${student.id}:${group}`;
        if(buttons.some(button=>button.dataset.busy==='true'))return;
        const previous=student[assignmentKey(group)]??null;
        const next=Number(previous)===Number(subject.id)?null:Number(subject.id);
        buttons.forEach(button=>{button.dataset.busy='true';button.disabled=true;});
        studentStatus.textContent='Wird gespeichert …';
        try {
            const result=await post('/assign-curriculum-individual-subject',{semesterId:selectedSemester(),studentId:Number(student.id),classId:currentClass(),grade:currentGrade(),assignmentGroup:group,subjectId:next,expectedSubjectId:previous});
            student[assignmentKey(group)]=result.subjectId==null?null:Number(result.subjectId);
            buttons.forEach(button=>setButtonState(button,Number(button.dataset.subjectId)===Number(student[assignmentKey(group)])));
            studentStatus.textContent='Gespeichert';
        } catch(error) {
            studentStatus.textContent=error.status===409?'Die Zuordnung wurde zwischenzeitlich geändert. Der aktuelle Stand wurde neu geladen.':'Änderung fehlgeschlagen.';
            if(error.status===409) await loadMatrix(studentStatus.textContent);
        } finally {buttons.forEach(button=>{button.dataset.busy='';button.disabled=false;});}
    };
    const groupControls=(student,subjects,group,studentStatus)=>{
        const fieldset=document.createElement('fieldset');fieldset.className='student-matrix-group';
        const legend=el('legend',groupLabel[group]);fieldset.append(legend);
        const controls=el('div');controls.className='student-matrix-subjects';const buttons=[];
        renderSubjects(subjects,group).forEach(subject=>{const button=el('button');button.type='button';button.className='student-matrix-choice';button.dataset.subjectId=String(subject.id);button.title=subject.name;button.setAttribute('aria-label',`${nameFor(student)}: ${subject.name}, ${groupLabel[group]}`);setButtonState(button,Number(student[assignmentKey(group)])===Number(subject.id));button.addEventListener('click',()=>choice(student,subject,group,buttons,studentStatus));controls.append(button);buttons.push(button);});
        fieldset.append(controls);return fieldset;
    };
    const renderDesktop=(data,subjects)=>{
        subjects=['RELIGION_ETHIK','WPF'].flatMap(group=>renderSubjects(subjects,group));
        const table=document.createElement('table');table.className='student-individual-matrix-table';
        const caption=el('caption',`Schülerzuordnung für ${data.classLabel}, Jahrgang ${data.grade}`);table.append(caption);
        const head=document.createElement('thead');const groupRow=document.createElement('tr');groupRow.append(el('th','Schüler'));for(const group of ['RELIGION_ETHIK','WPF']){const groupSubjects=renderSubjects(subjects,group);if(!groupSubjects.length)continue;const th=el('th',groupLabel[group]);th.colSpan=groupSubjects.length;th.className=`student-matrix-group-header group-${group.toLowerCase()}`;groupRow.append(th);}head.append(groupRow);const subjectRow=document.createElement('tr');subjectRow.append(el('th',''));for(const subject of subjects){const th=el('th',labelFor(subject));th.title=subject.name;th.setAttribute('aria-label',subject.name);th.scope='col';th.className=`group-${subject.assignmentGroup.toLowerCase()}`;subjectRow.append(th);}head.append(subjectRow);table.append(head);
        const body=document.createElement('tbody');rows(data.students).forEach(student=>{const row=document.createElement('tr');const name=el('th',nameFor(student));name.scope='row';row.append(name);for(const group of ['RELIGION_ETHIK','WPF'])for(const subject of renderSubjects(subjects,group)){const cell=document.createElement('td');cell.className=`group-${group.toLowerCase()}`;const button=el('button');button.type='button';button.className='student-matrix-choice';button.dataset.subjectId=String(subject.id);button.title=subject.name;button.setAttribute('aria-label',`${nameFor(student)}: ${subject.name}`);setButtonState(button,Number(student[assignmentKey(group)])===Number(subject.id));cell.append(button);row.append(cell);const all=row.querySelectorAll(`.group-${group.toLowerCase()} .student-matrix-choice`);button.addEventListener('click',()=>choice(student,subject,group,[...all],rowStatus));}const rowStatus=el('span');rowStatus.className='student-matrix-row-status';rowStatus.setAttribute('role','status');rowStatus.setAttribute('aria-live','polite');const statusCell=document.createElement('td');statusCell.className='student-matrix-status';statusCell.append(rowStatus);row.append(statusCell);body.append(row);});table.append(body);return table;
    };
    const renderMobile=(data,subjects)=>{const cards=el('div');cards.className='student-individual-matrix-cards';rows(data.students).forEach(student=>{const card=el('article');card.className='student-matrix-card';card.append(el('h4',nameFor(student)));const rowStatus=el('p');rowStatus.className='student-matrix-row-status';rowStatus.setAttribute('role','status');rowStatus.setAttribute('aria-live','polite');for(const group of ['RELIGION_ETHIK','WPF'])if(renderSubjects(subjects,group).length)card.append(groupControls(student,subjects,group,rowStatus));card.append(rowStatus);cards.append(card);});return cards;};
    const loadMatrix=async(message)=>{const version=++generation;matrix?.replaceChildren(el('p','Lade Schülerzuordnung …'));if(!selectedSemester()||!currentGrade()||!currentClass())return;try{const data=await post('/curriculum-individual-student-matrix',{semesterId:selectedSemester(),grade:currentGrade(),classId:currentClass()});if(version!==generation)return;const subjects=rows(data.subjects);matrix.replaceChildren(renderDesktop(data,subjects),renderMobile(data,subjects));setStatus(message||`${data.students.length} Schüler:innen · ${subjects.length} individuelle Fächer`);}catch{if(version===generation){matrix?.replaceChildren(el('p','Die Schülerzuordnung konnte nicht geladen werden.'));setStatus('Laden fehlgeschlagen.','error');}}};
    const populateClasses=()=>{classSelect.replaceChildren();for(const schoolClass of gradeClasses(currentGrade())){const option=el('option',schoolClass.label);option.value=String(schoolClass.id);classSelect.append(option);}if(!classSelect.value&&classSelect.options.length)classSelect.value=classSelect.options[0].value;};
    const renderRoot=()=>{root.replaceChildren();const section=el('section');section.className='student-individual-matrix';section.setAttribute('aria-labelledby','student-individual-heading');section.append(el('h3','Schülerzuordnung individuelle Fächer'));const controls=el('div');controls.className='student-matrix-controls';const gradeLabel=el('label','Jahrgang ');gradeSelect=document.createElement('select');gradeSelect.setAttribute('aria-label','Jahrgang');gradeLabel.append(gradeSelect);const classLabel=el('label','Klasse ');classSelect=document.createElement('select');classSelect.setAttribute('aria-label','Klasse');classLabel.append(classSelect);controls.append(gradeLabel,classLabel);section.append(controls);status=el('p','');status.className='student-matrix-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');section.append(status);matrix=el('div');matrix.className='student-matrix-content';section.append(matrix);root.append(section);const grades=[...new Set(rows(catalog.classes).filter(item=>Number(item.id)!==0&&item.active!==false&&item.active!==0).map(item=>Number(item.grade)))].sort((a,b)=>a-b);grades.forEach(value=>{const option=el('option',String(value));option.value=String(value);gradeSelect.append(option);});gradeSelect.value=grades.includes(5)?'5':String(grades[0]||'');populateClasses();gradeSelect.addEventListener('change',()=>{populateClasses();loadMatrix();});classSelect.addEventListener('change',()=>loadMatrix());loadMatrix();};
    const init=async()=>{try{catalog=await post('/curriculum-enrollment-catalog',{});const semesters=activeSemesters();semester.replaceChildren();semesters.forEach(item=>{const option=el('option',`${item.schoolYearLabel||''} ${item.label}`.trim());option.value=String(item.id);semester.append(option);});const active=semesters.find(item=>item.active);if(active)semester.value=String(active.id);renderRoot();semester.addEventListener('change',()=>loadMatrix());}catch{root.replaceChildren(el('p','Die Schülerzuordnung konnte nicht geladen werden.'));}};
    init();
});
