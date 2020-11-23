import { workspace, Uri } from 'coc.nvim'
import path, { basename } from 'path'
import {
  PrettierVSCodeConfig,
  Prettier,
  PrettierSupportInfo,
  ParserOption,
} from './types.d'
import { requireLocalPkg } from './requirePkg'
import { addToOutput } from './errorHandler'

export function getConfig(uri?: Uri): PrettierVSCodeConfig {
  return workspace.getConfiguration(
    'prettier',
    uri ? uri.toString() : undefined
  ) as any
}

export async function getPrettierInstance(): Promise<Prettier> {
  const document = await workspace.document
  const uri = Uri.parse(document.uri)

  const fileName = uri.fsPath
  const vscodeConfig: PrettierVSCodeConfig = getConfig(uri)

  const localOnly = vscodeConfig.onlyUseLocalVersion
  const resolvedPrettier = (await requireLocalPkg(
    path.dirname(fileName),
    'prettier',
    { silent: true, ignoreBundled: localOnly }
  )) as Prettier

  if (!resolvedPrettier) {
    addToOutput(
      `Prettier module not found, prettier.onlyUseLocalVersion: ${vscodeConfig.onlyUseLocalVersion}`,
      'Error'
    )
  }

  return resolvedPrettier
}

export function getParsersFromLanguageId(
  languageId: string,
  prettierInstance: Prettier,
  path?: string
): ParserOption[] {
  const supportedLanguages = getSupportLanguages(prettierInstance)
  const language = supportedLanguages.find(
    lang =>
      Array.isArray(lang.vscodeLanguageIds) &&
      lang.vscodeLanguageIds.includes(languageId) &&
      // Only for some specific filenames
      (lang.extensions.length > 0 ||
        (path != null &&
          lang.filenames != null &&
          lang.filenames.includes(basename(path))))
  )
  if (!language) {
    return []
  }
  return language.parsers
}

export function allLanguages(prettierInstance: Prettier): string[] {
  const supportedLanguages = getSupportLanguages(prettierInstance)
  return supportedLanguages.reduce(
    (ids, language) => [...ids, ...(language.vscodeLanguageIds || [])],
    [] as string[]
  )
}

export function enabledLanguages(prettierInstance: Prettier): string[] {
  const { disableLanguages } = getConfig()
  const languages = allLanguages(prettierInstance)

  return languages.filter(x => disableLanguages.indexOf(x) == -1)
}

export function rangeLanguages(): string[] {
  const { disableLanguages } = getConfig()
  return [
    'javascript',
    'javascriptreact',
    'typescript',
    'typescriptreact',
    'json',
    'graphql',
  ].filter(x => disableLanguages.indexOf(x) == -1)
}

export function getGroup(
  group: string,
  prettierInstance: Prettier
): PrettierSupportInfo['languages'] {
  const supportedLanguages = getSupportLanguages(prettierInstance)
  return supportedLanguages.filter(language => language.group === group)
}

function getSupportLanguages(
  prettierInstance: Prettier
): PrettierSupportInfo['languages'] {
  return prettierInstance.getSupportInfo({
    showUnreleased: true
  }).languages
}

export function hasLocalPrettierInstalled(filePath: string): boolean {
  const localPrettier = requireLocalPkg(filePath, 'prettier', {
    silent: true,
    ignoreBundled: true,
  })
  return localPrettier != null
}
