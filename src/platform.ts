/** Native file access is shared; desktop window controls are desktop-only. */
export const native = '__TAURI_INTERNALS__' in window
export const android = native && /Android/i.test(navigator.userAgent)
export const desktop = native && !android
