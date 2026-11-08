<?php
/**
 * 轻量级 JWT（HS256）签发与校验
 * 仅依赖 hash_hmac + base64，无第三方库
 */
class JWT
{
    private static function secret(): string
    {
        $cfg = require __DIR__ . '/../config/app.php';
        if (strlen($cfg['jwt_secret']) < 32) Response::fail('请先配置至少32位的 INTERCEPT_JWT_SECRET 环境变量', 503);
        return $cfg['jwt_secret'];
    }

    private static function b64(string $s): string
    {
        return rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
    }

    private static function b64d(string $s): string
    {
        return base64_decode(strtr($s, '-_', '+/'));
    }

    public static function encode(array $payload, int $ttl): string
    {
        $header = self::b64(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
        $payload['iat'] = time();
        $payload['exp'] = time() + $ttl;
        $payload = self::b64(json_encode($payload));
        $sig = self::b64(hash_hmac('sha256', $header . '.' . $payload, self::secret(), true));
        return $header . '.' . $payload . '.' . $sig;
    }

    public static function decode(string $token): ?array
    {
        $parts = explode('.', $token);
        if (count($parts) !== 3) return null;
        [$h, $p, $s] = $parts;
        $expected = self::b64(hash_hmac('sha256', $h . '.' . $p, self::secret(), true));
        if (!hash_equals($expected, $s)) return null;
        $payload = json_decode(self::b64d($p), true);
        if (!is_array($payload)) return null;
        if (!isset($payload['exp']) || !is_numeric($payload['exp']) || time() >= $payload['exp']) return null;
        return $payload;
    }

    /** 从 Authorization 头提取并校验 token */
    public static function fromHeader(): ?array
    {
        $hdr = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
        if (stripos($hdr, 'Bearer ') === 0) {
            $token = substr($hdr, 7);
            return self::decode(trim($token));
        }
        // 兼容 query 参数 token

        return null;
    }
}
