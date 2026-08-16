// lint-staged 配置（.lintstagedrc.mjs）
// 参考：https://github.com/lint-staged/lint-staged#ignoring-files
//
// 设计：
// - 生成物（generated/dist/out-tsc）不参与 lint/format：它们由 codegen/build 产生，
//   提交时 lint-staged 会原样放行，避免 prettier 改写生成物造成无意义 diff
// - 源码：prettier 统一格式 + oxlint 快速修复
//
// 注意：lint-staged 会把所有匹配文件传给任务；忽略文件需在任务自身或此处 filter 完成。

/** 跳过生成物：返回 false 表示该文件不传给任何任务 */
const IGNORED = /(^|\/)(generated|dist|out-tsc|test-output|coverage)(\/|$)/;

export default {
  '*.{ts,tsx,js,mjs,cjs,json,md,css,yml,yaml}': (files) =>
    files.filter((f) => !IGNORED.test(f)).map((f) => `prettier --write ${f}`),
  '*.{ts,tsx}': (files) =>
    files.filter((f) => !IGNORED.test(f)).map((f) => `oxlint --fix ${f}`),
};
