import { ExtensionContext, languages } from 'coc.nvim'
import { Disposable, DocumentSelector } from 'vscode-languageserver-protocol'
import configFileListener from './configCacheHandler'
import { setupErrorHandler } from './errorHandler'
import ignoreFileHandler from './ignoreFileHandler'
import EditProvider from './PrettierEditProvider'

interface Selectors {
  rangeLanguageSelector: DocumentSelector
  languageSelector: DocumentSelector
}

let formatterHandler: undefined | Disposable
let rangeFormatterHandler: undefined | Disposable
/**
 * Dispose formatters
 */
function disposeHandlers(): void {
  if (formatterHandler) {
    formatterHandler.dispose()
  }
  if (rangeFormatterHandler) {
    rangeFormatterHandler.dispose()
  }
  formatterHandler = undefined
  rangeFormatterHandler = undefined
}
/**
 * Build formatter selectors
 */
function selectors(): Selectors {
  let selector = [{ language: '*', scheme: 'file' }, { language: '*', scheme: 'untitled' }]
  return {
    languageSelector: selector,
    rangeLanguageSelector: selector
  }
}

export function activate(context: ExtensionContext): void {
  const { fileIsIgnored } = ignoreFileHandler(context.subscriptions)
  const editProvider = new EditProvider(fileIsIgnored)
  function registerFormatter(): void {
    disposeHandlers()
    const { languageSelector, rangeLanguageSelector } = selectors()
    rangeFormatterHandler = languages.registerDocumentRangeFormatProvider(
      rangeLanguageSelector,
      editProvider
    )
    formatterHandler = languages.registerDocumentFormatProvider(
      languageSelector,
      editProvider
    )
  }
  registerFormatter()
  context.subscriptions.push(
    setupErrorHandler(),
    configFileListener()
  )
}
