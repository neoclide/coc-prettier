import { window, Uri } from "coc.nvim"
import { TemplateService } from "./TemplateService"
import fs from 'fs'

export type createConfigFileFunction = () => Promise<void>

export const createConfigFile = (templateService: TemplateService): createConfigFileFunction =>
  async () => {
    const folderResult = await window.requestInput('Choose folder:', process.cwd())
    if (folderResult && fs.existsSync(folderResult)) {
      await templateService.writeConfigFile(Uri.file(folderResult))
    }
  }
