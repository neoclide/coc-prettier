import {
  DocumentFormattingEditProvider,
  DocumentRangeFormattingEditProvider, Uri, window, workspace,
  CancellationToken,
  FormattingOptions,
  Range,
  TextDocument,
  TextEdit
} from 'coc.nvim'
import path from 'path'
import { addToOutput, safeExecution } from './errorHandler'
import { requireLocalPkg } from './requirePkg'
import {
  ParserOption,
  Prettier,
  PrettierConfig,
  PrettierEslintFormat,
  PrettierStylelint,
  PrettierTslintFormat,
  PrettierVSCodeConfig
} from './types.d'
import {
  allLanguages,
  getConfig,
  getParsersFromLanguageId,
  getPrettierInstance
} from './utils'

/**
 * HOLD style parsers (for stylelint integration)
 */
const STYLE_PARSERS: ParserOption[] = ['postcss', 'css', 'less', 'scss']

interface ResolveConfigResult {
  config: PrettierConfig | null
  error?: Error
}

/**
 * Resolves the prettierconfig for the given file.
 *
 * @param filePath file's path
 */
async function resolveConfig(
  filePath: string,
  options: {
    editorconfig?: boolean
    onlyUseLocalVersion: boolean
    requireConfig: boolean
  }
): Promise<ResolveConfigResult> {
  try {
    const localPrettier = (await requireLocalPkg(
      path.dirname(filePath),
      'prettier',
      { silent: true, ignoreBundled: true }
    )) as Prettier
    let prettierInstance = localPrettier
    if (!prettierInstance && !options.onlyUseLocalVersion) {
      prettierInstance = require('prettier')
    }
    const config = await prettierInstance.resolveConfig(filePath, options)
    return { config }
  } catch (error) {
    return { config: null, error }
  }
}

/**
 * Define which config should be used.
 * If a prettierconfig exists, it returns itself.
 * It merges prettierconfig into vscode's config (editorconfig).
 * Priority:
 * - additionalConfig
 * - prettierConfig
 * - vscodeConfig
 * @param hasPrettierConfig a prettierconfig exists
 * @param additionalConfig config we really want to see in. (range)
 * @param prettierConfig prettier's file config
 * @param vscodeConfig our config
 */
function mergeConfig(
  hasPrettierConfig: boolean,
  additionalConfig: Partial<PrettierConfig>,
  prettierConfig: Partial<PrettierConfig>,
  vscodeConfig: Partial<PrettierConfig>
): any {
  return hasPrettierConfig
    ? Object.assign(
      {
        parser: vscodeConfig.parser, // always merge our inferred parser in
        filepath: vscodeConfig.filepath // always merge filepath to detect file type
      },
      prettierConfig,
      additionalConfig
    )
    : Object.assign(vscodeConfig, prettierConfig, additionalConfig)
}
/**
 * Format the given text with user's configuration.
 * @param text Text to format
 * @param path formatting file's path
 * @returns {string} formatted text
 */
export async function format(
  text: string,
  { languageId, uri }: TextDocument,
  customOptions: Partial<PrettierConfig>
): Promise<string> {
  let u = Uri.parse(uri)
  const isUntitled = u.scheme == 'untitled'
  const fileName = u.fsPath
  const vscodeConfig: PrettierVSCodeConfig = getConfig(u)

  const localOnly = vscodeConfig.onlyUseLocalVersion
  const resolvedPrettier = await getPrettierInstance()
  if (!resolvedPrettier) {
    addToOutput(
      `Prettier module not found, prettier.onlyUseLocalVersion: ${vscodeConfig.onlyUseLocalVersion}`,
      'Error'
    )
    return
  }

  let supportedLanguages = allLanguages(resolvedPrettier)
  if (supportedLanguages.indexOf(languageId) == -1) {
    window.showMessage(`${languageId} not supported by prettier`, 'error')
    return
  }

  const dynamicParsers = getParsersFromLanguageId(
    languageId,
    resolvedPrettier,
    isUntitled ? undefined : fileName
  )
  let useBundled = false
  let parser: ParserOption

  if (!dynamicParsers.length) {
    const bundledParsers = getParsersFromLanguageId(
      languageId,
      require('prettier'),
      isUntitled ? undefined : fileName
    )
    parser = bundledParsers[0] || 'babylon'
    useBundled = true
  } else if (dynamicParsers.includes(vscodeConfig.parser)) {
    // handle deprecated parser option (parser: "flow")
    parser = vscodeConfig.parser
  } else {
    parser = dynamicParsers[0]
  }
  const doesParserSupportEslint = [
    'javascript',
    'javascriptreact',
    'typescript',
    'typescriptreact',
    'vue',
  ].includes(languageId)

  const { config: fileOptions, error } = await resolveConfig(fileName, {
    editorconfig: true,
    onlyUseLocalVersion: localOnly,
    requireConfig: vscodeConfig.requireConfig,
  })
  const hasConfig = fileOptions != null
  if (!hasConfig && vscodeConfig.requireConfig) {
    return text
  }

  if (error) {
    addToOutput(
      `Failed to resolve config for ${fileName}. Falling back to the default config settings.`,
      'Error'
    )
  }

  const prettierOptions = mergeConfig(
    hasConfig,
    customOptions,
    fileOptions || {},
    {
      printWidth: vscodeConfig.printWidth,
      tabWidth: vscodeConfig.tabWidth,
      singleQuote: vscodeConfig.singleQuote,
      jsxSingleQuote: vscodeConfig.jsxSingleQuote,
      trailingComma: vscodeConfig.trailingComma,
      bracketSpacing: vscodeConfig.bracketSpacing,
      parser,
      semi: vscodeConfig.semi,
      useTabs: vscodeConfig.useTabs,
      proseWrap: vscodeConfig.proseWrap,
      arrowParens: vscodeConfig.arrowParens,
      filepath: fileName,
    }
  )

  if (vscodeConfig.tslintIntegration && parser === 'typescript') {
    return safeExecution(
      () => {
        const prettierTslint = requireLocalPkg(u.fsPath, 'prettier-tslint')
          .format as PrettierTslintFormat
        // setUsedModule('prettier-tslint', 'Unknown', true)

        return prettierTslint({
          text,
          filePath: fileName,
          fallbackPrettierOptions: prettierOptions,
        })
      },
      text,
      fileName
    )
  }

  if (vscodeConfig.eslintIntegration && doesParserSupportEslint) {
    return safeExecution(
      () => {
        const prettierEslint = requireLocalPkg(
          u.fsPath,
          'prettier-eslint'
        ) as PrettierEslintFormat
        // setUsedModule('prettier-eslint', 'Unknown', true)

        return prettierEslint({
          text,
          filePath: fileName,
          fallbackPrettierOptions: prettierOptions,
        })
      },
      text,
      fileName
    )
  }

  if (vscodeConfig.stylelintIntegration && STYLE_PARSERS.includes(parser)) {
    const prettierStylelint = requireLocalPkg(
      u.fsPath,
      'prettier-stylelint'
    ) as PrettierStylelint
    return safeExecution(
      prettierStylelint.format({
        text,
        filePath: fileName,
        prettierOptions,
      }),
      text,
      fileName
    )
  }

  if (!doesParserSupportEslint && useBundled) {
    let bundledPrettier = require('prettier')
    return safeExecution(
      () => {
        const warningMessage =
          `prettier@${bundledPrettier.version} doesn't support ${languageId}. ` +
          `Falling back to bundled prettier@${bundledPrettier.version}.`

        addToOutput(warningMessage, 'Warning')

        // setUsedModule('prettier', bundledPrettier.version, true)

        return bundledPrettier.format(text, prettierOptions)
      },
      text,
      fileName
    )
  }

  // setUsedModule('prettier', localPrettier.version, false)
  return safeExecution(
    () => resolvedPrettier.format(text, prettierOptions),
    text,
    fileName
  )
}

export function fullDocumentRange(document: TextDocument): Range {
  const lastLineId = document.lineCount - 1
  let doc = workspace.getDocument(document.uri)
  return {
    start: { character: 0, line: 0 },
    end: { character: doc.getline(lastLineId).length, line: lastLineId }
  }
}

class PrettierEditProvider
  implements
  DocumentRangeFormattingEditProvider,
  DocumentFormattingEditProvider {
  constructor(private _fileIsIgnored: (filePath: string) => boolean) {}

  public provideDocumentRangeFormattingEdits(
    document: TextDocument,
    range: Range,
    _options: FormattingOptions,
    _token: CancellationToken
  ): Promise<TextEdit[]> {
    return this._provideEdits(document, {
      rangeStart: document.offsetAt(range.start),
      rangeEnd: document.offsetAt(range.end),
    })
  }

  public provideDocumentFormattingEdits(
    document: TextDocument,
    _options: FormattingOptions,
    _token: CancellationToken
  ): Promise<TextEdit[]> {
    return this._provideEdits(document, {})
  }

  private async _provideEdits(
    document: TextDocument,
    options: Partial<PrettierConfig>
  ): Promise<TextEdit[]> {
    let fileName = Uri.parse(document.uri).fsPath
    if (!document.uri.startsWith('untitled') && this._fileIsIgnored(fileName)) {
      return Promise.resolve([])
    }

    const code = await format(document.getText(), document, options)
    const edits: TextEdit[] = [{
      range: fullDocumentRange(document),
      newText: code
    }]
    const { disableSuccessMessage } = getConfig()

    if (edits && edits.length && !disableSuccessMessage) {
      window.showMessage('Formatted by prettier')
    }

    addToOutput(`Formatted file: ${document.uri}`)
    addToOutput(`Prettier format edits: ${JSON.stringify(edits, null, 2)}`)

    return edits
  }
}

export default PrettierEditProvider
