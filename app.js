import {dateKey,initialState,advanceDay,snapshot,isValidState,previousSet,clone,compareSet,compareWorkout} from './workout-engine.js';
const $ = id=>document.getElementById(id);
const programResponse=await fetch('./workout-program.json',{cache:'no-store'});
if(!programResponse.ok)throw new Error('Не удалось загрузить программу тренировок');
const program=await programResponse.json();
const stateKey=window.workoutUserId?'workout-state-v3:'+window.workoutUserId:'workout-state-v3';
let state;
try{const saved=JSON.parse(localStorage.getItem(stateKey));if(isValidState(saved,program))state=saved}catch{}
state??=initialState(program,dateKey(new Date(),program.timezone));
// Display labels follow the program; stable IDs preserve saved results.
for(const session of [state.current,...state.history]){
 const labels=new Map(program.types[session.type].exercises.map(e=>[e.id,e.name]));
 for(const exercise of session.exercises)exercise.name=labels.get(exercise.id)??exercise.name;
}
advanceDay(state,program,dateKey(new Date(),program.timezone));
let exercises=state.current.exercises,activeExercise=0,sets=exercises[0].sets;
const exerciseOrder=exercises.map((_,i)=>i);
function persist(){localStorage.setItem(stateKey,JSON.stringify(state));}
try{persist()}catch{}
function formatDelta(delta){const rounded=Math.round(delta);return (rounded>0?'+':'')+rounded+'%'}
function comparisonNode(current,previous){
 const comparison=compareSet(current,previous);if(!comparison)return null;
 const badge=document.createElement('span');badge.className='set-comparison';
 if(comparison.delta===null){
  if(!comparison.weight)return null;
  badge.textContent=(comparison.weight>0?'+':'')+comparison.weight+' кг';badge.classList.add('neutral');
 }else{
  if(Math.abs(comparison.delta)<.5)return null;
  badge.textContent=formatDelta(comparison.delta);badge.classList.add(comparison.delta>0?'positive':'negative');
 }
 badge.title=comparison.label+' относительно предыдущей тренировки того же типа';
 badge.setAttribute('aria-label',badge.textContent+', '+badge.title);
 return badge;
}
function renderComparisons(){
 document.querySelectorAll('#sets .set').forEach((row,i)=>{
  row.querySelector('.set-comparison')?.remove();
  const old=previousSet(state.history,state.current,exercises[activeExercise].id,i);
  const badge=comparisonNode(sets[i],old);if(badge)row.append(badge);
 });
}
function updateProgress(){
 const completedSets=exercises.reduce((n,e)=>n+e.sets.filter(s=>s.done).length,0);
 const total=exercises.reduce((n,e)=>n+e.sets.length,0);
 for(const [prefix,done,max] of [['workout',completedSets,total],['exercise',sets.filter(s=>s.done).length,sets.length]]){
  const percent=Math.round(done/max*100),bar=$(prefix+'-progress');
  $(prefix+'-percent').textContent=percent+'%';bar.style.setProperty('--progress',done/max);
  bar.setAttribute('aria-valuemin','0');bar.setAttribute('aria-valuemax',String(max));bar.setAttribute('aria-valuenow',String(done));
  bar.classList.toggle('empty',done===0);bar.classList.toggle('full',done===max);
 }
}
function renderHome(){
 document.querySelector('#summary h1').textContent=state.current.title;
 document.querySelector('#summary .progress-caption p').textContent=state.current.subtitle;
 updateProgress();
 $('exercise-list').replaceChildren(...exerciseOrder.map(i=>{
  const exercise=exercises[i];
  const button=document.createElement('button');button.className='home-exercise';button.dataset.exercise=i;
  const name=document.createElement('span');name.textContent=exercise.name;
  const count=document.createElement('span');count.className='home-progress';
  const done=exercise.sets.filter(s=>s.done).length;count.textContent=`${done} / ${exercise.sets.length}`;
  count.classList.toggle('all-done',done===exercise.sets.length);
  button.append(name,count);button.onclick=()=>{if(!suppressHomeClick)resume(i)};return button;
 }));
}
let editing=null, draft=0, returnFocus=null, completed=false, closing=false;
function notify(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(notify.timer);notify.timer=setTimeout(()=>$('toast').classList.remove('visible'),2200)}
function save(){try{exercises[activeExercise].sets=sets;snapshot(state);persist();updateProgress();renderComparisons()}catch{notify('Не удалось сохранить в браузере')}}
function render(){
 $('sets').innerHTML=sets.map((s,i)=>`<div class="set">${s.reps>0?`<label class="complete ${s.done?'done':''}"><input class="set-switch" type="checkbox" switch data-set="${i}" aria-label="Подход ${i+1}: ${s.done?'снять отметку':'отметить выполненным'}" ${s.done?'checked':''}>${s.done?'<img src="assets/check.svg" width="48" height="48" alt="">':''}</label>`:`<button class="complete" data-set="${i}" data-action="incomplete" aria-label="Подход ${i+1}: отметить выполненным"></button>`}<div class="set-space"></div><button class="value ${s.weight?'filled':''}" data-set="${i}" data-action="weight" aria-label="Вес подхода ${i+1}">${s.weight} кг</button><img class="multiply" src="assets/x.svg" width="20" height="20" alt="×"><button class="value ${s.reps?'filled':''}" data-set="${i}" data-action="reps" aria-label="Повторения подхода ${i+1}">${s.reps}</button></div>`).join('');
 renderHome();renderComparisons();
}
const scroller = $('weight-scroll');
let wheelValues=[], wheelFrame=0, settleTimer=0, mouseDrag=null, inertiaFrame=0, suppressClick=false, wheelMotion=0, wheelTarget=null;
const rowHeight=72;
const wheelStep=()=>editing?.field==='reps'?1:2.5;
const wheelMax=()=>editing?.field==='reps'?Math.max(99,draft):1000;
function paintWheel(){
 const position=scroller.scrollTop/rowHeight;
 const index=Math.max(0,Math.min(wheelValues.length-1,Math.round(position)));
 draft=wheelValues[wheelTarget??index]??draft;
 for(let i=0;i<scroller.children.length;i++){
  const row=scroller.children[i], offset=i-position, distance=Math.abs(offset);
  // Project the visible digits onto a cylinder, with the selected row facing forward.
  const angle=Math.max(-80,Math.min(80,offset*32));
  const projected=Math.sin(angle*Math.PI/180)*122;
  const shift=projected-offset*rowHeight;
  row.style.transform=`translateY(${shift}px) perspective(500px) rotateX(${-angle}deg) scale(${Math.max(.72,1-distance*.09)})`;
  const blur=Math.min(5,Math.max(0,distance-.35)**1.7*1.5);
  row.style.filter=distance>2.7?'none':`blur(${blur.toFixed(2)}px)`;
  // A subtle refraction-like stretch at the rim; keep the selected value untouched.
  row.style.transform+=` scaleY(${1+Math.min(.1,Math.max(0,distance-.6)*.055)})`;
  row.style.opacity=String(Math.max(0,1-distance*.48));
  row.style.visibility=distance>2.7?'hidden':'visible';
  row.setAttribute('aria-selected',String(i===index));
 }
 if(editing){
  const i=editing.index,old=previousSet(state.history,state.current,exercises[activeExercise].id,i);
  const changed={...sets[i],[editing.field]:draft};
  const row=$('sets').children[i];row?.querySelector('.set-comparison')?.remove();
  const badge=comparisonNode(changed,old);if(badge&&row)row.append(badge);
 }
}
function updateWheel(){
 stopWheelMotion();cancelAnimationFrame(inertiaFrame);clearTimeout(settleTimer);
 const reps=editing.field==='reps';
 wheelValues=Array.from({length:reps?Math.max(100,draft+1):401},(_,i)=>reps?i:i*2.5);
 scroller.setAttribute('aria-label',reps?'Количество повторений':'Вес в килограммах');
 $('picker').setAttribute('aria-label',reps?'Выбор повторений':'Выбор веса');
 $('plus').querySelector('input').setAttribute('aria-label',reps?'Увеличить повторения':'Увеличить вес');
 $('minus').querySelector('input').setAttribute('aria-label',reps?'Уменьшить повторения':'Уменьшить вес');
 if(!wheelValues.includes(draft))wheelValues.push(draft);
 wheelValues.sort((a,b)=>a-b);
 scroller.replaceChildren(...wheelValues.map(value=>{
  const row=document.createElement('button');row.type='button';row.className='weight-option';
  row.textContent=editing.field==='reps'?String(value):value.toFixed(1);row.setAttribute('role','option');row.tabIndex=-1;
  row.addEventListener('click',()=>{
   if(suppressClick)return;
   if(Math.abs(value-draft)<.01)return;
   moveWheel(wheelValues.indexOf(value));
  });return row;
 }));
 scroller.scrollTop=wheelValues.indexOf(draft)*rowHeight;paintWheel();
}
function saveWheelDraft(){
 if(!editing||closing)return;
 const set=sets[editing.index];
 if(set[editing.field]===draft)return;
 set[editing.field]=draft;if(!set.reps)set.done=false;save();
}
function stopWheelMotion(){
 cancelAnimationFrame(wheelMotion);wheelMotion=0;wheelTarget=null;
}
function moveWheel(index){
 cancelAnimationFrame(wheelMotion);clearTimeout(settleTimer);
 wheelTarget=index;draft=wheelValues[index];
 const start=scroller.scrollTop,end=index*rowHeight,started=performance.now();
 const duration=matchMedia('(prefers-reduced-motion: reduce)').matches?0:240;
 const frame=now=>{
  const t=duration?Math.min(1,(now-started)/duration):1;
  scroller.scrollTop=start+(end-start)*(1-Math.pow(1-t,3));paintWheel();
  if(t<1)wheelMotion=requestAnimationFrame(frame);
  else{wheelMotion=0;wheelTarget=null;scroller.scrollTop=end;paintWheel();saveWheelDraft()}
 };
 wheelMotion=requestAnimationFrame(frame);
}
function snapWheel(){
 if(wheelMotion)return;
 const index=Math.max(0,Math.min(wheelValues.length-1,Math.round(scroller.scrollTop/rowHeight)));
 if(Math.abs(scroller.scrollTop-index*rowHeight)>.5)moveWheel(index);else saveWheelDraft();
}
function step(amount){
 cancelAnimationFrame(inertiaFrame);clearTimeout(settleTimer);
 const base=wheelTarget===null?wheelValues[Math.max(0,Math.min(wheelValues.length-1,Math.round(scroller.scrollTop/rowHeight)))]:wheelValues[wheelTarget];
 const target=Math.max(0,Math.min(wheelMax(),Math.round((base+amount)*10)/10));
 const index=wheelValues.indexOf(target);
 if(index<0){stopWheelMotion();draft=target;updateWheel();return}
 moveWheel(index);
}
scroller.addEventListener('scroll',()=>{
 cancelAnimationFrame(wheelFrame);wheelFrame=requestAnimationFrame(paintWheel);
 clearTimeout(settleTimer);settleTimer=setTimeout(()=>{if(!mouseDrag&&!wheelMotion)snapWheel()},240);
},{passive:true});
// iOS handles touch momentum and snap natively. Mouse dragging gets the same inertial feel.
scroller.addEventListener('pointerdown',e=>{
 stopWheelMotion();paintWheel();
 if(e.pointerType!=='mouse')return;
 cancelAnimationFrame(inertiaFrame);suppressClick=false;
 mouseDrag={y:e.clientY,time:performance.now(),velocity:0,distance:0};
 scroller.style.scrollSnapType='none';
});
scroller.addEventListener('pointermove',e=>{
 if(!mouseDrag)return;
 const now=performance.now(),delta=mouseDrag.y-e.clientY,dt=Math.max(1,now-mouseDrag.time);
 mouseDrag.velocity=mouseDrag.velocity*.35+(delta/dt)*.65;
 mouseDrag.distance+=Math.abs(delta);scroller.scrollTop+=delta;
 mouseDrag.y=e.clientY;mouseDrag.time=now;
 if(mouseDrag.distance>5){suppressClick=true;scroller.setPointerCapture(e.pointerId)}
});
function releaseWheel(){
 if(!mouseDrag)return;
 let velocity=performance.now()-mouseDrag.time>100?0:mouseDrag.velocity;
 mouseDrag=null;if(!suppressClick){scroller.style.scrollSnapType='none';return}let last=performance.now();
 const tick=now=>{
  const dt=Math.min(32,now-last);last=now;
  const before=scroller.scrollTop;scroller.scrollTop+=velocity*dt;
  velocity*=Math.exp(-dt/325);
  if(Math.abs(velocity)>.025&&Math.abs(scroller.scrollTop-before)>.1){inertiaFrame=requestAnimationFrame(tick)}
  else{scroller.style.scrollSnapType='none';snapWheel();setTimeout(()=>{suppressClick=false},0)}
 };inertiaFrame=requestAnimationFrame(tick);
}
scroller.addEventListener('pointerup',releaseWheel);
scroller.addEventListener('pointercancel',releaseWheel);
function openEditor(index,field,trigger){
 if(closing)return;editing={index,field};returnFocus=trigger;draft=sets[index][field];
 $('backdrop').hidden=false;$('exercise').inert=true;
 $('picker').hidden=false;
 trigger.classList.add('active');updateWheel();scroller.focus();
}
function closeEditor(commit=true){
 if(!editing||closing)return;
 closing=true;cancelAnimationFrame(inertiaFrame);cancelAnimationFrame(wheelFrame);clearTimeout(settleTimer);
 if(!$('picker').hidden)paintWheel();
 const {index,field}=editing;
 stopWheelMotion();
 if(commit){sets[index][field]=draft;if(!sets[index].reps)sets[index].done=false;save()}
 const panel=$('picker');
 panel.classList.add('closing');$('backdrop').classList.add('closing');
 const finish=()=>{
  $('picker').hidden=true;$('backdrop').hidden=true;
  panel.classList.remove('closing');$('backdrop').classList.remove('closing');
  $('exercise').inert=false;editing=null;closing=false;render();
  document.querySelector(`[data-set="${index}"][data-action="${field}"]`)?.focus();
 };
 if(matchMedia('(prefers-reduced-motion: reduce)').matches)finish();else setTimeout(finish,200);
}
$('sets').addEventListener('change',e=>{
 const input=e.target.closest('.set-switch');if(!input)return;
 const i=Number(input.dataset.set);
 if(!sets[i].reps){
  input.checked=sets[i].done;
  notify('Сначала укажи повторения');
  openEditor(i,'reps',input.closest('.complete'));return;
 }
 sets[i].done=input.checked;save();
 // Keep the tapped native switch in place so WebKit can complete its haptic action.
 const label=input.closest('.complete');label.classList.toggle('done',input.checked);
 input.setAttribute('aria-label',`Подход ${i+1}: ${input.checked?'снять отметку':'отметить выполненным'}`);
 label.querySelector('img')?.remove();
 if(input.checked){const img=document.createElement('img');img.src='assets/check.svg';img.width=48;img.height=48;img.alt='';img.className='just-checked';label.append(img)}
 if(input.checked&&navigator.vibrate)navigator.vibrate(12);
 
 renderHome();
});
$('sets').addEventListener('click',e=>{
 const b=e.target.closest('button[data-action]');if(!b)return;
 const i=Number(b.dataset.set);
 if(b.dataset.action==='incomplete'){notify('Сначала укажи повторения');openEditor(i,'reps',b);return}
 openEditor(i,b.dataset.action,b);
});
function setupStepHaptic(id,direction){
 const label=document.createElement('label');label.className='step haptic-step';label.id=id;
 const input=document.createElement('input');input.type='checkbox';input.setAttribute('switch','');input.className='haptic-switch';
 input.setAttribute('aria-label',direction>0?'Увеличить значение':'Уменьшить значение');
 const glyph=document.createElement('span');glyph.textContent=direction>0?'+':'−';glyph.setAttribute('aria-hidden','true');
 label.append(input,glyph);$(id).replaceWith(label);
 input.addEventListener('change',()=>{step(direction*wheelStep());if(navigator.vibrate)navigator.vibrate(10)});
}
setupStepHaptic('plus',1);setupStepHaptic('minus',-1);
$('backdrop').onclick=()=>closeEditor();
document.addEventListener('keydown',e=>{if(!editing)return;if(e.key==='Escape'){closeEditor();return}if(!$('picker').hidden){if(e.key==='ArrowUp'){e.preventDefault();step(wheelStep())}if(e.key==='ArrowDown'){e.preventDefault();step(-wheelStep())}if(e.key==='Enter'){e.preventDefault();closeEditor()}}if(e.key==='Tab'){const container=$('picker');const focusable=[...container.querySelectorAll('button,input,[tabindex]')].filter(el=>el.tabIndex>=0);const first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}});
let sheetTimer=0;
function showSummary(){
 clearTimeout(sheetTimer);
 $('summary').hidden=false;
 $('exercise').classList.add('sheet-closing');$('exercise').inert=true;$('exercise-overlay').classList.add('closing');
 const finish=()=>{
  $('exercise').hidden=true;$('exercise').classList.remove('sheet-closing');$('exercise-overlay').hidden=true;$('exercise-overlay').classList.remove('closing');
  $('summary').inert=false;document.querySelector(`[data-exercise="${activeExercise}"]`)?.focus();
 };
 if(matchMedia('(prefers-reduced-motion: reduce)').matches)finish();else sheetTimer=setTimeout(finish,180);
}
document.querySelector('#exercise .back').onclick=showSummary;
function resume(index=activeExercise){
 activeExercise=index;sets=exercises[index].sets;
 const name=exercises[index].name;
 document.querySelector('#exercise h1').textContent=name;
 $('exercise').setAttribute('aria-label',name);
 document.querySelector('#exercise .progress-caption p').textContent=`${exercises[index].repRange[0]}–${exercises[index].repRange[1]} повторений`;render();
 clearTimeout(sheetTimer);$('summary').inert=true;$('exercise-overlay').hidden=false;$('exercise-overlay').classList.remove('closing');
 $('exercise').classList.remove('sheet-closing');$('exercise').hidden=false;$('exercise').inert=false;
 document.querySelector('#exercise .back').focus();
}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!editing&&!$('exercise').hidden)showSummary()});
render();

// Reordering is intentionally kept in memory for this session only.
let suppressHomeClick=false, homeGesture=null, homeHoldTimer=0;
const homeList=$('exercise-list');
homeList.addEventListener('contextmenu',e=>e.preventDefault());
homeList.addEventListener('pointerdown',e=>{
 if(e.button!==0)return;
 const row=e.target.closest('.home-exercise');if(!row)return;
 homeGesture={row,id:e.pointerId,startX:e.clientX,startY:e.clientY,lastY:e.clientY,dragging:false};
 homeHoldTimer=setTimeout(()=>{
  if(!homeGesture)return;
  homeGesture.dragging=true;suppressHomeClick=true;
  row.setPointerCapture(e.pointerId);row.classList.add('dragging');
  homeList.classList.add('reordering');
 },380);
});
homeList.addEventListener('pointermove',e=>{
 const g=homeGesture;if(!g||g.id!==e.pointerId)return;
 if(g.scrolling){$('summary').scrollTop-=e.clientY-g.lastY;g.lastY=e.clientY;return}
 if(!g.dragging){if(Math.hypot(e.clientX-g.startX,e.clientY-g.startY)>10){clearTimeout(homeHoldTimer);g.scrolling=true;$('summary').scrollTop-=e.clientY-g.startY;g.lastY=e.clientY}return}
 e.preventDefault();g.lastY=e.clientY;
 g.row.style.transform=`translateY(${e.clientY-g.startY}px) scale(1.025)`;
 const rows=[...homeList.children];
 const target=rows.find(row=>row!==g.row&&e.clientY>=row.getBoundingClientRect().top&&e.clientY<=row.getBoundingClientRect().bottom);
 if(!target)return;
 const before=new Map(rows.map(row=>[row,row.getBoundingClientRect().top]));
 const oldIndex=rows.indexOf(g.row),newIndex=rows.indexOf(target);
 const layoutTop=g.row.offsetTop;
 if(newIndex>oldIndex)target.after(g.row);else target.before(g.row);
 g.startY+=g.row.offsetTop-layoutTop;
 g.row.style.transform=`translateY(${e.clientY-g.startY}px) scale(1.025)`;
 for(const row of rows){if(row===g.row)continue;const delta=before.get(row)-row.getBoundingClientRect().top;if(delta&&!matchMedia('(prefers-reduced-motion: reduce)').matches)row.animate([{transform:`translateY(${delta}px)`},{transform:'translateY(0)'}],{duration:200,easing:'cubic-bezier(.2,.8,.2,1)'})}
});
function finishHomeDrag(){
 clearTimeout(homeHoldTimer);
 if(homeGesture?.dragging){
  const row=homeGesture.row;row.style.transform='';row.classList.remove('dragging');homeList.classList.remove('reordering');
  exerciseOrder.splice(0,exerciseOrder.length,...[...homeList.children].map(row=>Number(row.dataset.exercise)));
  setTimeout(()=>{suppressHomeClick=false},350);
 }
 homeGesture=null;
}
homeList.addEventListener('pointerup',finishHomeDrag);
homeList.addEventListener('pointercancel',finishHomeDrag);

// Pull the exercise sheet down; controls and the number picker keep their own gestures.
let sheetGesture=null;
const exerciseSheet=$('exercise');
exerciseSheet.addEventListener('pointerdown',e=>{
 if(editing||e.button!==0||e.target.closest('button,input,label,.sets'))return;
 if(exerciseSheet.scrollTop>0)return;
 sheetGesture={id:e.pointerId,x:e.clientX,y:e.clientY,distance:0,dragging:false};
});
exerciseSheet.addEventListener('pointermove',e=>{
 const g=sheetGesture;if(!g||g.id!==e.pointerId)return;
 const dy=e.clientY-g.y,dx=e.clientX-g.x;
 if(!g.dragging){
  if(Math.abs(dx)>12&&Math.abs(dx)>Math.abs(dy)){sheetGesture=null;return}
  if(dy<10)return;
  g.dragging=true;exerciseSheet.setPointerCapture(e.pointerId);exerciseSheet.classList.add('sheet-dragging');
 }
 e.preventDefault();g.distance=Math.max(0,dy);
 exerciseSheet.style.transform=`translateY(${g.distance}px)`;
 exerciseSheet.style.opacity=String(1-Math.min(.35,g.distance/1200));
});
function finishSheetDrag(cancelled=false){
 const g=sheetGesture;sheetGesture=null;if(!g?.dragging)return;
 exerciseSheet.classList.remove('sheet-dragging');
 if(!cancelled&&g.distance>=Math.min(180,exerciseSheet.clientHeight*.22)){
  exerciseSheet.classList.add('sheet-dismissed');$('exercise-overlay').classList.add('closing');
  exerciseSheet.style.transform=`translateY(${exerciseSheet.clientHeight}px)`;exerciseSheet.style.opacity='0';
  setTimeout(()=>{$('exercise-overlay').hidden=true;$('exercise-overlay').classList.remove('closing');exerciseSheet.hidden=true;exerciseSheet.style.transform='';exerciseSheet.style.opacity='';exerciseSheet.classList.remove('sheet-dismissed');$('summary').inert=false;document.querySelector(`[data-exercise="${activeExercise}"]`)?.focus()},220);
 }else{exerciseSheet.style.transform='';exerciseSheet.style.opacity=''}
}
exerciseSheet.addEventListener('pointerup',()=>finishSheetDrag());
exerciseSheet.addEventListener('pointercancel',()=>finishSheetDrag(true));

$('exercise-overlay').onclick=()=>{if(!editing)showSummary()};

function readHistory(){return state.history.filter(session=>session.exercises.some(e=>e.sets.some(s=>s.done))).slice().sort((a,b)=>b.date.localeCompare(a.date));}
function recordWorkout(){snapshot(state);try{persist()}catch{}return readHistory();}
let statsFilter=state.current.type,statsExpanded=false;
function renderStats(){
 const fullHistory=recordWorkout();
 const history=fullHistory.filter(w=>w.type===statsFilter);
 $('stats-filter').value=statsFilter;
 $('toggle-stats-details').textContent=statsExpanded?'Скрыть подробности':'Показать подробности';
 $('toggle-stats-details').setAttribute('aria-expanded',String(statsExpanded));
 $('stats-list').replaceChildren(...history.map((workout,wi)=>{
  const article=document.createElement('article');article.className='workout-stat-card';
  const all=workout.exercises.flatMap(e=>e.sets),done=all.filter(s=>s.done).length;
  const fraction=all.length?done/all.length:0,percent=Math.round(fraction*100);
  const header=document.createElement('header');
  const title=document.createElement('h2');title.textContent=new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/Moscow'}).format(new Date(workout.date+'T12:00:00Z')).replace(/ г\.$/,'');
  const caption=document.createElement('div');caption.className='progress-caption';
  const name=document.createElement('p');name.textContent=workout.subtitle+' '+(workout.type.endsWith('lower')?'низа':'верха');
  const number=document.createElement('span');number.textContent=percent+'%';caption.append(name,number);header.append(title,caption);
  const bar=document.createElement('div');bar.className=`progress-bar ${fraction===0?'empty':fraction===1?'full':''}`;
  bar.style.setProperty('--progress',fraction);bar.setAttribute('role','progressbar');bar.setAttribute('aria-label','Выполнено подходов');bar.setAttribute('aria-valuemin','0');bar.setAttribute('aria-valuemax',String(all.length));bar.setAttribute('aria-valuenow',String(done));
  bar.innerHTML='<span class="progress-fill"></span><i></i><span class="progress-remaining"></span>';
  const details=document.createElement('div');details.className='stat-details';details.id=`stat-details-${wi}`;details.inert=true;
  const inner=document.createElement('div');inner.className='stat-details-inner';
  workout.exercises.forEach((exercise,ei)=>{
   const completed=exercise.sets.map((s,i)=>({s,i})).filter(({s})=>s.done);
   if(!completed.length)return;
   const section=document.createElement('section');section.className='stat-exercise';
   const heading=document.createElement('h3');heading.textContent=exercise.name;section.append(heading);
   completed.forEach(({s,i})=>{
    const row=document.createElement('div');row.className='stat-set';
    const weight=document.createElement('span');weight.textContent=s.weight+'кг';
    const times=document.createElement('img');times.src='assets/stats-x.svg';times.width=20;times.height=20;times.alt='×';
    const reps=document.createElement('span');reps.textContent=s.reps+' раз';row.append(weight,times,reps);
    const previous=previousSet(fullHistory,workout,exercise.id,i);
    const change=comparisonNode(s,previous);if(change)row.append(change);
    section.append(row);
   });inner.append(section);
  });
  if(!inner.children.length){const empty=document.createElement('p');empty.className='stats-empty';empty.textContent='Пока нет выполненных подходов';inner.append(empty)}
  details.append(inner);
  const toggle=document.createElement('button');toggle.className='stats-button';toggle.textContent='Подробности';toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls',details.id);
  toggle.onclick=()=>{const expanded=toggle.getAttribute('aria-expanded')!=='true';toggle.setAttribute('aria-expanded',String(expanded));toggle.textContent=expanded?'Скрыть подробности':'Подробности';details.classList.toggle('expanded',expanded);details.inert=!expanded};
  const growth=document.createElement('div');growth.className='workout-growth';
  const comparison=compareWorkout(fullHistory,workout);
  if(!comparison){growth.textContent='Первая тренировка этого типа'}
  else if(comparison.delta===null){growth.textContent='Сравнение появится после завершения упражнений'}
  else{
   const result=document.createElement('span');result.textContent=formatDelta(comparison.delta);result.className=comparison.delta>.5?'positive':comparison.delta<-.5?'negative':'neutral';
   const label=document.createElement('span');label.textContent=`Изменение объёма · ${comparison.count} из ${comparison.total} упр.`;growth.append(result,label);
   growth.title='Среднее изменение объёма по одинаковым полностью выполненным упражнениям. Для собственного веса сравниваются повторения.';
  }
  toggle.onclick=()=>{
   const expanded=toggle.getAttribute('aria-expanded')!=='true';toggle.setAttribute('aria-expanded',String(expanded));toggle.textContent=expanded?'Скрыть подробности':'Подробности';details.classList.toggle('expanded',expanded);details.inert=!expanded;
   const all=[...$('stats-list').querySelectorAll('.stat-details')];statsExpanded=all.every(el=>el.classList.contains('expanded'));
   $('toggle-stats-details').textContent=statsExpanded?'Скрыть подробности':'Показать подробности';$('toggle-stats-details').setAttribute('aria-expanded',String(statsExpanded));
  };
  if(statsExpanded){details.classList.add('expanded');details.inert=false;toggle.textContent='Скрыть подробности';toggle.setAttribute('aria-expanded','true')}
  article.append(header,bar,growth,details,toggle);return article;
 }));
 if(!history.length){const empty=document.createElement('p');empty.className='stats-empty';empty.textContent='Пока нет тренировок этого типа';$('stats-list').append(empty)}
}
$('open-stats').onclick=()=>{syncDay();statsFilter=state.current.type;renderStats();$('summary').hidden=true;$('stats').hidden=false;$('stats').scrollTop=0};
$('close-stats').onclick=()=>{$('stats').hidden=true;$('summary').hidden=false};

let midnightTimer=0;
function scheduleMidnight(){
 clearTimeout(midnightTimer);
 const now=Date.now(),today=dateKey(new Date(now),program.timezone);
 let lo=now,hi=now+27*60*60*1000;
 while(hi-lo>100){const mid=Math.floor((lo+hi)/2);if(dateKey(new Date(mid),program.timezone)===today)lo=mid;else hi=mid}
 midnightTimer=setTimeout(()=>{syncDay();scheduleMidnight()},Math.max(100,hi-now+50));
}
function syncDay(){
 const today=dateKey(new Date(),program.timezone);
 if(today<=state.current.date)return false;
 // Capture the latest intended value before archiving, even during momentum.
 if(editing){paintWheel();sets[editing.index][editing.field]=draft;if(!sets[editing.index].reps)sets[editing.index].done=false}
 stopWheelMotion();cancelAnimationFrame(inertiaFrame);cancelAnimationFrame(wheelFrame);clearTimeout(settleTimer);clearTimeout(sheetTimer);
 editing=null;closing=false;sheetGesture=null;finishHomeDrag();
 for(const id of ['picker','backdrop','exercise','exercise-overlay']){const node=$(id);node.hidden=true;node.inert=false;node.classList.remove('closing','sheet-closing','sheet-dragging','sheet-dismissed');node.style.transform='';node.style.opacity=''}
 advanceDay(state,program,today);
 exercises=state.current.exercises;activeExercise=0;sets=exercises[0].sets;
 exerciseOrder.splice(0,exerciseOrder.length,...exercises.map((_,i)=>i));
 $('summary').inert=false;
 try{persist()}catch{notify('Не удалось сохранить в браузере')}
 render();if(!$('stats').hidden)renderStats();scheduleMidnight();return true;
}
window.addEventListener('pageshow',()=>syncDay());
window.addEventListener('focus',()=>syncDay());
document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncDay();else{if(editing){paintWheel();saveWheelDraft()}try{persist()}catch{}}});
window.addEventListener('pagehide',()=>{if(editing){paintWheel();saveWheelDraft()}try{persist()}catch{}});
document.addEventListener('pointerdown',event=>{if(syncDay()){event.preventDefault();event.stopImmediatePropagation()}},{capture:true});
scheduleMidnight();

$('stats-filter').replaceChildren(...program.sequence.map(type=>{
 const option=document.createElement('option');option.value=type;
 option.textContent=(type.startsWith('heavy')?'Тяжёлый':'Лёгкий')+' '+(type.endsWith('lower')?'низ':'верх');return option;
}));
$('stats-filter').onchange=()=>{statsFilter=$('stats-filter').value;statsExpanded=false;renderStats()};
$('toggle-stats-details').onclick=()=>{statsExpanded=!statsExpanded;renderStats()};
