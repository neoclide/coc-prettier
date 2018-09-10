# coc-wxml

Wxml language server extension for [coc.nvim](https://github.com/neoclide/coc.nvim).

## Install

In your vim/neovim, run command:

```
:CocInstall coc-wxml
```

## Features

* Diagnostic support.
* `doHover` for tag name and tag attributes.
* `doComplete` for tag name, attributes and attribute values.

## Configuration options

* `wxml.enable` set to `false` to disable wxml language server.
* `wxml.trace.server` trace LSP traffic in output channel.
* `wxml.execArgv` add `execArgv` to `child_process.spawn`
* `wxml.complete.completeEvent` set to `false` to disable complete of event attributes.
* `wxml.complete.useSnippet` set to `false` to disable snippet for completion.

## License

MIT
