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
export const validName = value => typeof value==='string' && /^[\p{L}\p{N} _.-]{1,24}$/u.test(value);
export const validPlayer = value => typeof value==='string' && /^[a-f0-9]{64}$/.test(value);
