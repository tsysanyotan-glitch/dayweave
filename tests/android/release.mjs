// Run against the signed Release APK, without enabling WebView debugging.
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { adb, serial, dump, nativeTap, capture } from './driver.mjs'
if (!serial.startsWith('emulator-') || process.env.ANDROID_TEST_RESET !== '1') {
  throw new Error('仅在专用模拟器运行；确认清空其中的日序后设置 ANDROID_TEST_RESET=1。')
}
const checks = []
const pass = text => { checks.push(text); console.log('PASS ' + text) }
const back = () => adb('shell', 'input', 'keyevent', '4')
async function contains(text) {
  for (let i = 0; i < 5; i++) {
    if (dump().includes(text)) return
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw new Error('界面缺少：' + text)
}
try {
  mkdirSync('artifacts/android-ui', { recursive: true })
  writeFileSync('artifacts/dayweave-android-output.txt', 'DayWeave Android local file\n')
  adb('push', 'artifacts/dayweave-android-output.txt', '/sdcard/Download/dayweave-android-output.txt')
  adb('shell', 'pm', 'clear', 'app.dayweave.personal')
  adb('logcat', '-c')
  adb('shell', 'am', 'start', '-n', 'app.dayweave.personal/.MainActivity')
  await contains('新建任务')
  const pid = adb('shell', 'pidof', 'app.dayweave.personal').split(' ')[0]
  assert(!adb('shell', 'dumpsys', 'package', 'app.dayweave.personal').match(/pkgFlags=\[[^\]]*DEBUGGABLE/))
  // AOSP userdebug system images force WebView inspection on even when the app
  // explicitly disables it. On a production system also check the socket.
  if (adb('shell', 'getprop', 'ro.debuggable') !== '1') {
    assert(!adb('shell', 'cat', '/proc/net/unix').includes('@webview_devtools_remote_' + pid))
  }
  pass('Signed, minified Release starts and is not an Android debuggable application')
  await nativeTap('新建任务')
  await nativeTap('任务名称')
  adb('shell', 'input', 'text', 'Release_mobile_check')
  if (adb('shell', 'dumpsys', 'input_method').includes('mInputShown=true')) back()
  await nativeTap('保存任务')
  await contains('Release_mobile_check')
  pass('Release creates and saves a task using actual touch and keyboard')
  await nativeTap('展开：Release_mobile_check')
  await nativeTap('添加手机文件')
  await nativeTap('Show roots'); await nativeTap('Downloads'); await nativeTap('dayweave-android-output.txt')
  await contains('dayweave-android-output.txt')
  pass('Shrunk native file plugin opens system picker and attaches a local file')
  adb('shell', 'input', 'swipe', '540', '1800', '540', '600', '350')
  await nativeTap('打开本机')
  assert(adb('shell', 'dumpsys', 'activity', 'activities').includes('ChooserActivity'))
  back()
  await nativeTap('保存到手机')
  await nativeTap('Save')
  await contains('文件已保存')
  pass('Release shares a private file with the system viewer and exports a copy')
  await nativeTap('打开设置')
  await contains('邮箱验证码登录')
  back()
  await contains('新建任务')
  pass('Hardware Back closes settings while keeping the Release activity open')
  adb('shell', 'settings', 'put', 'system', 'user_rotation', '1')
  await contains('新建任务')
  capture('release-landscape')
  adb('shell', 'settings', 'put', 'system', 'user_rotation', '0')
  adb('shell', 'am', 'force-stop', 'app.dayweave.personal')
  adb('shell', 'am', 'start', '-n', 'app.dayweave.personal/.MainActivity')
  await contains('Release_mobile_check')
  pass('Release restores its task after process restart')
  back()
  for (let i = 0; i < 10; i++) {
    const activity = adb('shell', 'dumpsys', 'activity', 'activities')
    if (!/mResumedActivity:.*app\.dayweave\.personal/.test(activity)) break
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  assert(!/mResumedActivity:.*app\.dayweave\.personal/.test(adb('shell', 'dumpsys', 'activity', 'activities')))
  assert(!adb('logcat', '-d', '-b', 'crash').includes('app.dayweave.personal'))
  pass('Main-page Back exits normally and no app crash is recorded')
  writeFileSync('artifacts/android-ui/release-results.json', JSON.stringify({ checks, errors: [] }, null, 2))
} catch (error) {
  capture('release-failure')
  writeFileSync('artifacts/android-ui/release-failure.txt', String(error) + '\n' + dump())
  throw error
} finally {
  adb('shell', 'settings', 'put', 'system', 'user_rotation', '0')
}
