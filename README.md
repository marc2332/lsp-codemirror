## ✨ lsp-codemirror

LSP client for CodeMirror, intends to be a more updated and better version of the original client --> https://github.com/wylieconlon/lsp-editor-adapter (thanks to Wylie :D )

## 🤖 Installation

```shell
npm install lsp-codemirror
```

## ✍🏻 Usage 

```javascript
import CodeMirror from 'codemirror';
import { LspWsConnection, CodeMirrorAdapter } from 'lsp-codemirror';

const editor = CodeMirror(document.body,{})

const javascriptConnection = new LspWsConnection({
	serverUri: 'ws://localhost:2089/javascript',
	mode: 'javascript',
	rootUri: `file:///users/superman`,
	documentUri: `file:///users/superman/index.js`,
	documentText: () => editor.getValue(),
}).connect(new WebSocket('ws://localhost:2089/javascript'));

const javascriptAdapter = new CodeMirrorAdapter(javascriptConnection, {
	quickSuggestionsDelay: 25,
}, editor);
```

All options for CodeMirrorAdapter in: https://github.com/marc2332/lsp-codemirror/blob/aed38cc89e992b0b9aa7ee91cd298a4607a87b60/src/types.ts#L144