import * as path from "path";
import { Options, ResolveConfigOptions } from "prettier";
import * as url from "url";
import { Worker } from "worker_threads";
import {
  PrettierInstance,
  PrettierInstanceConstructor,
} from "./PrettierInstance";
import {
  PrettierFileInfoOptions,
  PrettierFileInfoResult,
  PrettierOptions,
  PrettierPlugin,
  PrettierSupportLanguage,
} from "./types";

let currentCallId = 0;

let worker: Worker | undefined;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(
      url.pathToFileURL(path.join(__dirname, "../worker/prettier-instance-worker.js"))
    );
    const current = worker;
    current.on("exit", () => {
      if (worker === current) worker = undefined;
    });
  }
  return worker;
}

export async function disposeWorker(beforeTerminate?: () => Promise<void>): Promise<void> {
  const current = worker;
  // Detach before awaiting cleanup so the next activation gets a fresh worker.
  worker = undefined;
  try {
    if (beforeTerminate) await beforeTerminate();
  } finally {
    if (current) await current.terminate();
  }
}

export const PrettierWorkerInstance: PrettierInstanceConstructor = class PrettierWorkerInstance
  implements PrettierInstance {
  private messageResolvers: Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (value: unknown) => void;
    }
  > = new Map();

  public version: string | null = null;

  private worker: Worker;
  private stoppedError: Error | undefined;

  constructor(private modulePath: string) {
    this.worker = getWorker();
    const rejectPending = (error: Error) => {
      this.stoppedError = error;
      for (const resolver of this.messageResolvers.values()) resolver.reject(error);
      this.messageResolvers.clear();
    };
    this.worker.on("error", rejectPending);
    this.worker.on("exit", code => rejectPending(new Error(`Prettier worker exited (${code}).`)));
    this.worker.on("message", ({ type, id, payload }) => {
      const resolver = this.messageResolvers.get(id);
      if (resolver) {
        this.messageResolvers.delete(id);
        switch (type) {
          case "import": {
            resolver.resolve(payload.version);
            this.version = payload.version;
            break;
          }
          case "callMethod": {
            if (payload.isError) {
              resolver.reject(payload.result);
            } else {
              resolver.resolve(payload.result);
            }
            break;
          }
        }
      }
    });
  }

  public async import(): Promise</* version of imported prettier */ string> {
    if (this.stoppedError) throw this.stoppedError;
    const callId = currentCallId++;
    const promise = new Promise((resolve, reject) => {
      this.messageResolvers.set(callId, { resolve, reject });
    });
    this.worker.postMessage({
      type: "import",
      id: callId,
      payload: { modulePath: this.modulePath },
    });
    return promise as Promise<string>;
  }

  public async format(
    source: string,
    options?: PrettierOptions
  ): Promise<string> {
    const result = await this.callMethod("format", [source, options]);
    return result;
  }

  public async getSupportInfo({
    plugins,
  }: {
    plugins: (string | PrettierPlugin)[];
  }): Promise<{
    languages: PrettierSupportLanguage[];
  }> {
    const result = await this.callMethod("getSupportInfo", [{ plugins }]);
    return result;
  }

  public async clearConfigCache(): Promise<void> {
    await this.callMethod("clearConfigCache", []);
  }

  public async getFileInfo(
    filePath: string,
    fileInfoOptions?: PrettierFileInfoOptions
  ): Promise<PrettierFileInfoResult> {
    const result = await this.callMethod("getFileInfo", [
      filePath,
      fileInfoOptions,
    ]);
    return result;
  }

  public async resolveConfigFile(
    filePath?: string | undefined
  ): Promise<string | null> {
    const result = await this.callMethod("resolveConfigFile", [filePath]);
    return result;
  }

  public async resolveConfig(
    fileName: string,
    options?: ResolveConfigOptions | undefined
  ): Promise<Options> {
    const result = await this.callMethod("resolveConfig", [fileName, options]);
    return result;
  }

  private callMethod(methodName: string, methodArgs: unknown[]): Promise<any> {
    if (this.stoppedError) return Promise.reject(this.stoppedError);
    const callId = currentCallId++;
    const promise = new Promise((resolve, reject) => {
      this.messageResolvers.set(callId, { resolve, reject });
    });
    this.worker.postMessage({
      type: "callMethod",
      id: callId,
      payload: {
        modulePath: this.modulePath,
        methodName,
        methodArgs,
      },
    });
    return promise;
  }
};
