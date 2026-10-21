// Destructive setup is restricted to an explicitly selected, disposable emulator.
import {execFileSync} from 'node:child_process'
import {mkdirSync,writeFileSync} from 'node:fs'
import {adb,serial} from './driver.mjs'
if(!serial.startsWith('emulator-') || process.env.ANDROID_TEST_RESET!=='1') {
  throw new Error('仅在专用模拟器运行；确认清空该模拟器中的日序后，设置 ANDROID_TEST_RESET=1。')
}
mkdirSync('artifacts/android-ui',{recursive:true})
writeFileSync('artifacts/dayweave-android-output.txt','DayWeave Android local file\n')
adb('shell','pm','clear','app.dayweave.personal')
adb('push','artifacts/dayweave-android-output.txt','/sdcard/Download/dayweave-android-output.txt')
adb('shell','am','start','-n','app.dayweave.personal/.MainActivity')
for(const script of ['tasks','details']) {
  execFileSync(process.execPath,[`tests/android/${script}.mjs`],{stdio:'inherit',env:process.env})
}
