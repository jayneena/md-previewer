// Windows 发布版隐藏控制台窗口
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// 应用入口 — 调用 lib.rs 中的 run() 启动 Tauri 应用
fn main() {
    md_previewer_lib::run()
}
