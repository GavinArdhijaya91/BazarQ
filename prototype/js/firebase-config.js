/* ============================================================
   BazarQ · Firebase Configuration
   Client-side config — aman di-commit untuk demo publik.
   Firebase Security Rules yang melindungi data, bukan API key.
   ============================================================ */

// Ganti dengan config Firebase project kamu jika fork repo ini.
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

// URL demo yang ditampilkan di QR fullscreen — update setelah deploy Vercel.
window.DEMO_URL = "bazarq-7adbe.vercel.app";
