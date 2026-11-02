const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const context={window:{}};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../formatters.js'),'utf8'),context);
const format=context.window.LPRFormatLapTime;

assert.equal(format(84508),'01:24.508');
assert.equal(format(60000),'01:00.000');
assert.equal(format(59999),'00:59.999');
assert.equal(format(1256),'00:01.256');
assert.equal(format(84508.6),'01:24.509','fractional milliseconds round to displayed millisecond precision');
assert.equal(format(3600000),'60:00.000','minutes expand beyond two digits');
for(const invalid of [null,undefined,NaN,Infinity,-1,'84508']) assert.equal(format(invalid),'--:--.---');
console.log('PASS: lap times use padded mm:ss.mmm with stable invalid and empty-value formatting');
