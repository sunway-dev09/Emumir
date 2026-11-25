// Emumir - Mode Game: deteksi app yang tampil di HP (lewat adb) dan simpan preset tombol.
//
// Dipakai window mirror untuk ganti preset otomatis sesuai game yang sedang dibuka.

use regex::Regex;
use serde_json::{json, Value};
use tauri::{AppHandle, State};

use super::{read_json, run_cmd, write_json, AppState};

fn ok_serial(s: &str) -> bool {
    !s.is_empty()
        && s.len() < 80
        && s.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | ':' | '-' | '_'))
}

// Cari package app yang sedang tampil di layar HP (untuk Mode Game: otomatis ganti preset).
// Baca mCurrentFocus/mFocusedApp dari `dumpsys window`; kalau kosong coba activity yang resumed.
fn parse_fg_pkg(out: &str) -> Option<String> {
    let re = Regex::new(r"\s([A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+)/").ok()?;
    let pick_from = |filter: &dyn Fn(&str) -> bool| -> Option<String> {
        for line in out.lines().filter(|l| filter(l)) {
            if let Some(c) = re.captures(line) {
                return Some(c[1].to_string());
            }
        }
        None
    };
    pick_from(&|l| l.contains("mCurrentFocus"))
        .or_else(|| pick_from(&|l| l.contains("mFocusedApp") || l.contains("ResumedActivity")))
}

#[tauri::command]
pub async fn phone_foreground(app: AppHandle, serial: String) -> Value {
    if !ok_serial(&serial) {
        return json!({ "ok": false, "err": "HP tidak valid" });
    }
    let r = run_cmd(
        &app,
        args!["-s", &serial, "shell", "dumpsys window | grep -E 'mCurrentFocus|mFocusedApp'"],
    )
    .await;
    if !r.ok && r.out.trim().is_empty() {
        return json!({ "ok": false, "err": "adb gagal" });
    }
    let mut pkg = parse_fg_pkg(&r.out);
    if pkg.is_none() {
        let r2 = run_cmd(
            &app,
            args!["-s", &serial, "shell", "dumpsys activity activities | grep -E 'topResumedActivity|mResumedActivity'"],
        )
        .await;
        pkg = parse_fg_pkg(&r2.out);
    }
    match pkg {
        Some(p) => json!({ "ok": true, "pkg": p }),
        None => json!({ "ok": true, "pkg": "" }),
    }
}

// Preset Mode Game disimpan sebagai berkas JSON di folder data app.
#[tauri::command]
pub fn gm_presets_get(st: State<'_, AppState>) -> Value {
    read_json(&st.data_dir.join("gamemode.json"), Value::Null)
}

#[tauri::command]
pub fn gm_presets_set(st: State<'_, AppState>, data: Value) {
    write_json(&st.data_dir.join("gamemode.json"), &data);
}
