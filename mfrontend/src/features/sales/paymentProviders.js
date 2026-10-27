// Akaunti za malipo za Cash sales zinatoka kwenye Bank accounts zilizosajiliwa (benki = CURRENT/SAVINGS/OTHER, pesa ya simu = MOBILE_MONEY).
// Njia ya malipo -> aina ya akaunti inayoonyeshwa. CASH na CHEQUE hazina orodha.
export const ACCOUNT_KIND = { BANK: 'bank', CARD: 'bank', MOBILE_MONEY: 'network' };

// Akaunti zinazofaa njia iliyochaguliwa: MOBILE_MONEY -> akaunti za pesa ya simu tu; BANK/CARD -> akaunti nyingine zote.
export const accountsFor = (method, accounts) => {
  const kind = ACCOUNT_KIND[method];
  if (!kind) return [];
  return (accounts || []).filter((a) => (kind === 'network') === (a.accountType === 'MOBILE_MONEY'));
};
export const bankName = (a) => a?.bank?.shortName || a?.bank?.name || '';
// "CRDB — Mainland Ltd (0150123456)"  /  "Vodacom — Mainland Ltd (0755 000 000)"
export const accountLabel = (a) => (a ? `${bankName(a)} — ${a.accountName} (${a.accountNo})` : '');

// Mauzo yaliyohifadhiwa kabla ya mabadiliko haya yanaweza kuwa na "CRDB | 12345" kwenye reference. Bado yanaonyeshwa vizuri.
const SEP = ' | ';
export const splitReference = (method, reference) => {
  const r = reference || '';
  if (!ACCOUNT_KIND[method]) return { provider: '', ref: r };
  const i = r.indexOf(SEP);
  return i > 0 ? { provider: r.slice(0, i), ref: r.slice(i + SEP.length) } : { provider: '', ref: r };
};
