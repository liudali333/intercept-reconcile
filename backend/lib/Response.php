<?php
/**
 * 统一 JSON 响应封装
 */
class Response
{
    public static function ok($data = null, string $msg = 'success'): void
    {
        self::output(0, $msg, $data);
    }

    public static function fail(string $msg, int $code = 400, $data = null): void
    {
        self::output($code, $msg, $data);
    }

    private static function output(int $code, string $msg, $data): void
    {
        if (!headers_sent()) {
            header('Content-Type: application/json; charset=utf-8');
        }
        echo json_encode([
            'code' => $code,
            'msg'  => $msg,
            'data' => $data,
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }
}
