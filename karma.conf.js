process.env.CHROME_BIN = require('puppeteer').executablePath()
const path = require('path')

module.exports = function(config) {
	config.set({
		basePath: '',

		files: [
			// The entry files are processed by webpack
			'test/**/*.test.ts'
		],

		browsers: ['ChromeHeadless'],

		mime: {
			'text/x-typescript': ['ts','tsx']
		},

		module: 'commonjs',

		singleRun: true,
		autoWatch: false,
		colors: true,

		frameworks: [
			'mocha',
		],


		reporters: [
			'mocha'
		],

		preprocessors: {
			'**/*!(.d).ts': 'webpack',
			'**/*!(.d).js': 'webpack'
		},

		plugins: [
			'karma-mocha',
			'karma-chrome-launcher',
			'karma-webpack',
			'karma-mocha-reporter'
		],

		webpack: {
			mode: 'development',
			module: {
				rules: [
					{
						test: /\.tsx?$/,
						use: 'ts-loader',
						exclude: /node_modules/
					}, {
						test: /\.css$/,
						use: [
							{ loader: 'style-loader' },
							{ loader: 'css-loader' }
						]
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
						]
					}
				]
			},
			resolve: {
				extensions: [ '.ts', '.js' ]
			},
			target: 'web',
			node: {
				net: 'mock',
			},
		}
	});
};
