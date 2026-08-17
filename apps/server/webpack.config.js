const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const webpack = require('webpack');
const { join } = require('path');

// API 版本单一来源：根 package.json（构建期读取并注入，
// 运行时 swagger.setup.ts 通过 process.env.API_VERSION 消费，dev/test 走兜底值）。
// 根 package.json 与 apps/admin/src/app/version.ts 由 `pnpm bump` 同步维护（提交前必跑），
// 保证 /health、Swagger 与 UI 显示的版本一致。
const { version: apiVersion } = require('../../package.json');

module.exports = {
  output: {
    path: join(__dirname, 'dist'),
    clean: true,
    ...(process.env.NODE_ENV !== 'production' && {
      devtoolModuleFilenameTemplate: '[absolute-resource-path]',
    }),
  },
  plugins: [
    new NxAppWebpackPlugin({
      target: 'node',
      // SWC 逐文件转译：不受 tsconfig project references 影响，且显著快于 ts-loader
      compiler: 'swc',
      main: './src/main.ts',
      tsConfig: './tsconfig.app.json',
      assets: ['./src/assets'],
      optimization: false,
      outputHashing: 'none',
      generatePackageJson: false,
      sourceMap: true,
    }),
    new webpack.DefinePlugin({
      'process.env.API_VERSION': JSON.stringify(apiVersion),
    }),
  ],
};
