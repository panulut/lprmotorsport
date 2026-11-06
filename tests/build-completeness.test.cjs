// Every local file a published page references must be copied into the release.
// scripts/build.cjs lists release files by hand, so a new script that is added to
// a page but not to that list would otherwise only fail in production (404).
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {build,root}=require('../scripts/build.cjs');

const target=path.join(root,`.build-completeness-${process.pid}`);
try {
  build(target);
  const pages=fs.readdirSync(target).filter(name=>name.endsWith('.html'));
  assert(pages.includes('index.html'),'The release must contain index.html');
  const missing=[];
  for(const page of pages) {
    const html=fs.readFileSync(path.join(target,page),'utf8');
    for(const [,reference] of html.matchAll(/\b(?:src|href)="([^"]+)"/g)) {
      // External, in-page, data and protocol links are not release files.
      if(/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(reference))continue;
      const file=decodeURIComponent(reference.split(/[?#]/)[0]);
      if(!file||file==='/'||file.endsWith('/'))continue;
      if(!fs.existsSync(path.join(target,file.replace(/^\//,''))))missing.push(`${page} -> ${file}`);
    }
  }
  assert.deepEqual(missing,[],`Release is missing referenced files (add them to gameFiles in scripts/build.cjs):\n${missing.join('\n')}`);
  console.log(`PASS: every local file referenced by ${pages.length} release pages is in the build`);
} finally {
  fs.rmSync(target,{recursive:true,force:true});
}
