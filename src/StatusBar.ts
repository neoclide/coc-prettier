import { StatusBarItem, window } from "coc.nvim"

export enum FormatterStatus {
  Ready = "",
  Success = "",
  Warn = "Warn",
  Error = "Error",
  Ignore = "x",
  Disabled = "x",
}

export class StatusBar {
  private statusBarItem: StatusBarItem
  constructor(private text: string) {
    // Setup the statusBarItem
    this.statusBarItem = window.createStatusBarItem(0, {})
    this.statusBarItem.text = this.text
    // this.update(FormatterStatus.Ready)
    // this.statusBarItem.show()
  }

  /**
   * Update the statusBarItem message and show the statusBarItem
   *
   * @param icon The the icon to use
   */
  public update(result: FormatterStatus): void {
    this.statusBarItem.text = `${this.text} ${result.toString()}`
    // Waiting for VS Code 1.53: https://github.com/microsoft/vscode/pull/116181
    // if (result === FormattingResult.Error) {
    //   this.statusBarItem.backgroundColor = new ThemeColor(
    //     "statusBarItem.errorBackground"
    //   );
    // } else {
    //   this.statusBarItem.backgroundColor = new ThemeColor(
    //     "statusBarItem.fourgroundBackground"
    //   );
    // }
    this.statusBarItem.show()
  }

  public hide() {
    this.statusBarItem.hide()
  }
}
