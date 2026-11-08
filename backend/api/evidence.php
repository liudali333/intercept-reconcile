<?php
require __DIR__ . '/../lib/bootstrap.php';
if(($_SERVER['REQUEST_METHOD'] ?? '')!=='GET') Response::fail('Method Not Allowed',405);
$payload=JWT::fromHeader();
if(($payload['role'] ?? '')==='merchant') $me=Auth::merchant();
elseif(($payload['role'] ?? '')==='courier') $me=Auth::courier();
else Response::fail('请先登录',401);
$pdo=DB::conn(); ReturnEvidence::ensureSchema($pdo);
$photoId=(int)($_GET['photo_id'] ?? 0);
$id=(int)($_GET['id'] ?? 0);
$where=$me['role']==='merchant' ? 'i.merchant_id=?' : 'i.courier_id=?';
$owner=$me['role']==='merchant' ? $me['uid'] : $me['courier_id'];
header('Cache-Control: private, no-store');
if($photoId>0) {
    $s=$pdo->prepare("SELECT p.mime,p.image FROM return_photos p JOIN intercepts i ON i.id=p.intercept_id WHERE p.id=? AND $where");
    $s->execute([$photoId,$owner]); $photo=$s->fetch();
    if(!$photo) Response::fail('照片不存在或无权查看',404);
    header('Content-Type: '.$photo['mime']); header('X-Content-Type-Options: nosniff');
    header('Content-Disposition: inline; filename="return-photo"');
    echo $photo['image']; exit;
}
$s=$pdo->prepare("SELECT i.id,i.tracking_no,i.status,i.returned_at FROM intercepts i WHERE i.id=? AND $where");
$s->execute([$id,$owner]); $item=$s->fetch();
if(!$item) Response::fail('记录不存在或无权查看',404);
$s=$pdo->prepare('SELECT id,created_at,review_status,reviewed_at,review_note FROM return_photos WHERE intercept_id=? ORDER BY id DESC');
$s->execute([$id]); Response::ok(['item'=>$item,'photos'=>$s->fetchAll()]);
