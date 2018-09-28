import { DocumentFormattingEditProvider, DocumentRangeFormattingEditProvider } from 'coc.nvim/lib/provider'
import { CancellationToken, FormattingOptions, Range, TextDocument, TextEdit } from 'vscode-languageserver-protocol'
import { addToOutput, safeExecution } from './errorHandler'
import { requireLocalPkg } from './requirePkg'
import { ParserOption, Prettier, PrettierConfig, PrettierEslintFormat, PrettierStylelint, PrettierTslintFormat, PrettierVSCodeConfig } from './types.d'
import { getConfig, getParsersFromLanguageId, enabledLanguages, rangeLanguages } from './utils'
import { workspace } from 'coc.nvim'
import path from 'path'
import Uri from 'vscode-uri'

const bundledPrettier = require('prettier') as Prettier
/**
 * HOLD style parsers (for stylelint integration)
 */
const STYLE_PARSERS: ParserOption[] = ['postcss', 'css', 'less', 'scss']
/**
 * Check if a given file has an associated prettierconfig.
 * @param filePath file's path
 */
async function hasPrettierConfig(filePath: string): Promise<boolean> {
  const { config } = await resolveConfig(filePath)
  return config !== null
}

interface ResolveConfigResult { config: PrettierConfig | null; error?: Error }

/**
 * Resolves the prettierconfig for the given file.
 *
 * @param filePath file's path
 */
async function resolveConfig(
  filePath: string,
  options?: { editorconfig?: boolean }
): Promise<ResolveConfigResult> {
  try {
    const config = await bundledPrettier.resolveConfig(filePath, options)
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
      { parser: vscodeConfig.parser }, // always merge our inferred parser in
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
async function format(
  text: string,
  { languageId, uri }: TextDocument,
  customOptions: Partial<PrettierConfig>
): Promise<string> {
  let u = Uri.parse(uri)
  const isUntitled = u.scheme == 'untitled'
  const fileName = u.fsPath
  const vscodeConfig: PrettierVSCodeConfig = getConfig(u)
  const localPrettier = requireLocalPkg(path.dirname(fileName), 'prettier') as Prettier

  // This has to stay, as it allows to skip in sub workspaceFolders. Sadly noop.
  // wf1  (with "lang") -> glob: "wf1/**"
  // wf1/wf2  (without "lang") -> match "wf1/**"
  if (vscodeConfig.disableLanguages.includes(languageId)) {
    return text
  }

  const dynamicParsers = getParsersFromLanguageId(
    languageId,
    localPrettier.version,
    isUntitled ? undefined : fileName
  )
  let useBundled = false
  let parser: ParserOption

  if (!dynamicParsers.length) {
    const bundledParsers = getParsersFromLanguageId(
      languageId,
      bundledPrettier.version,
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

  const hasConfig = await hasPrettierConfig(fileName)

  if (!hasConfig && vscodeConfig.requireConfig) {
    return text
  }

  const { config: fileOptions, error } = await resolveConfig(fileName, {
    editorconfig: true,
  })

  if (error) {
    addToOutput(
      `Failed to resolve config for ${fileName}. Falling back to the default config settings.`
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
      trailingComma: vscodeConfig.trailingComma,
      bracketSpacing: vscodeConfig.bracketSpacing,
      jsxBracketSameLine: vscodeConfig.jsxBracketSameLine,
      parser,
      semi: vscodeConfig.semi,
      useTabs: vscodeConfig.useTabs,
      proseWrap: vscodeConfig.proseWrap,
      arrowParens: vscodeConfig.arrowParens,
    }
  )

  if (vscodeConfig.tslintIntegration && parser === 'typescript') {
    return safeExecution(
      () => {
        const prettierTslint = require('prettier-tslint')
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
        const prettierEslint = require('prettier-eslint') as PrettierEslintFormat
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
    const prettierStylelint = require('prettier-stylelint') as PrettierStylelint
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
    return safeExecution(
      () => {
        const warningMessage =
          `prettier@${
          localPrettier.version
          } doesn't support ${languageId}. ` +
          `Falling back to bundled prettier@${
          bundledPrettier.version
          }.`

        addToOutput(warningMessage)

        // setUsedModule('prettier', bundledPrettier.version, true)

        return bundledPrettier.format(text, prettierOptions)
      },
      text,
      fileName
    )
  }

  // setUsedModule('prettier', localPrettier.version, false)

  return safeExecution(
    () => localPrettier.format(text, prettierOptions),
    text,
    fileName
  )
}

function fullDocumentRange(document: TextDocument): Range {
  const lastLineId = document.lineCount - 1
  let doc = workspace.getDocument(document.uri)

  return Range.create(
    { character: 0, line: 0 },
    { character: doc.getline(lastLineId).length, line: lastLineId }
  )
}

class PrettierEditProvider
  implements
  DocumentRangeFormattingEditProvider,
  DocumentFormattingEditProvider {
  constructor(private _fileIsIgnored: (filePath: string) => boolean) { }

  public provideDocumentRangeFormattingEdits(
    document: TextDocument,
    range: Range,
    _options: FormattingOptions,
    _token: CancellationToken
  ): Promise<TextEdit[]> {
    let languages = rangeLanguages()
    if (languages.indexOf(document.languageId) == -1) {
      return Promise.resolve(null)
    }
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
    let languages = enabledLanguages()
    if (languages.indexOf(document.languageId) == -1) {
      return Promise.resolve(null)
    }
    return this._provideEdits(document, {})
  }

  private _provideEdits(
    document: TextDocument,
    options: Partial<PrettierConfig>
  ): Promise<TextEdit[]> {
    let fileName = Uri.parse(document.uri).fsPath
    if (!document.uri.startsWith('untitled') && this._fileIsIgnored(fileName)) {
      return Promise.resolve([])
    }
    return format(document.getText(), document, options).then(code => [
      TextEdit.replace(fullDocumentRange(document), code),
    ]).then(edits => {
      if (edits && edits.length) {
        workspace.showMessage('Formatted by prettier')
      }
      return edits
    })
  }
}

export default PrettierEditProvider
