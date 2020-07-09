## ✨ lsp-codemirror

LSP client for CodeMirror, **forked** from https://github.com/wylieconlon/lsp-editor-adapter (amazing work from Wylie )

## Usage 

**Note**: (not published in NPM, yet)

```javascript
import CodeMirror from 'codemirror';
import { LspWsConnection, CodeMirrorAdapter } from 'lsp-codemirror';

const editor = CodeMirror(document.body,{})

const javascriptConnection = new LspWsConnection({
	serverUri: 'ws://localhost:3000/javascript',
	mode: 'javascript',
	rootUri: `file:///users/superman`,
	documentUri: `file:///users/superman/index.js`,
	documentText: () => editor.getValue(),
}).connect(new WebSocket('ws://localhost:3000/javascript'));

const htmlAdapter = new CodeMirrorAdapter(javascriptConnection, {
	quickSuggestionsDelay: 25,
}, editor);
```