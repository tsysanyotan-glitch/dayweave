import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';
export const serial=process.env.ANDROID_SERIAL ?? 'emulator-5554';
const adbPath=(process.env.ANDROID_HOME ?? process.env.LOCALAPPDATA+'/Android/Sdk')+'/platform-tools/adb.exe';
export const adb=(...args)=>execFileSync(adbPath,['-s',serial,...args],{encoding:'utf8'}).trim();
export const capture=name=>{dump();mkdirSync('artifacts/android-ui',{recursive:true});writeFileSync('artifacts/android-ui/'+name+'.png',execFileSync(adbPath,['-s',serial,'exec-out','screencap','-p']));};
export async function connect(attempt=0){
 let browser;
 for(let i=0;i<20;i++)try{
 const pid=adb('shell','pidof','app.dayweave.personal').split(' ')[0];
 const socket='webview_devtools_remote_'+pid;
 if(!adb('shell','cat','/proc/net/unix').includes('@'+socket))throw Error('WebView starting');
 adb('forward','tcp:9231','localabstract:'+socket);
 const targets=await fetch('http://127.0.0.1:9231/json/list',{signal:AbortSignal.timeout(5000)}).then(r=>r.json());
 if(!targets.some(t=>t.type==='page' && t.url!=='about:blank'))throw Error('App target starting');
 browser=await chromium.connectOverCDP('http://127.0.0.1:9231',{noDefaults:true,isWebView:true,timeout:5000});break;
 }catch(e){if(i===19)throw e;await new Promise(r=>setTimeout(r,500));}
 const context=browser.contexts()[0];
 let page=context.pages().find(p=>!p.url().includes('devtools'));
 if(!page)try{page=await context.waitForEvent('page',{timeout:5000});}catch(e){await browser.close();if(attempt>=3)throw e;await new Promise(r=>setTimeout(r,1000));return connect(attempt+1);}
 await expect(page.locator('.new-task')).toBeEnabled({timeout:30000});return{browser,page};
}
export function dump(){adb('shell','uiautomator','dump','/sdcard/dayweave-window.xml');return adb('shell','cat','/sdcard/dayweave-window.xml');}
export async function nativeTap(text){for(let i=0;i<5;i++){const xml=dump();const nodes=[...xml.matchAll(/<node\b[^>]*>/g)].map(m=>m[0]);const node=nodes.findLast(n=>n.includes('enabled="true"')&&(n.toLowerCase().includes('text="'+text.toLowerCase()+'"')||n.toLowerCase().includes('content-desc="'+text.toLowerCase()+'"')));if(!node){if(i===4)throw Error('Native control not found: '+text);await new Promise(r=>setTimeout(r,500));continue;}const b=node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/).slice(1).map(Number);adb('shell','input','tap',String(Math.round((b[0]+b[2])/2)),String(Math.round((b[1]+b[3])/2)));await new Promise(r=>setTimeout(r,500));return;}}
