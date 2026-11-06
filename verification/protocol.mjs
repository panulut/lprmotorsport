export const protocol = 'driving-v1';
const encoder = new TextEncoder();
const encode = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const decode = value => Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')), c => c.charCodeAt(0));
async function key(secret) {
  if(typeof secret !== 'string' || secret.length < 32) throw Error('Verification signing secret is missing');
  return crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
}
export async function sign(data,secret) {
  const payload=encode(encoder.encode(JSON.stringify(data)));
  return payload+'.'+encode(new Uint8Array(await crypto.subtle.sign('HMAC',await key(secret),encoder.encode(payload))));
}
export async function verify(value,secret) {
  if(typeof value!=='string'||value.length>4096||!/^[-\w]+\.[-\w]{43}$/.test(value))throw Error('Invalid signed value');
  const [payload,signature]=value.split('.');
  if(!await crypto.subtle.verify('HMAC',await key(secret),decode(signature),encoder.encode(payload)))throw Error('Invalid signature');
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(decode(payload)));
}
export async function hash(value) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value)))].map(n=>n.toString(16).padStart(2,'0')).join('');
}
// Rate-limit key for a client address. One IPv6 subscriber usually holds a whole /64,
// so limits count that prefix; otherwise each new address would get a fresh budget.
export function addressKey(value) {
  const ip = String(value || 'unknown').trim().toLowerCase();
  const ipv4 = ip.match(/(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (ipv4) return ipv4[1];
  if (!/^[0-9a-f:]+$/.test(ip) || !ip.includes(':')) return ip;
  const [head, tail = ''] = ip.split('::'), left = head ? head.split(':') : [], right = tail ? tail.split(':') : [];
  const groups = ip.includes('::') ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right] : left;
  return groups.slice(0, 4).map(group => group.padStart(4, '0')).join(':') + '::/64';
}
export const validName = value => typeof value==='string' && /^[\p{L}\p{N} _.-]{1,24}$/u.test(value);
export const validPlayer = value => typeof value==='string' && /^[a-f0-9]{64}$/.test(value);
