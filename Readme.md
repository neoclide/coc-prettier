# Prettier formatter for coc.nvim

Coc extension to format your JavaScript / TypeScript / CSS / JSON using [Prettier](https://github.com/prettier/prettier).

A fork of [prettier-vscode](https://github.com/prettier/prettier-vscode)

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

Then you can use `:Prettier` to format current buffer.

### Remap keys for range format in your `init.vim` or `.vimrc`

```
vmap <leader>f  <Plug>(coc-format-selected)
nmap <leader>f  <Plug>(coc-format-selected)
```

Then your can `<leader>f` for range format.

Prettier range format only support languageId including: `javascript`,
`javascriptreact`, `typescript`, `typescriptreact`, `json` and `graphql`.

### Update your `coc-settings.json` for format on save.

Open settings file with:

    :CocConfig

Add:

```
  "coc.preferences.formatOnSaveFiletypes": ["css", "markdown"],
```

to setup the languages which you want to format on save.

**Note:** prettier extension have lower priority, if the document have other
registered document format provider, prettier would not work.

To check the format is done by prettier, check out the output message after
format, which should contains `Formatted by prettier`.

To make prettier do the format, use command `:CocCommand prettier.formatFile`

To save without formatting, use `:noa w`

## Settings

### Prettier's Settings

Settings will be read from (listed by priority):

1. [Prettier configuration file](https://prettier.io/docs/en/configuration.html)
1. `.editorconfig`

Or if no prettier configuration file exist

1. `.editorconfig`
1. Coc prettier's settings (described below with their default)

#### prettier.printWidth (default: 80)

Fit code within this line limit

#### prettier.tabWidth (default: 2)

Number of spaces it should use per tab

#### prettier.singleQuote (default: false)

If true, will use single instead of double quotes

#### prettier.trailingComma (default: 'none')

Controls the printing of trailing commas wherever possible. Valid options:

- "none" - No trailing commas
- "es5" - Trailing commas where valid in ES5 (objects, arrays, etc)
- "all" - Trailing commas wherever possible (function arguments)

#### prettier.bracketSpacing (default: true)

Controls the printing of spaces inside object literals

#### prettier.jsxBracketSameLine (default: false)

If true, puts the `>` of a multi-line jsx element at the end of the last line instead of being alone on the next line

#### prettier.parser (default: 'babylon') - JavaScript only

Which parser to use. Valid options are 'flow' and 'babylon'.

#### prettier.semi (default: true)

Whether to add a semicolon at the end of every line (semi: true),
or only at the beginning of lines that may introduce ASI failures (semi: false)

#### prettier.useTabs (default: false)

If true, indent lines with tabs

#### prettier.proseWrap (default: 'preserve')

(Markdown) wrap prose over multiple lines.

#### prettier.arrowParens (default: 'avoid')

Include parentheses around a sole arrow function parameter

### Coc specific settings

These settings are specific to Coc and need to be set in the Coc settings file. See the [documentation](https://github.com/neoclide/coc.nvim/wiki/Using-the-configuration-file) for how to do that.

#### prettier.formatterPriority (default: 1) - priority of formatter

Change it to `-1` if you don't want prettier to have higher priority than
formatter provided by other language server.

#### prettier.eslintIntegration (default: false) - JavaScript and TypeScript only

Use _[prettier-eslint](https://github.com/prettier/prettier-eslint)_ instead of _prettier_.
Other settings will only be fallbacks in case they could not be inferred from ESLint rules.

#### prettier.tslintIntegration (default: false) - JavaScript and TypeScript only

Use _[prettier-tslint](https://github.com/azz/prettier-tslint)_ instead of _prettier_.
Other settings will only be fallbacks in case they could not be inferred from TSLint rules.

#### prettier.stylelintIntegration (default: false) - CSS, SCSS and LESS only

Use _[prettier-stylelint](https://github.com/hugomrdias/prettier-stylelint)_ instead of _prettier_.
Other settings will only be fallbacks in case they could not be inferred from stylelint rules.

#### prettier.requireConfig (default: false)

Require a 'prettierconfig' to format

#### prettier.ignorePath (default: .prettierignore)

Supply the path to an ignore file such as `.gitignore` or `.prettierignore`.
Files which match will not be formatted. Set to `null` to not read ignore files. Restart required.

#### prettier.disableLanguages (default: ["vue"])

A list of languages IDs to disable this extension on. Restart required.
_Note: Disabling a language enabled in a parent folder will prevent formatting instead of letting any other formatter to run_

#### prettier.statusItemText (default: "Prettier")

Text of status item indicating current buffer can be formatted by prettier.

#### prettier.onlyUseLocalVersion (default: false)

Only use the version of prettier installed by the client, ignoring the version bundled with coc-prettier

#### prettier.disableSuccessMessage (default: false)

Disable the 'Formatted by prettier' message which is echoed every time a file is successfully formatted

## Prettier resolution

This extension will use prettier from your project's local dependencies. Should prettier not be installed locally with your project's dependencies, a copy will be bundled with the extension.

### ESLint and TSLint Integration

`prettier-eslint` and `prettier-tslint` are included with the installation of this extension. There is no need for a separate local or global install of either for functionality.

`eslint`, `tslint`, and all peer dependencies required by your specific configuration must be installed locally. Global installations will not be recognized.

## Contribute

Feel free to open issues or PRs!
