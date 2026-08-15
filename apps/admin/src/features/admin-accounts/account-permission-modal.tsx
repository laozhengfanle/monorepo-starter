import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Modal, Space, Spin, Tag, Tree, theme } from 'antd';
import type { TreeDataNode } from 'antd';
import type { AccountMenuType } from '@starter/api-client';
import { useMenuTreeQuery } from '../../generated/graphql';
import { getAccountMenusApi, saveAccountMenusApi } from './api.js';

interface AccountPermissionModalProps {
  open: boolean;
  accountId: string;
  accountName: string;
  onClose: () => void;
  onSaved?: () => void;
}

/** 菜单树 → antd TreeDataNode（id 作 key，仅展示用） */
function toTreeData(nodes: {
  id: string;
  name: string;
  type: string;
  children?: unknown[];
}[]): TreeDataNode[] {
  return nodes.map((n) => ({
    key: n.id,
    title: n.name,
    children: n.children?.length ? toTreeData(n.children as never) : undefined,
  }));
}

/**
 * 账户特例授权弹窗（对标老项目 Vue AccountPermissionModal）：
 * 权限树每行「允许(grant) / 禁止(deny)」三态切换（再点回默认），
 * 带角色基线蓝点标记 + 统计 + 清空覆写。
 */
export function AccountPermissionModal({
  open,
  accountId,
  accountName,
  onClose,
  onSaved,
}: AccountPermissionModalProps): React.JSX.Element {
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const { data: treeData, loading: treeLoading } = useMenuTreeQuery({ skip: !open });

  const [roleMenuIds, setRoleMenuIds] = useState<Set<string>>(new Set());
  const [overrides, setOverrides] = useState<Record<string, AccountMenuType>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // 打开时加载：已有覆盖 + 角色基线
  useEffect(() => {
    if (!open || !accountId) return;
    setLoading(true);
    getAccountMenusApi(accountId)
      .then((result) => {
        setRoleMenuIds(new Set(result.roleMenuIds));
        const map: Record<string, AccountMenuType> = {};
        for (const o of result.overrides) map[o.menuId] = o.type;
        setOverrides(map);
      })
      .catch(() => {
        void message.error('加载特例授权失败');
      })
      .finally(() => setLoading(false));
  }, [open, accountId, message]);

  const stats = useMemo(() => {
    const values = Object.values(overrides);
    return {
      total: values.length,
      grant: values.filter((v) => v === 'grant').length,
      deny: values.filter((v) => v === 'deny').length,
    };
  }, [overrides]);

  /** 三态切换：同类型再点 → 回默认 */
  const toggleOverride = useCallback((menuId: string, type: AccountMenuType): void => {
    setOverrides((prev) => {
      const next = { ...prev };
      if (next[menuId] === type) {
        delete next[menuId];
      } else {
        next[menuId] = type;
      }
      return next;
    });
  }, []);

  /** 树节点渲染：角色基线圆点 + 允许/禁止 三态切换 */
  const renderTitle = useCallback(
    (node: TreeDataNode): React.ReactNode => {
      const menuId = String(node.key);
      const isRoleBase = roleMenuIds.has(menuId);
      const state = overrides[menuId];
      // 基线权限只给「禁止」（角色已有无需再允许）；非基线只给「允许」。
      // 已有覆盖（grant/deny）保持对应按钮可见，便于查看与清除
      const showAllow = !isRoleBase || state === 'grant';
      const showDeny = isRoleBase || state === 'deny';
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {isRoleBase && (
            <span
              style={{
                display: 'inline-block',
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: token.colorPrimary,
              }}
            />
          )}
          <span>{String(node.title)}</span>
          <span style={{ display: 'inline-flex', gap: 4, marginLeft: 8 }}>
            {showAllow && (
              <Button
                size="small"
                color="green"
                variant={state === 'grant' ? 'solid' : 'outlined'}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleOverride(menuId, 'grant');
                }}
              >
                允许
              </Button>
            )}
            {showDeny && (
              <Button
                size="small"
                color="red"
                variant={state === 'deny' ? 'solid' : 'outlined'}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleOverride(menuId, 'deny');
                }}
              >
                禁止
              </Button>
            )}
          </span>
        </span>
      );
    },
    [roleMenuIds, overrides, token, toggleOverride],
  );

  const handleSave = async (): Promise<void> => {
    setSaving(true);
    try {
      await saveAccountMenusApi(accountId, {
        items: Object.entries(overrides).map(([menuId, type]) => ({ menuId, type })),
      });
      void message.success('特例权限已保存');
      onSaved?.();
      onClose();
    } catch {
      void message.error('保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={`特例权限 - ${accountName}`}
      open={open}
      onCancel={onClose}
      onOk={handleSave}
      okText="保存"
      cancelText="取消"
      confirmLoading={saving}
      width={720}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, gap: 12 }}>
        <Alert type="info" showIcon title="通过右侧「允许/禁止」按钮设置特例覆写，带圆点标记的菜单为角色基线权限。" />
        <Space size="small" style={{ flexShrink: 0 }}>
          <Tag color="blue" style={{ marginInlineEnd: 0 }}>允许 {stats.grant}</Tag>
          <Tag color="red" style={{ marginInlineEnd: 0 }}>禁止 {stats.deny}</Tag>
          {stats.total > 0 && (
            <Button size="small" type="text" onClick={() => setOverrides({})}>
              清空覆写
            </Button>
          )}
        </Space>
      </div>

      {treeLoading || loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <Spin />
        </div>
      ) : (
        <div style={{ maxHeight: '60vh', overflow: 'auto' }}>
          <Tree treeData={toTreeData(treeData?.menuTree ?? [])} defaultExpandAll titleRender={renderTitle} />
        </div>
      )}
    </Modal>
  );
}
