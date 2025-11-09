const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  entry: {
    content: './src/content/index.js',
    background: './src/background/index.js',
    ui: './src/ui/index.jsx',
    popup: './src/popup/index.jsx',
    sidepanel: './src/sidepanel/index.jsx'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    clean: true,
    publicPath: '/'
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
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
        { from: 'manifest.json', to: 'manifest.json' },
        { from: 'src/icons', to: 'icons' },
        { from: 'src/content/content.css', to: 'content.css' },
        // Copy Tesseract.js worker files
        { 
          from: 'node_modules/tesseract.js/dist/worker.min.js', 
          to: 'tesseract-worker.min.js',
          noErrorOnMissing: true
        },
        { 
          from: 'node_modules/tesseract.js-core/tesseract-core.wasm.js', 
          to: 'tesseract-core.wasm.js',
          noErrorOnMissing: true
        }
      ]
    }),
    new HtmlWebpackPlugin({
      template: './src/ui/ui.html',
      filename: 'ui.html',
      chunks: ['ui']
    }),
    new HtmlWebpackPlugin({
      template: './src/popup/popup.html',
      filename: 'popup.html',
      chunks: ['popup']
    }),
    new HtmlWebpackPlugin({
      template: './src/sidepanel/sidepanel-simple.html',
      filename: 'sidepanel.html',
      chunks: ['sidepanel']
    })
  ]
};

