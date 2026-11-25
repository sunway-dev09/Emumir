# Emumir

Aplikasi desktop Windows untuk mirror layar HP Android ke PC, lewat **USB** atau **WiFi** (wireless debugging).
Jendela mirror bisa dipakai seperti emulator: klik mouse jadi sentuhan, keyboard jadi input.

Memakai [scrcpy](https://github.com/Genymobile/scrcpy) lewat adb. Dibangun dengan Tauri v2:
backend Rust, antarmuka HTML/CSS/JS. Tidak perlu memasang app apa pun di HP.

## Fitur

- Mirror layar (video, opsional audio) lewat USB atau WiFi.
- Kontrol dari jendela mirror: mouse, keyboard (opsional UHID), scroll, clipboard, drag and drop file.
- Pairing dan koneksi nirkabel, deteksi otomatis HP yang Wireless debugging-nya ON.
- Beberapa device tersimpan.
- Mode Game: preset tombol keyboard ke sentuhan, ganti otomatis sesuai game.
- Setelan scrcpy: resolusi, FPS, bitrate, orientasi, crop, dan lainnya.

## Memulai

1. Jalankan Emumir di PC.
2. USB: aktifkan USB debugging di HP, sambungkan kabel, HP muncul di Beranda lalu klik **Mirror**.
3. WiFi: buka menu **Setup**, pair dengan kode dari Wireless debugging, lalu tambahkan device.

Persyaratan: Windows 10/11 dengan WebView2, HP Android dengan USB debugging atau Wireless debugging (Android 11+).

## Build dari source

Prasyarat: Node.js 18+, Rust (rustup), Microsoft C++ Build Tools, WebView2.

```powershell
# opsional: taruh adb.exe, AdbWinApi.dll, AdbWinUsbApi.dll di src-tauri/resources/platform-tools
npm install
npm run dev
npm run build
```

Kalau `platform-tools` kosong, aplikasi memakai `adb` dari `PATH`.

## Struktur proyek

```
src-tauri/
  src/main.rs       adb, klien scrcpy (video/audio/kontrol), UHID, clipboard, setelan, window
  src/gamemode.rs   deteksi app di depan dan penyimpanan preset Mode Game
  resources/        scrcpy-server.jar dan platform-tools
renderer/           Antarmuka (HTML/CSS/JS); tauri-shim.js menjembatani window.api ke Rust
.github/workflows/  Build Windows otomatis
```

## Lisensi dan atribusi

`scrcpy-server.jar` adalah server resmi scrcpy v4.1 milik Genymobile, berlisensi Apache 2.0
(lihat `src-tauri/resources/LICENSE-scrcpy.txt`).
