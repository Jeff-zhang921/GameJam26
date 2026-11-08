// Build first; Chrome and MOONCLOCK_PLAYWRIGHT pointing to an external Playwright index.mjs.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createGameServer } from '../server.js';

const {chromium}=await import(process.env.MOONCLOCK_PLAYWRIGHT?pathToFileURL(process.env.MOONCLOCK_PLAYWRIGHT).href:'playwright');
const server=createGameServer({production:true,hostname:'127.0.0.1',port:0,countdownMs:500});
const browser=await chromium.launch({channel:'chrome'}),errors=[],out='.audit/pause-restart';
await mkdir(out,{recursive:true});
const ready=page=>page.waitForFunction(()=>window.__moonclock?.snapshot().phase==='playing'&&!window.__moonclock.rewind()&&!window.__moonclock.transition().phase);
const phase=(page,value)=>page.waitForFunction(value=>document.querySelector('#modal-root').dataset.phase===value,value);
async function open(options){
  const context=await browser.newContext(options),page=await context.newPage();page.setDefaultTimeout(15000);
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.addInitScript(()=>{
    localStorage.setItem('moonclock-v1',JSON.stringify({sound:false,unlocked:4}));
    window.restartFrames=[];window.watchRestart=false;
    const sample=()=>{
      const g=window.__moonclock,root=document.querySelector('#modal-root');
      if(g&&root&&window.watchRestart){window.restartFrames.push({rewinding:!!g.rewind(),roomRewind:!!g.connection().room?.rewinding,phase:root.dataset.phase,children:root.childElementCount});}
      requestAnimationFrame(sample);
    };requestAnimationFrame(sample);
  });
  await page.goto(server.url.href);return{context,page};
}
const watch=page=>page.evaluate(()=>{window.restartFrames=[];window.watchRestart=true;});
async function closed(page,label){
  const state=await page.evaluate(()=>({phase:document.querySelector('#modal-root').dataset.phase,children:document.querySelector('#modal-root').childElementCount,rewind:!!window.__moonclock.rewind()}));
  await page.screenshot({path:`${out}/${label}.png`});
  assert.equal(state.children,0,`${label}: restart left a menu visible (${JSON.stringify(state)})`);
  assert.equal(state.phase,'null');
}
async function traceClean(page,label){
  const frames=await page.evaluate(()=>{window.watchRestart=false;return window.restartFrames.filter(f=>f.rewinding||f.roomRewind);});
  assert.ok(frames.length>20,`${label}: rewind was not traced`);
  assert.ok(frames.every(f=>f.children===0&&f.phase==='null'),`${label}: a paused snapshot reopened the menu: ${JSON.stringify(frames.find(f=>f.children||f.phase!=='null'))}`);
}
try{
  for(const [name,options] of [['desktop',{viewport:{width:1280,height:800}}],['touch',{viewport:{width:844,height:390},hasTouch:true,isMobile:true}]]){
    const {context,page}=await open(options);
    try{
      await page.getByTestId('start').click();await ready(page);
      await page.keyboard.down('ArrowRight');await page.waitForFunction(()=>window.__moonclock.snapshot().actors[0].x>210);await page.keyboard.up('ArrowRight');
      await page.getByTestId(name==='touch'?'touch-pause':'pause').click();await phase(page,'pause');
      await watch(page);await page.getByTestId('restart').click();
      await page.waitForFunction(()=>!!window.__moonclock.rewind());
      await closed(page,`${name}-rewinding`);await ready(page);await traceClean(page,name);
      await closed(page,`${name}-resumed`);
      const s=await page.evaluate(()=>window.__moonclock.snapshot());assert.equal(s.actors[0].x,s.actors[0].spawnX);assert.ok(s.actors.every(p=>p.move===0&&!p.jumpHeld));
      await page.getByTestId(name==='touch'?'touch-pause':'pause').click();await phase(page,'pause');await page.getByTestId('resume').click();await ready(page);
      console.log(`PASS ${name}: Restart removes Pause immediately, stays clear through rewind and resumes normally`);
    }finally{await context.close();}
  }
  const a=await open({viewport:{width:1280,height:800}}),b=await open({viewport:{width:844,height:390},hasTouch:true,isMobile:true}),host=a.page,guest=b.page;
  try{
    await host.getByTestId('create-room').click();await host.getByTestId('room-code').waitFor();const code=(await host.getByTestId('room-code').innerText()).trim();
    await guest.getByTestId('join-room').click();await guest.getByTestId('room-code-input').fill(code);await guest.getByTestId('join-room-submit').click();
    await host.getByTestId('character-still').click();await guest.getByTestId('character-bloom').click();
    await host.getByTestId('ready').click();await guest.getByTestId('ready').click();await host.getByTestId('start-game').click();await Promise.all([ready(host),ready(guest)]);
    await guest.getByTestId('touch-pause').click();await Promise.all([phase(host,'pause'),phase(guest,'pause')]);
    assert.ok(await guest.getByTestId('restart').isDisabled());
    await guest.locator('#modal-root [data-action="help"]').click();await phase(guest,'help');
    await host.getByTestId('restart').click();await phase(host,'confirm-restart');assert.equal(await host.getByTestId('resume').count(),0);
    await host.getByTestId('cancel-restart').click();await phase(host,'pause');
    await host.getByTestId('restart').click();await phase(host,'confirm-restart');
    await Promise.all([watch(host),watch(guest)]);await host.getByTestId('confirm-restart').click();
    await Promise.all([host.waitForFunction(()=>!!window.__moonclock.rewind()),guest.waitForFunction(()=>!!window.__moonclock.rewind())]);
    // More than ten periodic snapshots still carry the old paused world during this interval.
    await host.waitForTimeout(650);
    await closed(host,'host-rewinding');await closed(guest,'guest-rewinding');
    await Promise.all([ready(host),ready(guest)]);await Promise.all([traceClean(host,'host'),traceClean(guest,'guest')]);
    const room=server.rooms.rooms.get(code);assert.equal(room.game.status,'playing');assert.equal(room.manualPaused,false);
    assert.ok(room.game.actors.every(p=>p.move===0&&!p.jumpHeld));
    await closed(host,'host-resumed');await closed(guest,'guest-resumed');
    await guest.getByTestId('touch-pause').click();await Promise.all([phase(host,'pause'),phase(guest,'pause')]);
    await host.getByTestId('resume').click();await Promise.all([ready(host),ready(guest)]);
    console.log('PASS online: Restart closes both Pause/help menus, paused snapshots never reopen them, host confirmation and permissions remain intact');
  }finally{await a.context.close();await b.context.close();}
  assert.deepEqual(errors,[]);
}finally{await browser.close();server.stop();}
