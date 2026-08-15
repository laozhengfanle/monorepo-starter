/**
 * 应用版本（单一来源）。
 *
 * 规定：每次提交到仓库前运行 `pnpm bump [major|minor|patch]`（默认 patch），
 * 脚本会自动升级此文件 + 根 package.json、提交并打 vX.Y.Z 标签。
 * 不要手动修改此文件。
 */
export const APP_VERSION = '0.1.3';
