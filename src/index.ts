import { ExtensionContext, events, workspace, languages, commands, Uri } from 'coc.nvim'
import { Disposable, DocumentSelector, TextEdit } from 'vscode-languageserver-protocol'
import configFileListener from './configCacheHandler'
import { setupErrorHandler } from './errorHandler'
import ignoreFileHandler from './ignoreFileHandler'
import EditProvider, { format, fullDocumentRange } from './PrettierEditProvider'
import { allLanguages, rangeLanguages, enabledLanguages, getConfig, hasLocalPrettierInstalled } from './utils'
import { PrettierVSCodeConfig } from './types'

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
  let languageSelector = enabledLanguages().reduce((curr, language) => {
    return curr.concat([{ language, scheme: 'file' }, { language, scheme: 'untitled' }])
  }, [])

  let rangeLanguageSelector = rangeLanguages().reduce((curr, language) => {
    return curr.concat([{ language, scheme: 'file' }, { language, scheme: 'untitled' }])
  }, [])
  return {
    languageSelector,
    rangeLanguageSelector,
  }
}

function wait(ms: number): Promise<any> {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve()
    }, ms)
  })
}

export async function activate(context: ExtensionContext): Promise<void> {
  const { fileIsIgnored } = ignoreFileHandler(context.subscriptions)
  const editProvider = new EditProvider(fileIsIgnored)
  const statusItem = workspace.createStatusBarItem(0)
  const config = workspace.getConfiguration('prettier')
  statusItem.text = config.get<string>('statusItemText', 'Prettier')
  let priority = config.get<number>('formatterPriority', 1)

  async function checkDocument(): Promise<void> {
    await wait(30)
    let doc = workspace.getDocument(workspace.bufnr)
    let languageIds = enabledLanguages()
    if (doc && languageIds.indexOf(doc.filetype) !== -1) {
      statusItem.show()
    } else {
      statusItem.hide()
    }
  }

  function registerFormatter(): void {
    disposeHandlers()
    const { languageSelector, rangeLanguageSelector } = selectors()

    rangeFormatterHandler = languages.registerDocumentRangeFormatProvider(
      rangeLanguageSelector,
      editProvider,
      priority
    )

    formatterHandler = languages.registerDocumentFormatProvider(
      languageSelector,
      editProvider,
      priority
    )
  }
  registerFormatter()
  checkDocument().catch(_e => {
    // noop
  })

  events.on('BufEnter', async () => {
    await checkDocument()
  }, null, context.subscriptions)

  context.subscriptions.push(
    setupErrorHandler(),
    configFileListener()
  )
  context.subscriptions.push(
    commands.registerCommand('prettier.formatFile', async () => {
      let document = await workspace.document
      let languageId = document.filetype
      let languages = allLanguages()
      if (languages.indexOf(languageId) == -1) {
        workspace.showMessage(`${document.filetype} not supported by prettier`, 'error')
        return
      }
      let prettierConfig = workspace.getConfiguration('prettier', document.uri)
      let onlyUseLocalVersion = prettierConfig.get<boolean>('onlyUseLocalVersion', false)
      if (onlyUseLocalVersion && (!hasLocalPrettierInstalled(Uri.parse(document.uri).fsPath) || document.schema != 'file')) {
        workspace.showMessage(`Flag prettier.onlyUseLocalVersion is set, but prettier is not installed locally. No operation will be made.`, 'warning')
        return
      }
      let edits = await format(document.content, document.textDocument, {}).then(code => [
        TextEdit.replace(fullDocumentRange(document.textDocument), code),
      ])
      if (edits && edits.length) {
        await document.applyEdits(workspace.nvim, edits)
      }
    })
  )
}
