<?php
class CarrierResolver
{
    private static bool $ready=false;
    public static function ensureSchema(PDO $pdo): void {
        if(self::$ready) return;
        $pdo->exec("CREATE TABLE IF NOT EXISTS courier_prefix_rules (prefix VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,courier_id INT UNSIGNED NOT NULL,PRIMARY KEY(prefix),KEY idx_prefix_courier(courier_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        self::$ready=true;
    }
    public static function parse($input): array {
        if (!is_string($input)) throw new RuntimeException('单号前缀格式错误');
        $parts=array_values(array_unique(preg_split('/[\s,;，；、]+/u',strtoupper(trim($input)),-1,PREG_SPLIT_NO_EMPTY)));
        if(count($parts)>100) throw new RuntimeException('每家公司最多维护100个前缀');
        foreach($parts as $p) if(!preg_match('/^[A-Z0-9]{1,20}$/D',$p)) throw new RuntimeException('前缀只能包含1至20位数字或字母');
        return $parts;
    }
    public static function save(PDO $pdo,int $id,array $prefixes): void {
        $pdo->prepare('DELETE FROM courier_prefix_rules WHERE courier_id=?')->execute([$id]);
        $s=$pdo->prepare('INSERT INTO courier_prefix_rules(prefix,courier_id) VALUES (?,?)');
        foreach($prefixes as $p) $s->execute([$p,$id]);
    }
    public static function resolve(PDO $pdo,string $tracking): int {
        if(!preg_match('/^[A-Z0-9]{6,50}$/D',$tracking)) throw new RuntimeException('运单号需为6至50位数字或字母');
        self::ensureSchema($pdo);
        return self::match($tracking,$pdo->query('SELECT r.prefix,r.courier_id,c.status FROM courier_prefix_rules r JOIN couriers c ON c.id=r.courier_id')->fetchAll());
    }
    public static function match(string $tracking,array $rules): int {
        $best=null;
        foreach($rules as $r) {
            if(strpos($tracking,$r['prefix'])!==0) continue;
            if($best===null || strlen($r['prefix'])>strlen($best['prefix'])) $best=$r;
            elseif(strlen($r['prefix'])===strlen($best['prefix']) && (int)$r['courier_id']!==(int)$best['courier_id']) throw new RuntimeException('前缀配置冲突');
        }
        if($best===null) throw new RuntimeException('未匹配到公司，请先在“快递公司”维护该单号的前缀');
        if(!(int)$best['status']) throw new RuntimeException('匹配的快递公司已停用，未录入');
        return (int)$best['courier_id'];
    }
}
