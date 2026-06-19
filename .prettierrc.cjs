// ============================================
// Prettier 统一配置（基座项目唯一配置）
// ============================================
// 所有 apps/ 和 packages/ 共享此配置。
// 子包禁止再单独配置 .prettierrc / prettier.config.*。
//
// 规范：
//   - singleQuote   : 单引号
//   - tabWidth      : 4 空格缩进
//   - printWidth    : 120 字符
//   - semi          : 有分号
//   - trailingComma : all（数组、对象、参数、import 都加尾逗号）
//   - endOfLine     : auto
// ============================================

module.exports = {
    // 语句末尾加分号
    semi: true,
    // 用单引号 'hello'，不用双引号
    singleQuote: true,
    // 缩进 4 个空格
    tabWidth: 4,
    // 多行结构末尾加尾逗号 { a, b, }
    trailingComma: 'all',
    // 每行超过 120 字符才换行
    printWidth: 120,
    // 换行符自动适配系统
    endOfLine: 'auto',
};
