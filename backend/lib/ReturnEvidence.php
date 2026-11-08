<?php
class ReturnEvidence
{
    private static bool $ready=false;
    public static function ensureSchema(PDO $pdo): void {
        if(self::$ready) return;
        $pdo->exec("CREATE TABLE IF NOT EXISTS return_photos (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            intercept_id BIGINT UNSIGNED NOT NULL,courier_id INT UNSIGNED NOT NULL,
            uploaded_by INT UNSIGNED NOT NULL,mime VARCHAR(32) NOT NULL,
            image MEDIUMBLOB NOT NULL,sha256 CHAR(64) NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            review_status VARCHAR(20) NOT NULL DEFAULT 'pending',
            reviewed_by INT UNSIGNED NULL,reviewed_at DATETIME NULL,
            review_note VARCHAR(255) NOT NULL DEFAULT '',
            KEY idx_photo_intercept(intercept_id,id),KEY idx_photo_company(courier_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        $column=$pdo->query("SHOW COLUMNS FROM reconcile_logs LIKE 'verified'")->fetch();
        if(!$column) {
            try { $pdo->exec('ALTER TABLE reconcile_logs ADD COLUMN verified INT NOT NULL DEFAULT 0'); }
            catch(PDOException $e) { if(($e->errorInfo[1] ?? 0)!==1060) throw $e; }
        }
        self::$ready=true;
    }
    public static function upload(array $file): array {
        if(($file['error'] ?? UPLOAD_ERR_NO_FILE)!==UPLOAD_ERR_OK || !is_uploaded_file($file['tmp_name'] ?? '')) throw new RuntimeException('必须上传退回照片，上传失败请重试');
        if(($file['size'] ?? 0)<=0 || $file['size']>5*1024*1024) throw new RuntimeException('照片大小需在5MB以内');
        $info=@getimagesize($file['tmp_name']);
        if(!$info || $info[0]*$info[1]>24000000 || !in_array($info['mime'] ?? '',['image/jpeg','image/png','image/webp'],true)) throw new RuntimeException('请上传有效的 JPG、PNG 或 WebP 照片');
        $bytes=file_get_contents($file['tmp_name']);
        if($bytes===false) throw new RuntimeException('照片读取失败');
        return [$info['mime'],$bytes,hash('sha256',$bytes)];
    }
}
