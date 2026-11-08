<?php
/**
 * 对账与统计 API（商家端）
 *
 * GET /api/reconcile.php?action=overview            总览（各快递公司汇总）
 * GET /api/reconcile.php?action=detail              明细对账（按快递公司+日期）
 * GET /api/reconcile.php?action=daily               每日趋势
 * POST /api/reconcile.php?action=save               保存对账记录
 * GET /api/reconcile.php?action=logs                对账记录列表
 * GET /api/reconcile.php?action=export              导出 CSV
 */
require __DIR__ . '/../lib/bootstrap.php';
$me = Auth::merchant();
$pdo = DB::conn();
ReturnEvidence::ensureSchema($pdo);
$action = $_GET['action'] ?? 'overview';

if ($action === 'overview') {
    $dateFrom = param('date_from', date('Y-m-01'));
    $dateTo   = param('date_to', date('Y-m-d'));
    $sql =
        "SELECT c.id courier_id, c.name courier_name, c.code courier_code,
                COUNT(i.id) total,
                SUM(i.status IN ('returned','verified')) returned,
                SUM(i.status='verified') verified,
                SUM(i.status IN ('intercepted','submitted')) unreturned,
                SUM(i.status='cancelled') cancelled
         FROM couriers c
         LEFT JOIN intercepts i ON i.courier_id = c.id
              AND DATE(i.intercepted_at) BETWEEN ? AND ? AND i.merchant_id=?
         WHERE c.status = 1
         GROUP BY c.id, c.name, c.code
         ORDER BY c.id";
    $s = $pdo->prepare($sql);
    $s->execute([$dateFrom, $dateTo, $me['uid']]);
    $rows = $s->fetchAll();
    // 转换 SUM 表达式结果为 int
    foreach ($rows as &$r) {
        $r['total']      = (int)$r['total'];
        $r['returned']   = (int)$r['returned'];
        $r['verified'] = (int)($r['verified'] ?? 0);
        $r['unreturned'] = (int)$r['unreturned'];
        $r['cancelled']  = (int)$r['cancelled'];
    }
    unset($r);
    Response::ok(['list' => $rows, 'date_from' => $dateFrom, 'date_to' => $dateTo]);
}

if ($action === 'detail') {
    $cid = (int)param('courier_id', 0);
    $dateFrom = param('date_from', date('Y-m-d'));
    $dateTo   = param('date_to', date('Y-m-d'));
    if ($cid <= 0) Response::fail('请选择快递公司');
    $s = $pdo->prepare(
        "SELECT i.id, i.tracking_no, i.last_five, i.status,
                i.intercepted_at, i.returned_at, i.return_method, i.note,
                a.real_name returned_name
         FROM intercepts i
         LEFT JOIN courier_accounts a ON a.id = i.returned_by
         WHERE i.courier_id = ? AND DATE(i.intercepted_at) BETWEEN ? AND ? AND i.merchant_id=?
         ORDER BY i.intercepted_at DESC"
    );
    $s->execute([$cid, $dateFrom, $dateTo, $me['uid']]);
    $rows = $s->fetchAll();
    $summary = [
        'total'      => count($rows),
        'returned'   => count(array_filter($rows, fn($r) => in_array($r['status'], ['returned','verified'], true))),
        'unreturned' => count(array_filter($rows, fn($r) => in_array($r['status'], ['intercepted','submitted'], true))),
        'verified' => count(array_filter($rows, fn($r) => $r['status'] === 'verified')),
        'cancelled'  => count(array_filter($rows, fn($r) => $r['status'] === 'cancelled')),
    ];
    Response::ok(['list' => $rows, 'summary' => $summary]);
}

if ($action === 'daily') {
    $cid = (int)param('courier_id', 0);
    $dateFrom = param('date_from', date('Y-m-d', strtotime('-30 days')));
    $dateTo   = param('date_to', date('Y-m-d'));
    $extra = $cid > 0 ? ' AND i.courier_id = ?' : '';
    $args = [$dateFrom, $dateTo, $me['uid']];
    if ($cid > 0) $args[] = $cid;
    $s = $pdo->prepare(
        "SELECT DATE(i.intercepted_at) d,
                COUNT(*) total,
                SUM(i.status IN ('returned','verified')) returned,
                SUM(i.status IN ('intercepted','submitted')) unreturned
         FROM intercepts i
         WHERE DATE(i.intercepted_at) BETWEEN ? AND ? AND i.merchant_id=?$extra
         GROUP BY DATE(i.intercepted_at)
         ORDER BY d"
    );
    $s->execute($args);
    $rows = $s->fetchAll();
    foreach ($rows as &$r) {
        $r['total']      = (int)$r['total'];
        $r['returned']   = (int)$r['returned'];
        $r['unreturned'] = (int)$r['unreturned'];
    }
    unset($r);
    Response::ok($rows);
}

if ($action === 'save' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $cid = (int)param('courier_id', 0);
    $dateFrom = param('date_from', '');
    $dateTo   = param('date_to', '');
    $note     = trim(param('note', ''));
    if ($cid <= 0 || $dateFrom === '' || $dateTo === '') Response::fail('参数不完整');
    $s = $pdo->prepare(
        "SELECT COUNT(*) total,
                SUM(status IN ('returned','verified')) returned,
                SUM(status='verified') verified,
                SUM(status IN ('intercepted','submitted')) unreturned
         FROM intercepts
         WHERE courier_id = ? AND DATE(intercepted_at) BETWEEN ? AND ? AND merchant_id=?"
    );
    $s->execute([$cid, $dateFrom, $dateTo, $me['uid']]);
    $row = $s->fetch();
    $pdo->prepare('INSERT INTO reconcile_logs (courier_id, period_start, period_end, total, returned, unreturned, verified, merchant_id, note) VALUES (?,?,?,?,?,?,?,?,?)')
        ->execute([$cid, $dateFrom, $dateTo, (int)$row['total'], (int)$row['returned'], (int)$row['unreturned'], (int)$row['verified'], $me['uid'], $note]);
    Response::ok(['id' => (int)$pdo->lastInsertId()], '对账记录已保存');
}

if ($action === 'logs') {
    $s = $pdo->prepare(
        "SELECT r.*, c.name courier_name, m.real_name merchant_name
         FROM reconcile_logs r
         LEFT JOIN couriers c ON c.id = r.courier_id
         LEFT JOIN merchants m ON m.id = r.merchant_id
         WHERE r.merchant_id=? ORDER BY r.created_at DESC LIMIT 200"
    );
    $s->execute([$me['uid']]);
    Response::ok($s->fetchAll());
}

if ($action === 'export') {
    $cid = (int)param('courier_id', 0);
    $dateFrom = param('date_from', date('Y-m-d'));
    $dateTo   = param('date_to', date('Y-m-d'));
    $where = 'DATE(i.intercepted_at) BETWEEN ? AND ? AND i.merchant_id=?';
    $args = [$dateFrom, $dateTo, $me['uid']];
    if ($cid > 0) { $where .= ' AND i.courier_id = ?'; $args[] = $cid; }
    $s = $pdo->prepare(
        "SELECT i.tracking_no, i.last_five, c.name courier_name, i.status,
                i.intercepted_at, i.returned_at, i.return_method, i.note
         FROM intercepts i
         LEFT JOIN couriers c ON c.id = i.courier_id
         WHERE $where
         ORDER BY i.intercepted_at DESC"
    );
    $s->execute($args);
    $rows = $s->fetchAll();

    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="intercepts_' . date('YmdHis') . '.csv"');
    echo "\xEF\xBB\xBF"; // BOM
    echo "运单号,快递公司,状态,拦截时间,退回时间,退回方式,备注\n";
    foreach ($rows as $r) {
        $statusMap = ['intercepted'=>'待退回','returned'=>'已退回待核对','verified'=>'已核对','submitted'=>'待补照片（历史）','cancelled'=>'已取消'];
        $methodMap = ['manual'=>'手动','photo'=>'拍照','scan'=>'扫描',''=>'-'];
        echo implode(',', [
            $r['tracking_no'], $r['courier_name'],
            $statusMap[$r['status']] ?? $r['status'],
            $r['intercepted_at'], $r['returned_at'] ?? '',
            $methodMap[$r['return_method']] ?? $r['return_method'],
            str_replace([',', "\n"], ['，', ' '], $r['note']),
        ]) . "\n";
    }
    exit;
}

Response::fail('未知操作', 404);
