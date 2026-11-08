-- ============================================================
-- 拦截件对账系统 数据库初始化脚本
-- ============================================================

CREATE DATABASE IF NOT EXISTS intercept_reconcile
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE intercept_reconcile;

-- ----------------------------------------------------------
-- 商家账号表（后端登录）
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS merchants (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  username      VARCHAR(50)  NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  real_name     VARCHAR(50)  NOT NULL DEFAULT '',
  status        TINYINT      NOT NULL DEFAULT 1 COMMENT '1启用 0禁用',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商家账号';

-- ----------------------------------------------------------
-- 快递公司表
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS couriers (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name       VARCHAR(50)  NOT NULL COMMENT '快递公司名称',
  code       VARCHAR(20)  NOT NULL COMMENT '快递公司编码',
  logo       VARCHAR(255) NOT NULL DEFAULT '',
  status     TINYINT      NOT NULL DEFAULT 1 COMMENT '1启用 0禁用',
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='快递公司';

-- ----------------------------------------------------------
-- 快递员账号表（前端登录，每家快递公司独立账号）
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS courier_accounts (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  courier_id    INT UNSIGNED NOT NULL COMMENT '所属快递公司',
  username      VARCHAR(50)  NOT NULL COMMENT '登录账号',
  password_hash VARCHAR(255) NOT NULL,
  real_name     VARCHAR(50)  NOT NULL DEFAULT '' COMMENT '快递员姓名',
  phone         VARCHAR(20)  NOT NULL DEFAULT '',
  status        TINYINT      NOT NULL DEFAULT 1 COMMENT '1启用 0禁用',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_courier_username (courier_id, username),
  KEY idx_courier (courier_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='快递员账号';

-- ----------------------------------------------------------
-- 拦截件主表
--   status: intercepted=已录入待退回  returned=已退回  cancelled=已取消
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS intercepts (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  courier_id     INT UNSIGNED  NOT NULL COMMENT '快递公司',
  tracking_no    VARCHAR(50)   NOT NULL COMMENT '完整运单号',
  last_five      VARCHAR(10)   NOT NULL COMMENT '运单号后五位（用于关联）',
  status         VARCHAR(20)   NOT NULL DEFAULT 'intercepted',
  intercepted_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '商家录入拦截时间',
  returned_at    DATETIME      NULL COMMENT '快递员退回时间',
  returned_by    INT UNSIGNED  NULL COMMENT '退回操作的快递员账号ID',
  return_method  VARCHAR(20)   NOT NULL DEFAULT '' COMMENT 'manual/photo/scan',
  merchant_id    INT UNSIGNED  NOT NULL COMMENT '录入拦截的商家',
  note           VARCHAR(255)  NOT NULL DEFAULT '',
  created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_courier_tracking (courier_id, tracking_no),
  KEY idx_courier_status (courier_id, status),
  KEY idx_last_five (courier_id, last_five),
  KEY idx_intercepted_date (intercepted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='拦截件';

-- ----------------------------------------------------------
-- 对账记录表
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS reconcile_logs (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  courier_id    INT UNSIGNED NOT NULL,
  period_start  DATE NOT NULL,
  period_end    DATE NOT NULL,
  total         INT NOT NULL DEFAULT 0 COMMENT '拦截总数',
  returned      INT NOT NULL DEFAULT 0 COMMENT '已退回',
  unreturned    INT NOT NULL DEFAULT 0 COMMENT '未退回',
  merchant_id   INT UNSIGNED NOT NULL,
  note          VARCHAR(255) NOT NULL DEFAULT '',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_courier_period (courier_id, period_start, period_end)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='对账记录';

-- ----------------------------------------------------------
-- 初始数据：默认商家账号 admin / admin123
-- 密码哈希使用 password_hash('admin123', PASSWORD_BCRYPT) 生成
-- 这里用 PHP 注册接口创建，此处仅插入快递公司示例
-- ----------------------------------------------------------
INSERT INTO couriers (name, code) VALUES
  ('顺丰速运',  'SF'),
  ('中通快递',  'ZTO'),
  ('圆通速递',  'YTO'),
  ('韵达快递',  'YD'),
  ('申通快递',  'STO'),
  ('百世快递',  'HTKY'),
  ('京东物流',  'JD'),
  ('邮政EMS',   'EMS'),
  ('极兔速递',  'JT'),
  ('德邦快递',  'DBL')
ON DUPLICATE KEY UPDATE name = VALUES(name);
