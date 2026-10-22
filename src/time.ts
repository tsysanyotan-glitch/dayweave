// Pure module shared by UI/model/API. Windows installs its network clock before
// importing the model or Auth SDK; server/other existing targets keep their clock.
const SystemDate = Date
let readTime = SystemDate.now.bind(SystemDate)
export function setClockSource(source: () => number) { readTime = source }
export function clockNow(): number { return readTime() }
export function clockDate(): Date { return new SystemDate(clockNow()) }
export function clockIso(): string { return clockDate().toISOString() }
