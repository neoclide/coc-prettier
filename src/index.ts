import { ExtensionContext, languages, workspace } from 'coc.nvim'
import { Disposable, DocumentFilter, DocumentSelector } from 'vscode-languageserver-protocol'
import configFileListener from './configCacheHandler'
import { setupErrorHandler } from './errorHandler'
import ignoreFileHandler from './ignoreFileHandler'
import EditProvider from './PrettierEditProvider'
import { allEnabledLanguages, getConfig, rangeSupportedLanguages } from './utils'

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
  const allLanguages = allEnabledLanguages()
  const allRangeLanguages = rangeSupportedLanguages()
  const { disableLanguages } = getConfig()
  const globalLanguageSelector = allLanguages.filter(
    l => !disableLanguages.includes(l)
  )
  const globalRangeLanguageSelector = allRangeLanguages.filter(
    l => !disableLanguages.includes(l)
  )
  if (workspace.workspaceFolder === undefined) {
    // no workspace opened
    return {
      languageSelector: globalLanguageSelector,
      rangeLanguageSelector: globalRangeLanguageSelector,
    }
  }

  // at least 1 workspace
  const untitledLanguageSelector: DocumentFilter[] = globalLanguageSelector.map(
    l => ({ language: l, scheme: 'untitled' })
  )
  const untitledRangeLanguageSelector: DocumentFilter[] = globalRangeLanguageSelector.map(
    l => ({ language: l, scheme: 'untitled' })
  )
  const fileLanguageSelector: DocumentFilter[] = globalLanguageSelector.map(
    l => ({ language: l, scheme: 'file' })
  )
  const fileRangeLanguageSelector: DocumentFilter[] = globalRangeLanguageSelector.map(
    l => ({ language: l, scheme: 'file' })
  )
  return {
    languageSelector: untitledLanguageSelector.concat(fileLanguageSelector),
    rangeLanguageSelector: untitledRangeLanguageSelector.concat(
      fileRangeLanguageSelector
    ),
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
