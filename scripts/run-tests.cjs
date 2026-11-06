// Runs every tests/*.test.cjs file, so a new test cannot be forgotten.
//   node scripts/run-tests.cjs            all tests (npm test)
//   node scripts/run-tests.cjs --unlisted only tests no other npm script runs (CI)
//   node scripts/run-tests.cjs sale wheel only tests whose name contains a word
//   node scripts/run-tests.cjs --browser  also tests that need Playwright
const {spawnSync}=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');

function testFiles(){return fs.readdirSync(path.join(root,'tests')).filter(name=>name.endsWith('.test.cjs')).sort().map(name=>`tests/${name}`);}
// A test is listed when some npm script other than this runner names it.
function listedFiles(){
  const scripts=Object.values(require(path.join(root,'package.json')).scripts).filter(command=>!command.includes('run-tests.cjs')).join('\n');
  return new Set(testFiles().filter(file=>scripts.includes(file)));
}
// Browser tests need Playwright, which is not a project dependency; run them with --browser.
function needsBrowser(file){return /scripts\/browser\.cjs|playwright/.test(fs.readFileSync(path.join(root,file),'utf8'));}
function select(args=process.argv.slice(2)){
  let files=testFiles();
  if(!args.includes('--browser'))files=files.filter(file=>!needsBrowser(file));
  if(args.includes('--unlisted')){const listed=listedFiles();files=files.filter(file=>!listed.has(file));}
  const words=args.filter(arg=>!arg.startsWith('--'));
  return words.length?files.filter(file=>words.some(word=>file.includes(word))):files;
}
function run(files){
  const failed=[];
  for(const file of files){
    const started=Date.now();
    const result=spawnSync(process.execPath,[file],{cwd:root,encoding:'utf8'});
    const seconds=((Date.now()-started)/1000).toFixed(1);
    if(result.status===0){console.log(`ok   ${file} (${seconds} s)`);continue;}
    failed.push(file);
    console.log(`FAIL ${file} (${seconds} s)\n${`${result.stdout||''}${result.stderr||''}`.trim()}\n`);
  }
  console.log(`\n${files.length-failed.length}/${files.length} test files passed`);
  if(failed.length)console.log(`Failed:\n  ${failed.join('\n  ')}`);
  return failed.length?1:0;
}
module.exports={testFiles,listedFiles,select};
if(require.main===module){
  const files=select();
  if(!files.length){console.log('No matching test files.');process.exit(0);}
  process.exitCode=run(files);
}
