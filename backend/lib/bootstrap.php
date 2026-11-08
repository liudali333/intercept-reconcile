<?php
/**
 * CORS 与公共引导文件
 * 所有 API 入口 require 本文件
 */
date_default_timezone_set('Asia/Shanghai');
session_start();

$cfg = require __DIR__ . '/../config/app.php';

if (!empty($cfg['allow_cors'])) {
    $origin = $cfg['courier_frontend_origin'] ?? '*';
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');
    header('Access-Control-Max-Age: 86400');
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

// 自动加载 lib 目录下的类
spl_autoload_register(function (string $class) {
    $file = __DIR__ . '/' . $class . '.php';
    if (is_file($file)) require $file;
});

/** 读取 JSON 请求体 */
function body(): array
{
    $raw = file_get_contents('php://input');
    if (empty($raw)) return $_POST;
    $json = json_decode($raw, true);
    return is_array($json) ? $json : [];
}

/** 取请求参数（优先 body，其次 query） */
function param(string $key, $default = null)
{
    $b = body();
    if (array_key_exists($key, $b)) return $b[$key];
    if (array_key_exists($key, $_GET)) return $_GET[$key];
    return $default;
}
