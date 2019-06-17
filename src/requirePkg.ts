import { addToOutput } from './errorHandler'
import path from 'path'
import resolveFrom from 'resolve-from'

declare var __webpack_require__: any
declare var __non_webpack_require__: any
const requireFunc = typeof __webpack_require__ === "function" ? __non_webpack_require__ : require

/**
 * Require package explicitely installed relative to given path.
 * Fallback to bundled one if no pacakge was found bottom up.
 * @param {string} fspath file system path starting point to resolve package
 * @param {string} pkgName package's name to require
 * @returns module
 */
function requireLocalPkg(fspath: string, pkgName: string): any {
  let modulePath = resolveFrom.silent(fspath, pkgName)

  if (modulePath !== void 0) {
    try {
      return requireFunc(modulePath)
    } catch (e) {
      addToOutput(`Failed to load ${pkgName} from ${modulePath}. Using bundled`, 'Error')
    }
  }

  return requireFunc(pkgName)
}
export { requireLocalPkg }
