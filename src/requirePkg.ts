import { addToOutput } from './errorHandler'
import resolveFrom from 'resolve-from'

declare var __webpack_require__: any
declare var __non_webpack_require__: any
const requireFunc = typeof __webpack_require__ === "function" ? __non_webpack_require__ : require

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
  options: Options = { silent: false, ignoreBundled: false }
): any {
  let modulePath = resolveFrom.silent(fspath, pkgName)

  if (modulePath !== void 0) {
    try {
      return requireFunc(modulePath)
    } catch (e) {
      if(!options.silent) {
        addToOutput(`Failed to load ${pkgName} from ${modulePath}.${options.ignoreBundled ? `` : ` Using bundled`}`, 'Error')
      }
    }
  }

  return options.ignoreBundled ? null : requireFunc(pkgName)
}
export { requireLocalPkg }
