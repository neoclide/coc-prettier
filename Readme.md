# Prettier formatter for coc.nvim

Fork of [prettier-vscode](https://github.com/prettier/prettier-vscode) to work
with [coc.nvim](https://github.com/neoclide/coc.nvim)

[Prettier](https://prettier.io/) is an opinionated code formatter. It enforces a consistent style by parsing your code and re-printing it with its own rules that take the maximum line length into account, wrapping code when necessary.

<p align="center">
  <em>
    JavaScript
    · TypeScript
    · Flow
    · JSX
    · JSON
  </em>
  <br />
  <em>
    CSS
    · SCSS
    · Less
  </em>
  <br />
  <em>
    HTML
    · Vue
    · Angular
  </em>
  <em>
    HANDLEBARS
    · Ember
    · Glimmer
  </em>
  <br />
  <em>
    GraphQL
    · Markdown
    · YAML
  </em>
  <br />
  <em>
    <a href="https://prettier.io/docs/en/plugins.html">
      Your favorite language?
    </a>
  </em>
</p>

## Installation

Run vim command:

```
:CocInstall coc-prettier
```

### Prettier Resolution

This extension will use prettier from your project's local dependencies (recommended). When the `prettier.resolveGlobalModules` is set to `true` the extension can also attempt to resolve global modules. Should prettier not be installed locally with your project's dependencies or globally on the machine, the version of prettier that is bundled with the extension will be used.

To install prettier in your project and pin its version [as recommended](https://prettier.io/docs/en/install.html), run:

```
npm install prettier -D --save-exact
```

> NOTE: You will be prompted to confirm that you want the extension to load a Prettier module. This is done to ensure that you are not loading a module or script that is not trusted.

### Plugins

This extension supports [Prettier plugins](https://prettier.io/docs/en/plugins.html) when you are using a locally or globally resolved version of prettier. If you have Prettier and a plugin registered in your `package.json`, this extension will attempt to register the language and provide automatic code formatting for the built-in and plugin languages.

## Configuration

There are multiple options for configuring Prettier with this extension. You can use coc.nvim's configuration file `.vim/coc-settings.json`, [prettier configuration files](https://prettier.io/docs/en/configuration.html), or an `.editorconfig` file. The coc.nvim settings are meant to be used as a fallback and are generally intended only for use on non-project files. **It is recommended that you always include a prettier configuration file in your project specifying all settings for your project.** This will ensure that no matter how you run prettier - from this extension, from the CLI, or from another IDE with Prettier, the same settings will get applied.

Using [Prettier Configuration files](https://prettier.io/docs/en/configuration.html) to set formatting options is the recommended approach. Options are searched recursively down from the file being formatted so if you want to apply prettier settings to your entire project simply set a configuration in the root. Settings can also be configured through coc-settings.json - however, these settings will only apply while running the extension, not when running prettier through the command line.

### Configuring Default Options

Some users may not wish to create a new Prettier config for every project or use the coc-settings.json. In order to set a default configuration, set [`prettier.configPath`](https://github.com/prettier/prettier-vscode#prettierconfigpath). However, be careful, if this is set this value will always be used and local configuration files will be ignored.

### Coc.nvim Settings

You can use [coc.nvim settings](#prettier-settings) to configure prettier. Settings will be read from (listed by priority):

1. [Prettier configuration file](https://prettier.io/docs/en/configuration.html)
1. `.editorconfig`
1. Configuration of coc.nvim (Ignored if any other configuration is present)

> NOTE: If any local configuration file is present (i.e. `.prettierrc`) the coc.nvim settings will **NOT** be used.

## Usage

### Create custom vim command

Setup `Prettier` command in your `init.vim` or `.vimrc`

```
command! -nargs=0 Prettier :CocCommand prettier.forceFormatDocument
```

Then you can use `:Prettier` to format the current buffer by coc-prettier.

Or use `:CocCommand` to open command list.

### Range format

Remap keys for range format in your `init.vim` or `.vimrc`

```
vmap <leader>f  <Plug>(coc-format-selected)
nmap <leader>f  <Plug>(coc-format-selected)
```

Then you can `<leader>f` for range format.

Format selection works on several languages depending on what Prettier itself supports. The following languages currently are supported:

```
javascript
javascriptreact
typescript
typescriptreact
json
graphql
handlebars
```

### Format On Save.

Open settings file with:

    :CocConfig

Add:

```
  "coc.preferences.formatOnSaveFiletypes": ["css", "markdown"],
```

to setup the languages which you want to format on save.

**Note:** if prettier extension have lower priority, and document have other
registered document format provider, prettier will be ignored.

To disable coc-prettier for specific files, you can create `.prettierignore`
file. Or use `"prettier.disableLanguages"` configuration, or
`"prettier.formatterPriority": -1` configuration to make it not override format
provider from other coc.nvim extensions.

To check the format is done by prettier, check out the output message after
format, which should contains `Formatted by prettier`.

Other useful commands:

- `:CocCommand prettier.formatFile`: force prettier to format the current
  buffer, even if another format provider exists.
- `:noa w`: save the current buffer _without_ formatting.
- `:CocCommand prettier.createConfigFile`: Create `.prettierrc` for current
  document.

### Format Document (Forced)

If you would like to format a document that is configured to be ignored by Prettier either because it is in a `.prettierignore` file or part of a normally excluded location like `node_modules`, you can run the command **Format Document (Forced)** to force the document to be formatted. Forced mode will also ignore any config for `requirePragma` allowing you to format files without the pragma comment present.

## Linter Integration

The recommended way of integrating with linters is to let Prettier do the formatting and configure the linter to not deal with formatting rules. You can find instructions on how to configure each linter on the Prettier docs site. You can then use each of the linting extensions as you normally would. For details refere to the [Prettier documentation](https://prettier.io/docs/en/integrating-with-linters.html).

## Settings

### Prettier Settings

All prettier options can be configured directly in this extension. These settings are used as a fallback when no configuration file is present in your project, see the [configuration](#configuration) section of this document for more details. For reference on the options see the [prettier documentation](https://prettier.io/docs/en/options.html).

> The default values of these configurations are always to their Prettier 2.0 defaults. In order to use defaults from earlier versions of prettier you must set them manually using your coc-prettier settings or local project configurations.

```
prettier.arrowParens
prettier.bracketSpacing
prettier.endOfLine
prettier.htmlWhitespaceSensitivity
prettier.insertPragma
prettier.bracketSameLine
prettier.jsxSingleQuote
prettier.printWidth
prettier.proseWrap
prettier.quoteProps
prettier.requirePragma
prettier.semi
prettier.singleQuote
prettier.tabWidth
prettier.trailingComma
prettier.useTabs
prettier.vueIndentScriptAndStyle
prettier.embeddedLanguageFormatting
```

### Extension Settings

These settings are specific to coc-prettier and need to be set in coc-settings.json. See the [documentation](https://github.com/neoclide/coc.nvim/wiki/Using-the-configuration-file) for how to do that.

#### prettier.enable (default: `true`)

Controls whether prettier is enabled or not. You must restart coc.nvim when you change this setting.

#### prettier.disableLanguages (default: ["vue"])

A list of languages IDs to disable this extension on. Restart required.
_Note: Disabling a language enabled in a parent folder will prevent formatting instead of letting any other formatter to run_

You must restart coc.nvim when you change this setting.

#### prettier.formatterPriority (default: 1) - priority of formatter

Change it to `-1` if you don't want prettier to have higher priority than
formatter provided by other language server.

#### prettier.statusItemText (default: "Prettier")

Text of status item indicating current buffer can be formatted by prettier.

#### prettier.requireConfig (default: `false`)

Require a prettier configuration file to format files. Untitled files will still be formatted using the coc-prettier Prettier configuration even with this option set to `true`.

#### prettier.ignorePath (default: `.prettierignore`)

Supply the path to an ignore file such as `.gitignore` or `.prettierignore`.
Files which match will not be formatted. Set to `null` to not read ignore files.

**Note, if this is set, this value will always be used and local ignore files will be ignored.**

**Disabled on untrusted workspaces**

#### prettier.configPath

Supply a custom path to the prettier configuration file.

**Note, if this is set, this value will always be used and local configuration files will be ignored. A better option for global defaults is to put a `~/.prettierrc` file in your home directory.**

**Disabled on untrusted workspaces**

#### prettier.prettierPath

Supply a custom path to the prettier module. This path should be to the module folder, not the bin/script path. i.e. `./node_modules/prettier`, not `./bin/prettier`.

**Disabled on untrusted workspaces**

#### prettier.resolveGlobalModules (default: `false`)

When enabled, this extension will attempt to use global npm or yarn modules if local modules cannot be resolved.

> NOTE: This setting can have a negative performance impact, particularly on Windows when you have attached network drives. Only enable this if you must use global modules. It is recommended that you always use local modules when possible.

**Note: Disabling a language enabled in a parent folder will prevent formatting instead of letting any other formatter to run**

**Disabled on untrusted workspaces**

#### prettier.documentSelectors

A list of [glob patterns](https://code.visualstudio.com/api/references/vscode-api#GlobPattern) to register Prettier formatter. Typically these will be in the format of `**/*.abc` to tell this extension to register itself as the formatter for all files with the `abc` extension. This feature can be useful when you have [overrides](https://prettier.io/docs/en/configuration.html#configuration-overrides) set in your config file to map custom extensions to a parser.

It is likely will need to also update your prettier config. For example, if I register the following document selector by itself, Prettier still won't know what to do with that file. I either need a Prettier extension that formats `.abc` file format or I need to configure Prettier.

```json
{
  "prettier.documentSelectors": ["**/*.abc"]
}
```

To tell Prettier how to format a file of type `.abc` I can set an override in the prettier config that makes this file type use the `babel` parser.

```json
{
  "overrides": [
    {
      "files": "*.abc",
      "options": {
        "parser": "babel"
      }
    }
  ]
}
```

**Disabled on untrusted workspaces**

#### prettier.useEditorConfig (default: `true`)

Whether or not to take .editorconfig into account when parsing configuration. See the [prettier.resolveConfig docs](https://prettier.io/docs/en/api.html) for details.

**Disabled on untrusted workspaces (always false)**

#### prettier.withNodeModules (default: `false`)

Whether or not to process files in the `node_modules` folder.

**Disabled on untrusted workspaces**

## Error Messages

**Failed to load module. If you have prettier or plugins referenced in package.json, ensure you have run `npm install`**

When a `package.json` is present in your project and it contains prettier, plugins, or linter libraries this extension will attempt to load these modules from your `node_module` folder. If you see this error, it most likely means you need to run `npm install` or `yarn install` to install the packages in your `package.json`.

**Your project is configured to use an outdated version of prettier that cannot be used by this extension. Upgrade to the latest version of prettier.**

You have to upgrade to a newer version of prettier.

## Contribute

Feel free to open issues or PRs!
