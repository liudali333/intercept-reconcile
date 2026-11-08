const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const elements={batchPhotoArea:{innerHTML:''},stats:{innerHTML:''}};
const c={localStorage:{getItem:()=>null},location:{pathname:'/frontend/',origin:'https://example.com'},document:{hidden:false,addEventListener(){},getElementById:id=>elements[id]},setInterval(){},setTimeout(){},URL,URLSearchParams,FormData,Blob,console};
vm.createContext(c);vm.runInContext(fs.readFileSync('frontend/photos.js','utf8'),c);vm.runInContext(fs.readFileSync('frontend/app.js','utf8').replace(/^render\(\);$/m,''),c);
vm.runInContext("loadStats=async()=>{};compressReturnPhoto=async()=>new Blob(['image'],{type:'image/jpeg'});globalThis.row={file:{},preview:'blob:test',tracking:'JT123456789',message:''};globalThis.calls=[];req=async(u,o)=>{calls.push({u,o});return u.includes('action=match')?{code:0,data:{list:[{id:12,tracking_no:'JT123456789'}]}}:{code:0}}",c);
(async()=>{
 await vm.runInContext("matchAndSubmitPhoto(row,'scan')",c);
 assert.equal(c.row.done,true);assert.equal(c.calls.length,2);assert.equal(c.calls[0].o.body.tracking_no,'JT123456789');assert.equal(c.calls[0].o.body.last_five,undefined);
 assert(c.calls[1].o.body instanceof FormData);assert.equal(c.calls[1].o.body.get('tracking_no'),'JT123456789');assert.equal(c.calls[1].o.body.get('note'),null);assert.equal(c.calls[1].o.body.get('photo').type,'image/jpeg');
 vm.runInContext("calls=[];row={file:{},tracking:'JT123456789'};req=async(u,o)=>{calls.push(u);return {code:0,data:{list:[{id:1},{id:2}]}}}",c);
 await vm.runInContext("matchAndSubmitPhoto(row,'scan')",c);assert.equal(c.calls.length,1);assert.equal(c.row.done,undefined);assert.equal(c.row.failed,true);
 const el={innerHTML:''};vm.runInContext("globalThis.view={innerHTML:''};renderScan(view)",c);const html=c.view.innerHTML;assert.doesNotMatch(html,/<input|手动|后五位|备注/);assert.match(html,/自动拍照/);
 console.log('PASS: 扫码完整单号自动匹配上传、照片绑定、无备注、多候选不退回、无手动与后五位入口');
})().catch(e=>{console.error(e);process.exitCode=1});
