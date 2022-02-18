import { CancellationToken, DocumentFormattingEditProvider, DocumentRangeFormattingEditProvider, FormattingOptions, LinesTextDocument, Range, TextEdit } from 'coc.nvim'
import { ExtensionFormattingOptions } from './types'

export class PrettierEditProvider
  implements
  DocumentRangeFormattingEditProvider,
  DocumentFormattingEditProvider {
  constructor(
    private provideEdits: (
      document: LinesTextDocument,
      options: ExtensionFormattingOptions
    ) => Promise<TextEdit[]>
  ) {}

  public async provideDocumentRangeFormattingEdits(
    document: LinesTextDocument,
    range: Range,
    options: FormattingOptions,
    token: CancellationToken
  ): Promise<TextEdit[]> {
    return this.provideEdits(document, {
      rangeEnd: document.offsetAt(range.end),
      rangeStart: document.offsetAt(range.start),
      force: false,
    })
  }

  public async provideDocumentFormattingEdits(
    document: LinesTextDocument,
    options: FormattingOptions,
    token: CancellationToken
  ): Promise<TextEdit[]> {
    return this.provideEdits(document, {
      force: false,
    })
  }
}
