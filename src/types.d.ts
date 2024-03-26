import * as prettier from "prettier"
import { TextDocument } from "coc.nvim"

type PrettierSupportLanguage = {
  vscodeLanguageIds?: string[]
  extensions?: string[]
  parsers: string[]
}
type PrettierFileInfoResult = {
  ignored: boolean
  inferredParser?: PrettierBuiltInParserName | null
}
type PrettierBuiltInParserName = string
type PrettierResolveConfigOptions = prettier.ResolveConfigOptions
type PrettierOptions = prettier.Options
type PrettierFileInfoOptions = prettier.FileInfoOptions

type PrettierModule = {
  format(source: string, options?: prettier.Options): Promise<string>
  getSupportInfo(): Promise<{ languages: PrettierSupportLanguage[] }>
  getFileInfo(
    filePath: string,
    options?: PrettierFileInfoOptions
  ): Promise<PrettierFileInfoResult>
}

type ModuleResolverInterface = {
  getPrettierInstance(fileName: string): Promise<PrettierModule | undefined>
  getGlobalPrettierInstance(): Promise<PrettierModule>
  getResolvedConfig(
    doc: TextDocument,
    vscodeConfig: PrettierVSCodeConfig
  ): Promise<"error" | "disabled" | PrettierOptions | null>
  dispose(): void
}

type TrailingCommaOption = "none" | "es5" | "all"

export type PackageManagers = "npm" | "yarn" | "pnpm"

/**
 * prettier-vscode specific configuration
 */
interface IExtensionConfig {
  /**
   *  Priority of formatter.
   */
  formatterPriority: number
  /**
   * Not use bundled when true.
   */
  onlyUseLocalVersion: boolean
  /**
   * List of disabled languages.
   */
  disableLanguages: string[]
  /**
   * Text for status item.
   */
  statusItemText: string
  /**
   * Path to '.prettierignore' or similar.
   */
  ignorePath: string
  /**
   * Path to prettier module.
   */
  prettierPath: string | undefined
  /**
   * Path to prettier configuration file.
   */
  configPath: string | undefined
  /**
   * If true will skip formatting if a prettier config isn't found.
   */
  requireConfig: boolean
  /**
   * If true, take into account the .editorconfig file when resolving configuration.
   */
  useEditorConfig: boolean
  /**
   * If true, this extension will attempt to use global npm or yarn modules.
   */
  resolveGlobalModules: boolean
  /**
   * If true, this extension will process files in node_modules
   */
  withNodeModules: boolean
  /**
   * Additional file patterns to register for formatting
   */
  documentSelectors: string[]
  /**
   * If true, this extension will be enabled
   */
  enable: boolean
  /**
   * If true, enabled debug logs
   */
  enableDebugLogs: boolean
}
/**
 * Configuration for prettier-vscode
 */
export type PrettierVSCodeConfig = IExtensionConfig & prettier.Options

export interface RangeFormattingOptions {
  rangeStart: number
  rangeEnd: number
}

export interface ExtensionFormattingOptions {
  rangeStart?: number
  rangeEnd?: number
  force: boolean
}
