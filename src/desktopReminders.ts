import { useCallback, useEffect, useRef, useState } from 'react'
import { desktop } from './platform'
import { patchTask, useTasks } from './store'
import { scheduleItems, upcomingTasks } from './reminderModel'
export interface DesktopSettings { closeToTray:boolean; startHidden:boolean; railCount:number; sound:boolean }
export interface ReminderItem {key:string;taskId:string;title:string;at:number;due:number;alarm:boolean}
export interface DesktopSnapshot {settings:DesktopSettings;autostart:boolean;active:ReminderItem[];pending:{key:string;taskId:string;scope:string}[]}
const defaults:DesktopSettings={closeToTray:true,startHidden:false,railCount:1,sound:true}
export async function nativeAction(action:string){const {invoke}=await import('@tauri-apps/api/core');await invoke('desktop_action',{action})}
export async function nativeSnapshot(){const {invoke}=await import('@tauri-apps/api/core');return invoke<DesktopSnapshot>('desktop_snapshot')}
export function useDesktopReminders(report:(m:string)=>void, quick:()=>void) {
  const state=useTasks(), current=useRef(state); current.current=state
  const [settings,setSettings]=useState<DesktopSettings>(defaults),[autostart,setAutostart]=useState(false)
  const [now,setNow]=useState(Date.now),queue=useRef(Promise.resolve()),applying=useRef(false)
  const refresh=useCallback(async()=>{
    const snapshot=await nativeSnapshot();setSettings(snapshot.settings);setAutostart(snapshot.autostart)
    if(applying.current || !current.current.ready)return
    applying.current=true
    try {for(const pending of snapshot.pending){if(pending.scope!==current.current.scope)continue;await patchTask(pending.taskId,t=>({...t,status:'done',waiting:false}),pending.scope);const {invoke}=await import('@tauri-apps/api/core');await invoke('reminder_complete_saved',{key:pending.key})}}
    finally{applying.current=false}
  },[])
  useEffect(()=>{
    if(!desktop)return
    let disposed=false;const releases:(()=>void)[]=[]
    void (async()=>{const {listen}=await import('@tauri-apps/api/event');for(const [event,handler] of [['dayweave-reminders-changed',()=>{void refresh().catch(e=>report(String(e)))}],['dayweave-quick-alarm',quick]] as const){const release=await listen(event,handler);if(disposed)release();else releases.push(release)}await refresh()})().catch(e=>report(String(e)))
    const timer=setInterval(()=>setNow(Date.now()),30000)
    const wake=()=>setNow(Date.now());window.addEventListener('focus',wake)
    return()=>{disposed=true;releases.forEach(fn=>fn());clearInterval(timer);window.removeEventListener('focus',wake)}
  },[report,quick,refresh])
  useEffect(()=>{
    if(!desktop)return
    const items=state.ready?scheduleItems(state.scope,state.records.map(r=>r.task)):[]
    queue.current=queue.current.then(async()=>{const {invoke}=await import('@tauri-apps/api/core');await invoke('reminders_sync',{scope:state.scope,items});await refresh()}).catch(e=>report('提醒计划未保存：'+String(e)))
  },[state.ready,state.scope,state.records,refresh,report])
  const update=async(next:DesktopSettings,start?:boolean)=>{
    if(desktop){const {invoke}=await import('@tauri-apps/api/core');await invoke('desktop_settings',{settings:next,autostart:start??null});await refresh()}
    else {setSettings(next);setAutostart(start??autostart)}
  }
  return {settings,autostart,update,upcoming:upcomingTasks(state.records.map(r=>r.task),settings.railCount,now)}
}
