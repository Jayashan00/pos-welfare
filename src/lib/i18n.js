import { SI } from './si';

// Interface language. English text is the key, so anything without a
// translation still shows in English rather than going blank.
let lang = 'en';

export function setLangGlobal(l) {
  lang = l === 'si' ? 'si' : 'en';
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
}
export const currentLang = () => lang;

export function t(s, p) {
  if (s == null) return '';
  let out = lang === 'si' && SI[s] ? SI[s] : s;
  if (p) out = out.replace(/\{(\w+)\}/g, (m, k) => (p[k] != null ? String(p[k]) : m));
  return out;
}

// Pick the Sinhala or English name of a product or category for the screen.
export const nameOf = (x) => (x ? (lang === 'si' && x.nameSi ? x.nameSi : x.name) : '');
