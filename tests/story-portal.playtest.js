// Chrome + an external Playwright installation; this visual test also imports the unbundled renderer.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createGameServer } from '../server.js';

const { chromium } = await import(process.env.MOONCLOCK_PLAYWRIGHT ? pathToFileURL(process.env.MOONCLOCK_PLAYWRIGHT).href : 'playwright');
const server = createGameServer({ hostname: '127.0.0.1', port: 0 });
const browser = await chromium.launch({ channel: 'chrome' });
const errors = [], out = '.audit/story-portal';
await mkdir(out, { recursive: true });
const ready = page => page.waitForFunction(() => window.__moonclock?.snapshot().phase === 'playing' && !window.__moonclock.transition().phase);
try {
  for (const [name, width, height, touch] of [['desktop',1280,800,false],['tablet',1194,834,true],['phone',667,375,true]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
    const page = await context.newPage(); page.setDefaultTimeout(20000);
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    try {
      await page.addInitScript(() => localStorage.setItem('moonclock-v1', JSON.stringify({sound:false,unlocked:4})));
      await page.goto(server.url.href); await page.getByTestId('start').click(); await ready(page);
      await page.waitForTimeout(1800); // Let the entry UI fade finish and show a complete first story line.
      const metrics = await page.evaluate(async () => {
        const { CONVERSATIONS } = await import('/dialogue.js');
        const root = document.querySelector('.character-dialogue'), body = root.querySelector('.dialogue-text');
        body.textContent = CONVERSATIONS.flat().map(line => line[1]).sort((a,b) => b.length-a.length)[0];
        root.style.opacity = '1';
        const box = root.getBoundingClientRect(), skip = root.querySelector('button').getBoundingClientRect();
        const hud = document.querySelector('.game-bottom').getBoundingClientRect();
        const hit = document.elementFromPoint(skip.x + skip.width/2, skip.y + skip.height/2);
        return { width:box.width,height:box.height, font:parseFloat(getComputedStyle(body).fontSize), right:box.right,
          bottom:box.bottom, hud:hud.toJSON(), skip:skip.toJSON(), reachable:root.querySelector('button').contains(hit) };
      });
      assert.equal(metrics.font, touch ? height < 560 ? 14 : 15 : 16);
      assert.ok(Math.abs(metrics.width - (touch ? Math.min(384,width*.44) : 420)) < 1);
      assert.ok(metrics.height >= (touch ? height < 560 ? 104 : 116 : 120));
      assert.ok(metrics.skip.height >= 44 && metrics.reachable);
      assert.ok(metrics.right + 6 < metrics.hud.x || metrics.bottom + 6 < metrics.hud.y, `${name}: dialogue overlaps HUD`);
      const clearHints = await page.evaluate(() => {
        const story=document.querySelector('.character-dialogue').getBoundingClientRect();
        return [...document.querySelectorAll('.task-hint:not([hidden])')].every(node=>{
          const r=node.getBoundingClientRect();
          return r.right<=story.left || r.left>=story.right || r.bottom<=story.top || r.top>=story.bottom;
        });
      });
      assert.ok(clearHints,`${name}: story hides a traveller's task hint`);
      await page.screenshot({ path:`${out}/${name}-dialogue.png` });
      await page.getByTestId('skip-dialogue').click();
      await page.locator('.shell [data-action="pause"]:visible').click();
      await page.getByTestId('level-2').click();
      await page.waitForFunction(() => window.__moonclock.presentation().arrivalKind === 'portal' && window.__moonclock.transition().phase === 'landing');
      await page.waitForTimeout(350);
      await page.screenshot({path:`${out}/${name}-portal-emergence.png`});
      await ready(page);
      const s = await page.evaluate(() => window.__moonclock.snapshot());
      assert.equal(s.seeds,2); assert.ok(s.objects.some(o => o.id === s.actors[1].carrying && o.kind === 'seed' && o.held === 1));
      console.log(`PASS ${name}: enlarged readable dialogue, usable Skip, separated HUD, portal emergence and opening hand seed`);

      if (name !== 'desktop') continue;
      await page.locator('.shell [data-action="pause"]:visible').click();
      await page.evaluate(async () => {
        const [{createRenderer},{setup},{S},{makeEnemy},{GROUNDS}] = await Promise.all([
          import('/render.js'),import('/src/logic.js'),import('/strings.js'),import('/src/enemies.js'),import('/themes.js')]);
        const surface = document.createElement('canvas'); surface.dataset.testid='visual-surface';
        Object.assign(surface.style,{position:'fixed',inset:'0',width:'1280px',height:'800px',zIndex:100000}); document.body.append(surface);
        const renderer = createRenderer(surface,S), state = setup({level:1});
        state.tick=4; state.objects=[]; state.pits=[];state.pickups=[];state.checkpoints=[];state.shards=[];
        state.actors.forEach(p => Object.assign(p,{x:50+p.id*50,y:520,invuln:1,carrying:null}));
        renderer.draw(state,0,{sceneKey:'visual',paused:true});
        const image = new Image(); image.src='/sprites/snail.png'; await image.decode();
        const source=document.createElement('canvas');source.width=image.width;source.height=image.height;source.getContext('2d').drawImage(image,0,0);
        window.visualTest={surface,renderer,state,setup,makeEnemy,GROUNDS,source};
      });
      await page.waitForLoadState('networkidle');
      const snail = await page.evaluate(() => {
        const {surface,renderer,state,makeEnemy,source}=window.visualTest, sourcePixels=source.getContext('2d').getImageData(0,0,source.width,source.height);
        const guard=makeEnemy('guard',{x:624,y:520,minX:624,maxX:624},'visual-guard');state.objects=[guard];
        const options={sceneKey:'visual',paused:true,reduced:false}, k=50/168; let checked=0,maxDifference=0,minSamples=Infinity,worst=null;
        for (const frozen of [false,true]) for(const dir of [-1,1]) for(let frame=0;frame<8;frame++) {
          Object.assign(guard,{x:624+frame*6,dir,frozen,chasing:true,attack:0,strikeSeq:0});renderer.draw(state,0,options);
          const c=renderer.inspect().camera, rect={x:Math.floor((guard.x-42)*c.scale+c.offsetX),y:Math.floor(450*c.scale+c.offsetY),w:86,h:75};
          const baseline=surface.getContext('2d').getImageData(rect.x,rect.y,rect.w,rect.h).data, samples=[];
          if(frame===2&&dir===-1&&!frozen)window.snailBaseline=new ImageData(new Uint8ClampedArray(baseline),rect.w,rect.h);
          // Clock-face interior only: the lower body is intentionally overlaid by the strike's dust.
          for(let sy=120;sy<=180;sy+=4)for(let sx=160;sx<=220;sx+=2){
            let opaque=true;
            for(const [dx,dy] of [-6,0,6].flatMap(dx=>[-6,0,6].map(dy=>[dx,dy]))) {
              const i=(((Math.floor(frame/4)*300+sy+dy)*source.width)+(frame%4*300+sx+dx))*4;
              if(sourcePixels.data[i+3]<250)opaque=false;
            }
            if(!opaque)continue;
            const px=Math.floor((guard.x+dir*(sx-128)*k)*c.scale+c.offsetX)-rect.x;
            const py=Math.floor((520+(sy-244)*k)*c.scale+c.offsetY)-rect.y;
            samples.push({i:(py*rect.w+px)*4,sx,sy,px,py});
          }
          minSamples=Math.min(minSamples,samples.length);
          for(let pose=0;pose<38;pose++){
            guard.attack=pose<30?pose:pose-30;guard.strikeSeq=pose<30?0:1;renderer.draw(state,0,options);
            const pixels=surface.getContext('2d').getImageData(rect.x,rect.y,rect.w,rect.h).data;
            if(frame===2&&dir===-1&&!frozen&&pose===16)window.snailAttack=new ImageData(new Uint8ClampedArray(pixels),rect.w,rect.h);
            for(const sample of samples)for(let channel=0;channel<3;channel++){
              const delta=Math.abs(baseline[sample.i+channel]-pixels[sample.i+channel]);
              if(delta>maxDifference){maxDifference=delta;worst={frame,dir,frozen,pose,sample,channel,before:baseline[sample.i+channel],after:pixels[sample.i+channel]};}
            }
            checked++;
          }
        }
        Object.assign(guard,{x:642,dir:1,frozen:true,attack:29,strikeSeq:0});renderer.draw(state,0,options);
        return {checked,maxDifference,minSamples,worst};
      });
      await page.evaluate(()=>{
        const c=document.createElement('canvas');c.width=172;c.height=75;c.dataset.testid='shell-comparison';
        c.getContext('2d').putImageData(window.snailBaseline,0,0);c.getContext('2d').putImageData(window.snailAttack,86,0);
        Object.assign(c.style,{position:'fixed',top:0,left:0,width:'688px',height:'300px',zIndex:200000,imageRendering:'pixelated'});document.body.append(c);
      });
      await page.getByTestId('shell-comparison').screenshot({path:`${out}/shell-comparison.png`});
      await page.getByTestId('shell-comparison').evaluate(c=>c.remove());
      // The source clock face is painted at alpha 253, so the moving head behind it can change a few levels.
      assert.ok(snail.minSamples > 8,JSON.stringify(snail)); assert.ok(snail.maxDifference <= 4,JSON.stringify(snail));
      await page.getByTestId('visual-surface').screenshot({path:`${out}/complete-shell-windup.png`});
      console.log(`PASS snail: protected shell pixels stable across ${snail.checked} frames, both directions and Freeze states`);

      const bridge = await page.evaluate(async () => {
        const {surface,renderer,setup,GROUNDS}=window.visualTest, s=setup(); s.tick=4;
        s.objects=[];s.pits=[];s.pickups=[];s.checkpoints=[];s.shards=[];
        s.actors.forEach(p=>Object.assign(p,{x:1530,y:470,invuln:1,carrying:null}));
        renderer.draw(s,0,{sceneKey:'bridge',paused:true,resetCamera:true});
        const img=new Image();img.src=GROUNDS.bridge.surface.src;await img.decode();
        const texture=document.createElement('canvas');texture.width=img.width;texture.height=img.height;texture.getContext('2d').drawImage(img,0,0);
        window.visualTest.bridge={s,texture};
      });
      await page.waitForLoadState('networkidle');
      const bridgePixels = await page.evaluate(() => {
        const {surface,renderer,GROUNDS,bridge:{s,texture}}=window.visualTest,g=GROUNDS.bridge.surface;
        const src=texture.getContext('2d').getImageData(0,0,texture.width,texture.height).data, samples=[];
        const shaftY=470-g.walk*g.scale+(g.legs[0]-g.y)*g.scale, course=(g.legs[1]-g.legs[0])*g.scale;
        for(let y=660;y<=674;y+=2)for(let x=840;x<1640;x+=2){
          const sx=Math.floor(g.x+(x-830)/g.scale),sy=Math.floor(g.legs[0]+((y-shaftY)%course)/g.scale);
          if([-3,0,3].flatMap(dx=>[-3,0,3].map(dy=>[dx,dy])).every(([dx,dy])=>src[((sy+dy)*texture.width+sx+dx)*4+3]>=250))samples.push([x,y]);
        }
        let first, maxDifference=0, checked=0;
        for(const rise of [0,15,30,45,60,75,90,75,60,30,0]){
          s.actors[0].y=470-rise;renderer.draw(s,0,{sceneKey:'bridge',paused:true,resetCamera:true});
          const c=renderer.inspect().camera, pixels=surface.getContext('2d').getImageData(0,0,surface.width,surface.height).data;
          const colors=samples.map(([x,y])=>{const i=(Math.floor(y*c.scale+c.offsetY)*surface.width+Math.floor(x*c.scale+c.offsetX))*4;return Array.from(pixels.slice(i,i+3));});
          if(!first)first=colors;else for(let i=0;i<colors.length;i++)for(let channel=0;channel<3;channel++)maxDifference=Math.max(maxDifference,Math.abs(colors[i][channel]-first[i][channel]));
          checked++;
        }
        s.actors[0].y=230;renderer.draw(s,0,{sceneKey:'bridge',paused:true,resetCamera:true});
        return {samples:samples.length,maxDifference,checked};
      });
      assert.ok(bridgePixels.samples>100,JSON.stringify(bridgePixels));assert.ok(bridgePixels.maxDifference<=4,JSON.stringify(bridgePixels));
      await page.getByTestId('visual-surface').screenshot({path:`${out}/bridge-high-camera.png`});
      console.log(`PASS bridge: ${bridgePixels.samples} opaque texture points retain world positions through ${bridgePixels.checked} camera heights`);

      const zoom = await page.evaluate(() => {
        const {surface,renderer,setup}=window.visualTest,s=setup({level:2});
        s.objects=[];s.actors.forEach((p,i)=>Object.assign(p,{x:s.exit.x+(i?20:-20),y:s.exit.y,carrying:null}));
        renderer.draw(s,0,{sceneKey:'exit',resetCamera:true,paused:true});const scale=renderer.inspect().camera.scale;let maximum=1,fullyVisible=true;
        for(let i=0;i<=100;i++){
          renderer.draw(s,0,{sceneKey:'exit',paused:true,celebration:{progress:i/100}});const c=renderer.inspect().camera;
          maximum=Math.max(maximum,c.scale/scale);
          fullyVisible&&=(s.exit.y-160)*c.scale+c.offsetY>=0 && s.exit.y*c.scale+c.offsetY<=800;
        }
        return {maximum,fullyVisible};
      });
      assert.ok(zoom.maximum<=1.150001&&zoom.maximum>=1.149);assert.ok(zoom.fullyVisible);
      await page.getByTestId('visual-surface').screenshot({path:`${out}/exit-moderate-zoom.png`});
      console.log('PASS exit: camera capped at 1.15 times normal scale, full arch remains visible');
    } finally {await context.close();}
  }
  assert.deepEqual(errors,[]);
} finally {await browser.close();server.stop();}
