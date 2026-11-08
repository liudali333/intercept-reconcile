const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const elements={mTracking:{value:'SF1234567890'},mNote:{value:''},mSave:{},bList:{value:'SF1234567890\nJT1234567890'},bSave:{isConnected:true}};
const c={localStorage:{getItem:()=>null},location:{href:'http://example.com/backend/web/'},URL,URLSearchParams,document:{getElementById:id=>elements[id]}};
vm.createContext(c);vm.runInContext(fs.readFileSync('backend/web/assets/app.js','utf8').replace(/^render\(\);$/m,''),c);
vm.runInContext("modal=html=>{globalThis.html=html};req=async(u,o)=>{globalThis.sent=o.body;return {code:0,data:{success:1,duplicate:0,errors:['JT1234567890:无法确定归属']}}};ok=()=>true;closeModal=()=>{};loadInterceptList=()=>{}",c);
(async()=>{
 vm.runInContext('showSingleModal([])',c);assert.doesNotMatch(c.html,/<select|mCourier/);await elements.mSave.onclick();assert.equal(c.sent.tracking_no,'SF1234567890');assert.equal(c.sent.courier_id,undefined);
 vm.runInContext('showBatchModal([])',c);assert.doesNotMatch(c.html,/<select|bCourier/);await elements.bSave.onclick();assert.equal(c.sent.courier_id,undefined);assert.match(c.html,/部分单号未录入/);assert.equal(elements.bSave.disabled,false);
 console.log('PASS: 单条批量无需选择公司、失败明细显示、提交按钮恢复');
})().catch(e=>{console.error(e);process.exitCode=1});
