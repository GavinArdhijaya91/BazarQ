// BazarQ · tool daftar booth terdesentralisasi (tanpa server sendiri).
// Cara pakai:
//   node backend/tools/create-booth.mjs --name "Kopi Rame" --pin 1234
// Menulis ke Firebase RTDB via REST API publik (butuh rules backend/database.rules.json).
// Output: slug + link order + link merchant yang bisa langsung dijadikan QR.

const DB = process.env.BAZARQ_DB_URL || 'https://bazarq-7adbe-default-rtdb.asia-southeast1.firebasedatabase.app';
const APP = process.env.BAZARQ_APP_URL || 'https://bazar-q.vercel.app';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--')) {
      const k = cur.slice(2);
      const v = arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true';
      acc.push([k, v]);
    }
    return acc;
  }, [])
);

function slugify(s) {
  return String(s || 'booth')
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'booth';
}

const name = args.name || 'Booth Demo';
const pin = String(args.pin || '1234').slice(0, 6);
if (!/^\d{4,6}$/.test(pin)) throw new Error('PIN harus 4-6 digit angka');
const { createHash } = await import('node:crypto');
const pinHash = createHash('sha256').update(pin).digest('hex');
const base = slugify(name);
const slug = `${base}-${Date.now().toString(36)}`;

const booth = {
  profile: { name, desc: String(args.desc || 'Booth UMKM BazarQ').slice(0, 80), pinHash, qrisImageUrl: '', createdAt: Date.now() },
  menu: [
    { id: 'm1', name: 'Menu Andalan 1', desc: 'Deskripsi singkat', price: 15000, active: true, icon: 'geprek' },
    { id: 'm2', name: 'Menu Andalan 2', desc: 'Deskripsi singkat', price: 10000, active: true, icon: 'paket' },
    { id: 'm3', name: 'Minuman Segar', desc: 'Deskripsi singkat', price: 5000, active: true, icon: 'esteh' }
  ],
  seq: 0, kitchenFull: false, orders: [], log: [{ at: Date.now(), type: 'ok', text: `Booth ${name} dibuat via tool.` }]
};

async function put(path, data) {
  const res = await fetch(`${DB}${path}.json`, { method: 'PUT', body: JSON.stringify(data) });
  if (!res.ok) throw new Error(`PUT ${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}

await put(`/bazarq/v2/registry/${slug}`, { name, createdAt: Date.now() });
await put(`/bazarq/v2/booths/${slug}`, booth);

console.log('\nBazarQ booth created ✔');
console.log('slug     :', slug);
console.log('order QR :', `${APP}/#pembeli/${slug}`);
console.log('merchant :', `${APP}/#merchant/${slug}`);
console.log('ticket   :', `${APP}/#tiket/<id>?booth=${slug}`);
console.log('\nCetak QR dari link order QR di atas (mis. via qrcode-monkey.com) lalu tempel di standee.\n');
