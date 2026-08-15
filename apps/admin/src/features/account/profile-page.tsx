import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Avatar,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Row,
  Space,
  Tag,
  Typography,
  theme,
} from 'antd';
import { useAuth } from '../../app/auth/auth-context.js';
import { buildPermissionGroups, formatDateTime, ROLE_LABEL_MAP, ROLE_TAG_COLOR_MAP } from './shared.js';

const { Text, Title } = Typography;

/** 个人中心（只读）：头像 + 账号信息 + 我的权限（对标老项目 ProfilePage） */
export function ProfilePage(): React.JSX.Element {
  const { token } = theme.useToken();
  const navigate = useNavigate();
  const { user } = useAuth();

  const nickname = user?.nickname || '未命名';
  const email = user?.email || '';
  const roleCodes = user?.roleCodes ?? [];
  const displayRole = roleCodes.map((c) => ROLE_LABEL_MAP[c] ?? c).join(' / ') || '-';
  const roleTagColor = roleCodes.length > 0 ? ROLE_TAG_COLOR_MAP[roleCodes[0]] || 'blue' : 'default';
  const isSuperAdmin = roleCodes.includes('super_admin');

  const permissionGroups = useMemo(() => buildPermissionGroups(user?.menus ?? []), [user?.menus]);
  const buttonPermissions = useMemo(() => {
    const menuCodes = new Set((user?.menus ?? []).flatMap((n) => [n.code, ...(n.children ?? []).map((c) => c.code)]));
    return (user?.permissions ?? []).filter((p) => !menuCodes.has(p));
  }, [user?.menus, user?.permissions]);

  return (
    <Space orientation="vertical" size={token.marginMD} style={{ width: '100%' }}>
      {/* 页面标题 + 账号设置按钮 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <Title level={5} style={{ margin: 0 }}>
          个人中心
          <Text type="secondary" style={{ fontSize: 13, fontWeight: 'normal', marginLeft: 8 }}>
            查看当前账号信息与权限
          </Text>
        </Title>
        <Button type="primary" onClick={() => navigate('/account/settings')}>
          账号设置
        </Button>
      </div>

      <Row gutter={[token.marginMD, token.marginMD]}>
        {/* 左列：个人中心 + 账号信息 */}
        <Col xs={24} lg={12}>
          <Space orientation="vertical" size={token.marginMD} style={{ width: '100%' }}>
            <Card title="个人中心">
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 16,
                  padding: '8px 0',
                }}
              >
                <Avatar src={user?.avatar || null} size={88}>
                  {nickname[0]}
                </Avatar>
                <div style={{ textAlign: 'center' }}>
                  <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>{nickname}</h2>
                  <Text type="secondary" style={{ fontSize: 13 }}>
                    {user?.username}
                  </Text>
                  <div style={{ marginTop: 8 }}>
                    <Tag color={roleTagColor}>{displayRole}</Tag>
                  </div>
                </div>
              </div>
            </Card>

            <Card title="账号信息">
              <Descriptions bordered column={2} size="small" styles={{ label: { width: 120 } }}>
                <Descriptions.Item label="账号 ID">{user?.accountId ?? '-'}</Descriptions.Item>
                <Descriptions.Item label="创建时间">
                  {formatDateTime(user?.createdAt)}
                </Descriptions.Item>
                <Descriptions.Item label="用户名">{user?.username ?? '-'}</Descriptions.Item>
                <Descriptions.Item label="邮箱">{email || '未设置'}</Descriptions.Item>
                <Descriptions.Item label="角色名称" span={2}>
                  {displayRole}
                </Descriptions.Item>
              </Descriptions>
            </Card>
          </Space>
        </Col>

        {/* 右列：我的权限 */}
        <Col xs={24} lg={12}>
          <Card title="我的权限">
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>
              基于当前账号的真实权限码与菜单
            </Text>
            {isSuperAdmin ? (
              <Empty
                description="超级管理员拥有所有权限，无需单独展示"
                style={{ padding: '24px 0' }}
              />
            ) : (
              <Space orientation="vertical" size={token.marginLG} style={{ width: '100%' }}>
                {permissionGroups.map((group) => (
                  <div key={group.module}>
                    <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Text strong style={{ fontSize: 13 }}>
                        {group.module}
                      </Text>
                      <Tag style={{ fontSize: 11 }}>{group.items.length} 项</Tag>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {group.items.map((perm) => (
                        <Tag key={perm.code} style={{ fontSize: 12 }}>
                          <span>{perm.name}</span>
                          <span style={{ marginLeft: 4, fontFamily: 'monospace', fontSize: 11, opacity: 0.6 }}>
                            {perm.code}
                          </span>
                        </Tag>
                      ))}
                    </div>
                  </div>
                ))}
                {buttonPermissions.length > 0 && (
                  <div>
                    <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Text strong style={{ fontSize: 13 }}>
                        操作权限
                      </Text>
                      <Tag style={{ fontSize: 11 }}>{buttonPermissions.length} 项</Tag>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {buttonPermissions.map((code) => (
                        <Tag key={code} style={{ fontSize: 12, fontFamily: 'monospace' }}>
                          {code}
                        </Tag>
                      ))}
                    </div>
                  </div>
                )}
                {permissionGroups.length === 0 && buttonPermissions.length === 0 && (
                  <Empty description="暂无权限数据" style={{ padding: '24px 0' }} />
                )}
              </Space>
            )}
          </Card>
        </Col>
      </Row>
    </Space>
  );
}
