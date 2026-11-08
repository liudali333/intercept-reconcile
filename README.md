# 拦截件对账系统

电商商家拦截件对账系统：**后端 PHP（商家端）** + **前端 HTML（快递员端）**。

## 功能概览

### 商家端（后端 PHP）
- 商家登录（固定账号 admin，仅密码登录）/ 修改密码
- **快递公司管理**：内置 10 家主流快递，可增删改；每家公司维护**单号前缀规则**，录入时自动识别所属公司
- **录入拦截快递**：单条 / 批量录入（每批最多 1000 条），按前缀自动匹配快递公司，未匹配项单独列出
- **快递员密码管理**：每家快递公司一个共享密码，下发给该公司所有快递员，修改后旧登录立即失效
- **退回照片核对**：查看快递员上传的退回照片，确认与单号一致后标记"已核对"，或驳回要求重拍
- **对账中心**：按快递公司 + 日期区间统计拦截总数 / 已退回 / 已核对 / 未退回 / 退回率，可保存对账记录、导出 CSV
- 拦截件列表查询（按快递公司 / 状态 / 日期 / 运单号）

### 快递员端（前端 HTML）
- 登录：选择快递公司 + 密码（每家公司独立密码，数据互不共享）
- **扫码拍照退回**：QuaggaJS 扫描条形码，连续 2 次识别同一码后自动从摄像头抓拍照片，匹配后端拦截件并上传照片登记退回
- **批量照片自动匹配**：一次选择多张包裹照片（最多 20 张），Tesseract.js OCR 识别面单运单号，自动匹配唯一待退回件并上传
- **实时统计**：待交回包裹数 / 今日新增拦截 / 今日已退回 / 已退回待核对 / 已核对（每 15 秒自动刷新）
- 待退回列表分页查看
- 退回需上传照片凭证，等待商家核对

## 技术栈

| 层 | 技术 |
|---|---|
| 后端 | PHP 7.4+ / PDO / MySQL 5.7+ |
| 认证 | JWT（HS256，纯 PHP 实现）+ 数据库凭证校验（改密后旧 token 失效） |
| 商家端 UI | 原生 HTML + CSS + JS（单页应用） |
| 快递员端 UI | 原生 HTML + CSS + JS（移动端适配） |
| 条形码扫描 | QuaggaJS（CDN） |
| 拍照 OCR | Tesseract.js（CDN） |

## 目录结构

```
├── backend/                  # 后端（商家端）
│   ├── api/                  # API 接口
│   │   ├── auth.php          # 商家登录/改密
│   │   ├── couriers.php      # 快递公司管理 + 单号前缀规则
│   │   ├── accounts.php      # 快递员密码管理 + 快递员登录
│   │   ├── intercepts.php    # 拦截件录入/退回/匹配/核对
│   │   ├── reconcile.php     # 对账/统计/导出
│   │   └── evidence.php      # 退回照片查看
│   ├── config/
│   │   ├── app.php           # 应用配置（JWT密钥从环境变量读取）
│   │   └── database.php      # 数据库连接配置
│   ├── lib/
│   │   ├── bootstrap.php     # 公共引导（CORS、自动加载、请求体解析）
│   │   ├── DB.php            # PDO 数据库单例
│   │   ├── JWT.php           # JWT 签发/校验
│   │   ├── Auth.php          # 认证中间件（含数据库凭证校验）
│   │   ├── Response.php      # 统一 JSON 响应
│   │   ├── CarrierResolver.php  # 单号前缀匹配快递公司
│   │   └── ReturnEvidence.php  # 退回照片上传校验
│   ├── sql/
│   │   └── init.sql          # 建库建表 + 初始快递公司数据
│   ├── web/                  # 商家端管理界面
│   │   ├── index.html
│   │   └── assets/
│   │       ├── style.css
│   │       ├── app.js
│   │       └── reviews.js    # 照片核对交互
│   └── init.php              # 初始化脚本（仅命令行执行，创建默认商家账号）
└── frontend/                 # 快递员端
    ├── index.html
    ├── style.css
    ├── app.js                # 主逻辑（登录/统计/扫码/列表）
    └── photos.js             # 照片批量处理（OCR/压缩/上传）
```

## 部署步骤

### 1. 环境要求
- PHP 7.4+（需启用 `pdo_mysql` 扩展）
- MySQL 5.7+ / MariaDB 10.3+
- Web 服务器（Apache / Nginx）

### 2. 初始化数据库
```bash
mysql -u root -p < backend/sql/init.sql
```
> 创建 `intercept_reconcile` 数据库、所有表，并插入 10 家快递公司。
> `courier_prefix_rules`（前缀规则）和 `return_photos`（退回照片）表在首次访问 API 时自动创建。

### 3. 配置数据库连接
编辑 `backend/config/database.php`：
```php
'host' => '127.0.0.1',
'username' => 'root',
'password' => '你的密码',
```

### 4. 配置 JWT 密钥（必须）
JWT 密钥从环境变量 `INTERCEPT_JWT_SECRET` 读取，要求至少 32 位。设置方式：

```bash
# Linux/Mac (Apache)
export INTERCEPT_JWT_SECRET="你的至少32位随机字符串"

# Nginx + PHP-FPM，在 php-fpm.conf 或 pool 配置中
env[INTERCEPT_JWT_SECRET] = 你的至少32位随机字符串

# Windows IIS + PHP，在系统环境变量中设置

# Apache .htaccess
SetEnv INTERCEPT_JWT_SECRET 你的至少32位随机字符串
```

若未配置或长度不足，登录及需要验证令牌的 API 将返回 503 错误。

### 5. 创建默认商家账号（命令行）
```bash
php backend/init.php
```
> 执行前设置环境变量 `INTERCEPT_ADMIN_PASSWORD`（至少8位），用于创建商家初始密码。固定内部身份为 admin，页面仅输入密码。
> **创建后请立即登录修改密码。** init.php 仅允许命令行执行，防止 Web 误访问。

### 6. 部署到 Web 服务器

#### Apache
将项目放到 Web 根目录：
- 商家端：`http://你的域名/backend/web/`
- 快递员端：`http://你的域名/frontend/`

#### Nginx 示例
```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /var/www/intercept;
    index index.html index.php;
    location ~ \.php$ {
        fastcgi_pass unix:/run/php/php8.0-fpm.sock;
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
    }
}
```

### 7. 配置快递员端后端地址
快递员端默认按同源推断后端地址（frontend 与 backend 同级）。若前后端不同域，在登录页「设置后端地址」填入后端基址，如 `http://your-domain.com/backend/`。

## 使用流程

### 商家端
1. 登录商家端（仅输入自行设置的商家密码）→ 首次进入会引导修改密码
2. **快递公司**：为每家公司维护**单号前缀**（如顺丰填 `SF`，中通填 `ZTO`、`7700` 等）。前缀越长优先级越高，同一前缀不能分给两家公司
3. **快递员密码**：为每家快递公司设置共享密码（至少 8 位），下发给该公司快递员
4. **拦截件管理**：录入拦截的快递单号（单条或批量），系统按前缀自动识别快递公司
5. **拦截件列表**：点击「查看照片/核对」查看快递员上传的退回照片，确认一致标记「已核对」，或驳回要求重拍
6. **对账中心**：按快递公司 + 日期查看对账，可保存对账记录、导出 CSV

### 快递员端
1. 快递员打开前端 → 选择快递公司 → 输入密码登录
2. 首页显示「待交回包裹」数（商家每天录入的拦截件自动同步，每 15 秒刷新）
3. **扫码拍照退回**：点击「开始扫码并自动拍照」，对准包裹条码，识别成功后自动抓拍照片并上传
4. **批量照片退回**：点击「上传照片自动匹配」，选择多张包裹照片，系统 OCR 识别运单号自动匹配并上传
5. 退回后状态变为「已退回待核对」，等待商家核对照片

## 数据隔离说明

- 每家快递公司一个共享密码，登录后 Token 绑定 `courier_id`
- 快递员所有查询/退回操作都限定在该快递公司下，**不同快递公司数据互不可见**
- 商家端数据按 `merchant_id` 隔离；当前为单商家部署，不作为多商家平台使用
- 退回照片按 `courier_id` 隔离，快递员只能查看本公司的照片

## 安全机制

1. JWT 密钥从环境变量读取，要求至少 32 位
2. Token 中携带 `credential`（密码哈希的 SHA256），每次请求校验数据库当前密码哈希，**改密后旧 Token 立即失效**
3. 退回必须上传照片凭证（JPG/PNG/WebP，5MB 内，24MP 内）
4. 照片通过 PHP 流式输出，设置 `X-Content-Type-Options: nosniff` 防止 MIME 嗅探
5. 前端照片压缩至 1600px / JPEG 0.8 质量后上传
6. init.php 仅允许命令行执行
7. 所有数据库查询使用 PDO 参数化，防 SQL 注入

## 默认快递公司

顺丰(SF) · 中通(ZTO) · 圆通(YTO) · 韵达(YD) · 申通(STO) · 百世(HTKY) · 京东(JD) · 邮政EMS(EMS) · 极兔(JT) · 德邦(DBL)

> 内置公司未预设前缀规则，需在「快递公司」页面为每家公司维护实际单号前缀后才能录入拦截件。

## 拦截件状态流转

```
intercepted（待退回）
    │ 快递员扫码拍照退回
    ▼
returned（已退回待核对）
    │ 商家核对照片
    ├──确认──▶ verified（已核对）
    └──驳回──▶ intercepted（恢复待退回，快递员重拍）
    
cancelled（已取消，商家主动取消）
```

## 常见问题

**Q: 录入拦截件提示"未匹配到公司"？**
A: 该运单号前缀未在「快递公司」页面维护。请先为对应公司添加单号前缀（如顺丰单号以 SF 开头则填 SF）。

**Q: 扫码摄像头无法启动？**
A: 浏览器要求 HTTPS 或 localhost 才能调用摄像头。请用 HTTPS 地址打开快递员端，或本地用 127.0.0.1 测试。

**Q: 拍照 OCR 识别不准？**
A: Tesseract.js 为纯前端通用 OCR，对面单清晰度要求较高。建议光线充足、对准单个包裹和运单号。系统会从识别结果中提取候选运单号逐一匹配，匹配到唯一件才会上传。

**Q: 快递员改密后旧登录还能用吗？**
A: 不能。密码修改后，旧 Token 的凭证校验会失败，快递员需用新密码重新登录。

**Q: 如何让历史无照片的退回件补拍？**
A: 商家端「查看照片/核对」中，若无照片可点击「要求补拍，恢复待退回」，该件会回到待退回列表。

## 许可证

项目自有代码采用 MIT 许可证，见 LICENSE。QuaggaJS、Tesseract.js 等第三方依赖遵循各自许可证。

## 验证范围

JavaScript 语法与现有自动匹配、登录和录入测试已通过；扫码及 OCR 准确率仍需用真实手机、真实面单验证。请勿将演示效果视为识别准确率保证。
