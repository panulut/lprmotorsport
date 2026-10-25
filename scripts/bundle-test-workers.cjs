// Produce test-only Worker bundles; credentials are configured in provider secrets.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),destination=path.join(root,'artifacts/verification/testing');
fs.mkdirSync(destination,{recursive:true});
cp.execFileSync(process.execPath,[path.join(root,'scripts/bundle-verified-worker.cjs')],{stdio:'inherit'});
fs.copyFileSync(path.join(root,'cloudflare/verified-worker.bundle.mjs'),path.join(destination,'verified-worker.mjs'));
const source=fs.readFileSync(path.join(root,'cloudflare/worker.mjs'),'utf8');
const origins="const ORIGINS = new Set(['https://panulut.github.io', 'http://localhost:8000', 'http://127.0.0.1:8000']);";
if(!source.includes(origins))throw Error('Review analytics Worker origin isolation');
fs.writeFileSync(path.join(destination,'analytics-worker.mjs'),source.replace(origins,"const ORIGINS = new Set(['https://lpr-motorsport-test.onrender.com']);"));
console.log('Test Worker bundles: '+destination);
