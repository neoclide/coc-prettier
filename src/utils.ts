import { workspace } from 'coc.nvim'
import { basename } from 'path'
import Uri from 'vscode-uri'
import {
  PrettierVSCodeConfig,
  Prettier,
  PrettierSupportInfo,
  ParserOption,
} from './types.d'

export function getConfig(uri?: Uri): PrettierVSCodeConfig {
  return workspace.getConfiguration('prettier', uri ? uri.toString() : undefined) as any
}

export function getParsersFromLanguageId(
  languageId: string,
  version: string,
  path?: string
): ParserOption[] {
  const language = getSupportLanguages(version).find(
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
    (ids, language) => [...ids, ...(language.vscodeLanguageIds || []), ...['typescript.jsx', 'typescript.tsx']],
    [] as string[]
  )
}

export function enabledLanguages(): string[] {
  const { disableLanguages } = getConfig()
  return getSupportLanguages().reduce(
    (ids, language) => [...ids, ...(language.vscodeLanguageIds || []), ...['typescript.jsx', 'typescript.tsx']],
    [] as string[]
  ).filter(x => disableLanguages.indexOf(x) == -1)
}

export function rangeLanguages(): string[] {
  const { disableLanguages } = getConfig()
  return [
    'javascript',
    'javascript.jsx',
    'typescript',
    'typescript.jsx',
    'typescript.tsx',
    'json',
    'graphql',
  ].filter(x => disableLanguages.indexOf(x) == -1)
}

export function getGroup(group: string): PrettierSupportInfo['languages'] {
  return getSupportLanguages().filter(language => language.group === group)
}

function getSupportLanguages(version?: string): any {
  return (require('prettier') as Prettier).getSupportInfo(version).languages
}
