/**
 * 菜单领域类型 — 可辨识联合类型（Discriminated Union）
 *
 * 对齐后端 AdminMenu 表结构 + RBAC 权限模型。
 * 通过 type 字段区分 directory / menu / button，TypeScript 自动收窄字段访问。
 *
 * 重要：type 枚举值必须与后端 schema（admin-menu.schema.ts）保持一致：
 *   - 后端：`z.enum(['directory', 'menu', 'button'])`
 *   - 前端：本文件
 * 任何不一致都会导致 menuToRoutes / Sidebar 静默丢弃菜单（switch 不匹配）。
 *
 * 使用方式：
 *   if (node.type === "menu") {
 *       node.routeName;  // ✅ 自动推导为 string（必填）
 *       node.component;  // ✅ 自动推导为 string（必填）
 *   }
 */

export type MenuTypeEnum = 'directory' | 'menu' | 'button';

// ============================================================
// 基础公共字段（映射后端 AdminMenu 表）
// ============================================================
interface BaseMenuNode {
    id: string;
    parentId?: string | null;
    name: string;
    sort: number;
    enabled: boolean;
    createdAt?: string;
    updatedAt?: string;
    children?: MenuNode[];
}

// ============================================================
// 可辨识联合类型
// ============================================================

/** 📁 目录节点 — 侧边栏分组容器，不对应实际路由页面（与后端 type='directory' 对齐） */
export interface FolderNode extends BaseMenuNode {
    type: 'directory';
    path: string;
    icon?: string;
    visible: boolean;
}

/** 📄 页面路由节点 — 对应一个实际的前端页面 */
export interface PageNode extends BaseMenuNode {
    type: 'menu';
    path: string;
    routeName: string; // 必填，路由名称（唯一标识）
    component: string; // 必填，对应 componentMap 的键（DB 存储）
    icon?: string;
    permissionCode?: string; // 页面级访问权限码
    visible: boolean;
    keepAlive: boolean;
    activeMenuId?: string; // 详情页侧边栏高亮目标菜单 ID
}

/** 🔘 按钮/操作节点 — 不对应路由，仅用于权限控制 */
export interface ButtonNode extends BaseMenuNode {
    type: 'button';
    permissionCode: string; // 必填，如 'iam:admin:create'
}

/** 联合类型 — API 响应、Store、组件统一使用此类型 */
export type MenuNode = FolderNode | PageNode | ButtonNode;

// ============================================================
// 运行时类型守卫（用于 API JSON 数据的类型收窄）
// ============================================================

/** 📁 目录节点判定（type === "directory"，与后端 schema 对齐） */
export function isDirectory(node: MenuNode): node is FolderNode {
    return node.type === 'directory';
}

// isFolder 是 isDirectory 的别名，保留以兼容历史代码（之前版本用 'folder'，现已统一为 'directory'）
export const isFolder = isDirectory;

/** 📄 页面节点判定（type === "menu"） */
export function isPage(node: MenuNode): node is PageNode {
    return node.type === 'menu';
}

/** 🔘 按钮/操作节点判定（type === "button"） */
export function isButton(node: MenuNode): node is ButtonNode {
    return node.type === 'button';
}

// ============================================================
// API 参数类型
// ============================================================

/** 新增菜单参数 */
export interface CreateMenuParams {
    parentId?: string | null;
    name: string;
    type: MenuTypeEnum;
    sort?: number;
    enabled?: boolean;
    // directory / menu 共用
    path?: string;
    icon?: string;
    visible?: boolean;
    // menu 专属
    routeName?: string;
    component?: string;
    keepAlive?: boolean;
    activeMenuId?: string;
    // menu / button 共用
    permissionCode?: string;
}

/** 更新菜单参数 */
export type UpdateMenuParams = Partial<CreateMenuParams>;
