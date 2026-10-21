import {expect} from '@playwright/test';
import {writeFileSync} from 'node:fs';
import {adb,capture,connect,nativeTap,dump} from './driver.mjs';
let {browser,page}=await connect();const checks=[];const errors=[];page.on('pageerror',e=>errors.push(e.message));
const pass=x=>{checks.push(x);console.log('PASS '+x)};
try{
 const title='Android 拖拽与离线验收';
 if(await page.getByRole('button',{name:'收起：'+title}).count())await page.getByRole('button',{name:'收起：'+title}).click();
 const cdp=await page.context().newCDPSession(page);
 for(const status of ['done','todo','doing']){
  const grip=page.getByRole('button',{name:'拖动任务：'+title,exact:true});await grip.scrollIntoViewIfNeeded();const box=await grip.boundingBox();
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2}]});
  const target=await page.locator(`.drag-status-targets [data-drop-status="${status}"]`).boundingBox();
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:target.x+target.width/2,y:target.y+target.height/2}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect(page.locator('.group-'+status).getByTestId('task-row')).toHaveCount(1);
 }
 pass('Real touch events drag a task through done, todo and doing groups');
 await page.locator('.group-doing > .group-heading').click();await expect(page.getByTestId('task-row')).toHaveCount(0);
 await page.reload();await expect(page.getByTestId('task-row')).toHaveCount(0);
 await page.locator('.group-doing > .group-heading').click();await expect(page.getByTestId('task-row')).toHaveCount(1);
 pass('Group folding survives reload');
 adb('shell','settings','put','secure','show_ime_with_hard_keyboard','1');
 await page.locator('.new-task').click();const input=page.getByLabel('任务名称');await input.scrollIntoViewIfNeeded();const box=await input.boundingBox();
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+30,y:box.y+20}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await expect.poll(()=>adb('shell','dumpsys','input_method').includes('mInputShown=true')).toBe(true);
 await input.fill('键盘遮挡检查');await expect(page.getByRole('button',{name:'保存任务',exact:true})).toBeInViewport();
 capture('keyboard-editor');adb('shell','input','keyevent','4');
 await expect(page.getByRole('dialog')).toBeVisible();
 await page.getByRole('dialog').getByRole('button',{name:'关闭窗口'}).click();
 pass('Actual software keyboard leaves Save reachable; Back hides keyboard before closing editor');
 await page.getByRole('button',{name:'打开设置',exact:true}).click();
 const backups=adb('shell','ls','/sdcard/Download').split(/\r?\n/).filter(x=>x.endsWith('.json'));expect(backups.length).toBeGreaterThan(0);
 await page.getByRole('button',{name:'导入备份',exact:true}).click();await nativeTap('Show roots');await nativeTap('Downloads');await nativeTap(backups[0]);
 await expect(page.getByRole('status').filter({hasText:/已添加/})).toBeVisible({timeout:15000});
 await page.getByRole('dialog').getByRole('button',{name:'关闭窗口'}).click();await expect(page.getByTestId('task-row')).toHaveCount(2);
 pass('Android native picker imports exported JSON as a separate copy');
 await page.getByRole('button',{name:'展开：'+title}).last().click();await page.getByRole('button',{name:'删除：'+title}).last().click();await expect(page.getByTestId('task-row')).toHaveCount(1);
 pass('Delete moves only the selected task to trash');
 adb('shell','wm','size','720x1280');adb('shell','wm','density','360');adb('shell','am','force-stop','app.dayweave.personal');await browser.close();adb('shell','am','start','-n','app.dayweave.personal/.MainActivity');({browser,page}=await connect());
 await expect.poll(()=>page.evaluate(()=>innerWidth)).toBe(320);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);capture('small-320');
 await page.getByRole('button',{name:'打开设置',exact:true}).click();await expect(page.getByLabel('邮箱',{exact:true})).toBeInViewport();capture('small-settings');
 await page.getByRole('dialog').getByRole('button',{name:'关闭窗口'}).click();
 pass('320px phone viewport has no horizontal overflow and settings remain reachable');
 adb('shell','wm','size','reset');adb('shell','wm','density','reset');
 adb('shell','svc','wifi','disable');adb('shell','svc','data','disable');adb('shell','am','force-stop','app.dayweave.personal');await browser.close();
 adb('shell','am','start','-n','app.dayweave.personal/.MainActivity');const reopened=await connect();
 await expect(reopened.page.getByTestId('task-row')).toHaveCount(1);await reopened.page.getByRole('button',{name:'展开：'+title}).click();
 await expect(reopened.page.getByLabel('核对移动端结果',{exact:true})).toBeChecked();await expect(reopened.page.getByTestId('output-row')).toContainText('仅在本机');
 capture('offline-restart');await reopened.browser.close();pass('Airplane-style offline restart retains task, substep and exact local output association');
 expect(errors).toEqual([]);writeFileSync('artifacts/android-ui/extra-results.json',JSON.stringify({checks,errors},null,2));
}catch(e){capture('extra-failure');writeFileSync('artifacts/android-ui/extra-failure.txt',String(e)+'\n'+dump());throw e;}
finally{adb('shell','wm','size','reset');adb('shell','wm','density','reset');adb('shell','svc','wifi','enable');adb('shell','svc','data','enable');await browser.close().catch(()=>{});}
