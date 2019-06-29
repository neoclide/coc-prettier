import { commands, OutputChannel, workspace } from 'coc.nvim'
import { Disposable } from 'vscode-languageserver-protocol'

let outputChannel: OutputChannel
/**
 * Adds the filepath to the error message
 *
 * @param msg The original error message
 * @param fileName The path to the file
 * @returns {string} enhanced message with the filename
 */
function addFilePath(msg: string, fileName: string): string {
  const lines = msg.split('\n')
  if (lines.length > 0) {
    lines[0] = lines[0].replace(/(\d*):(\d*)/g, `${fileName}:$1:$2`)
    return lines.join('\n')
  }

  return msg
}

/**
 * Append messages to the output channel and format it with a title
 *
 * @param message The message to append to the output channel
 */
export function addToOutput(message: string, type = 'Trace'): void {
  if (!outputChannel) return
  const title = `${type} - ${new Date().toLocaleString()}:`

  // Create a sort of title, to differentiate between messages
  outputChannel.appendLine('')
  // Append actual output
  outputChannel.appendLine(`[${title}] ${message}\n`)
}

/**
 * Execute a callback safely, if it doesn't work, return default and log messages.
 *
 * @param cb The function to be executed,
 * @param defaultText The default value if execution of the cb failed
 * @param fileName The filename of the current document
 * @returns {string} formatted text or defaultText
 */
export function safeExecution(
  cb: (() => string) | Promise<string>,
  defaultText: string,
  fileName: string
): string | Promise<string> {
  if (cb instanceof Promise) {
    return cb
      .then(returnValue => {
        // updateStatusBar('Prettier: $(check)')
        return returnValue
      })
      .catch((err: Error) => {
        addToOutput(addFilePath(err.message, fileName), 'Error')
        // updateStatusBar('Prettier: $(x)')

        return defaultText
      })
  }

  try {
    const returnValue = cb()

    // updateStatusBar('Prettier: $(check)')

    return returnValue
  } catch (err) {
    addToOutput(addFilePath(err.message, fileName), 'Error')
    // updateStatusBar('Prettier: $(x)')

    return defaultText
  }
}
/**
 * Setup the output channel and the statusBarItem.
 * Create a command to show the output channel
 *
 * @returns {Disposable} The command to open the output channel
 */
export function setupErrorHandler(): Disposable {
  // Setup the outputChannel
  outputChannel = workspace.createOutputChannel('prettier')

  return commands.registerCommand('prettier.open-output', () => {
    outputChannel.show()
  })
}
