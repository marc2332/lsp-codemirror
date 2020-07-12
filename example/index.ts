import CodeMirror from 'codemirror';
import 'codemirror/mode/javascript/javascript';
import 'codemirror/mode/htmlmixed/htmlmixed';
import 'codemirror/mode/css/css';
import 'codemirror/lib/codemirror.css';
import 'codemirror/theme/idea.css';
import 'codemirror/addon/hint/show-hint.css';
import 'codemirror/addon/hint/show-hint';
import '../src/codemirror-lsp.css';
import { LspWsConnection, CodeMirrorAdapter } from '../src/index.ts';
import path from 'path'

const sampleJs = `
function test(){
  
  
}












test()
`;

const sampleHtml = `
<html>
<head>
<title>Page Title</title>
</head>
<body>
<h1>Basic HTML</h1>
</body>
</html>
`;

const sampleCss = `
body {
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
}

.header {
color: blue;
}
`;

const normalize = dir => dir.replace(/\\/gm,'/')

const htmlEditor = CodeMirror(document.querySelector('.html'), {
	theme: 'idea',
	lineNumbers: true,
	mode: 'htmlmixed',
	value: sampleHtml,
	gutters: ['CodeMirror-lsp'],
});

const cssEditor = CodeMirror(document.querySelector('.css'), {
	theme: 'idea',
	lineNumbers: true,
	mode: 'css',
	value: sampleCss,
	gutters: ['CodeMirror-lsp'],
});

const jsEditor = CodeMirror(document.querySelector('.js'), {
	theme: 'idea',
	lineNumbers: true,
	mode: 'javascript',
	value: sampleJs,
	gutters: ['CodeMirror-lsp'],
});

interface lspServerOptions {
	rootPath: string;
	htmlPath: string;
	cssPath: string;
	jsPath: string;
}

const html = {
	serverUri: 'ws://localhost:3001/html',
	languageId: 'html',
	rootUri: `file://${normalize(path.join(__dirname,'example-project'))}`,
	documentUri:  `file://${normalize(path.join(__dirname,'example-project/project.html'))}`,
	documentText: () => htmlEditor.getValue(),
};

const js = {
	serverUri: 'ws://localhost:3001/javascript',
	languageId: 'javascript',
	rootUri: `file:///${normalize(path.join(__dirname,'example-project'))}`,
	documentUri:  `file:///${normalize(path.join(__dirname,'example-project/source.js'))}`,
	documentText: () => jsEditor.getValue(),
};

const css = {
	serverUri: 'ws://localhost:3001/css',
	languageId: 'css',
	rootUri: `file://${normalize(path.join(__dirname,'example-project'))}`,
	documentUri: `file://${normalize(path.join(__dirname,'example-project/styles.css'))}`,
	documentText: () => cssEditor.getValue(),
};

const htmlConnection = new LspWsConnection(html).connect(new WebSocket(html.serverUri));

const htmlAdapter = new CodeMirrorAdapter(htmlConnection, {
	quickSuggestionsDelay: 25,
}, htmlEditor);

const cssConnection = new LspWsConnection(css).connect(new WebSocket(css.serverUri));

const cssAdapter = new CodeMirrorAdapter(cssConnection, {
	quickSuggestionsDelay: 75,
}, cssEditor);

const jsConnection = new LspWsConnection(js).connect(new WebSocket(js.serverUri));

const jsAdapter = new CodeMirrorAdapter(jsConnection, {
	quickSuggestionsDelay: 75,
}, jsEditor);
