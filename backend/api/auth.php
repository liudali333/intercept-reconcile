<?php
/**
 * 商家端认证 API
 * POST /api/auth.php?action=login   登录
 * POST /api/auth.php?action=logout  登出
 * GET  /api/auth.php?action=me      当前用户
 */
require __DIR__ . '/../lib/bootstrap.php';

$action = $_GET['action'] ?? 'login';
$pdo = DB::conn();

switch ($action) {
    case 'login': {
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') Response::fail('Method Not Allowed', 405);
        $password = param('password', '');
        if (!is_string($password) || $password === '') Response::fail('请输入商家密码');
        $stmt = $pdo->prepare("SELECT * FROM merchants WHERE username='admin' AND status=1");
        $stmt->execute();
        $user = $stmt->fetch();
        if (!$user || !password_verify($password, $user['password_hash'])) Response::fail('密码错误或尚未设置', 401);
        $cfg = require __DIR__ . '/../config/app.php';
        $token = JWT::encode([
            'role' => 'merchant',
            'credential' => hash('sha256', $user['password_hash']),
            'uid'  => (int)$user['id'],
            'name' => $user['real_name'],
            'uname' => $user['username'],
        ], $cfg['merchant_token_ttl']);
        Response::ok([
            'token' => $token,
            'user'  => [
                'id'        => (int)$user['id'],
                'username'  => $user['username'],
                'real_name' => $user['real_name'],
            ],
        ], '登录成功');
    }

    case 'me': {
        $p = Auth::merchant();
        Response::ok([
            'id'        => $p['uid'],
            'username'  => $p['uname'] ?? '',
            'real_name' => $p['name'] ?? '',
        ]);
    }

    case 'set_password': {
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') Response::fail('Method Not Allowed', 405);
        $p = Auth::merchant();
        $password = param('password', '');
        if (!is_string($password) || strlen($password) < 8 || strlen($password) > 72) Response::fail('密码需为8至72字节');
        $s = $pdo->prepare('SELECT password_hash FROM merchants WHERE id=?');
        $s->execute([$p['uid']]); $oldHash = $s->fetchColumn();
        if ($oldHash !== '' && !password_verify(param('old_password', ''), $oldHash)) Response::fail('原密码错误');
        $s = $pdo->prepare('UPDATE merchants SET password_hash=? WHERE id=? AND password_hash=?');
        $s->execute([password_hash($password, PASSWORD_BCRYPT), $p['uid'], $oldHash]);
        if ($s->rowCount() !== 1) Response::fail('密码状态已变化，请重新登录', 409);
        Response::ok(null, '密码已保存，请重新登录');
    }
    default:
        Response::fail('未知操作', 404);
}
