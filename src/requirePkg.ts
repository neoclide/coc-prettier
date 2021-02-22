import { addToOutput } from './errorHandler'
import resolveFrom from 'resolve-from'
import path from 'path'

interface Options {
  silent: boolean
  ignoreBundled: boolean
}

/**
 * Require package explicitly installed relative to given path.
 * Fallback to bundled one if no package was found bottom up.
 * @param {string} fspath file system path starting point to resolve package
 * @param {string} pkgName package's name to require
 * @returns module
 */
function requireLocalPkg(
  fspath: string,
  pkgName: string,
  options: Options = { silent: true, ignoreBundled: false }
): any {
  let modulePath = resolveFrom.silent(fspath, pkgName)

  if (modulePath !== void 0) {
    try {
      return require(modulePath)
    } catch (e) {
      if (!options.silent) {
        addToOutput(`Failed to load require ${pkgName} from ${modulePath}.${options.ignoreBundled ? `` : ` Using bundled`}`, 'Error')
      }
    }
  }
  if (options.ignoreBundled) {
    return null
  }
  try {
    return require(pkgName)
  } catch (e) {
    addToOutput(`Failed to load ${pkgName} from ${path.dirname(__dirname)}`, 'Error')
  }
  return null
}

export { requireLocalPkg }
