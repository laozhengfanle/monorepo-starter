# OAuth 第三方登录方案

> 微信（公众号 / 小程序 / 开放平台）和 Apple 登录的完整对接方案：时序图、token 管理、账号绑定/解绑、安全防护。
> 设计原则：**平台可扩展**——新增第三方登录只需实现 `OAuthProvider` 接口 + 注册路由，业务代码零改动。

---

## 一、支持平台

| 平台                     |  identity_type  | identifier    |   适用端    | 优先级 |
| ------------------------ | :-------------: | ------------- | :---------: | :----: |
| 微信开放平台（网站应用） | `wechat_openid` | openid        |   PC Web    | 🔴 高  |
| 微信公众号（网页授权）   | `wechat_openid` | openid        |  微信内 H5  | 🔴 高  |
| 微信小程序               | `wechat_openid` | openid        |   小程序    | 🟡 中  |
| Apple                    |     `apple`     | Apple user ID | iOS / macOS | 🟡 中  |

> 微信三端的 **unionid 机制** 是核心设计点——同一用户在不同端有不同 openid，但 unionid 相同。详见 [unionid 策略](#四unionid-策略)。

---

## 二、架构设计

### 模块位置

```text
server/src/
├── common/
│   └── oauth/                          # OAuth 服务模块
│       ├── oauth.module.ts             # 动态模块，根据配置注入实现
│       ├── oauth.service.ts            # 业务层：授权、回调、绑定/解绑
│       ├── oauth.provider.ts           # OAuthProvider 接口定义
│       └── providers/
│           ├── wechat-web.provider.ts  # 微信开放平台（网站应用）
│           ├── wechat-mp.provider.ts   # 微信公众号（网页授权）
│           ├── wechat-miniprogram.provider.ts  # 微信小程序
│           └── apple.provider.ts       # Apple 登录
├── modules/
│   └── auth/
│       └── member/
│           └── member-auth.controller.ts  # POST /member/auth/wechat, /member/auth/apple
```

### OAuthProvider 接口

```typescript
/**
 * 第三方 OAuth 服务商抽象接口
 * 新增平台只需实现此接口，然后在 oauth.module.ts 中注册
 */
export interface OAuthProvider {
    /** 平台标识，对应 account_identity.identity_type */
    readonly identityType: string;

    /** 生成授权 URL（前端跳转用） */
    getAuthorizationUrl(params: GetAuthorizationUrlParams): Promise<AuthorizationResult>;

    /** 用授权码换取用户信息 */
    getUserInfo(params: GetUserInfoParams): Promise<OAuthUserInfo>;

    /** 刷新 access_token（如已过期） */
    refreshAccessToken?(refreshToken: string): Promise<TokenRefreshResult>;
}

export interface GetAuthorizationUrlParams {
    /** OAuth state 参数（防 CSRF） */
    state: string;
    /** 回调地址 */
    redirectUri: string;
    /** 附加参数（如微信的 scope） */
    extraParams?: Record<string, string>;
}

export interface AuthorizationResult {
    /** 前端应跳转的授权 URL */
    url: string;
}

export interface GetUserInfoParams {
    /** 授权码 */
    code: string;
    /** 回调地址（部分平台需要） */
    redirectUri?: string;
}

export interface OAuthUserInfo {
    /** 平台内的用户唯一标识（openid / Apple user ID） */
    openid: string;
    /** 跨应用统一标识（微信 unionid，Apple 无此概念） */
    unionid?: string;
    /** 昵称（可能为空，微信已不再返回头像昵称） */
    nickname?: string;
    /** 头像 URL（可能为空） */
    avatar?: string;
    /** access_token（需加密存储） */
    accessToken: string;
    /** refresh_token */
    refreshToken?: string;
    /** access_token 过期时间（Unix 时间戳） */
    expiresAt?: number;
}

export interface TokenRefreshResult {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: number;
}
```

---

## 三、时序图

### 3.1 微信开放平台（网站应用）登录

```text
┌────────┐     ┌────────┐     ┌──────────────┐     ┌───────┐     ┌────────┐
│ 浏览器  │     │ Server │     │ 微信开放平台  │     │ Redis │     │  DB    │
└───┬────┘     └───┬────┘     └──────┬───────┘     └───┬───┘     └───┬────┘
    │              │                 │                  │             │
    │ 1. 点击"微信登录"│              │                  │             │
    │─────────────→│                 │                  │             │
    │              │                 │                  │             │
    │              │ 2. 生成 state    │                  │             │
    │              │    存入 Redis    │                  │             │
    │              │─────────────────────────────────→│             │
    │              │                 │                  │             │
    │              │ 3. 返回授权 URL  │                  │             │
    │←─────────────│                 │                  │             │
    │              │                 │                  │             │
    │ 4. 302 跳转微信授权页            │                  │             │
    │─────────────────────────────→│                  │             │
    │              │                 │                  │             │
    │ 5. 用户扫码确认 │                 │                  │             │
    │←─────────────────────────────│                  │             │
    │              │                 │                  │             │
    │ 6. 302 回调 /member/auth/wechat/callback?code=xxx&state=yyy
    │─────────────→│                 │                  │             │
    │              │                 │                  │             │
    │              │ 7. 校验 state   │                  │             │
    │              │─────────────────────────────────→│             │
    │              │                 │                  │             │
    │              │ 8. code 换 access_token + openid  │             │
    │              │────────────────→│                  │             │
    │              │←────────────────│                  │             │
    │              │                 │                  │             │
    │              │ 9. access_token 换用户信息（可选）  │             │
    │              │────────────────→│                  │             │
    │              │←────────────────│                  │             │
    │              │                 │                  │             │
    │              │ 10. 查 account_identity            │             │
    │              │    WHERE identity_type='wechat_openid'          │
    │              │    AND identifier=openid           │             │
    │              │─────────────────────────────────────────────→│
    │              │                 │                  │             │
    │              │ 11a. 找到 → 签发 JWT               │             │
    │              │ 11b. 未找到 → 事务创建账号 → 签发 JWT│             │
    │              │                 │                  │             │
    │ 12. 返回 JWT + 用户信息         │                  │             │
    │←─────────────│                 │                  │             │
```

### 3.2 微信公众号（网页授权）登录

与开放平台流程基本一致，差异点：

| 维度     | 开放平台                               | 公众号                                           |
| -------- | -------------------------------------- | ------------------------------------------------ |
| 授权 URL | `open.weixin.qq.com/connect/qrconnect` | `open.weixin.qq.com/connect/oauth2/authorize`    |
| scope    | `snsapi_login`                         | `snsapi_base`（静默）/ `snsapi_userinfo`（弹窗） |
| 用户信息 | 需单独 API 获取                        | `snsapi_userinfo` 时可直接获取                   |
| 回调域名 | 开放平台后台配置                       | 公众号后台配置                                   |
| 使用场景 | PC 网站扫码                            | 微信内 H5 页面                                   |

### 3.3 微信小程序登录

```text
┌────────┐     ┌────────┐     ┌──────────┐     ┌───────┐     ┌────────┐
│ 小程序  │     │ Server │     │ 微信API  │     │ Redis │     │  DB    │
└───┬────┘     └───┬────┘     └────┬─────┘     └───┬───┘     └───┬────┘
    │              │               │                │             │
    │ 1. wx.login() │               │                │             │
    │─────────────→│               │                │             │
    │  返回 code   │               │                │             │
    │←─────────────│               │                │             │
    │              │               │                │             │
    │ 2. POST /member/auth/wechat/miniprogram { code }
    │─────────────→│               │                │             │
    │              │               │                │             │
    │              │ 3. code + appid + secret 换 session_key + openid
    │              │──────────────→│                │             │
    │              │←──────────────│                │             │
    │              │               │                │             │
    │              │ 4. 查/创建账号  │                │             │
    │              │────────────────────────────────────────────→│
    │              │               │                │             │
    │ 5. 返回 JWT  │               │                │             │
    │←─────────────│               │                │             │
```

> ⚠️ 小程序的 `session_key` 用于解密用户信息（如手机号），**不存入 account_identity.credential**。session_key 有效期短，应存 Redis（TTL 与微信一致，约 30 天）。

### 3.4 Apple 登录

```text
┌────────┐     ┌────────┐     ┌──────────┐     ┌───────┐     ┌────────┐
│ iOS/Web│     │ Server │     │ Apple API│     │ Redis │     │  DB    │
└───┬────┘     └───┬────┘     └────┬─────┘     └───┬───┘     └───┬────┘
    │              │               │                │             │
    │ 1. Apple ID 登录弹窗          │                │             │
    │  (ASAuthorizationAppleIDProvider)              │             │
    │              │               │                │             │
    │ 2. 返回 authorization code + identity_token + user
    │─────────────→│               │                │             │
    │              │               │                │             │
    │              │ 3. 校验 identity_token 签名     │             │
    │              │    (Apple 公钥 JWT 验证)        │             │
    │              │──────────────→│                │             │
    │              │←──────────────│                │             │
    │              │               │                │             │
    │              │ 4. 提取 sub (Apple user ID)     │             │
    │              │    查/创建账号  │                │             │
    │              │────────────────────────────────────────────→│
    │              │               │                │             │
    │ 5. 返回 JWT  │               │                │             │
    │←─────────────│               │                │             │
```

> Apple 登录的特殊性：
>
> - **无需服务端换 token**：前端直接拿到 `identity_token`（JWT），服务端只需验证签名
> - **首次登录才返回用户信息**：`name` 和 `email` 只在首次授权时返回，后续只返回 `sub`
> - **必须实现 token 撤销通知**：Apple 要求实现 `revoked` 通知端点

---

## 四、unionid 策略

### 什么是 unionid

微信生态中，同一用户在不同应用（公众号、小程序、开放平台应用）有不同的 openid，但 unionid 相同（前提：这些应用绑定到同一个微信开放平台账号）。

### 账号关联策略

```text
场景：用户先用小程序登录（获得 openid_A），后来又在 PC 网站扫码登录（获得 openid_B）

如果两个应用绑定了同一开放平台账号：
  → 两次登录返回相同的 unionid
  → 通过 unionid 关联到同一个 account
  → account_identity 表有两条记录：
    1. identity_type='wechat_openid', identifier='openid_A'（小程序）
    2. identity_type='wechat_openid', identifier='openid_B'（PC 网站）

如果未绑定开放平台账号：
  → 没有 unionid
  → 两次登录创建两个独立 account（用户需手动绑定手机号来合并）
```

### 数据库存储

```sql
-- account_identity 表中的存储方式
-- 微信开放平台（PC 网站）
identity_type = 'wechat_openid', identifier = 'oXXXX...', credential = AES({ access_token, refresh_token, unionid, expires_at })

-- 微信公众号
identity_type = 'wechat_openid', identifier = 'oYYYY...', credential = AES({ access_token, refresh_token, unionid, expires_at })

-- 微信小程序
identity_type = 'wechat_openid', identifier = 'oZZZZ...', credential = AES({ session_key, unionid })
```

> `unionid` 存在 `credential` 的加密 JSON 中，而非单独字段。原因：unionid 不是登录标识（不能用来查 account_identity），只是关联逻辑的中间数据。

### unionid 关联逻辑

```typescript
/**
 * 微信登录时，通过 unionid 关联已有账号
 * 流程：
 * 1. 先用 openid 查 account_identity
 * 2. 找到 → 直接登录
 * 3. 未找到 → 有 unionid → 用 unionid 查其他 wechat_openid 记录
 * 4. 找到 → 将新 openid 关联到同一 account
 * 5. 未找到 → 创建新账号
 */
async findOrCreateByWechat(userInfo: OAuthUserInfo): Promise<{ account: Account; isNew: boolean }> {
  // 1. 用 openid 查
  const existing = await this.prisma.accountIdentity.findUnique({
    where: { identity_type_identifier: { identity_type: 'wechat_openid', identifier: userInfo.openid } },
    include: { account: true },
  });

  if (existing) {
    // 更新 credential（token 可能刷新了）
    await this.updateCredential(existing.id, userInfo);
    return { account: existing.account, isNew: false };
  }

  // 2. 用 unionid 查关联（如果有）
  if (userInfo.unionid) {
    const linked = await this.findByUnionid(userInfo.unionid);
    if (linked) {
      // 找到同 unionid 的记录 → 新 openid 关联到同一 account
      await this.prisma.accountIdentity.create({
        data: {
          id: generateUuidV7(),
          account_id: linked.account_id,
          identity_type: 'wechat_openid',
          identifier: userInfo.openid,
          credential: this.encryptCredential(userInfo),
          verified: true,
        },
      });
      // 写入 Redis 映射，后续同 unionid 登录直接 O(1) 查找
      if (userInfo.unionid) {
        await this.redis.setex(
          `mono:oauth:wechat:unionid:${userInfo.unionid}`,
          30 * 24 * 3600,
          linked.account_id,
        );
      }
      const account = await this.prisma.account.findUnique({ where: { id: linked.account_id } });
      return { account: account!, isNew: false };
    }
  }

  // 3. 全新用户 → 创建账号
  return this.createWechatAccount(userInfo);
}

/**
 * 通过 unionid 查找已有的微信登录记录
 * 优先查 Redis 映射，miss 时回退到 DB 查询（仅首次）
 */
private async findByUnionid(unionid: string): Promise<AccountIdentity | null> {
  // 1. 优先查 Redis 映射（O(1)，热路径）
  const redisKey = `mono:oauth:wechat:unionid:${unionid}`;
  const accountId = await this.redis.get(redisKey);
  if (accountId) {
    // 用 account_id 反查任意一条 wechat_openid 记录
    return this.prisma.accountIdentity.findFirst({
      where: { account_id: accountId, identity_type: 'wechat_openid' },
    });
  }

  // 2. Redis miss → DB 查询（冷启动或缓存过期时）
  // 用 credential 中的 unionid 匹配，限制扫描范围
  const wechatIdentities = await this.prisma.accountIdentity.findMany({
    where: { identity_type: 'wechat_openid' },
    take: 1000,
  });

  for (const identity of wechatIdentities) {
    const cred = this.decryptCredential(identity.credential);
    if (cred?.unionid === unionid) {
      // 回填 Redis 映射，后续请求走缓存
      await this.redis.setex(redisKey, 30 * 24 * 3600, identity.account_id);
      return identity;
    }
  }

  return null;
}
```

> `findByUnionid` 采用 Redis 映射 + DB 回退策略：首次查询走 DB 遍历并回填 Redis（`mono:oauth:wechat:unionid:{unionid} → account_id`，TTL 30 天），后续查询 O(1) 命中缓存。映射写入时机：微信登录/注册成功后。

---

## 五、token 管理

### OAuth Token 存储策略

| token                      | 存储位置                                   | 加密方式    | TTL     | 用途                           |
| -------------------------- | ------------------------------------------ | ----------- | ------- | ------------------------------ |
| 微信 access_token          | `account_identity.credential`              | AES-256-GCM | 2 小时  | 调用微信 API（获取用户信息等） |
| 微信 refresh_token         | `account_identity.credential`              | AES-256-GCM | 30 天   | 刷新 access_token              |
| 微信 session_key（小程序） | Redis `mono:oauth:wechat:session:{openid}` | 不加密      | 30 天   | 解密小程序用户信息             |
| Apple refresh_token        | `account_identity.credential`              | AES-256-GCM | 长期    | Apple 要求的 token 撤销        |
| Apple identity_token       | 不存储                                     | —           | 10 分钟 | 一次性验证，验证后丢弃         |

### credential 加密 JSON 结构

```typescript
/** 微信 credential 解密后的结构 */
interface WechatCredential {
    access_token: string;
    refresh_token: string;
    expires_at: number; // access_token 过期时间（Unix 时间戳）
    unionid?: string; // 跨应用统一标识
}

/** 小程序 credential 解密后的结构 */
interface WechatMiniProgramCredential {
    session_key: string;
    unionid?: string;
}

/** Apple credential 解密后的结构 */
interface AppleCredential {
    refresh_token: string; // Apple 的 refresh_token 是长期有效的
    email?: string; // 首次授权时 Apple 返回的邮箱
}
```

### Token 刷新机制

```typescript
/**
 * 获取有效的微信 access_token
 * 如果已过期，自动刷新并更新 credential
 */
async getValidAccessToken(accountIdentityId: string): Promise<string> {
  const identity = await this.prisma.accountIdentity.findUnique({
    where: { id: accountIdentityId },
  });

  const cred = this.decryptCredential<WechatCredential>(identity!.credential);

  // 未过期，直接返回
  if (cred.expires_at > Date.now() / 1000 + 300) { // 提前 5 分钟刷新
    return cred.access_token;
  }

  // 已过期，刷新
  if (!cred.refresh_token) {
    throw new BusinessException(ErrorCode.OAUTH_TOKEN_EXPIRED_NO_REFRESH);
  }

  const provider = this.getProvider('wechat') as WechatWebProvider;
  const refreshed = await provider.refreshAccessToken(cred.refresh_token);

  // 更新 credential
  const newCred: WechatCredential = {
    ...cred,
    access_token: refreshed.accessToken,
    refresh_token: refreshed.refreshToken || cred.refresh_token,
    expires_at: refreshed.expiresAt!,
  };

  await this.prisma.accountIdentity.update({
    where: { id: accountIdentityId },
    data: { credential: this.encryptCredential(newCred) },
  });

  return newCred.access_token;
}
```

---

## 六、账号绑定与解绑

### 绑定流程

用户已通过手机号登录，想绑定微信（后续可微信直接登录）：

```text
1. 用户点击"绑定微信"
2. 前端发起微信 OAuth（携带当前 JWT）
3. 回调时，服务端校验 JWT + 微信 code
4. 查 account_identity WHERE identity_type='wechat_openid' AND identifier=openid
   - 已存在且属于其他 account → 提示"该微信已绑定其他账号"
   - 不存在 → INSERT account_identity（关联到当前 account）
5. 绑定成功
```

```typescript
/**
 * 绑定第三方账号
 * @param accountId 当前登录用户的 account ID
 * @param providerType 平台类型
 * @param code OAuth 授权码
 */
async bindOAuth(accountId: string, providerType: string, code: string): Promise<void> {
  const provider = this.getProvider(providerType);
  const userInfo = await provider.getUserInfo({ code });

  // 检查该 openid 是否已被其他账号绑定
  const existing = await this.prisma.accountIdentity.findUnique({
    where: {
      identity_type_identifier: {
        identity_type: provider.identityType,
        identifier: userInfo.openid,
      },
    },
  });

  if (existing) {
    if (existing.account_id === accountId) {
      throw new BusinessException(ErrorCode.OAUTH_ALREADY_BOUND);
    }
    throw new BusinessException(ErrorCode.OAUTH_BOUND_TO_OTHER_ACCOUNT);
  }

  // 创建绑定记录
  await this.prisma.accountIdentity.create({
    data: {
      id: generateUuidV7(),
      account_id: accountId,
      identity_type: provider.identityType,
      identifier: userInfo.openid,
      credential: this.encryptCredential(userInfo),
      verified: true,
    },
  });

  // 清除权限缓存（登录方式变更可能影响权限计算）
  await this.redis.del(`mono:auth:${accountId}`);
}
```

### 解绑流程

```typescript
/**
 * 解绑第三方账号
 * 安全约束：不能解绑唯一的登录方式
 */
async unbindOAuth(accountId: string, providerType: string): Promise<void> {
  // 查询该账号的所有登录方式
  const identities = await this.prisma.accountIdentity.findMany({
    where: { account_id: accountId },
  });

  // 至少保留一种已验证的登录方式
  const verifiedCount = identities.filter((i) => i.verified).length;
  if (verifiedCount <= 1) {
    throw new BusinessException(ErrorCode.OAUTH_CANNOT_UNBIND_LAST);
  }

  // 检查要解绑的是否存在
  const target = identities.find((i) => i.identity_type === providerType);
  if (!target) {
    throw new BusinessException(ErrorCode.OAUTH_NOT_BOUND);
  }

  // 删除绑定记录
  await this.prisma.accountIdentity.delete({
    where: { id: target.id },
  });

  // 清除权限缓存
  await this.redis.del(`mono:auth:${accountId}`);
}
```

---

## 七、安全防护

### 7.1 OAuth State 防 CSRF

```typescript
/**
 * 生成 OAuth state 参数
 * 1. 生成 32 字节随机数
 * 2. 存入 Redis（TTL 10 分钟）
 * 3. 返回 state 值
 */
async generateState(sessionId?: string): Promise<string> {
  const state = crypto.randomBytes(32).toString('hex');
  const value = sessionId ? JSON.stringify({ sid: sessionId }) : '1';
  await this.redis.setex(`mono:oauth:state:${state}`, 600, value);
  return state;
}

/**
 * 校验 OAuth state
 * 一次性消费：校验后立即删除
 */
async verifyState(state: string): Promise<boolean> {
  const key = `mono:oauth:state:${state}`;
  const exists = await this.redis.exists(key);
  if (exists) {
    await this.redis.del(key); // 一次性消费
  }
  return exists === 1;
}
```

### 7.2 Apple Token 撤销通知

Apple 要求实现 token 撤销通知端点（App Store 审核要求）：

```typescript
/**
 * Apple token 撤销通知
 * 当用户在 Apple 设置中停止使用 Apple ID 登录时，Apple 会发送此通知
 */
@Post('apple/revoke')
async handleAppleRevoke(@Body() body: AppleRevokeNotification): Promise<void> {
  // 1. 验证 JWT 签名（Apple 签发的通知 JWT）
  const decoded = this.verifyAppleNotificationJwt(body.payload);

  // 2. 根据 sub (Apple user ID) 找到关联的 account_identity
  const identity = await this.prisma.accountIdentity.findUnique({
    where: {
      identity_type_identifier: {
        identity_type: 'apple',
        identifier: decoded.sub,
      },
    },
  });

  if (!identity) return;

  // 3. 标记为未验证（不删除，保留绑定关系）
  await this.prisma.accountIdentity.update({
    where: { id: identity.id },
    data: {
      verified: false,
      credential: null, // 清除 token
    },
  });

  // 4. 清除权限缓存
  await this.redis.del(`mono:auth:${identity.account_id}`);

  // 5. 通知用户（下次登录时提示"Apple 登录已失效，请使用其他方式"）
}
```

### 7.3 安全检查清单

| 风险              | 防护措施                                  | 参考                                                    |
| ----------------- | ----------------------------------------- | ------------------------------------------------------- |
| CSRF 攻击         | OAuth state 参数，一次性消费              | [安全防护.md](./安全防护.md#16-oauth-state-参数防-csrf) |
| Token 泄露        | AES-256-GCM 加密存储                      | [安全防护.md](./安全防护.md#17-敏感字段-aes-加密)       |
| 授权码重放        | 授权码只能使用一次（平台保证）            | —                                                       |
| 回调 URL 篡改     | 回调地址硬编码在服务端，不传前端          | —                                                       |
| 用户信息伪造      | Apple identity_token 签名验证             | Apple 公钥 JWT                                          |
| 账号劫持          | 绑定/解绑需验证当前登录状态               | JWT 校验                                                |
| 微信 API 调用伪造 | access_token 由服务端直接换取，不经过前端 | —                                                       |

---

## 八、REST API 设计

### 端点定义

```http
# 微信登录（开放平台 / 公众号）
POST /member/auth/wechat
Content-Type: application/json

Request:
{
  "code": "071234567890",      # 微信授权码
  "state": "abc123...",         # CSRF state
  "platform": "web"             # web | mp | miniprogram
}

Response 200:
{
  "code": 0,
  "message": "登录成功",
  "data": {
    "accessToken": "eyJ...",
    "refreshToken": "eyJ...",
    "userType": "member",
    "isNewUser": false
  }
}

# 微信小程序登录
POST /member/auth/wechat/miniprogram
Content-Type: application/json

Request:
{
  "code": "071234567890"        # wx.login() 返回的 code
}

Response: 同上

# Apple 登录
POST /member/auth/apple
Content-Type: application/json

Request:
{
  "code": "c1234567890",        # Apple authorization code
  "identityToken": "eyJ...",    # Apple identity_token (JWT)
  "user": {                     # 仅首次登录有值
    "name": { "firstName": "张", "lastName": "三" },
    "email": "example@privaterelay.appleid.com"
  }
}

Response: 同上

# 绑定第三方账号（需登录）
POST /member/auth/bind
Content-Type: application/json
Authorization: Bearer eyJ...

Request:
{
  "provider": "wechat",         # wechat | apple
  "code": "071234567890",
  "state": "abc123..."
}

Response 200:
{
  "code": 0,
  "message": "绑定成功"
}

# 解绑第三方账号（需登录）
POST /member/auth/unbind
Content-Type: application/json
Authorization: Bearer eyJ...

Request:
{
  "provider": "wechat"          # wechat | apple
}

Response 200:
{
  "code": 0,
  "message": "解绑成功"
}

# 获取授权 URL（前端跳转用）
# 回调地址由服务端根据 platform 从环境变量读取，前端不传 redirectUri（防篡改）
GET /member/auth/wechat/authorize-url?platform=web

Response 200:
{
  "code": 0,
  "data": {
    "url": "https://open.weixin.qq.com/connect/qrconnect?appid=...&state=...",
    "state": "abc123..."
  }
}
```

### Provider Type → 端点路径映射

> 原文档散落出现 `wechat` / `wechat-miniprogram` / `wechat-mp` / `wechat-web` / `apple` 多种命名，本表统一服务端点路径（前端只需关注 `provider` 字段值）。

| provider 字段        | 实际场景           | 端点路径                               | 回调路径                               | identity_type   |
| -------------------- | ------------------ | -------------------------------------- | -------------------------------------- | --------------- |
| `wechat-web`         | PC Web（开放平台） | `POST /member/auth/wechat-web`         | `GET /member/auth/wechat-web/callback` | `wechat_openid` |
| `wechat-mp`          | 微信公众号 H5      | `POST /member/auth/wechat-mp`          | `GET /member/auth/wechat-mp/callback`  | `wechat_openid` |
| `wechat-miniprogram` | 微信小程序         | `POST /member/auth/wechat-miniprogram` | （无回调，前端 code 直传）             | `wechat_openid` |
| `apple`              | Apple Sign-In      | `POST /member/auth/apple`              | `POST /member/auth/apple/callback`     | `apple_sub`     |

> **统一请求体**：`POST /member/auth/{provider}` body = `{ code, state?, redirectUri? }`，response 统一返回 `{ accessToken, refreshToken, account, isNew }`。
>
> **统一回调路径**：`{provider}/callback` 是开放平台 OAuth 重定向入口，由服务端用 `code` 换 `access_token` 再换用户信息。

### Zod Schema

```typescript
import { z } from 'zod';

/** 微信登录请求 */
export const WechatLoginSchema = z.object({
    code: z.string().min(1, '授权码不能为空'),
    state: z.string().optional(),
    platform: z.enum(['web', 'mp', 'miniprogram']).default('web'),
});

/** 微信小程序登录请求 */
export const WechatMiniProgramLoginSchema = z.object({
    code: z.string().min(1, '授权码不能为空'),
});

/** Apple 登录请求 */
export const AppleLoginSchema = z.object({
    code: z.string().min(1, '授权码不能为空'),
    identityToken: z.string().min(1, 'identity_token 不能为空'),
    user: z
        .object({
            name: z.object({ firstName: z.string(), lastName: z.string() }).optional(),
            email: z.string().email().optional(),
        })
        .optional(),
});

/** 绑定第三方账号请求 */
export const BindOAuthSchema = z.object({
    provider: z.enum(['wechat', 'apple']),
    code: z.string().min(1, '授权码不能为空'),
    state: z.string().optional(),
});

/** 解绑第三方账号请求 */
export const UnbindOAuthSchema = z.object({
    provider: z.enum(['wechat', 'apple']),
});
```

---

## 九、错误码

| 错误码  | HTTP 状态 | 说明                                     | 前端处理                   |
| ------- | :-------: | ---------------------------------------- | -------------------------- |
| `40001` |    400    | OAuth 授权码无效或已过期                 | 提示重新授权               |
| `40002` |    400    | OAuth state 校验失败（CSRF）             | 提示重新授权               |
| `40003` |    409    | 该第三方账号已绑定其他账号               | 提示"该微信已绑定其他账号" |
| `40004` |    400    | 该第三方账号已绑定当前账号               | 提示"已绑定"               |
| `40005` |    400    | 解绑失败（至少保留一种已验证的登录方式） | 提示"请先绑定其他登录方式" |
| `40006` |    400    | 未绑定该第三方账号                       | 提示"未绑定"               |
| `40007` |    500    | 第三方 token 已过期且无 refresh_token    | 提示重新授权               |
| `40008` |    500    | 第三方用户信息获取失败                   | 提示稍后重试               |
| `40009` |    500    | 第三方平台 API 调用失败                  | 提示稍后重试               |
| `40010` |    400    | Apple identity_token 验证失败            | 提示重新授权               |

> 错误码段 `40xxx` 专用于 OAuth 服务，与短信 `30xxx`、认证 `20xxx`、权限 `22xxx` 段不冲突。

---

## 十、环境变量

```env
# ——— 微信开放平台（网站应用）———
WECHAT_WEB_APP_ID=
WECHAT_WEB_APP_SECRET=

# ——— 微信公众号（网页授权）———
WECHAT_MP_APP_ID=
WECHAT_MP_APP_SECRET=

# ——— 微信小程序 ———
WECHAT_MINIPROGRAM_APP_ID=
WECHAT_MINIPROGRAM_APP_SECRET=

# ——— 微信开放平台 UnionID（如需跨应用关联）———
# 如果公众号、小程序、网站应用绑定了同一开放平台账号，
# 则会返回 unionid，无需额外配置

# ——— Apple 登录 ———
APPLE_CLIENT_ID=com.example.web    # Service ID（Web）或 Bundle ID（iOS）
APPLE_TEAM_ID=
APPLE_KEY_ID=
APPLE_PRIVATE_KEY=                 # .p8 文件内容

# ——— AES 加密（OAuth token 加密存储）———
AES_ENCRYPTION_KEY=                # 64 位 hex 字符串（32 字节）
```

---

## 十一、微信各平台对接细节

### 11.1 微信开放平台（网站应用）

```typescript
@Injectable()
export class WechatWebProvider implements OAuthProvider {
    readonly identityType = 'wechat_openid';

    async getAuthorizationUrl(params: GetAuthorizationUrlParams): Promise<AuthorizationResult> {
        const url = new URL('https://open.weixin.qq.com/connect/qrconnect');
        url.searchParams.set('appid', process.env.WECHAT_WEB_APP_ID!);
        // 回调地址从环境变量读取，不使用前端传入的值（防篡改）
        url.searchParams.set('redirect_uri', process.env.WECHAT_WEB_REDIRECT_URI!);
        url.searchParams.set('response_type', 'code');
        url.searchParams.set('scope', 'snsapi_login');
        url.searchParams.set('state', params.state);
        url.hash = 'wechat_redirect'; // 微信要求

        return { url: url.toString() };
    }

    async getUserInfo(params: GetUserInfoParams): Promise<OAuthUserInfo> {
        // Step 1: code 换 access_token + openid
        const tokenUrl = new URL('https://api.weixin.qq.com/sns/oauth2/access_token');
        tokenUrl.searchParams.set('appid', process.env.WECHAT_WEB_APP_ID!);
        tokenUrl.searchParams.set('secret', process.env.WECHAT_WEB_APP_SECRET!);
        tokenUrl.searchParams.set('code', params.code);
        tokenUrl.searchParams.set('grant_type', 'authorization_code');

        const tokenRes = await fetch(tokenUrl.toString());
        const tokenData = await tokenRes.json();

        if (tokenData.errcode) {
            throw new BusinessException(ErrorCode.OAUTH_PROVIDER_ERROR, tokenData.errmsg);
        }

        // Step 2: access_token 换用户信息
        const userUrl = new URL('https://api.weixin.qq.com/sns/userinfo');
        userUrl.searchParams.set('access_token', tokenData.access_token);
        userUrl.searchParams.set('openid', tokenData.openid);
        userUrl.searchParams.set('lang', 'zh_CN');

        const userRes = await fetch(userUrl.toString());
        const userData = await userRes.json();

        return {
            openid: tokenData.openid,
            unionid: tokenData.unionid,
            nickname: userData.nickname,
            avatar: userData.headimgurl,
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token,
            expiresAt: Math.floor(Date.now() / 1000) + tokenData.expires_in,
        };
    }

    async refreshAccessToken(refreshToken: string): Promise<TokenRefreshResult> {
        const url = new URL('https://api.weixin.qq.com/sns/oauth2/refresh_token');
        url.searchParams.set('appid', process.env.WECHAT_WEB_APP_ID!);
        url.searchParams.set('grant_type', 'refresh_token');
        url.searchParams.set('refresh_token', refreshToken);

        const res = await fetch(url.toString());
        const data = await res.json();

        if (data.errcode) {
            throw new BusinessException(ErrorCode.OAUTH_PROVIDER_ERROR, data.errmsg);
        }

        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
        };
    }
}
```

### 11.2 微信公众号（网页授权）

```typescript
@Injectable()
export class WechatMpProvider implements OAuthProvider {
    readonly identityType = 'wechat_openid';

    async getAuthorizationUrl(params: GetAuthorizationUrlParams): Promise<AuthorizationResult> {
        const scope = params.extraParams?.scope || 'snsapi_userinfo';
        const url = new URL('https://open.weixin.qq.com/connect/oauth2/authorize');
        url.searchParams.set('appid', process.env.WECHAT_MP_APP_ID!);
        // 回调地址从环境变量读取，不使用前端传入的值（防篡改）
        url.searchParams.set('redirect_uri', process.env.WECHAT_MP_REDIRECT_URI!);
        url.searchParams.set('response_type', 'code');
        url.searchParams.set('scope', scope);
        url.searchParams.set('state', params.state);
        url.hash = 'wechat_redirect';

        return { url: url.toString() };
    }

    // getUserInfo 和 refreshAccessToken 与 WechatWebProvider 类似，
    // 只是 appid/secret 使用公众号的配置
    // ...
}
```

### 11.3 微信小程序

```typescript
@Injectable()
export class WechatMiniProgramProvider implements OAuthProvider {
    readonly identityType = 'wechat_openid';

    /**
     * 小程序不需要授权 URL（由 wx.login() 发起）
     * 此方法不适用
     */
    async getAuthorizationUrl(): Promise<AuthorizationResult> {
        throw new Error('MiniProgram does not use authorization URL flow');
    }

    async getUserInfo(params: GetUserInfoParams): Promise<OAuthUserInfo> {
        // code 换 session_key + openid
        const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
        url.searchParams.set('appid', process.env.WECHAT_MINIPROGRAM_APP_ID!);
        url.searchParams.set('secret', process.env.WECHAT_MINIPROGRAM_APP_SECRET!);
        url.searchParams.set('js_code', params.code);
        url.searchParams.set('grant_type', 'authorization_code');

        const res = await fetch(url.toString());
        const data = await res.json();

        if (data.errcode) {
            throw new BusinessException(ErrorCode.OAUTH_PROVIDER_ERROR, data.errmsg);
        }

        // session_key 存 Redis（用于后续解密用户信息）
        await this.redis.setex(
            `mono:oauth:wechat:session:${data.openid}`,
            30 * 24 * 3600, // 30 天
            data.session_key,
        );

        return {
            openid: data.openid,
            unionid: data.unionid,
            // 小程序不返回昵称和头像（需用户主动授权）
            nickname: undefined,
            avatar: undefined,
            accessToken: data.session_key, // 复用字段存 session_key
            expiresAt: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
        };
    }
}
```

### 11.4 Apple 登录

```typescript
@Injectable()
export class AppleProvider implements OAuthProvider {
    readonly identityType = 'apple';

    /**
     * Apple 不需要服务端生成授权 URL
     * 前端使用 ASAuthorizationAppleIDProvider (iOS) 或 Apple JS SDK (Web)
     */
    async getAuthorizationUrl(): Promise<AuthorizationResult> {
        throw new Error('Apple does not use server-side authorization URL flow');
    }

    async getUserInfo(params: GetUserInfoParams & { identityToken: string }): Promise<OAuthUserInfo> {
        // 1. 验证 identity_token 的 JWT 签名
        const decoded = await this.verifyAppleIdentityToken(params.identityToken);

        // 2. 提取 Apple user ID (sub)
        const appleUserId = decoded.sub;

        // 3. 用 authorization code 换 refresh_token（Apple 要求）
        const refreshToken = await this.exchangeCodeForRefreshToken(params.code);

        return {
            openid: appleUserId,
            nickname: undefined, // Apple 不提供昵称
            avatar: undefined, // Apple 不提供头像
            accessToken: params.identityToken, // 临时存储，验证后丢弃
            refreshToken,
            expiresAt: Math.floor(Date.now() / 1000) + 600, // identity_token 10 分钟有效
        };
    }

    /**
     * 验证 Apple identity_token
     * 1. 从 Apple 公钥端点获取公钥
     * 2. 验证 JWT 签名
     * 3. 验证 iss, aud, exp
     */
    private async verifyAppleIdentityToken(token: string): Promise<AppleIdentityTokenPayload> {
        // 获取 Apple 公钥
        const keysRes = await fetch('https://appleid.apple.com/auth/keys');
        const keysData = await keysRes.json();

        // 使用 jose 库验证 JWT
        const { payload } = await jose.jwtVerify(
            token,
            createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys')),
            {
                issuer: 'https://appleid.apple.com',
                audience: process.env.APPLE_CLIENT_ID,
            },
        );

        return payload as AppleIdentityTokenPayload;
    }

    /**
     * 用 authorization code 换 refresh_token
     * Apple 要求在服务端完成此步骤
     */
    private async exchangeCodeForRefreshToken(code: string): Promise<string> {
        const clientSecret = this.generateAppleClientSecret();

        const res = await fetch('https://appleid.apple.com/auth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: process.env.APPLE_CLIENT_ID!,
                client_secret: clientSecret,
                code,
                grant_type: 'authorization_code',
            }),
        });

        const data = await res.json();
        return data.refresh_token;
    }

    /**
     * 生成 Apple Client Secret（JWT，有效期 6 个月）
     * 使用 Apple 开发者账号的私钥签名
     */
    private generateAppleClientSecret(): string {
        const now = Math.floor(Date.now() / 1000);

        return jose
            .SignJWT({})
            .setProtectedHeader({ alg: 'ES256', kid: process.env.APPLE_KEY_ID })
            .setIssuer(process.env.APPLE_TEAM_ID!)
            .setIssuedAt(now)
            .setExpirationTime(now + 15777000) // 6 个月
            .setAudience('https://appleid.apple.com')
            .setSubject(process.env.APPLE_CLIENT_ID!)
            .sign(importPKCS8(process.env.APPLE_PRIVATE_KEY!, 'ES256'));
    }
}

interface AppleIdentityTokenPayload {
    sub: string; // Apple user ID
    email?: string; // 用户邮箱
    email_verified?: boolean;
    is_private_email?: boolean; // 是否使用隐藏邮件
    iss: string; // https://appleid.apple.com
    aud: string; // 你的 Client ID
    exp: number;
    iat: number;
}
```

---

## 十二、Redis Key 汇总

| Key                                   | 类型   | TTL    | 说明                                              |
| ------------------------------------- | ------ | ------ | ------------------------------------------------- |
| `mono:oauth:state:{state}`            | STRING | 10 min | OAuth state 防 CSRF                               |
| `mono:oauth:wechat:session:{openid}`  | STRING | 30 day | 小程序 session_key                                |
| `mono:oauth:wechat:unionid:{unionid}` | STRING | 30 day | unionid → account_id 映射（Redis 优先 + DB 回退） |

> 与 [缓存设计.md](./缓存设计.md) 的 key 命名规范一致。

---

## 延伸阅读

- [用户体系.md](./用户体系.md) — 登录流程、account_identity 表设计、JWT Payload
- [安全防护.md](./安全防护.md) — OAuth State 防 CSRF、AES 加密、OWASP 对照
- [缓存设计.md](./缓存设计.md) — Redis key 命名规范、TTL 策略
- [短信服务方案.md](./短信服务方案.md) — C 端手机号 + 验证码登录
- [错误码.md](./错误码.md) — 全局错误码规范
- [部署运维.md](./部署运维.md) — OAuth 环境变量配置
