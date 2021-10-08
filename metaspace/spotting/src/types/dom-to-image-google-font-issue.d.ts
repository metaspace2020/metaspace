declare module 'dom-to-image-google-font-issue' {
  interface DTIOptions {
    filter?(node: HTMLElement): boolean
    bgcolor?: string
    width?: number
    height?: number
    style?: any
    quality?: number
    imagePlaceholder?: string
    cacheBust?: boolean
  }

  interface DTI {
    toPng(node: HTMLElement, options?: DTIOptions): Promise<string>
    toBlob(node: HTMLElement, options?: DTIOptions): Promise<Blob>
  }

  const domtoimage: DTI
  export = domtoimage;
}
