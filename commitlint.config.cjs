// ============================================
// commitlint 配置：约定式提交（Conventional Commits）
// ============================================
// 文档：https://www.conventionalcommits.org/zh-hans/
// 规则参考：@commitlint/config-conventional
//
// 提交信息格式：
//   <type>(<scope>): <subject>
//   <空行>
//   <body>
//   <空行>
//   <footer>
//
// type 可选值（type-enum）：
//   - feat     : 新功能
//   - fix      : 修复 bug
//   - docs     : 文档变更
//   - style    : 代码格式（不影响功能）
//   - refactor : 重构
//   - perf     : 性能优化
//   - test     : 测试相关
//   - build    : 构建系统 / 依赖变更
//   - ci       : CI 配置变更
//   - chore    : 其他杂项
//   - revert   : 回滚 commit
//
// breaking change：在 footer 中加 `BREAKING CHANGE: <描述>`
// ============================================

module.exports = {
    extends: ['@commitlint/config-conventional'],
    rules: {
        // 限制 type 范围
        'type-enum': [
            2,
            'always',
            ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert'],
        ],
        // subject 不允许为空
        'subject-empty': [2, 'never'],
        // subject 不允许以句号结尾
        'subject-full-stop': [2, 'never', '.'],
        // subject 长度限制
        'subject-max-length': [2, 'always', 72],
        // type 长度限制（避免拼写错误）
        'type-case': [2, 'always', 'lower-case'],
        // scope 长度限制
        'scope-max-length': [2, 'always', 32],
        // body 与 footer 之间需要空行
        'body-leading-blank': [2, 'always'],
        'footer-leading-blank': [2, 'always'],
    },
};
