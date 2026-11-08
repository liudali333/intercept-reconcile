<?php
/**
 * 系统初始化脚本：创建默认商家账号
 * 访问一次即可，建议创建后删除或重命名
 * 用法: php init.php  或浏览器访问 init.php
 */
if (PHP_SAPI !== 'cli') { http_response_code(403); exit('请在服务器命令行执行初始化'); }
require __DIR__ . '/lib/bootstrap.php';

$cfg = require __DIR__ . '/config/app.php';
$dm = $cfg['default_merchant'];

if (strlen($dm['password']) < 8 || strlen($dm['password']) > 72) Response::fail('请配置8至72字节的 INTERCEPT_ADMIN_PASSWORD 环境变量');
$pdo = DB::conn();
$stmt = $pdo->prepare('SELECT id FROM merchants WHERE username = ?');
$stmt->execute([$dm['username']]);
if ($stmt->fetch()) {
    Response::ok(null, '默认商家账号已存在，无需重复创建');
}

$hash = password_hash($dm['password'], PASSWORD_BCRYPT);
$pdo->prepare('INSERT INTO merchants (username, password_hash, real_name) VALUES (?,?,?)')
    ->execute([$dm['username'], $hash, $dm['real_name']]);

Response::ok([
    'username' => $dm['username'],

], '默认商家账号创建成功，请立即登录并修改密码');
