import { workspace, Uri } from 'coc.nvim'
import { basename } from 'path'
import readPkgUp from 'read-pkg-up'
import {
  PrettierVSCodeConfig,
  Prettier,
  PrettierSupportInfo,
  ParserOption,
} from './types.d'
import { requireLocalPkg } from './requirePkg';

const bundledPrettier = require('prettier') as Prettier

export function getConfig(uri?: Uri): PrettierVSCodeConfig {
  return workspace.getConfiguration('prettier', uri ? uri.toString() : undefined) as any
}

export function getParsersFromLanguageId(
  languageId: string,
  prettierInstance: Prettier,
  path?: string
): ParserOption[] {
  const language = getSupportLanguages(prettierInstance).find(
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

export function allLanguages(): string[] {
  return getSupportLanguages().reduce(
    (ids, language) => [...ids, ...(language.vscodeLanguageIds || []), ...['javascriptreact', 'typescriptreact']],
    [] as string[]
  )
}

export function enabledLanguages(): string[] {
  const { disableLanguages } = getConfig()
  return getSupportLanguages().reduce(
    (ids, language) => [...ids, ...(language.vscodeLanguageIds || []), ...['javascriptreact', 'typescriptreact']],
    [] as string[]
  ).filter(x => disableLanguages.indexOf(x) == -1)
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

export function getGroup(group: string): PrettierSupportInfo['languages'] {
  return getSupportLanguages().filter(language => language.group === group)
}

function getSupportLanguages(prettierInstance: Prettier = bundledPrettier): any {
  return prettierInstance.getSupportInfo(prettierInstance.version).languages
}

export function hasLocalPrettierInstalled(filePath: string): boolean {
  const pkgResult = readPkgUp.sync({ cwd: filePath })

  if(!pkgResult || !pkgResult.package) {
    return false
  }
  
  const { dependencies = {}, devDependencies = {} } = pkgResult.package

  const hasPrettierOnPkgJson = devDependencies.prettier || dependencies.prettier

  if(!hasPrettierOnPkgJson) {
    return false
  }

  const localPrettier = requireLocalPkg(filePath, 'prettier', { silent: true, ignoreBundled: true })

  if(!localPrettier) {
    return false
  }

  return true
}
