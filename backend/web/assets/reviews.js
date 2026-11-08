let reviewPhotoUrls=[];
function releaseReviewPhotos(){for(const url of reviewPhotoUrls)URL.revokeObjectURL(url);reviewPhotoUrls=[];}
async function reviewReturn(id) {
 releaseReviewPhotos();
 const j=await get('api/evidence.php?id='+id);if(j.code!==0)return fail(j);
 const {item,photos}=j.data;
 modal(`<h3>退回照片核对：${esc(item.tracking_no)}</h3><p>请逐一查看单号与退回实物。历史无照片记录不能标记已核对。</p><div id="reviewPhotos">加载中…</div><div id="reviewActions"></div><button class="btn-default" onclick="closeModal()">关闭</button>`);
 const box=document.getElementById('reviewPhotos');
 if(!photos.length){box.textContent='此记录没有退回照片，请快递员补拍上传。';if(item.status==='returned')document.getElementById('reviewActions').innerHTML=`<button class="btn-default" onclick="requestLegacyPhoto(${id})">要求补拍，恢复待退回</button>`;return;}
 box.innerHTML='';let pendingLoaded=false;
 for(const photo of photos){
  const entry=document.createElement('div');entry.innerHTML=`<p>上传：${esc(photo.created_at)} · ${esc(({pending:'待核对',verified:'已核对',rejected:'已驳回'})[photo.review_status]||photo.review_status)} ${esc(photo.review_note)}</p>`;box.appendChild(entry);
  try{
   const response=await fetch(API+'api/evidence.php?photo_id='+photo.id,{headers:{Authorization:'Bearer '+TOKEN},cache:'no-store'});
   if(!response.ok||!(response.headers.get('Content-Type')||'').startsWith('image/'))throw new Error('照片加载失败，请重试');
   const url=URL.createObjectURL(await response.blob());reviewPhotoUrls.push(url);
   const image=document.createElement('img');image.alt='单号 '+item.tracking_no+' 的退回照片';image.style='max-width:100%;max-height:600px;display:block';image.src=url;
   await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('照片无法显示'));});
   if(!box.isConnected)return;entry.appendChild(image);if(photo.review_status==='pending')pendingLoaded=true;
  }catch(e){const p=document.createElement('p');p.textContent=e.message;entry.appendChild(p);}
 }
 const actions=document.getElementById('reviewActions');
 if(actions&&item.status==='returned'&&pendingLoaded)actions.innerHTML=`<button class="btn-success" onclick="reviewDecision(${id},'confirm')">照片与单号一致，确认已核对</button> <button class="btn-danger" onclick="reviewDecision(${id},'reject')">驳回重拍</button>`;
}
async function reviewDecision(id,action){
 let reason='';if(action==='reject'){reason=prompt('请填写驳回原因（如照片不清晰、单号不符）','');if(!reason?.trim())return;}
 else if(!confirm('确认已核实照片与该包裹单号一致？'))return;
 const j=await post('api/intercepts.php?action='+action,{id,reason});
 if(ok(j)){closeModal();if(document.getElementById('list'))loadInterceptList();}
}
async function requestLegacyPhoto(id){if(!confirm('将此历史无照片记录恢复待退回，要求快递员补拍？'))return;const j=await post('api/intercepts.php?action=request_photo',{id});if(ok(j)){closeModal();loadInterceptList();}}
