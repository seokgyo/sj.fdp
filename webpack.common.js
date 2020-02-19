const path = require('path');

const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const WorkerPlugin = require('worker-plugin');

module.exports = {
  entry: {
    main: './lib/index.js',
    experiments: './experiments/index.js',
  },
  module: {
    rules: [
      {
        test: /\.m?js$/,
        exclude: /(node_modules|bower_components)/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
               ["@babel/preset-env", { targets: { chrome: '80' } }]
            ]
          }
        }
      }
    ]
  },
  plugins: [
    new CleanWebpackPlugin(),
    new HtmlWebpackPlugin({
      chunks: ['main'],
      title: 'js.fdp',
    }),
    new HtmlWebpackPlugin({
      chunks: ['experiments'],
      filename: 'experiments',
      title: 'js.fdp',
    }),
    new WorkerPlugin({
      globalObject: 'self',
    }),
  ],
  output: {
    filename: '[name].bundle.js',
    path: path.resolve(__dirname, 'dist'),
  },
};
