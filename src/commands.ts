import { window, workspace } from "coc.nvim";
import * as fs from 'fs'
import * as path from 'path'
import { TemplateService } from "./TemplateService";

export function isDirectory(filepath: string | undefined): boolean {
  if (!filepath || !path.isAbsolute(filepath) || !fs.existsSync(filepath)) return false
  let stat = fs.statSync(filepath)
  return stat.isDirectory()
}


export type createConfigFileFunction = () => Promise<void>;

export const createConfigFile =
  (templateService: TemplateService): createConfigFileFunction =>
    async () => {
      const { nvim, cwd } = workspace
      const folder = await nvim.callAsync('coc#util#with_callback', ['input', ['New path: ', cwd, 'file']]) as string
      if (!folder) return
      if (folder && isDirectory(folder)) {
        await templateService.writeConfigFile(folder);
      } else {
        window.showErrorMessage('Invalid folder selected: ' + folder)
      }
    };
