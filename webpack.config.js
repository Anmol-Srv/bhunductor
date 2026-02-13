const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  mode: process.env.NODE_ENV === 'development' ? 'development' : 'production',
  entry: './renderer/index.js',
  output: {
    path: path.resolve(__dirname, 'renderer'),
    filename: 'bundle.js'
  },
  target: 'electron-renderer',
  module: {
    rules: [
      {
        test: /\.jsx?$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-react']
          }
        }
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      }
    ]
  },
  resolve: {
    extensions: ['.js', '.jsx']
  },
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        {
          from: 'node_modules/monaco-editor/min/vs',
          to: 'vs'
        }
      ]
    })
  ],
  devtool: process.env.NODE_ENV === 'development' ? 'source-map' : false
};
