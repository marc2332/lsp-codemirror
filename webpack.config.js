const path = require('path');

module.exports = {
	mode: "production",
	entry: {
		index: './src/index.ts'
	},
	module: {
		rules: [
			{
				test: /\.ts?$/,
				use: 'ts-loader',
				exclude: /node_modules/
			},  
			{
				test: /\.(woff(2)?|ttf|eot|png|jpe?g|svg)(\?v=\d+\.\d+\.\d+)?$/,
				include: path.resolve(__dirname, 'src'),
				use: [
					{
						loader: 'file-loader',
						options: {
							name: '[name].[ext]',
							outputPath: 'icons/',
						},
					},
					{
						loader: 'image-webpack-loader',
						options: {
							disable: true,
						},
					},
				],
			}
		]
	},
	resolve: {
		extensions: [ '.ts', '.js' ],
		symlinks: false
	},
	target: 'web',
	node: {
		net: 'mock',
	},
	output: {
		filename: '[name].js',
		path: path.resolve(__dirname, 'lib'),
		library: 'lsp-codemirror',
		libraryTarget: 'umd'
	},
	externals: {
		codemirror: {
			commonjs: 'codemirror',
			commonjs2: 'codemirror',
			amd: 'codemirror',
			root: 'CodeMirror'
		}
	}
};
