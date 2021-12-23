# Prettier formatter for coc.nvim

Coc extension to format your JavaScript/TypeScript/CSS/JSON using
[Prettier](https://github.com/prettier/prettier).  Forked from
[prettier-vscode](https://github.com/prettier/prettier-vscode).

## Installation

Run vim command:

```
:CocInstall coc-prettier
```

## Usage

### Setup `Prettier` command in your `init.vim` or `.vimrc`

```
command! -nargs=0 Prettier :CocCommand prettier.formatFile
```

Then you can use `:Prettier` to format the current buffer.

### Remap keys for range format in your `init.vim` or `.vimrc`

```
vmap <leader>f  <Plug>(coc-format-selected)
nmap <leader>f  <Plug>(coc-format-selected)
```

Then `<leader>f` will 'range reformat' the selected code.  This only supports the following
`languageId`s: `javascript`, `javascriptreact`, `typescript`, `typescriptreact`, `json` and
`graphql`.

### Update your `coc-settings.json` for format on save.

Open settings file with:

    :CocConfig

Add:

```
  "coc.preferences.formatOnSaveFiletypes": ["css", "markdown"],
```

to setup the languages which you want to format on save.

**Note:** the prettier extension may have lower priority than other format providers.  If a document
has another higher-priority format provider, then prettier will not work.  See the
`prettier.formatterPriority` option below for setting this priority.  If prettier was run, the
output message from formatting is `Formatted by prettier`; otherwise, another formatter was used.

Other useful commands:
- `:CocCommand prettier.formatFile`: force prettier to format the current buffer, even if another
  format provider exists.
- `:noa w`: save the current buffer _without_ formatting.

## Settings

### Configuration files

coc-prettier takes three sources of configuration (ordered by priority, highest first):

1. [`.prettierrc`](https://prettier.io/docs/en/configuration.html): Prettier's per-project config
   file
2. [`.editorconfig`](https://editorconfig.org/): Per-project config file for editor extensions
3. `:CocConfig`: Configuration specific to Coc, applied to every project

There is, however, one exception: if `.prettierrc` exists, coc-prettier will **completely ignore**
`:CocConfig`.  This behaviour is logical - if you open a project which already uses prettier,
coc-prettier should use exactly the same code style as everyone else - but can come as a surprise.

### Prettier's Settings

| Parameter Name | Default | Description |
|----------------|:-------:|-------------|
| `prettier.printWidth` | 80 | Fit code within this line limit |
| `prettier.tabWidth` | 2 | Number of spaces it should use per tab |
| `prettier.singleQuote` | false | If true, will use single instead of double quotes |
| `prettier.trailingComma` | 'none' | Controls the printing of trailing commas wherever possible. Valid options:<ul style="margin-bottom: 0;"><li>"none" - No trailing commas</li><li>"es5" - Trailing commas where valid in ES5 (objects, arrays, etc)</li><li>"all" - Trailing commas wherever possible (function arguments)</li></ul> |
| `prettier.bracketSpacing` | true | Controls the printing of spaces inside object literals |
| `prettier.jsxBracketSameLine` | false | If true, puts the `>` of a multi-line jsx element at the end of the last line instead of being alone on the next line |
| `prettier.parser` | 'babylon' | Which JS parser to use. Options are 'flow' and 'babylon' |
| `prettier.semi` | true | Whether to add a semicolon at the end of every statement (semi: true), or only at the beginning of lines that may introduce ASI failures (semi: false) |
| `prettier.useTabs` | false | If true, indent lines with tabs |
| `prettier.proseWrap` | 'preserve' | (Markdown) wrap prose over multiple lines. |
| `prettier.arrowParens` | 'avoid' | Include parentheses around a sole arrow function parameter |

### Coc specific settings

These settings are specific to Coc and need to be set in the Coc settings file. See the [documentation](https://github.com/neoclide/coc.nvim/wiki/Using-the-configuration-file) for how to do that.

| Parameter Name | Default | Description |
|----------------|:-------:|-------------|
| `prettier.formatterPriority` | 1 | Priority of formatter, higher is better |
| `prettier.eslintIntegration` | false | (JavaScript and TypeScript only) Use _[prettier-eslint](https://github.com/prettier/prettier-eslint)_ instead of _prettier_. Other settings will only be fallbacks in case they could not be inferred from ESLint rules. |
| `prettier.tslintIntegration` | false | (JavaScript and TypeScript only) Use _[prettier-tslint](https://github.com/azz/prettier-tslint)_ instead of _prettier_. Other settings will only be fallbacks in case they could not be inferred from TSLint rules. |
| `prettier.stylelintIntegration` | false | (CSS, SCSS and LESS only) Use _[prettier-stylelint](https://github.com/hugomrdias/prettier-stylelint)_ instead of _prettier_. Other settings will only be fallbacks in case they could not be inferred from stylelint rules. |
| `prettier.requireConfig` | false | Require a 'prettierconfig' to format |
| `prettier.ignorePath` | .prettierignore | Supply the path to an ignore file such as `.gitignore` or `.prettierignore`. Files which match will not be formatted. Set to `null` to not read ignore files. Restart required. |
| `prettier.disableLanguages` | ["vue"] | A list of languages IDs to disable this extension on. Restart required. _Note: Disabling a language enabled in a parent folder will prevent formatting instead of letting any other formatter to run_ |
| `prettier.statusItemText` | "Prettier" | Text of status item indicating current buffer can be formatted by prettier. |
| `prettier.onlyUseLocalVersion` | false | Only use the version of prettier installed by the client, ignoring the version bundled with coc-prettier |
| `prettier.disableSuccessMessage` | false | Disable the 'Formatted by prettier' message which is echoed every time a file is successfully formatted |

## Prettier resolution

This extension will use prettier from your project's local dependencies. Should prettier not be installed locally with your project's dependencies, a copy will be bundled with the extension.

### ESLint and TSLint Integration

`prettier-eslint` and `prettier-tslint` are included with the installation of this extension. There is no need for a separate local or global install of either for functionality.

`eslint`, `tslint`, and all peer dependencies required by your specific configuration must be installed locally. Global installations will not be recognized.

## Contribute

Feel free to open issues or PRs!
