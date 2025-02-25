import { TextEncoder, promisify } from "util";
import * as path from 'path'
import * as fs from 'fs'
import { LoggingService } from "./LoggingService";
import { PrettierModule, PrettierOptions } from "./types";

export class TemplateService {
  constructor(
    private loggingService: LoggingService,
    private prettierModule: PrettierModule
  ) {}
  public async writeConfigFile(folderPath: string) {
    const settings = { tabWidth: 2, useTabs: false };
    // folderPath.with

    const outputPath = path.join(folderPath, ".prettierrc");

    const formatterOptions: PrettierOptions = {
      /* cspell: disable-next-line */
      filepath: outputPath,
      tabWidth: settings.tabWidth,
      useTabs: settings.useTabs,
    };

    const templateSource = await this.prettierModule.format(
      JSON.stringify(settings, null, 2),
      formatterOptions
    );

    this.loggingService.logInfo(`Writing .prettierrc to ${outputPath}`);
    await promisify(fs.writeFile)(
      outputPath,
      new TextEncoder().encode(templateSource)
    );
  }
}
