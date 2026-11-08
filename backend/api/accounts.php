<?php
/**
 * 快递员账号管理 API
 *
 * 商家端：
 *   GET    /api/accounts.php?courier_id=N        列表
 *   POST   /api/accounts.php                     新增
 *   PUT    /api/accounts.php?id=N                修改
 *   DELETE /api/accounts.php?id=N                删除
 *   POST   /api/accounts.php?action=reset&id=N   重置密码
 *
 * 快递员端：
 *   POST /api/accounts.php?action=courier_login  快递员登录
 *   GET  /api/accounts.php?action=courier_list   当前快递公司下所有快递员（用于选择）
 */
require __DIR__ . '/../lib/bootstrap.php';
$pdo = DB::conn();
$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

// ---------- 快递员登录 ----------
if ($action === 'courier_login' && $method === 'POST') {
    $courierId = (int)param('courier_id', 0);
    $password = param('password', '');
    if ($courierId <= 0 || !is_string($password) || $password === '') {
        Response::fail('请选择快递公司并填写密码');
    }
    $stmt = $pdo->prepare(
        'SELECT a.*, c.name courier_name, c.code courier_code
         FROM courier_accounts a
         JOIN couriers c ON c.id = a.courier_id
         WHERE a.courier_id = ? AND a.username = \'__company__\' AND a.status = 1 AND c.status = 1'
    );
    $stmt->execute([$courierId]);
    $acc = $stmt->fetch();
    if (!$acc || !password_verify($password, $acc['password_hash'])) {
        Response::fail('密码错误、未设置或已停用');
    }
    $cfg = require __DIR__ . '/../config/app.php';
    $token = JWT::encode([
        'role'        => 'courier',
        'credential' => hash('sha256', $acc['password_hash']),
        'uid'         => (int)$acc['id'],
        'courier_id'  => (int)$acc['courier_id'],
        'courier_name'=> $acc['courier_name'],
        'courier_code'=> $acc['courier_code'],
        'name'        => $acc['real_name'],
    ], $cfg['courier_token_ttl']);
    Response::ok([
        'token' => $token,
        'user'  => [
            'id'          => (int)$acc['id'],
            'real_name'   => $acc['real_name'],
            'courier_id'  => (int)$acc['courier_id'],
            'courier_name'=> $acc['courier_name'],
            'courier_code'=> $acc['courier_code'],
        ],
    ], '登录成功');
}

// ---------- 快递员端：取启用的快递公司列表（登录页选择） ----------
if ($action === 'courier_companies' && $method === 'GET') {
    $rows = $pdo->query('SELECT id, name, code, logo FROM couriers WHERE status = 1 ORDER BY id')->fetchAll();
    Response::ok($rows);
}

// ---------- 快递员端：当前登录信息 ----------
if ($action === 'courier_me' && $method === 'GET') {
    $p = Auth::courier();
    Response::ok([
        'id'          => $p['uid'],
        'real_name'   => $p['name'],
        'courier_id'  => $p['courier_id'],
        'courier_name'=> $p['courier_name'],
        'courier_code'=> $p['courier_code'],
    ]);
}

// 每家公司仅维护一个共享密码，旧账号保留历史关联但不再参与登录。
Auth::merchant();
if ($method === 'GET') {
    $rows = $pdo->query("SELECT c.id courier_id,c.name courier_name,c.code courier_code,c.status,
        CASE WHEN a.id IS NULL OR a.password_hash='' THEN 0 ELSE 1 END password_set
        FROM couriers c LEFT JOIN courier_accounts a ON a.courier_id=c.id AND a.username='__company__' ORDER BY c.id")->fetchAll();
    Response::ok($rows);
}
if ($method === 'PUT') {
    $cid = (int)param('courier_id',0);
    $password = param('password','');
    if ($cid <= 0 || !is_string($password) || strlen($password)<8 || strlen($password)>72) Response::fail('请选择快递公司，密码需为8至72字节');
    $check=$pdo->prepare('SELECT id FROM couriers WHERE id=?'); $check->execute([$cid]);
    if (!$check->fetch()) Response::fail('快递公司不存在',404);
    $hash=password_hash($password,PASSWORD_BCRYPT);
    $s=$pdo->prepare("INSERT INTO courier_accounts (courier_id,username,password_hash,real_name,status) VALUES (?,'__company__',?,'公司共享登录',1)
        ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash),status=1");
    $s->execute([$cid,$hash]);
    Response::ok(null,'公司密码已保存，旧登录已失效');
}
Response::fail('Method Not Allowed',405);
