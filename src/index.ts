import { commands, ExtensionContext, workspace } from "coc.nvim";
import { createConfigFile } from "./commands";
import { LoggingService } from "./LoggingService";
import { ModuleResolver } from "./ModuleResolver";
import PrettierEditService from "./PrettierEditService";
import { StatusBar } from "./StatusBar";
import { TemplateService } from "./TemplateService";
import { getConfig } from "./util";
import { RESTART_TO_ENABLE, EXTENSION_DISABLED } from "./message";
import { name, version } from '../package.json';

// the application insights key (also known as instrumentation key)
const extensionName = name;
const extensionVersion = version

export async function activate(context: ExtensionContext): Promise<void> {
  const loggingService = new LoggingService();

  loggingService.logInfo(`Extension Name: ${extensionName}.`);
  loggingService.logInfo(`Extension Version: ${extensionVersion}.`);

  const { enable, enableDebugLogs, formatterPriority, statusItemText } = getConfig();

  if (enableDebugLogs) {
    loggingService.setOutputLevel("DEBUG");
  }

  if (!enable) {
    loggingService.logInfo(EXTENSION_DISABLED);
    context.subscriptions.push(
      workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration("prettier.enable")) {
          loggingService.logWarning(RESTART_TO_ENABLE);
        }
      })
    );
    return;
  }

  const moduleResolver = new ModuleResolver(loggingService);

  const templateService = new TemplateService(
    loggingService,
    await moduleResolver.getGlobalPrettierInstance()
  );

  const statusBar = new StatusBar(statusItemText ?? 'Prettier');

  const editService = new PrettierEditService(
    moduleResolver,
    loggingService,
    statusBar,
    formatterPriority
  );
  editService
    .registerGlobal()
    .then(() => {
      const createConfigFileFunc = createConfigFile(templateService);
      const createConfigFileCommand = commands.registerCommand(
        "prettier.createConfigFile",
        createConfigFileFunc
      );
      const openOutputCommand = commands.registerCommand(
        "prettier.openOutput",
        () => {
          loggingService.show();
        }
      );
      const forceFormatDocumentCommand = commands.registerCommand(
        "prettier.forceFormatDocument",
        editService.forceFormatDocument
      );
      const formatDocumentCommand = commands.registerCommand(
        'prettier.formatFile',
        editService.forceFormatDocument
      )

      context.subscriptions.push(
        statusBar,
        editService,
        formatDocumentCommand,
        createConfigFileCommand,
        openOutputCommand,
        forceFormatDocumentCommand,
        ...editService.registerDisposables()
      );
    })
    .catch((err) => {
      loggingService.logError("Error registering extension", err);
    });
}
