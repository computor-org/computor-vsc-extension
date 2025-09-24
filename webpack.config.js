const path = require('path');

/**
 * @param {Record<string, unknown>} env
 * @param {{ mode?: 'development' | 'production' | 'none' }} argv
 */
module.exports = (_env = {}, argv = {}) => {
  const mode = argv.mode && typeof argv.mode === 'string' ? argv.mode : 'production';

  return {
    mode,
    target: 'node',
    entry: path.resolve(__dirname, 'src', 'extension.ts'),
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: 'extension.js',
      libraryTarget: 'commonjs2'
    },
    devtool: mode === 'development' ? 'eval-source-map' : 'source-map',
    externals: {
      vscode: 'commonjs vscode'
    },
    resolve: {
      extensions: ['.ts', '.tsx', '.js', '.json']
    },
    module: {
      rules: [
        {
          test: /\.[tj]s$/,
          exclude: /node_modules/,
          use: [
            {
              loader: 'ts-loader',
              options: {
                transpileOnly: true
              }
            }
          ]
        }
      ]
    },
    infrastructureLogging: {
      level: 'warn'
    }
  };
};
