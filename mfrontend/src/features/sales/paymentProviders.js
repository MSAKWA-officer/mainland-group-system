// Benki na mitandao ya simu inayochaguliwa wakati wa malipo (Cash sales).
// Hakuna safu mpya kwenye database: jina la benki/mtandao linahifadhiwa mwanzoni mwa "reference" kama "CRDB | 1234567".
// Mfano: BANK / CARD -> orodha ya benki, MOBILE_MONEY -> orodha ya mitandao ya simu.
export const OTHER = '__OTHER__';
export const SEP = ' | ';
export const MAX_PROVIDER = 30;   // reference ya database ni herufi 100 tu: 30 (jina) + 3 (kitenganishi) + 60 (namba ya muamala) = 93
export const MAX_REF = 60;

export const BANKS = ['CRDB', 'NMB', 'NBC', 'Stanbic', 'Equity', 'Exim', 'DTB', 'Absa', 'KCB', 'Azania', 'TCB', 'TPB'];
export const NETWORKS = ['Vodacom M-Pesa', 'Airtel Money', 'Mixx by Yas (Tigo Pesa)', 'Halotel HaloPesa', 'TTCL T-Pesa', 'Azam Pesa'];

// Njia ya malipo -> aina ya orodha ya kuonyesha. Njia nyingine (CASH, CHEQUE) hazina orodha.
export const PROVIDER_KIND = { BANK: 'bank', CARD: 'bank', MOBILE_MONEY: 'network' };
export const providerList = (method) => (PROVIDER_KIND[method] === 'bank' ? BANKS : PROVIDER_KIND[method] === 'network' ? NETWORKS : []);

export const joinReference = (provider, ref) => (provider ? `${provider}${SEP}${ref}` : ref);

// Kinyume chake: tenganisha jina la benki/mtandao na namba ya muamala (kwa orodha na ukurasa wa kuangalia).
export const splitReference = (method, reference) => {
  const r = reference || '';
  if (!PROVIDER_KIND[method]) return { provider: '', ref: r };
  const i = r.indexOf(SEP);
  return i > 0 ? { provider: r.slice(0, i), ref: r.slice(i + SEP.length) } : { provider: '', ref: r };
};
