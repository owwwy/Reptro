// Pure data operations: no DOM, timers, or storage side effects.
export const clone = value => JSON.parse(JSON.stringify(value));
export function dateKey(now,timezone='Europe/Moscow'){
 const p=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const get=type=>p.find(item=>item.type===type).value;
 return `${get('year')}-${get('month')}-${get('day')}`;
}
export function hasTraining(session){return session.exercises.some(e=>e.sets.some(s=>s.done));}
export function lastSameType(history,type,beforeDate){
 return history.filter(s=>s.type===type&&s.date<beforeDate&&hasTraining(s)).sort((a,b)=>b.date.localeCompare(a.date))[0]??null;
}
export function createSession(program,type,date,history){
 const template=program.types[type],previous=lastSameType(history,type,date);
 return {date,type,title:template.title,subtitle:template.subtitle,exercises:template.exercises.map(e=>{
  const old=previous?.exercises.find(item=>item.id===e.id);
  return {id:e.id,name:e.name,repRange:clone(e.repRange),sets:Array.from({length:e.sets},(_,i)=>{
   // Fall back to the last real set if the program adds another set.
   const prior=old?.sets[i]??old?.sets.at(-1);
   return {weight:prior?.weight??e.initialWeight,reps:prior?.reps??e.initialReps,done:false};
  })};
 })};
}
export function initialState(program,date){
 return {version:3,sequence:clone(program.sequence),current:createSession(program,program.initialType,date,[]),history:[]};
}
export function snapshot(state){
 const current=state.current;
 state.history=state.history.filter(item=>!(item.date===current.date&&item.type===current.type));
 if(hasTraining(current))state.history.push(clone(current));
 state.history.sort((a,b)=>b.date.localeCompare(a.date));
 return state;
}
export function advanceDay(state,program,today){
 if(today<=state.current.date)return false;
 const trained=hasTraining(state.current),oldType=state.current.type;
 snapshot(state);
 const sequence=state.sequence;
 const next=trained?sequence[(sequence.indexOf(oldType)+1)%sequence.length]:oldType;
 if(trained){state.current=createSession(program,next,today,state.history);}
 else{
  // Unfinished days retain drafts and order, never manufacture history.
  state.current.date=today;
 }
 return true;
}
export function isValidState(value,program){
 const validSet=s=>s&&Number.isFinite(s.weight)&&s.weight>=0&&s.weight<=1000&&Number.isInteger(s.reps)&&s.reps>=0&&s.reps<=999&&typeof s.done==='boolean';
 const validSession=s=>s&&/^\d{4}-\d{2}-\d{2}$/.test(s.date)&&program.types[s.type]&&Array.isArray(s.exercises)&&s.exercises.length>0&&s.exercises.every(e=>typeof e.id==='string'&&typeof e.name==='string'&&Array.isArray(e.sets)&&e.sets.length>0&&e.sets.every(validSet));
 return value?.version===3&&Array.isArray(value.sequence)&&value.sequence.length===program.sequence.length&&new Set(value.sequence).size===program.sequence.length&&value.sequence.every(t=>program.types[t])&&validSession(value.current)&&Array.isArray(value.history)&&value.history.every(validSession);
}
export function previousSet(history,session,exerciseId,index){
 const previous=lastSameType(history,session.type,session.date);
 return previous?.exercises.find(e=>e.id===exerciseId)?.sets[index]??null;
}

// Logged workload is not a measure of technique, effort, or physiological strength.
export function compareSet(current,previous){
 if(!previous?.done||current.reps<=0||previous.reps<=0)return null;
 if(current.weight===0&&previous.weight===0){
  const delta=(current.reps/previous.reps-1)*100;
  return {delta,metric:'reps',label:'повторения'};
 }
 if(current.weight>0&&previous.weight>0){
  const delta=(current.weight*current.reps/(previous.weight*previous.reps)-1)*100;
  return {delta,metric:'volume',label:'объём'};
 }
 return {delta:null,metric:'weight-change',weight:current.weight-previous.weight,label:'дополнительный вес'};
}
export function compareWorkout(history,session){
 const previous=lastSameType(history,session.type,session.date);
 if(!previous)return null;
 const comparisons=[];
 for(const exercise of session.exercises){
  const old=previous.exercises.find(e=>e.id===exercise.id);
  if(!old||old.sets.length!==exercise.sets.length||!exercise.sets.every(s=>s.done)||!old.sets.every(s=>s.done))continue;
  const pairs=exercise.sets.map((set,i)=>compareSet(set,old.sets[i]));
  if(pairs.some(p=>!p||p.metric==='weight-change')||new Set(pairs.map(p=>p.metric)).size!==1)continue;
  const metric=pairs[0].metric;
  const sum=sets=>sets.reduce((n,s)=>n+(metric==='reps'?s.reps:s.weight*s.reps),0);
  const before=sum(old.sets);if(before<=0)continue;
  comparisons.push({id:exercise.id,metric,delta:(sum(exercise.sets)/before-1)*100});
 }
 if(!comparisons.length)return {delta:null,count:0,total:session.exercises.length,date:previous.date};
 return {delta:comparisons.reduce((n,c)=>n+c.delta,0)/comparisons.length,count:comparisons.length,total:session.exercises.length,date:previous.date};
}
