## [9.2.0]

- Removed support for legacy linter integration. [See documentation](https://github.com/neoclide/coc-prettier#linter-integration) on how to configure linters.
- Removed `prettier.disableSuccessMessage`, no success message any more.
- Removed support for Prettier versions older than 1.13.0.
- No longer bundling linters with extension - to use install them in your package.json.
- Use Prettier to determine if a file is ignored or not instead of custom logic.
- Support for formatting of untitled files when the language is set by vim.
- Set file path config on format to assist with parser resolution.
- Less fallbacks - if you have local prettier installed it will always use that. Before if your local prettier didn't support things we would fall back to bundled prettier - this caused many errors and inconsistent behavior.
- Enhanced logging.
- Memoize package path lookup to improve perf of repeated calls to same file.
- Shows error message when outdated versions of prettier are used.
- Refreshes modules without restart for cases where prettier version or plugins are installed locally.
- Registers `.graphql` files as `graphql` language in order to provide formatting.
- Ignore files are only read from the workspace folder to behave the [same as prettier](https://github.com/prettier/prettier/issues/4081).
- Added configuration option `prettier.prettierPath` to override module resolution.
- Added configuration option `prettier.configPath` to override configuration file resolution.
- Add command `Prettier: Create Configuration File` to create a basic `.prettierrc` file
- Sets `resolveConfig: true` to allow parser overrides on [Prettier 1.19+](https://prettier.io/blog/2019/11/09/1.19.0.html#api). #1067
- Added setting `prettier.useEditorConfig` (defaults to `true`) to allow disabling resolving `.editorconfig` for Prettier config
- Added `pattern` filter to formatter registrations to avoid registering incorrectly on multi-workspace projects
- Added support for global module resolution, due to performance issues, global
  module resolution is now off by default. Enable by setting
  `prettier.resolveGlobalModules` to `true`
- Added setting `packageManager` to determine which package manager to use for global module resolution
- Show error when prettier configuration file is invalid
- Change default configuration for `trailingComma` to `es5` to match Prettier 2.0
- Change default configuration for `arrowParens` to `always` to match Prettier 2.0
- Change default configuration for `endOfLine` to `lf` to match Prettier 2.0
- Added configuration option `withNodeModules` to enable processing of files in the `node_modules` folder
- Update loading implicit Prettier dep from `node_modules` to only occur if explicit `package.json` dep is not found in a parent directory
- Support for additional configuration file extensions (`toml`, `cls`).
- Added support for [custom document selectors](https://github.com/neoclide/coc-prettier#prettierdocumentselectors) to provide formatting on custom languages/extensions.
- Added [Embedded Language Formatting](https://prettier.io/docs/en/options.html#embedded-language-formatting) option.
- Added [enable](https://github.com/neoclide/coc-prettier#enable) setting.
- Automatically detect package manager
- Prompt to allow Prettier module to load
- Added debug mode for logging
- Handlebars support ([@lifeart](https://github.com/lifeart))

## [1.1.13]

- Just bumping minor version to accomadate `yarn upgrade` to fix issue reported by `yarn audit`.

## [1.1.0]

- Prettier [1.16](https://prettier.io/blog/2019/01/20/1.16.0.html)
- prettier-tslint 0.4.2
- Validate the `"prettier"` key in `package.json` using the prettier settings schema
- Prettier [1.15](https://prettier.io/blog/2018/11/07/1.15.0.html)
- New options: jsxSingleQuote, htmlWhitespaceSensitivity and endOfLine (More info in readme).
