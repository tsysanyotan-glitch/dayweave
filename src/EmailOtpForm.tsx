import { useEffect, useState, type FormEvent } from 'react'
import { Mail } from 'lucide-react'
import { cloud } from './cloud'

const storageKey = 'dayweave-email-otp'
type Delivery = { email: string; sentAt: number; retryAt: number }
function rememberedDelivery(): Delivery | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(storageKey) || 'null') as Delivery | null
    return value && typeof value.email === 'string' && Number.isFinite(value.sentAt) && Number.isFinite(value.retryAt) && value.sentAt <= Date.now() && Date.now() - value.sentAt < 600000 ? value : null
  } catch { return null }
}
function authMessage(error: unknown) {
  const { code, status } = (error || {}) as { code?: string; status?: number }
  if (code === 'otp_expired' || code === 'access_denied') return '验证码不正确或已过期，请检查邮件中的最新验证码，或重新发送。'
  if (status === 429 || code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit') return '发送过于频繁，请稍后再试。'
  if (code === 'email_address_not_authorized') return '邮件暂时无法发送到此邮箱，请检查云端邮件服务设置。'
  if (code === 'signup_disabled') return '此邮箱还没有账号，云端暂未开放新账号注册。'
  if (code === 'email_address_invalid' || code === 'validation_failed') return '请检查邮箱地址或输入的验证码。'
  return '暂时无法完成登录，请检查网络或稍后重试。'
}

export function EmailOtpForm() {
  const [delivery, setDelivery] = useState(rememberedDelivery)
  const [email, setEmail] = useState(() => rememberedDelivery()?.email || '')
  const [code, setCode] = useState('')
  const [retryAt, setRetryAt] = useState(() => rememberedDelivery()?.retryAt || 0)
  const [now, setNow] = useState(Date.now)
  const [busy, setBusy] = useState<'send' | 'verify' | null>(null)
  const [error, setError] = useState('')
  const remaining = Math.max(0, Math.ceil((retryAt - now) / 1000))
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [])
  const send = async (event?: FormEvent) => {
    event?.preventDefault()
    if (!cloud || busy || Date.now() < retryAt) return
    const address = (delivery?.email || email).trim().toLowerCase()
    setBusy('send'); setError('')
    try {
      const { error } = await cloud.auth.signInWithOtp({ email: address, options: { shouldCreateUser: true } })
      if (error) throw error
      const sentAt = Date.now()
      const next = { email: address, sentAt, retryAt: sentAt + 60000 }
      setDelivery(next); setEmail(address); setRetryAt(next.retryAt); setNow(sentAt); setCode('')
      try { sessionStorage.setItem(storageKey, JSON.stringify(next)) } catch { /* Login also works without session storage. */ }
    } catch (error) {
      if ((error as { status?: number })?.status === 429) { setRetryAt(Date.now() + 60000); setNow(Date.now()) }
      setError(authMessage(error))
    } finally { setBusy(null) }
  }
  const verify = async (event: FormEvent) => {
    event.preventDefault()
    if (!cloud || busy || !delivery || !/^\d{6}$/.test(code)) return
    setBusy('verify'); setError('')
    try {
      const { data, error } = await cloud.auth.verifyOtp({ email: delivery.email, token: code, type: 'email' })
      if (error) throw error
      if (!data.session) throw new Error('Session missing')
      try { sessionStorage.removeItem(storageKey) } catch { /* No stored OTP is required. */ }
      setCode('')
    } catch (error) { setError(authMessage(error)) }
    finally { setBusy(null) }
  }
  return <div className="auth-form otp-form">
    <div className="otp-intro"><Mail size={18} /><div><strong>邮箱验证码登录</strong><small>免密码，新邮箱验证后自动创建账号。</small></div></div>
    {!delivery ? <form onSubmit={send}>
      <label>邮箱<input type="email" autoComplete="email" required maxLength={254} placeholder="you@example.com" value={email} onChange={e => { const value = e.target.value; setEmail(value); const previous = rememberedDelivery(); setRetryAt(previous?.email === value.trim().toLowerCase() ? previous.retryAt : 0) }} /></label>
      <button className="button primary" disabled={!!busy || remaining > 0}>{busy === 'send' ? '正在发送…' : remaining ? `${remaining} 秒后可发送` : '获取验证码'}</button>
    </form> : <form onSubmit={verify}>
      <p className="otp-delivery" role="status">验证码已发送至 <strong>{delivery.email}</strong><br />请查看收件箱或垃圾邮件，输入最新的 6 位验证码。</p>
      <label>6 位验证码<input key={delivery.sentAt} autoFocus className="otp-code" type="text" inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{6}" maxLength={6} placeholder="000000" value={code} onChange={e => setCode(e.target.value.normalize('NFKC').replace(/\D/g, '').slice(0, 6))} /></label>
      <button className="button primary" disabled={!!busy || code.length !== 6}>{busy === 'verify' ? '正在验证…' : '登录并同步'}</button>
      <div className="otp-actions"><button type="button" disabled={!!busy || remaining > 0} onClick={() => void send()}>{busy === 'send' ? '正在发送…' : remaining ? `${remaining} 秒后重发` : '重新发送验证码'}</button><button type="button" disabled={!!busy} onClick={() => { setDelivery(null); setCode(''); setError('') }}>修改邮箱</button></div>
    </form>}
    {error && <p className="error" role="alert">{error}</p>}
    <small>登录后展示账号专属任务；本机离线任务可手动复制。</small>
  </div>
}
