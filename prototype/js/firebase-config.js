/**
 * @file firebase-config.js
 * @summary Konfigurasi Firebase sisi klien dan konstanta lingkungan dasar.
 * 
 * Kontrak:
 * - window.FIREBASE_CONFIG: Objek konfigurasi klien Firebase. Dapat diakses publik;
 *   batasan akses data diamankan secara eksklusif lewat Firebase Security Rules.
 * - window.DEMO_URL: String hostname produksi ("bazar-q.vercel.app") yang digunakan sebagai
 *   basis URL saat membuat tautan QR code dari jaringan lokal/pengembangan privat.
 */

// Konfigurasi proyek Firebase (ganti jika menggunakan database Firebase sendiri).
window.FIREBASE_CONFIG = {
  apiKey:            "AIzaSyC3MG8vMBhGgtCpXajLxL51p4FDksG3NhQ",
  authDomain:        "bazarq-7adbe.firebaseapp.com",
  databaseURL:       "https://bazarq-7adbe-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:         "bazarq-7adbe",
  storageBucket:     "bazarq-7adbe.firebasestorage.app",
  messagingSenderId: "234836303189",
  appId:             "1:234836303189:web:6349e946f2b15cead963dc",
  measurementId:     "G-NDW0XT1NXY"
};

// URL produksi yang dipakai sebagai isi QR (QR = URL penuh halaman order booth).
window.DEMO_URL = "bazar-q.vercel.app";
