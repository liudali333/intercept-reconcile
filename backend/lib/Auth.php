<?php
/**
 * 认证中间件
 */
class Auth
{
    /** 要求商家登录，返回商家 payload */
    public static function merchant(): array
    {
        $payload = JWT::fromHeader();
        if (!$payload || ($payload['role'] ?? '') !== 'merchant') {
            Response::fail('未登录或登录已过期', 401);
        }
        $s = DB::conn()->prepare('SELECT status,password_hash FROM merchants WHERE id=?');
        $s->execute([$payload['uid'] ?? 0]);
        $row = $s->fetch();
        if (!$row || (int)$row['status'] !== 1) Response::fail('账号已停用', 401);
        $setup = $row['password_hash'] === '' && basename($_SERVER['SCRIPT_NAME'] ?? '') === 'auth.php' && ($_GET['action'] ?? '') === 'set_password';
        if (!$setup && !hash_equals(hash('sha256', $row['password_hash']), $payload['credential'] ?? '')) Response::fail('请使用密码重新登录', 401);
        return $payload;
    }

    /** 要求快递员登录，返回快递员 payload */
    public static function courier(): array
    {
        $payload = JWT::fromHeader();
        if (!$payload || ($payload['role'] ?? '') !== 'courier') {
            Response::fail('未登录或登录已过期', 401);
        }
        $s = DB::conn()->prepare('SELECT a.id,a.username,a.password_hash FROM courier_accounts a JOIN couriers c ON c.id=a.courier_id WHERE a.id=? AND a.courier_id=? AND a.status=1 AND c.status=1');
        $s->execute([$payload['uid'] ?? 0, $payload['courier_id'] ?? 0]);
        $row = $s->fetch();
        if (!$row || $row['username'] !== '__company__' || !hash_equals(hash('sha256', $row['password_hash']), $payload['credential'] ?? '')) Response::fail('密码已变更或快递公司已停用，请重新登录', 401);
        return $payload;
    }
}
