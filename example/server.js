#!/usr/bin/env node

"use strict";

const fs = require('fs');
const path = require('path');
const express = require('express');
const rpcWS = require('node-jsonrpc-lsp')

const app = express();

app.listen(4000, () => {
	console.log('Listening on port 4000');
});

app.use(express.static('dist'));

new rpcWS({
	port: 3001,
	languageServers:{
		javascript:[
			'node',
			'C:/Users/mespi/Projects/Graviton-App/plugins/js-ts-langserver/wp/d.js'
		],
		html:[
			'node',
			'./node_modules/vscode-html-languageserver-bin/htmlServerMain.js',
			'--stdio'
		],
		css:[
			'node',
			'./node_modules/vscode-css-languageserver-bin/cssServerMain.js',
			'--stdio'
		]
	}
})

app.set('views', '');
app.set('view engine', 'html');

app.get('/', (req, res) => {
	res.render('dist/index.html');
});
