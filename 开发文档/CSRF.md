# CSRF 防护（Cross-Site Request Forgery）

本项目使用 **Double Submit Cookie** 模式防御 CSRF 攻击。
配套实现见 `apps/server/src/common/middleware/csrf.middleware.ts`。

## 工作流程

### 1. 普通 REST 场景

```
1. 客户端首次访问 /api/auth/csrf-token
   → 后端 Set-Cookie: csrf-token=<token>; HttpOnly; SameSite=Strict
   → 响应体返回 { token }

2. 前端把 token 存在内存（pinia / composable）

3. 写请求（POST/PUT/DELETE/PATCH + GraphQL mutation）
   → 浏览器自动带 csrf-token cookie（SameSite=Strict 不允许跨站带）
   → 前端在 X-CSRF-Token header 里带相同 token
   → 后端中间件校验：cookie === header
```

**为什么是 Double Submit**：

- 攻击者的网站无法读到我们的 Set-Cookie（HttpOnly + SameSite=Strict）
- 攻击者无法伪造 X-CSRF-Token header（攻击者要猜出 64 字符 hex）
- 即使攻击者诱导用户带 cookie（SameSite=Strict 也不允许），也无法匹配 header

### 2. SSE 场景（EventSource 例外）

浏览器原生 `EventSource` API 限制：

- **不支持自定义 header**（只能由浏览器控制 Accept / Cache-Control 等）
- 只能通过 **URL query 参数** 传 token

```
1. 客户端请求 /api/auth/csrf-token?type=sse
   → 后端 Set-Cookie: sse-csrf=<token>; HttpOnly; Secure; SameSite=None
   → 响应体返回 { token }

2. 前端建立 EventSource：
   const es = new EventSource(`/api/stream?csrf=${token}`, { withCredentials: true });

3. 后端中间件检测 Accept: text/event-stream
   → 走 SSE 校验路径：cookie (sse-csrf) === query (csrf)
```

**安全权衡**：

- SSE 端点必须 `SameSite=None; Secure`（EventSource 不支持自定义 header）
- 攻击者可以在用户访问恶意网站时嵌入一个 `<img src="https://api.example.com/api/stream?csrf=victim_token">` 标签
- 但攻击者拿不到用户的 sse-csrf cookie（HttpOnly），所以无法构造匹配的 token
- **重要**：SSE 端点**不能用于执行写操作**，只能用于被动推送数据

## Cookie 配置

| 场景       | Cookie 名           | SameSite | Secure | HttpOnly | 用途                   |
| ---------- | ------------------- | -------- | ------ | -------- | ---------------------- |
| REST       | `__Host-csrf-token` | `Strict` | true   | true     | 写请求（POST/PUT/...） |
| REST (dev) | `csrf-token`        | `Strict` | false  | true     | 同上，开发用 HTTP      |
| SSE        | `__Host-sse-csrf`   | `None`   | true   | true     | EventSource 长连接     |
| SSE (dev)  | `sse-csrf`          | `None`   | false  | true     | 同上，开发用 HTTP      |

> `__Host-` 前缀的 cookie 强制要求 `Secure; Path=/; no Domain`，能彻底防域名欺骗。

## 配置开关

`.env` 里的 `CSRF_COOKIE_SECURE`（`true`/`false`）控制 Secure 标志：

- `true`：生产环境，cookie 名带 `__Host-` 前缀
- `false`：开发环境，普通 cookie 名 + 不强制 Secure

```bash
# 开发环境
CSRF_COOKIE_SECURE=false

# 生产环境
CSRF_COOKIE_SECURE=true
```

## 豁免规则

CSRF 中间件对以下请求**不校验**：

| 路径                         | 原因                               |
| ---------------------------- | ---------------------------------- |
| `GET` / `HEAD` / `OPTIONS`   | HTTP 规范上不应有副作用            |
| `/api/auth/login`            | 登录前 cookie 还没建，登录后才能用 |
| `/api/admin/auth/login`      | 同上                               |
| `/api/member/auth/sms/login` | 短信登录前 cookie 还没建           |
| `/api/auth/refresh`          | 用 refresh token（cookie 形式）    |
| `/api/auth/logout`           | 用户主动登出，cookie 会被清掉      |
| `/api/auth/csrf-token`       | 下发 token 端点                    |

GraphQL（`/graphql`）：

- query 操作不校验
- mutation 操作要校验
- 无法判断类型时放行（GraphQL 内部有 JWT 鉴权兜底）

## 前端集成

### Web 端（REST）

```ts
// 1. 首次访问拿 token
const res = await fetch('/api/auth/csrf-token', { credentials: 'include' });
const { token } = await res.json();

// 2. 写请求带 header
await fetch('/api/admin/foo', {
    method: 'POST',
    credentials: 'include', // 关键：带 cookie
    headers: { 'X-CSRF-Token': token },
    body: JSON.stringify({ ... }),
});
```

### Web 端（SSE）

```ts
// 1. 拉 SSE 专用 token
const res = await fetch('/api/auth/csrf-token?type=sse', { credentials: 'include' });
const { token } = await res.json();

// 2. 拼到 EventSource URL
const url = `/api/stream?csrf=${encodeURIComponent(token)}`;
const es = new EventSource(url, { withCredentials: true });
```

## 时序安全

后端用 `crypto.timingSafeEqual` 比较 cookie 和 header（query）的 token：

- 先比长度：长度不一致直接 403（避免 `timingSafeEqual` 抛 RangeError 暴露信息）
- 长度相同才走 `timingSafeEqual`：恒定时间比较，防 timing attack

## 单元测试

测试文件：`apps/server/src/common/middleware/__tests__/csrf.middleware.spec.ts`

覆盖：

1. 异长 token（不抛 RangeError）
2. 同长但内容不同
3. token 完全匹配 → next()
4. 缺 cookie / 缺 header / 都缺
5. GET / HEAD / OPTIONS 跳过
6. 豁免路径
7. SSE 带 query + 专用 cookie → 通过
8. SSE 缺 query → 403
9. SSE cookie 与 query 不一致 → 403
10. 普通 POST 仍走 header（不被 query 干扰）

## 边界情况

| 场景                          | 行为                                       |
| ----------------------------- | ------------------------------------------ |
| 客户端只发 cookie 不发 header | 403 CSRF token missing                     |
| 客户端只发 header 不发 cookie | 403 CSRF token missing                     |
| cookie 与 header 长度不同     | 403 CSRF token mismatch（不抛 RangeError） |
| 攻击者用脚本探测 64 字符 hex  | 理论上需要 2^256 次尝试，暴力破解不可行    |
| 用户禁用 cookie               | 写请求被 CSRF 中间件拦截，前端需提示       |
| 跨子域攻击（subdomain）       | `__Host-` 前缀的 cookie 不能被 sub 设置    |

## 相关文件

- 实现：`apps/server/src/common/middleware/csrf.middleware.ts`
- 挂载：`apps/server/src/main.ts`（`app.use(csrfGuard(configService))`）
- 工厂调用：`apps/server/src/modules/auth/admin/admin-auth.controller.ts` 等登录响应
- 前端调用：`apps/web/src/api/csrf.ts`
