<?php
require __DIR__ . '/../lib/bootstrap.php';
Auth::merchant();
$pdo=DB::conn();
$method=$_SERVER['REQUEST_METHOD'] ?? 'GET';
// 增量创建独立规则表，保留现有公司与拦截数据。
CarrierResolver::ensureSchema($pdo);
if($method==='GET') {
    $rows=$pdo->query('SELECT id,name,code,logo,status,created_at FROM couriers ORDER BY id')->fetchAll();
    $rules=$pdo->query('SELECT prefix,courier_id FROM courier_prefix_rules ORDER BY prefix')->fetchAll(); $byCompany=[];
    foreach($rules as $r) $byCompany[$r['courier_id']][]=$r['prefix'];
    foreach($rows as &$r) $r['prefixes']=implode(', ',$byCompany[$r['id']] ?? []); unset($r);
    Response::ok($rows);
}
if($method==='POST' || $method==='PUT') {
    $id=(int)($_GET['id'] ?? 0);
    if($method==='PUT' && $id<=0) Response::fail('缺少公司ID');
    $name=trim(param('name','')); $code=strtoupper(trim(param('code',''))); $logo=trim(param('logo','')); $status=(int)param('status',1);
    if($name==='' || !preg_match('/^[A-Z0-9_]{1,20}$/D',$code) || !in_array($status,[0,1],true)) Response::fail('请填写公司名称、有效编码和状态');
    try { $prefixes=CarrierResolver::parse(param('prefixes','')); } catch(RuntimeException $e) { Response::fail($e->getMessage()); }
    try {
        $pdo->beginTransaction();
        if($method==='POST') {
            $pdo->prepare('INSERT INTO couriers(name,code,logo,status) VALUES (?,?,?,?)')->execute([$name,$code,$logo,$status]); $id=(int)$pdo->lastInsertId();
        } else {
            $s=$pdo->prepare('SELECT id FROM couriers WHERE id=? FOR UPDATE'); $s->execute([$id]);
            if(!$s->fetch()) { $pdo->rollBack(); Response::fail('公司不存在',404); }
            $pdo->prepare('UPDATE couriers SET name=?,code=?,logo=?,status=? WHERE id=?')->execute([$name,$code,$logo,$status,$id]);
        }
        CarrierResolver::save($pdo,$id,$prefixes); $pdo->commit();
    } catch(PDOException $e) {
        if($pdo->inTransaction()) $pdo->rollBack();
        Response::fail($e->getCode()==23000 ? '公司编码或单号前缀已被其他公司使用；原设置已保留' : '保存失败，请稍后重试',409);
    }
    Response::ok(['id'=>$id],'保存成功');
}
if($method==='DELETE') {
    $id=(int)($_GET['id'] ?? 0); if($id<=0) Response::fail('缺少ID');
    $s=$pdo->prepare('SELECT COUNT(*) FROM intercepts WHERE courier_id=?'); $s->execute([$id]);
    if((int)$s->fetchColumn()) Response::fail('该公司已有拦截件，不能删除');
    $pdo->beginTransaction();
    $pdo->prepare('DELETE FROM courier_prefix_rules WHERE courier_id=?')->execute([$id]);
    $pdo->prepare('DELETE FROM couriers WHERE id=?')->execute([$id]); $pdo->commit();
    Response::ok(null,'已删除');
}
Response::fail('Method Not Allowed',405);
