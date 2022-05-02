import {
  Disposable,
  DocumentFilter,
  languages,
  Range,
  TextDocument,
  TextEdit,
  Uri,
  window,
  workspace,
  TextEditor,
  LinesTextDocument
} from 'coc.nvim'
import { getParserFromLanguageId } from './languageFilters'
import { LoggingService } from './LoggingService'
import { RESTART_TO_ENABLE } from './message'
import { PrettierEditProvider } from './PrettierEditProvider'
import { FormatterStatus, StatusBar } from './StatusBar'
import {
  ExtensionFormattingOptions,
  ModuleResolverInterface,
  PrettierBuiltInParserName,
  PrettierFileInfoResult,
  PrettierModule,
  PrettierOptions,
  RangeFormattingOptions
} from './types'
import { getConfig, getWorkspaceRelativePath } from './util'

interface ISelectors {
  rangeLanguageSelector: DocumentFilter[]
  languageSelector: DocumentFilter[]
}

/**
 * Prettier reads configuration from files
 */
const PRETTIER_CONFIG_FILES = [
  '.prettierrc',
  '.prettierrc.json',
  '.prettierrc.json5',
  '.prettierrc.yaml',
  '.prettierrc.yml',
  '.prettierrc.toml',
  '.prettierrc.js',
  '.prettierrc.cjs',
  'package.json',
  'prettier.config.js',
  'prettier.config.cjs',
  '.editorconfig'
]

export default class PrettierEditService implements Disposable {
  private formatterHandler: undefined | Disposable
  private rangeFormatterHandler: undefined | Disposable
  private registeredWorkspaces = new Set<string>()

  private allLanguages: string[] = []
  private allExtensions: string[] = []
  private allRangeLanguages: string[] = [
    'javascript',
    'javascriptreact',
    'typescript',
    'typescriptreact',
    'json',
    'graphql',
    'handlebars'
  ]

  constructor(
    private moduleResolver: ModuleResolverInterface,
    private loggingService: LoggingService,
    private statusBar: StatusBar
  ) {}

  public registerDisposables(): Disposable[] {
    const packageWatcher = workspace.createFileSystemWatcher('**/package.json')
    packageWatcher.onDidChange(this.resetFormatters)
    packageWatcher.onDidCreate(this.resetFormatters)
    packageWatcher.onDidDelete(this.resetFormatters)

    const configurationWatcher = workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('prettier.enable')) {
        this.loggingService.logWarning(RESTART_TO_ENABLE)
      } else if (event.affectsConfiguration('prettier')) {
        this.resetFormatters()
      }
    })

    const prettierConfigWatcher = workspace.createFileSystemWatcher(
      `**/{${PRETTIER_CONFIG_FILES.join(',')}}`
    )
    prettierConfigWatcher.onDidChange(this.prettierConfigChanged)
    prettierConfigWatcher.onDidCreate(this.prettierConfigChanged)
    prettierConfigWatcher.onDidDelete(this.prettierConfigChanged)

    const textEditorChange = window.onDidChangeActiveTextEditor(editor => {
      this.handleActiveTextEditorChanged(editor)
    })

    this.handleActiveTextEditorChanged(window.activeTextEditor)

    return [
      packageWatcher,
      configurationWatcher,
      prettierConfigWatcher,
      textEditorChange
    ]
  }

  public forceFormatDocument = async () => {
    try {
      const doc = await workspace.document
      if (!doc || !doc.attached) {
        this.loggingService.logInfo(
          'No active document. Nothing was formatted.'
        )
        return
      }

      this.loggingService.logInfo(
        'Forced formatting will not use ignore files.'
      )

      const edits = await this.provideEdits(doc.textDocument, { force: true })
      if (edits.length !== 1) {
        return
      }

      await doc.applyEdits(edits)
    } catch (e) {
      this.loggingService.logError('Error formatting document', e)
    }
  }

  private prettierConfigChanged = async (uri: Uri) => this.resetFormatters(uri)

  private resetFormatters = async (uri?: Uri) => {
    if (uri) {
      const workspaceFolder = workspace.getWorkspaceFolder(uri.toString())
      const fsPath = workspaceFolder
        ? Uri.parse(workspaceFolder.uri).fsPath
        : undefined
      this.registeredWorkspaces.delete(fsPath ?? 'global')
    } else {
      // coc-prettier config change, reset everything
      this.registeredWorkspaces.clear()
    }
    this.statusBar.update(FormatterStatus.Ready)
  }

  private handleActiveTextEditorChanged = async (editor: TextEditor | undefined) => {
    if (!editor || !editor.document.attached) {
      this.statusBar.hide()
      return
    }
    let doc = editor.document
    const { disableLanguages } = getConfig(Uri.parse(doc.uri))
    const uri = Uri.parse(doc.uri)
    if (uri.scheme !== 'file') {
      // We set as ready for untitled documents,
      // but return because these will always
      // use the global registered formatter.
      return
    }
    const workspaceFolder = workspace.getWorkspaceFolder(doc.uri)

    if (!workspaceFolder) {
      // Do nothing, this is only for registering formatters in workspace folder.
      return
    }
    const workspaceUri = Uri.parse(workspaceFolder.uri)

    const prettierInstance = await this.moduleResolver.getPrettierInstance(
      workspaceUri.fsPath
    )
    const isRegistered = this.registeredWorkspaces.has(workspaceUri.fsPath)

    // If there isn't an instance here, it is because the module
    // could not be loaded either locally or globably when specified
    if (!prettierInstance) {
      this.statusBar.update(FormatterStatus.Error)
      return
    }

    const selectors = await this.getSelectors(prettierInstance, workspaceUri)

    if (!isRegistered) {
      this.registerDocumentFormatEditorProviders(selectors)
      this.registeredWorkspaces.add(workspaceUri.fsPath)
      this.loggingService.logDebug(
        `Enabling Prettier for Workspace ${workspaceUri.fsPath}`,
        selectors
      )
    }

    if (
      Array.isArray(disableLanguages) &&
      disableLanguages.includes(doc.languageId)
    ) {
      this.statusBar.hide()
      return
    }

    const score = workspace.match(selectors.languageSelector, doc.textDocument)
    if (score > 0) {
      this.statusBar.update(FormatterStatus.Ready)
    } else {
      this.statusBar.hide()
    }
  }

  public async registerGlobal() {
    const selectors = await this.getSelectors(
      this.moduleResolver.getGlobalPrettierInstance()
    )
    this.registerDocumentFormatEditorProviders(selectors)
    this.loggingService.logDebug('Enabling Prettier globally', selectors)
  }

  public dispose = () => {
    this.moduleResolver.dispose()
    this.formatterHandler?.dispose()
    this.rangeFormatterHandler?.dispose()
    this.formatterHandler = undefined
    this.rangeFormatterHandler = undefined
  }

  private registerDocumentFormatEditorProviders({
    languageSelector,
    rangeLanguageSelector
  }: ISelectors) {
    this.dispose()
    const editProvider = new PrettierEditProvider(this.provideEdits)
    const { formatterPriority } = getConfig()
    let priority = formatterPriority ?? -1
    this.rangeFormatterHandler = languages.registerDocumentRangeFormatProvider(
      rangeLanguageSelector,
      editProvider,
      priority
    )
    this.formatterHandler = languages.registerDocumentFormatProvider(
      languageSelector,
      editProvider,
      priority
    )
  }

  /**
   * Build formatter selectors
   */
  private getSelectors = async (
    prettierInstance: PrettierModule,
    uri?: Uri
  ): Promise<ISelectors> => {
    const { languages } = prettierInstance.getSupportInfo()
    const { documentSelectors, disableLanguages } = getConfig(uri)

    languages.forEach((lang) => {
      if (lang && lang.vscodeLanguageIds) {
        this.allLanguages.push(...lang.vscodeLanguageIds)
      }
    })
    this.allLanguages = this.allLanguages.filter((value, index, self) => {
      if (Array.isArray(disableLanguages) && disableLanguages.includes(value))
        return false
      return self.indexOf(value) === index
    })

    languages.forEach((lang) => {
      if (lang && lang.extensions) {
        this.allExtensions.push(...lang.extensions)
      }
    })
    this.allExtensions = this.allExtensions.filter((value, index, self) => {
      return self.indexOf(value) === index
    })

    // Language selector for file extensions
    // const extensionLanguageSelector: DocumentFilter[] = uri
    //   ? this.allExtensions.length === 0
    //     ? []
    //     : [
    //         {
    //           pattern: `${uri.fsPath}/**/*.{${this.allExtensions
    //             .map((e) => e.substring(1))
    //             .join(',')}}`,
    //           scheme: 'file'
    //         }
    //       ]
    //   : []

    const customLanguageSelectors: DocumentFilter[] = uri
      ? documentSelectors.map((pattern) => ({
        pattern: `${uri.fsPath}/${pattern}`,
        scheme: 'file'
      }))
      : []

    const defaultLanguageSelectors: DocumentFilter[] = [
      ...this.allLanguages.map((language) => ({ language })),
      { language: 'jsonc', scheme: 'vscode-userdata' } // Selector for VSCode settings.json
    ]

    const languageSelector = [
      ...customLanguageSelectors,
      ...defaultLanguageSelectors
    ]

    const rangeLanguageSelector: DocumentFilter[] = [
      ...this.allRangeLanguages.map((language) => ({
        language
      }))
    ].filter((o) => {
      if (
        Array.isArray(disableLanguages) &&
        disableLanguages.includes(o.language)
      )
        return false
      return true
    })
    return { languageSelector, rangeLanguageSelector }
  }

  private provideEdits = async (
    document: LinesTextDocument,
    options: ExtensionFormattingOptions
  ): Promise<TextEdit[]> => {
    const startTime = new Date().getTime()
    const result = await this.format(document.getText(), document, options)
    if (!result) {
      // No edits happened, return never so coc-prettier can try other formatters
      return []
    }
    const duration = new Date().getTime() - startTime
    this.loggingService.logInfo(`Formatting completed in ${duration / 1000}ms.`)
    return [TextEdit.replace(this.fullDocumentRange(document), result)]
  }

  /**
   * Format the given text with user's configuration.
   * @param text Text to format
   * @param path formatting file's path
   * @returns {string} formatted text
   */
  private async format(
    text: string,
    document: TextDocument,
    options: ExtensionFormattingOptions
  ): Promise<string | undefined> {
    const { uri, languageId } = document
    const fileName = Uri.parse(uri).fsPath

    this.loggingService.logInfo(`Formatting ${uri}`)

    const vscodeConfig = getConfig(Uri.parse(uri))

    const resolvedConfig = await this.moduleResolver.getResolvedConfig(
      document,
      vscodeConfig
    )
    if (resolvedConfig === 'error') {
      this.statusBar.update(FormatterStatus.Error)
      return
    }
    if (resolvedConfig === 'disabled') {
      this.statusBar.hide()
      return
    }

    const prettierInstance = await this.moduleResolver.getPrettierInstance(
      fileName
    )

    if (!prettierInstance) {
      this.loggingService.logError(
        'Prettier could not be loaded. See previous logs for more information.'
      )
      this.statusBar.update(FormatterStatus.Error)
      return
    }

    let resolvedIgnorePath: string | undefined
    if (vscodeConfig.ignorePath) {
      resolvedIgnorePath = getWorkspaceRelativePath(
        fileName,
        vscodeConfig.ignorePath
      )
      if (resolvedIgnorePath) {
        this.loggingService.logInfo(
          `Using ignore file (if present) at ${resolvedIgnorePath}`
        )
      }
    }

    let fileInfo: PrettierFileInfoResult | undefined
    if (fileName) {
      fileInfo = await prettierInstance.getFileInfo(fileName, {
        ignorePath: resolvedIgnorePath,
        resolveConfig: true,
        withNodeModules: vscodeConfig.withNodeModules
      })
      this.loggingService.logInfo('File Info:', fileInfo)
    }

    if (!options.force && fileInfo && fileInfo.ignored) {
      this.loggingService.logInfo('File is ignored, skipping.')
      this.statusBar.hide()
      return
    }

    let parser: PrettierBuiltInParserName | string | undefined
    if (fileInfo && fileInfo.inferredParser) {
      parser = fileInfo.inferredParser
    } else if (languageId !== 'plaintext' && languageId !== 'txt') {
      // Don't attempt coc-prettier language for plaintext because we never have
      // a formatter for plaintext and most likely the reason for this is
      // somebody has registered a custom file extension without properly
      // configuring the parser in their prettier config.
      this.loggingService.logWarning(`Parser not inferred, trying languageId.`)
      const languages = prettierInstance.getSupportInfo().languages
      parser = getParserFromLanguageId(languages, Uri.parse(uri), languageId)
    }

    if (!parser) {
      this.loggingService.logError(
        `Failed to resolve a parser, skipping file. If you registered a custom file extension, be sure to configure the parser.`
      )
      this.statusBar.update(FormatterStatus.Error)
      return
    }

    const prettierOptions = this.getPrettierOptions(
      fileName,
      parser as PrettierBuiltInParserName,
      vscodeConfig,
      resolvedConfig,
      options
    )

    this.loggingService.logInfo('Prettier Options:', prettierOptions)

    try {
      const formattedText = prettierInstance.format(text, prettierOptions)
      this.statusBar.update(FormatterStatus.Success)

      return formattedText
    } catch (error) {
      this.loggingService.logError('Error formatting document.', error)
      this.statusBar.update(FormatterStatus.Error)

      return text
    }
  }

  private getPrettierOptions(
    fileName: string,
    parser: PrettierBuiltInParserName,
    vsCodeConfig: PrettierOptions,
    configOptions: PrettierOptions | null,
    extensionFormattingOptions: ExtensionFormattingOptions
  ): Partial<PrettierOptions> {
    const fallbackToVSCodeConfig = configOptions === null

    const vsOpts: PrettierOptions = {}
    if (fallbackToVSCodeConfig) {
      vsOpts.arrowParens = vsCodeConfig.arrowParens
      vsOpts.bracketSpacing = vsCodeConfig.bracketSpacing
      vsOpts.endOfLine = vsCodeConfig.endOfLine
      vsOpts.htmlWhitespaceSensitivity = vsCodeConfig.htmlWhitespaceSensitivity
      vsOpts.insertPragma = vsCodeConfig.insertPragma
      vsOpts.jsxBracketSameLine = vsCodeConfig.jsxBracketSameLine
      vsOpts.jsxSingleQuote = vsCodeConfig.jsxSingleQuote
      vsOpts.printWidth = vsCodeConfig.printWidth
      vsOpts.proseWrap = vsCodeConfig.proseWrap
      vsOpts.quoteProps = vsCodeConfig.quoteProps
      vsOpts.requirePragma = vsCodeConfig.requirePragma
      vsOpts.semi = vsCodeConfig.semi
      vsOpts.singleQuote = vsCodeConfig.singleQuote
      vsOpts.tabWidth = vsCodeConfig.tabWidth
      vsOpts.trailingComma = vsCodeConfig.trailingComma
      vsOpts.useTabs = vsCodeConfig.useTabs
      vsOpts.vueIndentScriptAndStyle = vsCodeConfig.vueIndentScriptAndStyle
    }

    this.loggingService.logInfo(
      fallbackToVSCodeConfig
        ? 'No local configuration (i.e. .prettierrc or .editorconfig) detected, falling back to coc-prettier configuration'
        : 'Detected local configuration (i.e. .prettierrc or .editorconfig), coc-prettier configuration will not be used'
    )

    let rangeFormattingOptions: RangeFormattingOptions | undefined
    if (
      extensionFormattingOptions.rangeEnd &&
      extensionFormattingOptions.rangeStart
    ) {
      rangeFormattingOptions = {
        rangeEnd: extensionFormattingOptions.rangeEnd,
        rangeStart: extensionFormattingOptions.rangeStart
      }
    }

    const options: PrettierOptions = {
      ...(fallbackToVSCodeConfig ? vsOpts : {}),
      ...{
        /* cspell: disable-next-line */
        filepath: fileName,
        parser: parser as PrettierBuiltInParserName
      },
      ...(rangeFormattingOptions || {}),
      ...(configOptions || {})
    }

    if (extensionFormattingOptions.force && options.requirePragma === true) {
      options.requirePragma = false
    }

    return options
  }

  private fullDocumentRange(document: LinesTextDocument): Range {
    const lastLineId = document.lineCount - 1
    let doc = workspace.getDocument(document.uri)
    return Range.create(0, 0, lastLineId, doc.getline(lastLineId).length)
  }
}
