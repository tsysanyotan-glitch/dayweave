# 邮箱 6 位验证码

客户端使用 Supabase 的 `signInWithOtp` 发送邮件，使用 `verifyOtp({ email, token, type: 'email' })` 验证后建立会话。旧邮箱仍是原账号，不迁移或清空任务；新邮箱验证后创建账号。客户端不收集密码，不保存验证码，当前浏览器会话只记住发送邮箱与时间以保留重发倒计时。

## 托管项目配置

在 Authentication 中开启 Email Provider 和新账号注册，设置邮件验证码长度为 6，有效期为 600 秒。在 Email Templates 中把 **Magic Link** 和 **Confirm signup** 两份邮件模板改为 [email-otp.html](../supabase/templates/email-otp.html) 的内容，标题可填「日序登录验证码」。关键占位符是 `{{ .Token }}`。只改 Magic Link 会导致新邮箱首次登录仍收到确认链接。

2026-10-20，项目所有者已确认保存 6 位验证码和这两份模板。本轮没有管理 Auth 配置的访问凭据，未独立读取远端模板或验证真实收件箱投递；完成自动化验证不等于邮件到达率测试。

2026-06-03 之后创建的免费项目，如果使用 Supabase 默认 SMTP，可能无法定制邮件模板。遇到模板锁定时，需在 Auth 的 SMTP Settings 配置自己的邮件服务，或使用支持模板定制的项目方案。默认发信服务也有收件人和频率限制。不要把 SMTP 密码、数据库密码或管理令牌放进客户端。

官方资料：[Email OTP](https://supabase.com/docs/guides/auth/auth-email-passwordless)、[邮件模板](https://supabase.com/docs/guides/auth/auth-email-templates)、[免费项目模板政策](https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier)。

## 本地开发

`supabase/config.toml` 与模板已匹配 6 位、10 分钟、60 秒重发间隔，并开启邮箱确认。此文件用于本地开发；修改本地文件不会自动改变托管项目，也不要把整份默认配置直接推送到线上。

## 实际使用检查

1. 打开新版「设置与同步」，填写自己的邮箱，点击「获取验证码」。
2. 查看收件箱和垃圾邮件，填入邮件中的最新 6 位数字，点击「登录并同步」。前导零需保留。
3. 同一邮箱验证后显示原账号任务；需要时手动复制独立的离线任务。
4. 新邮箱首次使用也应收到数字验证码。错误或过期验证码不能登录，重发后使用最新邮件。
5. 关闭并重新打开设置后保留重发倒计时；成功登录后重新启动应用应保留账号，退出登录回到本机空间。

自动化检查拦截真实 SDK 的 HTTP 请求并返回测试响应，覆盖发送、错误验证码、前导零、会话持久化、退出、发送失败、倒计时和修改邮箱；不会发出真实邮件或访问测试邮箱。
