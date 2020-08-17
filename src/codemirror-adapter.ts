/// <reference types="@types/codemirror" />

import debounce from 'lodash-es/debounce';
import * as lsProtocol from 'vscode-languageserver-protocol';
import { Location, LocationLink, MarkupContent } from 'vscode-languageserver-protocol';
import { getFilledDefaults, IEditorAdapter, ILspConnection, IPosition, ITextEditorOptions, ITokenInfo } from './types';
import 'setimmediate';
import Rect from './icons/rect.svg'
import Tri from './icons/tri.svg'
import Circle from './icons/circle.svg'
import SmallRect from './icons/small_rect.svg'
import * as CodeMirror from 'codemirror'

interface IScreenCoord {
	x: number;
	y: number;
}

class CodeMirrorAdapter extends IEditorAdapter<CodeMirror.Editor> {
	public options: ITextEditorOptions;
	public editor: CodeMirror.Editor;
	public connection: ILspConnection;

	private hoverMarker: CodeMirror.TextMarker;
	private signatureWidget: CodeMirror.LineWidget;
	private token: ITokenInfo;
	private markedDiagnostics: CodeMirror.TextMarker[] = [];
	private highlightMarkers: CodeMirror.TextMarker[] = [];
	private hoverCharacter: IPosition;
	private debouncedGetHover: (position: IPosition) => void;
	private connectionListeners: { [key: string]: () => void } = {};
	private editorListeners: { [key: string]: () => void } = {};
	private documentListeners: { [key: string]: () => void } = {};
	private tooltip: HTMLElement;
	private isShowingContextMenu: boolean = false;

	constructor(connection: ILspConnection, options: ITextEditorOptions, editor: CodeMirror.Editor) {
		super(connection, options, editor);
		this.connection = connection;
		this.options = getFilledDefaults(options);
		this.editor = editor;

		this.debouncedGetHover = debounce((position: IPosition) => {
			this.connection.getHoverTooltip(position);
		}, this.options.quickSuggestionsDelay);

		this._addListeners();
	}
	
	public handleMouseLeave() {
		this._removeHover();
		this._removeTooltip();
	}
	
	public handleMouseOver(ev: MouseEvent) {
		if (!this._isEventInsideVisible(ev) || !this._isEventOnCharacter(ev)) {
			return;
		}

		const docPosition: IPosition = this.editor.coordsChar({
			left: ev.clientX,
			top: ev.clientY,
		}, 'window');

		if (
			!(this.hoverCharacter &&
			  docPosition.line === this.hoverCharacter.line && docPosition.ch === this.hoverCharacter.ch)
		) {
			// Avoid sending duplicate requests in a row
			this.hoverCharacter = docPosition;
			this.debouncedGetHover(docPosition);
		}
	}

	public handleChange(cm: CodeMirror.Editor, change: CodeMirror.EditorChange) {
		const location = this.editor.getDoc().getCursor('end');
		this.connection.sendChange();
		const completionCharacters = this.connection.getLanguageCompletionCharacters();
		const signatureCharacters = this.connection.getLanguageSignatureCharacters();
		const code = this.editor.getValue()
		const line = this.editor.getLine(location.line)
		const typedCharacter = line[location.ch - 1];
		if (typeof typedCharacter === 'undefined') {
			// Line was cleared
			this._removeSignatureWidget();
		} else if (completionCharacters.indexOf(typedCharacter) > -1) {
			this.token = this._getTokenEndingAtPosition(code, location, completionCharacters);
			this.connection.getCompletion(
				location,
				this.token,
				completionCharacters.find((c) => c === typedCharacter),
				lsProtocol.CompletionTriggerKind.TriggerCharacter,
			);
		} else if (signatureCharacters.indexOf(typedCharacter) > -1) {
			this.token = this._getTokenEndingAtPosition(code, location, signatureCharacters);
			this.connection.getSignatureHelp(location);
		} else if (!/\W/.test(typedCharacter)) {
			this.connection.getCompletion(
				location,
				this.token,
				'',
				lsProtocol.CompletionTriggerKind.Invoked,
			);
			this.token = this._getTokenEndingAtPosition(code, location, completionCharacters.concat(signatureCharacters));
		} else {
			this._removeSignatureWidget();
		}
	}
	
	public handleRefresh(){
		this._removeHover();
		this._removeTooltip();
	}
	
	public handleScrollLeave(){
		this._removeHover();
		this._removeTooltip();
	}

	public handleHover(response: lsProtocol.Hover) {
		this._removeHover();
		this._removeTooltip();

		if (!response || !response.contents || (Array.isArray(response.contents) && response.contents.length === 0)) {
			return;
		}

		let start = this.hoverCharacter;
		let end = this.hoverCharacter;
		if (response.range) {
			start = {
				line: response.range.start.line,
				ch: response.range.start.character,
			} as CodeMirror.Position;
			end = {
				line: response.range.end.line,
				ch: response.range.end.character,
			} as CodeMirror.Position;

			this.hoverMarker = this.editor.getDoc().markText(start, end, {
				className: 'CodeMirror-lsp-hover'
			});
		}

		let tooltipText: string;
		if (MarkupContent.is(response.contents)) {
			tooltipText = response.contents.value;
		} else if (Array.isArray(response.contents)) {
			const firstItem = response.contents[0];
			if (MarkupContent.is(firstItem)) {
				tooltipText = firstItem.value;
			} else if (firstItem === null) {
				return;
			} else if (typeof firstItem === 'object') {
				tooltipText = firstItem.value;
			} else {
				tooltipText = firstItem;
			}
		} else if (typeof response.contents === 'string') {
			tooltipText = response.contents;
		}

		const htmlElement = document.createElement('div');
		htmlElement.innerText = tooltipText;
		const coords = this.editor.charCoords(start, 'page');
		this._showTooltip(htmlElement, {
			x: coords.left,
			y: coords.top,
		});
	}

	public handleHighlight(items: lsProtocol.DocumentHighlight[]) {
		this._highlightRanges((items || []).map((i) => i.range));
	}

	public handleCompletion(completions: lsProtocol.CompletionItem[]): void {
		if (!this.token) {
			return;
		}

		const bestCompletions = this._getFilteredCompletions(this.token.text, completions);
		let start = this.token.start;
		if (/^\W$/.test(this.token.text)) {
			// Special case for completion on the completion trigger itself, the completion goes after
			start = this.token.end;
		}
		(this.editor as any).showHint({
			completeSingle: false,
			hint: () => {
				return {
					from: start,
					to: this.token.end,
					list: bestCompletions.map(({ label, kind }) => {
						return {
							text: label,
							displayText: label,
							render: (element: HTMLElement) => {
								const con = document.createElement('div')
								con.classList.add('CodeMirror-lsp-hint')
								const text = document.createElement('span')
								const img = document.createElement('img')
								text.innerText = label
								img.src = this._getIconByKind(kind)
								con.append(img)
								con.append(text)
								element.append(con)
							}
						}
					}),
				};
			},
		});
	}
	private _getIconByKind(kind: number){
		switch(kind){
			case 3:
				return Rect
			case 14:
				return Tri
			case 6:
				return Circle
			default:
				return SmallRect
		}
	}
	public handleDiagnostic(response: lsProtocol.PublishDiagnosticsParams) {
		this.editor.clearGutter('CodeMirror-lsp');
		this.markedDiagnostics.forEach((marker) => {
			marker.clear();
		});
		this.markedDiagnostics = [];
		CodeMirror.signal(this.editor,'lsp/diagnostics', response.diagnostics)
		response.diagnostics.forEach((diagnostic: lsProtocol.Diagnostic) => {
			const start = {
				line: diagnostic.range.start.line,
				ch: diagnostic.range.start.character,
			} as CodeMirror.Position;
			const end = {
				line: diagnostic.range.end.line,
				ch: diagnostic.range.end.character,
			} as CodeMirror.Position;

			this.markedDiagnostics.push(this.editor.getDoc().markText(start, end, {
				title: diagnostic.message,
				className: 'cm-error',
			}));

			const childEl = document.createElement('div');
			childEl.classList.add('CodeMirror-lsp-guttermarker');
			childEl.title = diagnostic.message;
			this.editor.setGutterMarker(start.line, 'CodeMirror-lsp', childEl);
		});
	}

	public handleSignature(result: lsProtocol.SignatureHelp) {
		this._removeSignatureWidget();
		this._removeTooltip();
		if (!result || !result.signatures.length || !this.token) {
			return;
		}

		const htmlElement = document.createElement('div');
		result.signatures.forEach((item: lsProtocol.SignatureInformation) => {
			const el = document.createElement('div');
			el.innerText = item.label;
			htmlElement.appendChild(el);
		});
		const coords = this.editor.charCoords(this.token.start, 'page');
		this._showTooltip(htmlElement, {
			x: coords.left,
			y: coords.top,
		});
	}

	public handleGoTo(location: Location | Location[] | LocationLink[] | null) {
		this._removeTooltip();

		if (!location) {
			return;
		}

		const documentUri = this.connection.getDocumentUri();
		let scrollTo: IPosition;
		if (lsProtocol.Location.is(location)) {
			if (location.uri !== documentUri) {
				return;
			}
			this._highlightRanges([location.range]);
			scrollTo = {
				line: location.range.start.line,
				ch: location.range.start.character,
			};
		} else if ((location as any[]).every((l) => lsProtocol.Location.is(l))) {
			const locations = (location as Location[]).filter((l) => {
				return l.uri === documentUri
			});
			this._highlightRanges(locations.map((l) => l.range));
			scrollTo = {
				line: locations[0].range.start.line,
				ch: locations[0].range.start.character,
			};
		} else if ((location as any[]).every((l) => lsProtocol.LocationLink.is(l))) {
			const locations = (location as LocationLink[]).filter((l) => l.targetUri === documentUri);
			this._highlightRanges(locations.map((l) => l.targetRange));
			scrollTo = {
				line: locations[0].targetRange.start.line,
				ch: locations[0].targetRange.start.character,
			};
		}
		this.editor.scrollIntoView(scrollTo);
	}

	public remove() {
		this._removeSignatureWidget();
		this._removeHover();
		this._removeTooltip();
		// Show-hint addon doesn't remove itself. This could remove other uses in the project
		this.editor.getWrapperElement().querySelectorAll('.CodeMirror-hints').forEach((e) => e.remove());
		this.editor.off('change', this.editorListeners.change);
		this.editor.off('cursorActivity', this.editorListeners.cursorActivity);
		this.editor.getWrapperElement().removeEventListener('mousemove', this.editorListeners.mouseover);
		this.editor.getWrapperElement().removeEventListener('contextmenu', this.editorListeners.contextmenu);
		Object.keys(this.connectionListeners).forEach((key) => {
			this.connection.off(key as any, this.connectionListeners[key]);
		});
		Object.keys(this.documentListeners).forEach((key) => {
			document.removeEventListener(key as any, this.documentListeners[key]);
		});
	}

	private _addListeners() {
		const changeListener = debounce(this.handleChange.bind(this), this.options.debounceSuggestionsWhileTyping);
		this.editor.on('change', changeListener);
		this.editorListeners.change = changeListener;

		const self = this;
		this.connectionListeners = {
			hover: this.handleHover.bind(self),
			highlight: this.handleHighlight.bind(self),
			completion: this.handleCompletion.bind(self),
			signature: this.handleSignature.bind(self),
			diagnostic: this.handleDiagnostic.bind(self),
			goTo: this.handleGoTo.bind(self),
		};

		Object.keys(this.connectionListeners).forEach((key) => {
			this.connection.on(key as any, this.connectionListeners[key]);
		});
		
		const refreshListener = this.handleRefresh.bind(this);
		this.editor.on('refreshed', refreshListener);
		this.editorListeners.refresh = refreshListener;
		
		const mouseLeaveListener = this.handleMouseLeave.bind(this);
		this.editor.getWrapperElement().addEventListener('mouseleave', mouseLeaveListener);
		this.editorListeners.mouseleave = mouseLeaveListener;
		
		const scrollListener = this.handleScrollLeave.bind(this);
		this.editor.on('scroll', scrollListener);
		this.editorListeners.scroll = scrollListener;

		const mouseOverListener = this.handleMouseOver.bind(this);
		this.editor.getWrapperElement().addEventListener('mousemove', mouseOverListener);
		this.editorListeners.mouseover = mouseOverListener;

		const debouncedCursor = debounce(() => {
			this.connection.getDocumentHighlights(this.editor.getDoc().getCursor('start'));
		}, this.options.quickSuggestionsDelay);

		const rightClickHandler = this._handleRightClick.bind(this);
		this.editor.getWrapperElement().addEventListener('contextmenu', rightClickHandler);
		this.editorListeners.contextmenu = rightClickHandler;

		this.editor.on('cursorActivity', debouncedCursor);
		this.editorListeners.cursorActivity = debouncedCursor;

		const clickOutsideListener = this._handleClickOutside.bind(this);
		document.addEventListener('click', clickOutsideListener);
		this.documentListeners.clickOutside = clickOutsideListener;
		
		const clickInsideListener = this._handleClickInside.bind(this);
		this.editor.on('focus', clickInsideListener);
		this.documentListeners.clickInside = clickInsideListener;
	}

	private _getTokenEndingAtPosition(code: string, location: IPosition, splitCharacters: string[]): ITokenInfo {
		const lines = code.split('\n');
		const line = lines[location.line];
		const typedCharacter = line[location.ch - 1];

		if (splitCharacters.indexOf(typedCharacter) > -1) {
			return {
				text: typedCharacter,
				start: {
					line: location.line,
					ch: location.ch - 1,
				},
				end: location,
			};
		}

		let wordStartChar = 0;
		for (let i = location.ch - 1; i >= 0; i--) {
			const char = line[i];
			if (/\W/u.test(char)) {
				break;
			}
			wordStartChar = i;
		}
		return {
			text: line.substr(wordStartChar, location.ch),
			start: {
				line: location.line,
				ch: wordStartChar,
			},
			end: location,
		};
	}

	private _getFilteredCompletions(
	triggerWord: string,
	 items: lsProtocol.CompletionItem[],
	): lsProtocol.CompletionItem[] {
		const word = triggerWord.split(/\W+/)[0];
		if (/\W+/.test(word) || !items) {
			return [];
		}
		return items.filter((item: lsProtocol.CompletionItem) => {
			if (item.filterText && item.filterText.indexOf(word) === 0) {
				return true;
			} else if( item.label === word) {
				return false
			} else {
				return item.label.indexOf(word) === 0;
			}
		}).sort((a: lsProtocol.CompletionItem, b: lsProtocol.CompletionItem) => {
			const inA = (a.label.indexOf(triggerWord) === 0) ? -1 : 1;
			const inB = b.label.indexOf(triggerWord) === 0 ? 1 : -1;
			return inA + inB;
		});
	}

	private _isEventInsideVisible(ev: MouseEvent) {
		// Only handle mouseovers inside CodeMirror's bounding box
		let isInsideSizer = false;
		let target: HTMLElement = ev.target as HTMLElement;
		while (target !== document.body) {
			if (target.classList.contains('CodeMirror')) {
				isInsideSizer = true;
				break;
			}
			target = target.parentElement;
		}

		return isInsideSizer;
	}

	private _isEventOnCharacter(ev: MouseEvent) {
		const docPosition: IPosition = this.editor.coordsChar({
			left: ev.clientX,
			top: ev.clientY,
		}, 'window');

		const token = this.editor.getTokenAt(docPosition);
		const hasToken = !!token.string.length;

		return hasToken;
	}

	private _handleRightClick(ev: MouseEvent) {
		if (!this._isEventInsideVisible(ev) || !this._isEventOnCharacter(ev)) {
			return;
		}

		if( !this.connection.isDefinitionSupported() && 
		   !this.connection.isTypeDefinitionSupported() && 
		   !this.connection.isReferencesSupported()
		  ){
			return
		}

		ev.preventDefault();

		const docPosition: IPosition = this.editor.coordsChar({
			left: ev.clientX,
			top: ev.clientY,
		}, 'window');
		
		if(this.options.contextMenuProvider){
			let features: Array<{ label: String, action: any}> = []
			if (this.connection.isDefinitionSupported()) {
				features.push({
					label: 'Go to Definition',
					action: () => this.connection.getDefinition(docPosition)
				})
			}
			if (this.connection.isTypeDefinitionSupported()) {
				features.push({
					label: 'Go to Type Definition',
					action: () => this.connection.getTypeDefinition(docPosition)
				})
			}
			if (this.connection.isReferencesSupported()) {
				features.push({
					label: 'Find all References',
					action: () => this.connection.getReferences(docPosition)
				})
			}
			this.options.contextMenuProvider(ev, features)
		}else{
			const htmlElement = document.createElement('div');
			htmlElement.classList.add('CodeMirror-lsp-context');

			if (this.connection.isDefinitionSupported()) {
				const goToDefinition = document.createElement('div');
				goToDefinition.innerText = 'Go to Definition';
				goToDefinition.addEventListener('click', () => {
					this.connection.getDefinition(docPosition);
				});
				htmlElement.appendChild(goToDefinition);
			}

			if (this.connection.isTypeDefinitionSupported()) {
				const goToTypeDefinition = document.createElement('div');
				goToTypeDefinition.innerText = 'Go to Type Definition';
				goToTypeDefinition.addEventListener('click', () => {
					this.connection.getTypeDefinition(docPosition);
				});
				htmlElement.appendChild(goToTypeDefinition);
			}

			if (this.connection.isReferencesSupported()) {
				const getReferences = document.createElement('div');
				getReferences.innerText = 'Find all References';
				getReferences.addEventListener('click', () => {
					this.connection.getReferences(docPosition);
				});
				htmlElement.appendChild(getReferences);
			}
			const coords = this.editor.charCoords(docPosition, 'page');
			this._showTooltip(htmlElement, {
				x: ev.x-4,
				y: ev.y+8,
			});
		}
		
	}

	private _handleClickInside(ev: MouseEvent){
		this._unhighlightRanges()
	}
	
	private _handleClickOutside(ev: MouseEvent) {
		if (this.isShowingContextMenu) {
			let target: HTMLElement = ev.target as HTMLElement;
			let isInside = false;
			while (target !== document.body) {
				if (target.classList.contains('CodeMirror-lsp-tooltip')) {
					isInside = true;
					break;
				}
				target = target.parentElement;
			}

			if (isInside) {
				return;
			}

			// Only remove tooltip if clicked outside right click
			this._removeTooltip();
		}
	}

	private _showTooltip(el: HTMLElement, coords: IScreenCoord) {
		if (this.isShowingContextMenu) {
			this._removeTooltip();
		}

		let top = coords.y - this.editor.defaultTextHeight();

		this.tooltip = document.createElement('div');
		this.tooltip.classList.add('CodeMirror-lsp-tooltip');
		this.tooltip.style.left = `${coords.x}px`;
		this.tooltip.style.top = `${top}px`;
		this.tooltip.appendChild(el);
		document.body.appendChild(this.tooltip);

		// Measure and reposition after rendering first version
		requestAnimationFrame(() => {
			top += this.editor.defaultTextHeight();
			top -= this.tooltip.offsetHeight;

			this.tooltip.style.left = `${coords.x}px`;
			this.tooltip.style.top = `${top}px`;
		});
		
		this.isShowingContextMenu = true
	}

	private _removeTooltip() {
		if (this.tooltip) {
			this.isShowingContextMenu = false;
			this.tooltip.remove();
		}
	}

	private _removeSignatureWidget() {
		if (this.signatureWidget) {
			this.signatureWidget.clear();
			this.signatureWidget = null;
		}
		if (this.tooltip) {
			this._removeTooltip();
		}
	}

	private _removeHover() {
		if (this.hoverMarker) {
			this.hoverMarker.clear();
			this.hoverMarker = null;
		}
	}

	private _unhighlightRanges() {
		if (this.highlightMarkers) {
			this.highlightMarkers.forEach((marker) => {
				marker.clear();
			});
		}
		this.highlightMarkers = [];
	}
	private _highlightRanges(items: lsProtocol.Range[]) {
		
		this._unhighlightRanges()
		
		if (!items.length) {
			return;
		}

		items.forEach((item) => {
			const start = {
				line: item.start.line,
				ch: item.start.character,
			} as CodeMirror.Position;
			const end = {
				line: item.end.line,
				ch: item.end.character,
			} as CodeMirror.Position;

			this.highlightMarkers.push(this.editor.getDoc().markText(start, end, {
				className: 'CodeMirror-lsp-highlight',
			}));
		});
	}
}

export default CodeMirrorAdapter;
