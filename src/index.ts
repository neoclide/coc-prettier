import { ExtensionContext, events, workspace, languages, commands } from 'coc.nvim'
import { Disposable, DocumentSelector, TextEdit } from 'vscode-languageserver-protocol'
import configFileListener from './configCacheHandler'
import { setupErrorHandler } from './errorHandler'
import ignoreFileHandler from './ignoreFileHandler'
import EditProvider, { format, fullDocumentRange } from './PrettierEditProvider'
import { allLanguages, enabledLanguages } from './utils'

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

function wait(ms: number): Promise<any> {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve()
    }, ms)
  })
}

export function activate(context: ExtensionContext): void {
  const { fileIsIgnored } = ignoreFileHandler(context.subscriptions)
  const editProvider = new EditProvider(fileIsIgnored)
  const statusItem = workspace.createStatusBarItem(0)
  const config = workspace.getConfiguration('prettier')
  statusItem.text = config.get('statusItemText', 'Prettier')

  async function checkDocuemnt(): Promise<void> {
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
      1
    )
    formatterHandler = languages.registerDocumentFormatProvider(
      languageSelector,
      editProvider,
      1
    )
  }
  registerFormatter()
  checkDocuemnt().catch(_e => {
    // noop
  })

  events.on('BufEnter', async () => {
    await checkDocuemnt()
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
      let edits = await format(document.content, document.textDocument, {}).then(code => [
        TextEdit.replace(fullDocumentRange(document.textDocument), code),
      ])
      if (edits && edits.length) {
        await document.applyEdits(workspace.nvim, edits)
      }
    })
  )
}
