import {
  Disposable,
  DocumentFilter,
  languages,
  Range,
  TextDocument,
  TextEdit,
  TextEditor,
  Uri,
  window,
  workspace,
} from "coc.nvim";
import { getParserFromLanguageId } from "./languageFilters";
import { LoggingService } from "./LoggingService";
import { RESTART_TO_ENABLE } from "./message";
import { PrettierEditProvider } from "./PrettierEditProvider";
import { PrettierInstance } from "./PrettierInstance";
import { FormatterStatus, StatusBar } from "./StatusBar";
import {
  ExtensionFormattingOptions,
  ModuleResolverInterface,
  PrettierBuiltInParserName,
  PrettierFileInfoResult,
  PrettierModule,
  PrettierOptions,
  PrettierPlugin,
  RangeFormattingOptions,
} from "./types";
import { getConfig, isAboveV3 } from "./util";

interface ISelectors {
  rangeLanguageSelector: ReadonlyArray<DocumentFilter>;
  languageSelector: ReadonlyArray<DocumentFilter>;
}

/**
 * Prettier reads configuration from files
 */
const PRETTIER_CONFIG_FILES = [
  ".prettierrc",
  ".prettierrc.json",
  ".prettierrc.json5",
  ".prettierrc.yaml",
  ".prettierrc.yml",
  ".prettierrc.toml",
  ".prettierrc.js",
  ".prettierrc.cjs",
  ".prettierrc.mjs",
  "package.json",
  "prettier.config.js",
  "prettier.config.cjs",
  "prettier.config.mjs",
  ".editorconfig",
];

export default class PrettierEditService implements Disposable {
  private formatterHandler: undefined | Disposable;
  private rangeFormatterHandler: undefined | Disposable;
  private registeredWorkspaces = new Set<string>();

  private allLanguages: string[] = [];
  private allExtensions: string[] = [];
  private allRangeLanguages: string[] = [
    "javascript",
    "javascriptreact",
    "typescript",
    "typescriptreact",
    "json",
    "jsonc",
    "graphql",
  ];

  constructor(
    private moduleResolver: ModuleResolverInterface,
    private loggingService: LoggingService,
    private statusBar: StatusBar,
    private priority: number
  ) {}

  public registerDisposables(): Disposable[] {
    const packageWatcher = workspace.createFileSystemWatcher("**/package.json");
    packageWatcher.onDidChange(this.resetFormatters);
    packageWatcher.onDidCreate(this.resetFormatters);
    packageWatcher.onDidDelete(this.resetFormatters);

    const configurationWatcher = workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("prettier.enable")) {
        this.loggingService.logWarning(RESTART_TO_ENABLE);
      } else if (event.affectsConfiguration("prettier")) {
        this.resetFormatters();
      }
    });

    const prettierConfigWatcher = workspace.createFileSystemWatcher(
      `**/{${PRETTIER_CONFIG_FILES.join(",")}}`
    );
    prettierConfigWatcher.onDidChange(this.prettierConfigChanged);
    prettierConfigWatcher.onDidCreate(this.prettierConfigChanged);
    prettierConfigWatcher.onDidDelete(this.prettierConfigChanged);

    const textEditorChange = window.onDidChangeActiveTextEditor(
      this.handleActiveTextEditorChangedSync
    );

    this.handleActiveTextEditorChangedSync(window.activeTextEditor);

    return [
      packageWatcher,
      configurationWatcher,
      prettierConfigWatcher,
      textEditorChange,
    ];
  }

  public forceFormatDocument = async () => {
    try {
      const editor = window.activeTextEditor;
      if (!editor) {
        this.loggingService.logInfo(
          "No active document. Nothing was formatted."
        );
        return;
      }

      this.loggingService.logInfo(
        "Forced formatting will not use ignore files."
      );

      const edits = await this.provideEdits(editor.document.textDocument, { force: true });
      if (edits.length !== 1) {
        return;
      }
      await editor.document.applyEdits(edits, true);
    } catch (e) {
      this.loggingService.logError("Error formatting document", e);
    }
  };

  private prettierConfigChanged = async (uri: Uri) => this.resetFormatters(uri);

  private resetFormatters = (uri?: Uri) => {
    if (uri) {
      const workspaceFolder = workspace.getWorkspaceFolder(uri);
      this.registeredWorkspaces.delete(Uri.parse(workspaceFolder?.uri ?? '').fsPath ?? "global");
    } else {
      // VS Code config change, reset everything
      this.registeredWorkspaces.clear();
    }
    this.statusBar.update(FormatterStatus.Ready);
  };

  private handleActiveTextEditorChangedSync = (
    textEditor: TextEditor | undefined
  ) => {
    this.handleActiveTextEditorChanged(textEditor).catch((err) => {
      this.loggingService.logError("Error handling text editor change", err);
    });
  };

  private handleActiveTextEditorChanged = async (
    textEditor: TextEditor | undefined
  ) => {
    if (!textEditor || !textEditor.document.attached) {
      this.statusBar.hide();
      return;
    }
    const { document } = textEditor;

    if (document.schema !== "file") {
      this.statusBar.hide()
      return;
    }
    const { disableLanguages } = getConfig(Uri.parse(document.uri))
    if (
      Array.isArray(disableLanguages) &&
      disableLanguages.includes(document.languageId)
    ) {
      this.statusBar.hide()
      return
    }



    const workspaceFolder = workspace.getWorkspaceFolder(document.uri);

    if (!workspaceFolder) {
      // Do nothing, this is only for registering formatters in workspace folder.
      return;
    }

    const prettierInstance = await this.moduleResolver.getPrettierInstance(
      Uri.parse(workspaceFolder.uri).fsPath
    );

    const isRegistered = this.registeredWorkspaces.has(
      Uri.parse(workspaceFolder.uri).fsPath
    );

    if (!prettierInstance) {
      this.statusBar.hide()
      return;
    }

    const selectors = await this.getSelectors(
      prettierInstance,
      Uri.parse(document.uri),
      Uri.parse(workspaceFolder.uri)
    );

    // this.statusBar.updateConfig({
    //   selector: selectors.languageSelector,
    // });

    if (!isRegistered) {
      this.registerDocumentFormatEditorProviders(selectors);
      this.registeredWorkspaces.add(Uri.parse(workspaceFolder.uri).fsPath);
      this.loggingService.logDebug(
        `Enabling Prettier for Workspace ${workspaceFolder.uri}`,
        selectors
      );
    }

    const score = workspace.match(selectors.languageSelector.map(s => s), document);
    if (score > 0) {
      this.statusBar.update(FormatterStatus.Ready);
    } else {
      this.statusBar.update(FormatterStatus.Disabled);
    }
  };

  public async registerGlobal() {
    let instance = await this.moduleResolver.getGlobalPrettierInstance();
    const selectors = await this.getSelectors(instance);
    this.registerDocumentFormatEditorProviders(selectors);
    this.loggingService.logDebug("Enabling Prettier globally", selectors);
  }

  public dispose = () => {
    this.moduleResolver.dispose();
    this.formatterHandler?.dispose();
    this.rangeFormatterHandler?.dispose();
    this.formatterHandler = undefined;
    this.rangeFormatterHandler = undefined;
  };

  private registerDocumentFormatEditorProviders({
    languageSelector,
    rangeLanguageSelector,
  }: ISelectors) {
    this.dispose();
    const editProvider = new PrettierEditProvider(this.provideEdits);
    this.rangeFormatterHandler =
      languages.registerDocumentRangeFormatProvider(
        rangeLanguageSelector as any,
        editProvider,
        this.priority
      );
    this.formatterHandler = languages.registerDocumentFormatProvider(
      languageSelector as any,
      editProvider,
      this.priority
    );
  }

  /**
   * Build formatter selectors
   */
  private getSelectors = async (
    prettierInstance: PrettierModule | PrettierInstance,
    documentUri?: Uri,
    workspaceFolderUri?: Uri
  ): Promise<ISelectors> => {
    const plugins: (string | PrettierPlugin)[] = [];
    const { disableLanguages } = getConfig(documentUri)

    // Prettier v3 does not load plugins automatically
    // So need to resolve config to get plugins info.
    if (
      documentUri &&
      "resolveConfig" in prettierInstance &&
      isAboveV3(prettierInstance.version)
    ) {
      const resolvedConfig = await this.moduleResolver.resolveConfig(
        prettierInstance,
        documentUri,
        documentUri.fsPath,
        getConfig(documentUri)
      );
      if (resolvedConfig === "error") {
        this.statusBar.update(FormatterStatus.Error);
      } else if (resolvedConfig === "disabled") {
        this.statusBar.update(FormatterStatus.Disabled);
      } else if (resolvedConfig?.plugins) {
        plugins.push(...resolvedConfig.plugins);
      }
    }

    const { languages } = await prettierInstance.getSupportInfo({
      plugins,
    });

    languages.forEach((lang) => {
      if (lang && lang.vscodeLanguageIds) {
        this.allLanguages.push(...lang.vscodeLanguageIds);
      }
    });
    this.allLanguages = this.allLanguages.filter((value, index, self) => {
      return self.indexOf(value) === index;
    });

    languages.forEach((lang) => {
      if (lang && lang.extensions) {
        this.allExtensions.push(...lang.extensions);
      }
    });
    this.allExtensions = this.allExtensions.filter((value, index, self) => {
      return self.indexOf(value) === index;
    });

    const { documentSelectors } = getConfig();

    // Language selector for file extensions
    const extensionLanguageSelector: DocumentFilter[] = workspaceFolderUri
      ? this.allExtensions.length === 0
        ? []
        : [
          {
            pattern: `${workspaceFolderUri.fsPath}/**/*.{${this.allExtensions
              .map((e) => e.substring(1))
              .join(",")}}`,
            scheme: "file",
          },
        ]
      : [];

    const customLanguageSelectors: DocumentFilter[] = workspaceFolderUri
      ? documentSelectors.map((pattern) => ({
        pattern: `${workspaceFolderUri.fsPath}/${pattern}`,
        scheme: "file",
      }))
      : [];

    const defaultLanguageSelectors: DocumentFilter[] = [
      ...this.allLanguages.map((language) => ({ language })),
      { language: "jsonc", scheme: "vscode-userdata" }, // Selector for VSCode settings.json
    ];

    let languageSelector = [
      ...customLanguageSelectors,
      ...extensionLanguageSelector,
      ...defaultLanguageSelectors,
    ];

    let rangeLanguageSelector: DocumentFilter[] = [
      ...this.allRangeLanguages.map((language) => ({
        language,
      })),
    ];
    if (Array.isArray(disableLanguages) && disableLanguages.length > 0) {
      languageSelector = languageSelector.filter(s => s.language == null || !disableLanguages.includes(s.language))
      rangeLanguageSelector = rangeLanguageSelector.filter(s => s.language == null || !disableLanguages.includes(s.language))
    }

    return { languageSelector, rangeLanguageSelector };
  };

  private provideEdits = async (
    document: TextDocument,
    options: ExtensionFormattingOptions
  ): Promise<TextEdit[]> => {
    const startTime = new Date().getTime();
    const result = await this.format(document.getText(), document, options);
    if (!result) {
      // No edits happened, return never so VS Code can try other formatters
      return [];
    }
    const duration = new Date().getTime() - startTime;
    this.loggingService.logInfo(`Formatting completed in ${duration}ms.`);
    const edit = this.minimalEdit(document, result);
    return [edit];
  };

  private minimalEdit(document: TextDocument, string1: string) {
    const string0 = document.getText();
    // length of common prefix
    let i = 0;
    while (
      i < string0.length &&
      i < string1.length &&
      string0[i] === string1[i]
    ) {
      ++i;
    }
    // length of common suffix
    let j = 0;
    while (
      i + j < string0.length &&
      i + j < string1.length &&
      string0[string0.length - j - 1] === string1[string1.length - j - 1]
    ) {
      ++j;
    }
    const newText = string1.substring(i, string1.length - j);
    const pos0 = document.positionAt(i);
    const pos1 = document.positionAt(string0.length - j);

    return TextEdit.replace(Range.create(pos0, pos1), newText);
  }

  /**
   * Format the given text with user's configuration.
   * @param text Text to format
   * @param path formatting file's path
   * @returns {string} formatted text
   */
  private async format(
    text: string,
    doc: TextDocument,
    options: ExtensionFormattingOptions
  ): Promise<string | undefined> {
    const { uri, languageId } = doc;
    const fileName = Uri.parse(uri).fsPath

    this.loggingService.logInfo(`Formatting ${uri}`);

    const vscodeConfig = getConfig(doc);

    const resolvedConfig = await this.moduleResolver.getResolvedConfig(
      doc,
      vscodeConfig
    );
    if (resolvedConfig === "error") {
      this.statusBar.update(FormatterStatus.Error);
      return;
    }
    if (resolvedConfig === "disabled") {
      this.statusBar.update(FormatterStatus.Disabled);
      return;
    }

    const prettierInstance = await this.moduleResolver.getPrettierInstance(
      fileName
    );
    this.loggingService.logInfo("PrettierInstance:", prettierInstance);

    if (vscodeConfig.onlyUseLocalVersion) {
      return;
    }
    if (!prettierInstance) {
      this.loggingService.logError(
        "Prettier could not be loaded. See previous logs for more information."
      );
      this.statusBar.update(FormatterStatus.Error);
      return;
    }

    let resolvedIgnorePath: string | undefined;
    if (vscodeConfig.ignorePath) {
      resolvedIgnorePath = await this.moduleResolver.getResolvedIgnorePath(
        fileName,
        vscodeConfig.ignorePath
      );
      if (resolvedIgnorePath) {
        this.loggingService.logInfo(
          `Using ignore file (if present) at ${resolvedIgnorePath}`
        );
      }
    }

    let fileInfo: PrettierFileInfoResult | undefined;
    if (fileName) {
      fileInfo = await prettierInstance.getFileInfo(fileName, {
        ignorePath: resolvedIgnorePath,
        plugins: resolvedConfig?.plugins?.filter(
          (item): item is string => typeof item === "string"
        ),
        resolveConfig: true,
        withNodeModules: vscodeConfig.withNodeModules,
      });
      this.loggingService.logInfo("File Info:", fileInfo);
    }

    if (!options.force && fileInfo && fileInfo.ignored) {
      this.loggingService.logInfo("File is ignored, skipping.");
      this.statusBar.update(FormatterStatus.Ignore);
      return;
    }

    let parser: PrettierBuiltInParserName | string | undefined;
    if (fileInfo && fileInfo.inferredParser) {
      parser = fileInfo.inferredParser;
    } else if (languageId !== "plaintext") {
      // Don't attempt VS Code language for plaintext because we never have
      // a formatter for plaintext and most likely the reason for this is
      // somebody has registered a custom file extension without properly
      // configuring the parser in their prettier config.
      this.loggingService.logWarning(
        `Parser not inferred, trying parse language.`
      );
      const { languages } = await prettierInstance.getSupportInfo({
        plugins: [],
      });
      parser = getParserFromLanguageId(languages, Uri.parse(uri), languageId);
    }

    if (!parser) {
      this.loggingService.logError(
        `Failed to resolve a parser, skipping file. If you registered a custom file extension, be sure to configure the parser.`
      );
      this.statusBar.update(FormatterStatus.Error);
      return;
    }

    const prettierOptions = this.getPrettierOptions(
      fileName,
      parser as PrettierBuiltInParserName,
      vscodeConfig,
      resolvedConfig,
      options
    );

    this.loggingService.logInfo("Prettier Options:", prettierOptions);

    try {
      // Since Prettier v3, `format` returns Promise.
      const formattedText = await prettierInstance.format(
        text,
        prettierOptions
      );
      this.statusBar.update(FormatterStatus.Success);

      return formattedText;
    } catch (error) {
      this.loggingService.logError("Error formatting document.", error);
      this.statusBar.update(FormatterStatus.Error);

      return text;
    }
  }

  private getPrettierOptions(
    fileName: string,
    parser: PrettierBuiltInParserName,
    vsCodeConfig: PrettierOptions,
    configOptions: PrettierOptions | null,
    extensionFormattingOptions: ExtensionFormattingOptions
  ): Partial<PrettierOptions> {
    const fallbackToVSCodeConfig = configOptions === null;

    const vsOpts: PrettierOptions = {};
    if (fallbackToVSCodeConfig) {
      vsOpts.arrowParens = vsCodeConfig.arrowParens;
      vsOpts.bracketSpacing = vsCodeConfig.bracketSpacing;
      vsOpts.endOfLine = vsCodeConfig.endOfLine;
      vsOpts.htmlWhitespaceSensitivity = vsCodeConfig.htmlWhitespaceSensitivity;
      vsOpts.insertPragma = vsCodeConfig.insertPragma;
      vsOpts.singleAttributePerLine = vsCodeConfig.singleAttributePerLine;
      vsOpts.bracketSameLine = vsCodeConfig.bracketSameLine;
      vsOpts.jsxBracketSameLine = vsCodeConfig.jsxBracketSameLine;
      vsOpts.jsxSingleQuote = vsCodeConfig.jsxSingleQuote;
      vsOpts.printWidth = vsCodeConfig.printWidth;
      vsOpts.proseWrap = vsCodeConfig.proseWrap;
      vsOpts.quoteProps = vsCodeConfig.quoteProps;
      vsOpts.requirePragma = vsCodeConfig.requirePragma;
      vsOpts.semi = vsCodeConfig.semi;
      vsOpts.singleQuote = vsCodeConfig.singleQuote;
      vsOpts.tabWidth = vsCodeConfig.tabWidth;
      vsOpts.trailingComma = vsCodeConfig.trailingComma;
      vsOpts.useTabs = vsCodeConfig.useTabs;
      vsOpts.embeddedLanguageFormatting =
        vsCodeConfig.embeddedLanguageFormatting;
      vsOpts.vueIndentScriptAndStyle = vsCodeConfig.vueIndentScriptAndStyle;
      vsOpts.experimentalTernaries = vsCodeConfig.experimentalTernaries;
    }

    this.loggingService.logInfo(
      fallbackToVSCodeConfig
        ? "No local configuration (i.e. .prettierrc or .editorconfig) detected, falling back to coc.nvim configuration"
        : "Detected local configuration (i.e. .prettierrc or .editorconfig), coc.nvim configuration will not be used"
    );

    let rangeFormattingOptions: RangeFormattingOptions | undefined;
    if (
      extensionFormattingOptions.rangeEnd &&
      extensionFormattingOptions.rangeStart
    ) {
      rangeFormattingOptions = {
        rangeEnd: extensionFormattingOptions.rangeEnd,
        rangeStart: extensionFormattingOptions.rangeStart,
      };
    }

    const options: PrettierOptions = {
      ...(fallbackToVSCodeConfig ? vsOpts : {}),
      ...{
        /* cspell: disable-next-line */
        filepath: fileName,
        parser: parser as PrettierBuiltInParserName,
      },
      ...(rangeFormattingOptions || {}),
      ...(configOptions || {}),
    };

    if (extensionFormattingOptions.force && options.requirePragma === true) {
      options.requirePragma = false;
    }

    return options;
  }
}
