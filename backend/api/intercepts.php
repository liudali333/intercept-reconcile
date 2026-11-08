<?php
/**
 * 拦截件 API
 *
 * 商家端：
 *   GET    /api/intercepts.php?action=list                 分页列表（支持 courier_id/status/date 过滤）
 *   POST   /api/intercepts.php?action=batch                批量录入拦截（运单号列表）
 *   POST   /api/intercepts.php?action=import               单条录入
 *   DELETE /api/intercepts.php?action=delete&id=N          删除
 *   POST   /api/intercepts.php?action=cancel               取消拦截（id）
 *
 * 快递员端：
 *   GET  /api/intercepts.php?action=courier_pending        待退回列表（当前快递公司）
 *   GET  /api/intercepts.php?action=courier_stats          统计：今日/总数/未退回
 *   POST /api/intercepts.php?action=match                  完整运单号匹配
 *   POST /api/intercepts.php?action=return                 完整单号 + ID + 退回照片
 */
require __DIR__ . '/../lib/bootstrap.php';
$pdo = DB::conn();
ReturnEvidence::ensureSchema($pdo);
$action = $_GET['action'] ?? 'list';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

/** 提取运单号后五位（仅数字字母） */
function lastFive(string $no): string {
    $no = preg_replace('/[^0-9A-Za-z]/', '', $no);
    return strtoupper(substr($no, -5));
}

// ============================================================
// 快递员端接口
// ============================================================

if ($action === 'courier_stats') {
    $me = Auth::courier();
    $cid = $me['courier_id'];
    $today = date('Y-m-d');
    $s = $pdo->prepare('SELECT COUNT(*) FROM intercepts WHERE courier_id = ? AND DATE(intercepted_at) = ?');
    $s->execute([$cid, $today]);
    $totalToday = (int)$s->fetchColumn();

    $s = $pdo->prepare("SELECT COUNT(*) FROM intercepts WHERE courier_id = ? AND status IN ('intercepted','submitted')");
    $s->execute([$cid]);
    $unreturned = (int)$s->fetchColumn();

    $s = $pdo->prepare("SELECT COUNT(*) FROM intercepts WHERE courier_id = ? AND status IN ('returned','verified') AND DATE(returned_at) = ?");
    $s->execute([$cid, $today]);
    $returnedToday = (int)$s->fetchColumn();

    $s = $pdo->prepare('SELECT COUNT(*) FROM intercepts WHERE courier_id = ?');
    $s->execute([$cid]);
    $totalAll = (int)$s->fetchColumn();
    $s=$pdo->prepare("SELECT SUM(status='verified') verified,SUM(status='returned') awaiting_review FROM intercepts WHERE courier_id=?");
    $s->execute([$cid]);$review=$s->fetch();

    Response::ok([
        'total_today'    => $totalToday,
        'returned_today' => $returnedToday,
        'unreturned'     => $unreturned,
        'total_all'      => $totalAll,
        'verified'      => (int)$review['verified'],
        'awaiting_review'=> (int)$review['awaiting_review'],
        'courier_name'   => $me['courier_name'],
        'courier_code'   => $me['courier_code'],
    ]);
}

if ($action === 'courier_pending') {
    $me = Auth::courier();
    $cid = $me['courier_id'];
    $page = max(1, (int)param('page', 1));
    $size = min(100, max(1, (int)param('size', 20)));
    $offset = ($page - 1) * $size;
    $s = $pdo->prepare(
        "SELECT id, tracking_no, last_five, status, intercepted_at, note
         FROM intercepts
         WHERE courier_id = ? AND status IN ('intercepted','submitted')
         ORDER BY intercepted_at DESC
         LIMIT $size OFFSET $offset"
    );
    $s->execute([$cid]);
    $rows = $s->fetchAll();
    $c = $pdo->prepare("SELECT COUNT(*) FROM intercepts WHERE courier_id = ? AND status IN ('intercepted','submitted')");
    $c->execute([$cid]);
    Response::ok(['list' => $rows, 'total' => (int)$c->fetchColumn(), 'page' => $page, 'size' => $size]);
}

if ($action === 'match') {
    if($method!=='POST') Response::fail('Method Not Allowed',405);
    $me=Auth::courier();$tracking=strtoupper(trim(param('tracking_no','')));
    if(!preg_match('/^[A-Z0-9]{6,50}$/D',$tracking)) Response::fail('请通过条码或照片提供完整运单号');
    $s=$pdo->prepare("SELECT id,tracking_no,status,intercepted_at FROM intercepts WHERE courier_id=? AND tracking_no=? AND status IN ('intercepted','submitted')");
    $s->execute([$me['courier_id'],$tracking]);Response::ok(['list'=>$s->fetchAll()]);
}

if ($action === 'return') {
    if ($method !== 'POST') Response::fail('Method Not Allowed', 405);
    $me = Auth::courier();
    $cid = (int)$me['courier_id'];
    $id = (int)param('id', 0);
    $tracking = strtoupper(trim(param('tracking_no', '')));
    $returnMethod=param('method','');
    if(!in_array($returnMethod,['scan','photo'],true)) Response::fail('仅支持扫码拍照或照片识别退回');
    if($id<=0 || !preg_match('/^[A-Z0-9]{6,50}$/D',$tracking)) Response::fail('请提供匹配后的完整单号');
    try { [$mime,$bytes,$sha]=ReturnEvidence::upload($_FILES['photo'] ?? []); }
    catch(RuntimeException $e) { Response::fail($e->getMessage(),422); }
    try {
        $pdo->beginTransaction();
        $s=$pdo->prepare("SELECT id FROM intercepts WHERE id=? AND courier_id=? AND tracking_no=? AND status IN ('intercepted','submitted') FOR UPDATE");
        $s->execute([$id,$cid,$tracking]);
        if(!$s->fetch()) { $pdo->rollBack(); Response::fail('状态已变化或无权退回，请刷新',409); }
        $s=$pdo->prepare('INSERT INTO return_photos(intercept_id,courier_id,uploaded_by,mime,image,sha256) VALUES (?,?,?,?,?,?)');
        $s->execute([$id,$cid,$me['uid'],$mime,$bytes,$sha]);
        $pdo->prepare("UPDATE intercepts SET status='returned',returned_at=NOW(),returned_by=?,return_method=? WHERE id=?")
            ->execute([$me['uid'],$returnMethod,$id]);
        $pdo->commit();
    } catch(Throwable $e) {
        if($pdo->inTransaction()) $pdo->rollBack();
        Response::fail('照片及退回记录保存失败，请重试',500);
    }
    Response::ok(['id'=>$id],'已上传照片并登记退回，等待商家核对');
}

// ============================================================
// 商家端接口
// ============================================================
$me = Auth::merchant();

if($action==='request_photo' && $method==='POST') {
    $s=$pdo->prepare("UPDATE intercepts i SET note=LEFT(CONCAT(note,' | 历史退回缺照片，商家要求补拍'),255),status='intercepted',returned_at=NULL,returned_by=NULL,return_method='' WHERE id=? AND merchant_id=? AND status='returned' AND NOT EXISTS (SELECT 1 FROM return_photos p WHERE p.intercept_id=i.id)");
    $s->execute([(int)param('id',0),$me['uid']]);
    if($s->rowCount()!==1) Response::fail('状态已变化或无权操作',409);
    Response::ok(null,'已恢复待退回，请快递员补拍照片');
}

if ($action === 'confirm' || $action === 'reject') {
    if($method!=='POST') Response::fail('Method Not Allowed',405);
    $id=(int)param('id',0); $reason=trim(param('reason',''));
    if($action==='reject' && ($reason==='' || strlen($reason)>255)) Response::fail('请填写驳回原因（255字节内）');
    try {
        $pdo->beginTransaction();
        $s=$pdo->prepare("SELECT id FROM intercepts WHERE id=? AND merchant_id=? AND status='returned' FOR UPDATE");
        $s->execute([$id,$me['uid']]);
        if(!$s->fetch()) { $pdo->rollBack(); Response::fail('状态已变化或无权核对',409); }
        $s=$pdo->prepare("SELECT id FROM return_photos WHERE intercept_id=? AND review_status='pending' ORDER BY id DESC LIMIT 1");
        $s->execute([$id]); $photoId=$s->fetchColumn();
        if(!$photoId) { $pdo->rollBack(); Response::fail('历史记录没有待核对照片，不能标记已核对',409); }
        $review=$action==='confirm'?'verified':'rejected';
        $pdo->prepare('UPDATE return_photos SET review_status=?,reviewed_by=?,reviewed_at=NOW(),review_note=? WHERE id=?')->execute([$review,$me['uid'],$reason,$photoId]);
        if($action==='confirm') $pdo->prepare("UPDATE intercepts SET status='verified' WHERE id=?")->execute([$id]);
        else $pdo->prepare("UPDATE intercepts SET status='intercepted',returned_at=NULL,returned_by=NULL,return_method='' WHERE id=?")->execute([$id]);
        $pdo->commit();
    } catch(Throwable $e) { if($pdo->inTransaction()) $pdo->rollBack(); Response::fail('核对保存失败，请重试',500); }
    Response::ok(null,$action==='confirm'?'已核对':'已驳回，请快递员补拍照片重新提交');
}

if ($action === 'list') {
    $where = ['i.merchant_id = ?'];
    $args = [$me['uid']];
    $cid = (int)param('courier_id', 0);
    if ($cid > 0) { $where[] = 'i.courier_id = ?'; $args[] = $cid; }
    $status = param('status', '');
    if ($status !== '') { $where[] = 'i.status = ?'; $args[] = $status; }
    $dateFrom = param('date_from', '');
    if ($dateFrom !== '') { $where[] = 'DATE(i.intercepted_at) >= ?'; $args[] = $dateFrom; }
    $dateTo = param('date_to', '');
    if ($dateTo !== '') { $where[] = 'DATE(i.intercepted_at) <= ?'; $args[] = $dateTo; }
    $kw = trim(param('keyword', ''));
    if ($kw !== '') { $where[] = 'i.tracking_no LIKE ?'; $args[] = "%$kw%"; }

    $page = max(1, (int)param('page', 1));
    $size = min(200, max(1, (int)param('size', 50)));
    $offset = ($page - 1) * $size;
    $whereSql = implode(' AND ', $where);

    $c = $pdo->prepare("SELECT COUNT(*) FROM intercepts i WHERE $whereSql");
    $c->execute($args);
    $total = (int)$c->fetchColumn();

    $s = $pdo->prepare(
        "SELECT i.*, (SELECT COUNT(*) FROM return_photos rp WHERE rp.intercept_id=i.id) photo_count, c.name courier_name, c.code courier_code,
                m.real_name merchant_name, a.real_name returned_name
         FROM intercepts i
         LEFT JOIN couriers c ON c.id = i.courier_id
         LEFT JOIN merchants m ON m.id = i.merchant_id
         LEFT JOIN courier_accounts a ON a.id = i.returned_by
         WHERE $whereSql
         ORDER BY i.intercepted_at DESC
         LIMIT $size OFFSET $offset"
    );
    $s->execute($args);
    Response::ok(['list' => $s->fetchAll(), 'total' => $total, 'page' => $page, 'size' => $size]);
}

if ($action === 'import' && $method === 'POST') {
    $trackingNo = strtoupper(trim(param('tracking_no', '')));
    $note = trim(param('note', ''));
    try { $cid = CarrierResolver::resolve($pdo, $trackingNo); }
    catch (RuntimeException $e) { Response::fail($e->getMessage(), 422); }
    $lf = lastFive($trackingNo);
    try {
        $pdo->prepare('INSERT INTO intercepts (courier_id, tracking_no, last_five, merchant_id, note) VALUES (?,?,?,?,?)')
            ->execute([$cid, $trackingNo, $lf, $me['uid'], $note]);
    } catch (PDOException $e) {
        if ($e->getCode() == 23000) Response::fail('该运单号已存在');
        Response::fail('录入失败: ' . $e->getMessage(), 500);
    }
    Response::ok(['id' => (int)$pdo->lastInsertId(), 'last_five' => $lf], '录入成功');
}

if ($action === 'batch' && $method === 'POST') {
    $raw = param('tracking_list', '');
    if (is_array($raw)) {
        $list = $raw;
    } else {
        $list = preg_split('/[\r\n,;\s]+/', $raw);
    }
    $list = array_filter(array_map(function($v){ return strtoupper(trim($v)); }, $list));
    if (empty($list)) Response::fail('运单号列表为空');
    if (count($list)>1000) Response::fail('每批最多1000条，请分批录入');

    $ok = 0; $dup = 0; $errors = [];
    $stmt = $pdo->prepare('INSERT INTO intercepts (courier_id, tracking_no, last_five, merchant_id) VALUES (?,?,?,?)');
    foreach ($list as $no) {
        if ($no === '') continue;
        try {
            $cid = CarrierResolver::resolve($pdo, $no);
            $stmt->execute([$cid, $no, lastFive($no), $me['uid']]);
            $ok++;
        } catch (PDOException $e) {
            if ($e->getCode() == 23000) $dup++; else $errors[] = $no . ':录入失败';
        } catch (RuntimeException $e) {
            $errors[] = $no . ':' . $e->getMessage();
        }
    }
    Response::ok(['success' => $ok, 'duplicate' => $dup, 'errors' => $errors, 'total' => count($list)], "录入完成：成功 $ok 条，重复 $dup 条");
}

if ($action === 'cancel' && $method === 'POST') {
    $id = (int)param('id', 0);
    $pdo->prepare("UPDATE intercepts SET status='cancelled' WHERE id=? AND merchant_id=? AND status IN ('intercepted','submitted')")
        ->execute([$id, $me['uid']]);
    Response::ok(null, '已取消');
}

if ($action === 'delete' && $method === 'DELETE') {
    $id = (int)($_GET['id'] ?? 0);
    $pdo->prepare("DELETE FROM intercepts WHERE id = ? AND merchant_id = ? AND status IN ('intercepted','submitted')")
        ->execute([$id, $me['uid']]);
    Response::ok(null, '已删除');
}

Response::fail('未知操作', 404);
