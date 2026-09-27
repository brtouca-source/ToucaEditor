'use strict';
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),test=require('node:test'),assert=require('node:assert/strict');
const code=fs.readFileSync(path.join(__dirname,'../renderer/legacy/v22.js'),'utf8');const functions=code.slice(code.indexOf('function norm22'),code.indexOf('function installScriptCaptionUI22'));
const ctx=vm.createContext({});vm.runInContext(functions,ctx);
test('script alignment preserves names/punctuation and monotonic timing',()=>{
 const out=ctx.alignScript22('Esse é o Tech Jacket!', [{text:'Esse',timestamp:[0,.2]},{text:'é',timestamp:[.2,.35]},{text:'o',timestamp:[.35,.45]},{text:'Tech',timestamp:[.45,.7]},{text:'Jacket',timestamp:[.7,1]}],1);
 assert.equal(out.words.map(x=>x.text).join(' '),'Esse é o Tech Jacket!');assert.equal(out.matched,5);assert.ok(out.words.every((x,i)=>x.end>=x.start&&(!i||x.start>=out.words[i-1].end)));
});
test('long narration aligns within a bounded band',()=>{
 const n=3000,words=Array.from({length:n},(_,i)=>'palavra'+i),chunks=words.map((text,i)=>({text,timestamp:[i*.3,(i+1)*.3]}));const out=ctx.alignScript22(words.join(' '),chunks,n*.3);assert.equal(out.matched,n);assert.equal(out.words.length,n);
});
