// Tauri 后端模块
// 提供文件读写命令、单实例处理、应用生命周期管理

use tauri::{Emitter, Manager};

#[cfg(not(mobile))]
use tauri_plugin_single_instance::init as single_instance_init;

// 允许打开的 Markdown 文件扩展名列表
const ALLOWED_EXTENSIONS: &[&str] = &["md", "markdown", "mdown", "mkd"];

// 校验文件路径是否为允许的 Markdown 扩展名
fn validate_markdown_path(path: &str) -> Result<(), String> {
    let ext = path
        .rsplit('.')
        .next()
        .map(|e| e.to_lowercase())
        .unwrap_or_default();
    if !ALLOWED_EXTENSIONS.contains(&ext.as_str()) {
        return Err(format!("不允许的文件类型: .{}", ext));
    }
    Ok(())
}

// 返回命令行参数中的文件路径（用于文件关联打开）
#[tauri::command]
fn get_file_arg() -> Option<String> {
    std::env::args().nth(1)
}

// 读取 Markdown 文件内容（UTF-8 文本）
#[tauri::command]
fn read_file_content(path: String) -> Result<String, String> {
    validate_markdown_path(&path)?;
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

// 写入文本内容到 Markdown 文件
#[tauri::command]
fn write_file_content(path: String, content: String) -> Result<(), String> {
    validate_markdown_path(&path)?;
    std::fs::write(&path, &content).map_err(|e| e.to_string())
}

// 写入二进制文件（用于保存 DOCX）
#[tauri::command]
fn write_binary_file(path: String, data: Vec<u8>) -> Result<(), String> {
    std::fs::write(&path, &data).map_err(|e| e.to_string())
}

// 读取二进制文件（用于读取 DOCX 模版）
#[tauri::command]
fn read_binary_file(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&path).map_err(|e| e.to_string())
}

// 应用入口 — 构建 Tauri 应用并运行
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(single_instance_init(|app, args, _cwd| {
            // 单实例：新实例启动时将文件路径发送给已有窗口
            if let Some(window) = app.get_webview_window("main") {
                let file_path = args.get(1).cloned().unwrap_or_default();
                if !file_path.is_empty() {
                    window.emit("single-instance", file_path).ok();
                }
                window.show().ok();
                window.set_focus().ok();
            }
        }))
        .invoke_handler(tauri::generate_handler![
            get_file_arg,
            read_file_content,
            write_file_content,
            write_binary_file,
            read_binary_file
        ])
        .setup(|app| {
            // 启动时如果有文件参数则最大化窗口
            if std::env::args().nth(1).is_some() {
                if let Some(window) = app.get_webview_window("main") {
                    window.maximize().ok();
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
