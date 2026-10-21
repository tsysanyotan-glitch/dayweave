# Android 客户端

Android、Windows 和网页共用任务模型、离线保存和账号同步逻辑。手机沿用 [编码前生成的设计图](design/dayweave-v3-mobile.png)，界面随竖屏、横屏、分屏和小屏尺寸调整。

## 安装与使用

将正式签名 APK 传到手机，允许当前文件管理器安装此应用，然后打开「日序」。首次打开无需登录即可记录；「设置与同步」中用邮箱 6 位验证码登录同一账号，手机与电脑便可同步账号中的任务。本机离线任务可通过设置里的按钮复制到账号。

当前构建包含 ARM64 和 x86_64，最低 Android 7.0。请保持 Android System WebView 更新。尚未适配 32 位 ARM 手机，也未发布应用商店。

- 返回键先关闭任务编辑或设置弹窗，再关闭侧栏或回到今天；在主页面返回会正常退出。
- 拖动任务左侧把手可跨状态移动；也可展开任务，通过状态选择器修改。
- 软件键盘出现时，弹窗限制在可见区域内，可以继续滚动到保存按钮。
- Android 不显示桌面窗口的置顶、缩放和关闭按钮。

## 手机文件

「添加手机文件」打开系统文档选择器，所选文件复制到应用私有目录，单个最多 25 MB。只同步附件名称等信息，内容不会自动上传。手机无需获取整个存储空间的访问权限。

「打开本机」交给手机上相应的文档应用；「保存到手机」通过系统保存面板另存到自己选择的位置。卸载日序会删除应用内的副本，需长期保存的文档请另存或备份。原来选择的文件不受影响。

电脑项目文件夹请在 Windows 端确认上传 ZIP 副本。手机登录同一账号后可下载、打开或另存；改回仅本机时先保留本机副本再移除云端内容。JSON 任务备份不包含附件内容。

## 从源码构建

需要 Node.js 24、Rust stable、JDK 21、Android SDK Platform 36 / Build Tools 36 / Platform Tools，以及 Android NDK 28.2 或更新版本。安装 Rust 的 `aarch64-linux-android` 和 `x86_64-linux-android` 目标。

```powershell
npm ci
Copy-Item .env.example .env.local
# .env.local 仅填写 Supabase URL 与 publishable key
npm run android:build
```

Android 工程已提交，不必重新运行 `tauri android init`。重新初始化会覆盖定制的系统返回、文件查看、安全区域和构建配置。Gradle 固定为 8.14.3，Android Gradle Plugin 固定为 8.13.0。

Windows 构建脚本默认将 Rust 临时文件放到 `%LOCALAPPDATA%/DayWeaveBuild/android`，规避 NDK 对中文路径的处理问题。若 Windows 拒绝创建原生库的符号链接，脚本只在确认 Rust 编译成功且错误恰好是链接权限时复制编译产物，然后交给 Gradle 打包。其他编译错误仍直接终止。Gradle 使用 `--no-daemon`，Kotlin 编译也不保留后台进程。

输出：`src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk`。

### 正式签名

本机签名密钥保存在用户目录 `.dayweave/signing/`，不提交 GitHub。请妥善备份此目录，后续升级须使用同一密钥。

其他开发机需自行创建密钥，并在 `src-tauri/gen/android/keystore.properties` 配置 `storeFile`、`keyAlias`、`password`。密钥文件和配置均被 Git 忽略；未配置时生成未签名 Release，不能直接安装。

### 验证

```powershell
npm test
npm run test:e2e
# 生成可调试的模拟器安装包
powershell -NoProfile -File scripts/android.ps1 -Debug -Targets x86_64
# 安装到专用模拟器后运行原生界面回归（会清空其中的日序数据）
$env:ANDROID_SERIAL = 'emulator-5554'
$env:ANDROID_TEST_RESET = '1'
npm run android:test
# 已安装正式签名 APK 时，验证压缩后的原生交互（同样清空专用模拟器数据）
node tests/android/release.mjs
```

网页的手机模拟测试与实际 Android 安装测试是不同层次。实际验证范围和截图见 [Android 验证记录](verification-android.md)。

原生测试使用已启动的专用 Android 模拟器，需要 ADB 可连接并已安装 Debug APK。脚本检查真实 WebView、系统文件面板、触摸拖拽、软键盘、窄屏和断网重启，截图与结果写入 `artifacts/android-ui/`。云同步需要另行使用隔离测试账号验证；测试脚本不保存账号或云端凭证。

Release 工程保留 Android 标准压缩规则，避免插件所用 Jackson 枚举反射被移除；正式包也要实际安装测试，不能仅以 Debug 测试代替。应用明确按构建类型开关 WebView 调试；AOSP userdebug 模拟器系统可能强制开放 WebView 检查，脚本仍核对正式包没有 `DEBUGGABLE` 标志。
