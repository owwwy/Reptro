import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as engine from './workout-engine.js';
const program=JSON.parse(await readFile(new URL('./workout-program.json',import.meta.url),'utf8'));
const first=engine.initialState(program,'2026-10-22');
assert.equal(first.current.type,'heavy-lower');
assert.equal(first.current.exercises.reduce((n,e)=>n+e.sets.length,0),22);
assert.equal(engine.createSession(program,'heavy-upper','2026-10-22',[]).exercises.reduce((n,e)=>n+e.sets.length,0),23);
assert.equal(first.history.length,0);
assert(first.current.exercises.every(e=>e.sets.every(s=>!s.done)));
assert.equal(engine.previousSet(first.history,first.current,'vertical-pull',0),null);
const skipped=engine.clone(first);
skipped.current.exercises[0].sets[0].weight=55;
engine.advanceDay(skipped,program,'2026-10-29');
assert.equal(skipped.current.type,'heavy-lower');
assert.equal(skipped.current.exercises[0].sets[0].weight,55);
assert.equal(skipped.history.length,0);
const cycle=engine.clone(first),types=[];
for(let day=22;day<26;day++){
 cycle.current.exercises[0].sets[0]={weight:day===22?72.5:30,reps:7,done:true};
 engine.advanceDay(cycle,program,`2026-10-${day+1}`);
 types.push(cycle.current.type);
}
assert.deepEqual(types,['heavy-upper','light-lower','light-upper','heavy-lower']);
assert.deepEqual(cycle.current.exercises[0].sets[0],{weight:72.5,reps:7,done:false});
assert.equal(cycle.history.length,4);
assert.equal(engine.previousSet(cycle.history,cycle.current,'vertical-pull',0).weight,72.5);
assert.equal(engine.dateKey(new Date('2026-10-22T20:59:59Z'),'Europe/Moscow'),'2026-10-22');
assert.equal(engine.dateKey(new Date('2026-10-22T21:00:00Z'),'Europe/Moscow'),'2026-10-23');
const unchanged=engine.clone(cycle);
assert.equal(engine.advanceDay(cycle,program,cycle.current.date),false);
assert.deepEqual(cycle,unchanged);
// A long gap after an actual workout advances just once, never fabricating intervening days.
const gap=engine.clone(first);gap.current.exercises[0].sets[0].done=true;
engine.advanceDay(gap,program,'2026-11-15');
assert.equal(gap.current.type,'heavy-upper');assert.equal(gap.history.length,1);
// Unmarking the final set removes today's real-history entry and cancels advancement.
const unmarked=engine.clone(first);unmarked.current.exercises[0].sets[0].done=true;
engine.snapshot(unmarked);engine.snapshot(unmarked);assert.equal(unmarked.history.length,1);
unmarked.current.exercises[0].sets[0].done=false;engine.snapshot(unmarked);
assert.equal(unmarked.history.length,0);engine.advanceDay(unmarked,program,'2026-10-23');assert.equal(unmarked.current.type,'heavy-lower');
assert(engine.isValidState(cycle,program));
console.log('Schedule, skipped days, midnight, autosave snapshots, seed exclusion and same-type carryover: passed');

// Workload deltas are independent from completion, and have no fabricated zero denominator.
assert(Math.abs(engine.compareSet({weight:50,reps:12},{weight:50,reps:10,done:true}).delta-20)<.001);
assert.equal(engine.compareSet({weight:0,reps:15},{weight:0,reps:10,done:true}).delta,50);
assert.equal(engine.compareSet({weight:5,reps:10},{weight:0,reps:10,done:true}).delta,null);
assert.equal(engine.compareSet({weight:50,reps:10},{weight:50,reps:10,done:false}),null);
const metricCurrent=engine.initialState(program,'2026-10-22').current;
const metricOld=engine.clone(metricCurrent);metricOld.date='2026-10-15';
metricOld.exercises[0].sets.forEach(s=>Object.assign(s,{weight:50,reps:10,done:true}));
metricCurrent.exercises[0].sets.forEach(s=>Object.assign(s,{weight:50,reps:12,done:true}));
assert.equal(engine.compareWorkout([metricOld],metricCurrent).count,1);
assert(Math.abs(engine.compareWorkout([metricOld],metricCurrent).delta-20)<.001);
metricCurrent.exercises[0].sets[0].done=false;
assert.equal(engine.compareWorkout([metricOld],metricCurrent).count,0);
metricOld.type='light-lower';assert.equal(engine.compareWorkout([metricOld],metricCurrent),null);
console.log('Comparison metrics, bodyweight, zero baseline, comparable full exercises: passed');
