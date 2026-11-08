<?php
/**
 * 应用配置
 */
return [
    // JWT 密钥（请修改为随机字符串）
    'jwt_secret' => getenv('INTERCEPT_JWT_SECRET') ?: '',

    // Token 有效期（秒）：商家端 8 小时，快递员端 12 小时
    'merchant_token_ttl' => 8 * 3600,
    'courier_token_ttl'  => 12 * 3600,

    // 是否允许跨域（开发环境）
    'allow_cors' => true,

    // 前端快递员端地址（用于 CORS 白名单）
    'courier_frontend_origin' => '*',

    // 默认商家账号（首次启动时通过 init.php 创建）
    'default_merchant' => [
        'username' => 'admin',
        'password' => getenv('INTERCEPT_ADMIN_PASSWORD') ?: '',
        'real_name' => '系统管理员',
    ],
];
