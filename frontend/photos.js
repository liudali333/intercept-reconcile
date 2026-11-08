let photoBatch=[],batchRecognizing=false;
async function compressReturnPhoto(file) {
 if(!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('请选择JPG、PNG或WebP照片');
 if(file.size>20*1024*1024) throw new Error('原图过大，请缩小到20MB以内');
 const image=await createImageBitmap(file);
 try {
  const scale=Math.min(1,1600/Math.max(image.width,image.height));
  const canvas=document.createElement('canvas');canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);
  canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.8));
  if(!blob || blob.size>1500*1024) throw new Error('照片压缩失败或过大，请重新拍摄');
  return blob;
 } finally {image.close();}
}
async function compressForOcr(file) {
  if(!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('请选择JPG、PNG或WebP照片');
  const image=await createImageBitmap(file);
  try {
    const scale=Math.min(1,2200/Math.max(image.width,image.height));
    const canvas=document.createElement('canvas');canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);
    const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,canvas.width,canvas.height);
    // 灰度+对比度增强，提升 OCR 对运单号数字的识别率
    try{const img=ctx.getImageData(0,0,canvas.width,canvas.height),d=img.data;for(let i=0;i<d.length;i+=4){const g=0.299*d[i]+0.587*d[i+1]+0.114*d[i+2];const v=Math.min(255,Math.max(0,(g-128)*1.4+128));d[i]=d[i+1]=d[i+2]=v;}ctx.putImageData(img,0,0);}catch(e){}
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.92));
    if(!blob) throw new Error('照片处理失败');
    return blob;
  } finally {image.close();}
}
function extractTrackingCandidates(text) {
  const upper=(text||'').toUpperCase();
  const all=[...new Set((upper.match(/[A-Z0-9]+/g)||[]).filter(s=>s.length>=6&&s.length<=50))];
  const scored=all.map(s=>{
    const pureDigit=/^\d+$/.test(s),len=s.length;
    let score;
    if(pureDigit&&len>=10&&len<=15)score=100;
    else if(pureDigit&&len>=8&&len<=18)score=80;
    else if(!pureDigit&&len>=8&&len<=15)score=55;
    else score=15;
    score-=Math.abs(len-12)*3;
    return {s,score};
  });
  scored.sort((a,b)=>b.score-a.score);
  if(scored.length>40) throw new Error('照片文字过多，请对准单个包裹运单号重拍');
  return scored.map(x=>x.s);
}
async function submitPhotoReturn(item,file,method='photo') {
 const blob=await compressReturnPhoto(file),form=new FormData();
 form.append('id',String(item.id));form.append('tracking_no',item.tracking_no);form.append('method',method);form.append('photo',blob,'return.jpg');
 return req('api/intercepts.php?action=return',{method:'POST',body:form});
}
function renderPhotoBatch(){
 const el=document.getElementById('batchPhotoArea');if(!el)return;
 el.innerHTML=photoBatch.map((r,i)=>`<div class="card"><img src="${r.preview}" alt="退回照片" style="max-width:100%;max-height:160px"><div>${esc(r.name||r.file.name||'退回照片')}</div><p>${esc(r.tracking||'正在识别完整单号')}</p><p>${esc(r.message)}</p>${r.failed&&!r.done?`<button class="btn-default" onclick="retryPhoto(${i})">重新识别并匹配</button>`:''}</div>`).join('');
}
async function matchAndSubmitPhoto(row,method='photo'){
 row.busy=true;row.failed=false;renderPhotoBatch();
 try{
  let candidates;
  if(method==='scan')candidates=[row.tracking];
  else{
    if(typeof Tesseract==='undefined')throw new Error('识别库未加载，请刷新或重新拍照');
    row.message='正在识别照片（0%）';renderPhotoBatch();
    const worker=await Tesseract.createWorker('eng',1,{logger:m=>{if(m.status==='recognizing text'&&typeof m.progress==='number'){row.message='正在识别照片（'+Math.round(m.progress*100)+'%）';renderPhotoBatch();}}});
    let ocrText='';
    try{
      await worker.setParameters({tessedit_pageseg_mode:'3'});
      const r1=await worker.recognize(await compressForOcr(row.file));ocrText=r1.data.text||'';
      // 若整页识别无候选，尝试单行文本模式重试
      if(!extractTrackingCandidates(ocrText).length){await worker.setParameters({tessedit_pageseg_mode:'6'});const r2=await worker.recognize(await compressForOcr(row.file));ocrText+='\n'+(r2.data.text||'');}
    }finally{await worker.terminate();}
    candidates=extractTrackingCandidates(ocrText);
    if(!candidates.length)throw new Error('未识别到运单号，请对准包裹运单号重拍，或改用扫码');
  }
  const found=new Map();
  for(const tracking of candidates){const j=await post('api/intercepts.php?action=match',{tracking_no:tracking});if(j.code!==0)throw new Error(j.msg);for(const item of j.data.list)found.set(item.id,item);}
  if(found.size!==1)throw new Error(found.size?'照片匹配到多个包裹，请分开重新拍摄':'未找到当前公司待退回件，请检查单号、照片或是否已退回');
  const item=[...found.values()][0];row.tracking=item.tracking_no;row.message='已匹配，正在上传照片';renderPhotoBatch();
  const j=await submitPhotoReturn(item,row.file,method);if(j.code!==0)throw new Error(j.msg);
  row.done=true;row.message='已退回，等待商家核对照片';await loadStats();
 }catch(e){row.failed=true;row.message=e.message;}finally{row.busy=false;renderPhotoBatch();}
}
function startBatchPhotos(){
 if(batchRecognizing||scanCapturing||quaggaRunning)return toast('正在处理，请稍候','error');
 const input=document.createElement('input');input.type='file';input.accept='image/jpeg,image/png,image/webp';input.multiple=true;
 input.onchange=async()=>{
  const files=Array.from(input.files||[]);if(!files.length)return;
  if(files.length>20)return toast('每批最多20张','error');
  if(batchRecognizing||scanCapturing||quaggaRunning)return;
  for(const r of photoBatch)URL.revokeObjectURL(r.preview);
  photoBatch=files.map(file=>({file,preview:URL.createObjectURL(file),message:'等待自动识别',done:false}));renderPhotoBatch();
  batchRecognizing=true;try{for(const row of photoBatch)await matchAndSubmitPhoto(row);}finally{batchRecognizing=false;}
 };input.click();
}
async function retryPhoto(index){const row=photoBatch[index];if(!row||row.done||row.busy||batchRecognizing||scanCapturing)return;batchRecognizing=true;try{await matchAndSubmitPhoto(row,row.name?'scan':'photo');}finally{batchRecognizing=false;}}
