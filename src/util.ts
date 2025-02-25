import { TextDocument, Uri, workspace } from "coc.nvim";
import * as os from "os";
import * as path from "path";
import * as semver from "semver";
import { PrettierVSCodeConfig } from "./types";

export function getWorkspaceRelativePath(
  filePath: string,
  pathToResolve: string
) {
  // In case the user wants to use ~/.prettierrc on Mac
  if (
    process.platform === "darwin" &&
    pathToResolve.indexOf("~") === 0 &&
    os.homedir()
  ) {
    return pathToResolve.replace(/^~(?=$|\/|\\)/, os.homedir());
  }

  if (workspace.workspaceFolders) {
    const folder = workspace.getWorkspaceFolder(Uri.file(filePath));
    return folder
      ? path.isAbsolute(pathToResolve)
        ? pathToResolve
        : path.join(Uri.parse(folder.uri).fsPath, pathToResolve)
      : undefined;
  }
}

export function getConfig(scope?: TextDocument | Uri): PrettierVSCodeConfig {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const config = workspace.getConfiguration(
    "prettier",
    scope
  ) as unknown as PrettierVSCodeConfig;

  return config;
}

export function isAboveV3(version: string | null): boolean {
  const parsedVersion = semver.parse(version);
  if (!parsedVersion) {
    throw new Error("Invalid version");
  }
  return parsedVersion.major >= 3;
}
