import fs from 'fs';

const root = 'src/i18n/locales';
const langs = fs.readdirSync(root);
const flat = (o, p = '') =>
  Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? flat(v, p + k + '.') : [p + k]));

const nsList = new Set(langs.flatMap((l) => fs.readdirSync(`${root}/${l}`)));
let bad = 0;

for (const ns of nsList) {
  const keys = {};
  for (const l of langs) {
    const f = `${root}/${l}/${ns}`;
    if (!fs.existsSync(f)) { console.log(`MISSING FILE  ${l}/${ns}`); bad++; continue; }
    keys[l] = new Set(flat(JSON.parse(fs.readFileSync(f, 'utf8'))));
  }
  const all = new Set(Object.values(keys).flatMap((s) => [...s]));
  for (const l in keys) {
    for (const k of all) {
      if (!keys[l].has(k)) { console.log(`${l}/${ns}: missing key "${k}"`); bad++; }
    }
  }
}

console.log(bad ? `\n${bad} problem(s) found` : 'i18n OK: all languages match');
process.exit(bad ? 1 : 0);