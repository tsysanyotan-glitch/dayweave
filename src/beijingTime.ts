const formatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

export function beijingTime(now: Date) {
  const parts = formatter.formatToParts(now)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)!.value
  const year = part('year'), month = part('month'), day = part('day')
  const time = `${part('hour')}:${part('minute')}`, weekday = part('weekday')
  return {
    time, date: `${month}月${day}日`, shortDate: `${month}/${day}`, weekday,
    dateTime: `${year}-${month}-${day}T${time}:00+08:00`,
    label: `北京时间 ${year}年${month}月${day}日 ${weekday} ${time}`,
  }
}
