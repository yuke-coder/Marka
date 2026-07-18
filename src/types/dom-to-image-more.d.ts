declare module 'dom-to-image-more' {
    interface DomToImageOptions {
        width?: number;
        height?: number;
        bgcolor?: string;
        style?: Record<string, string>;
        quality?: number;
        cacheBust?: boolean;
        imagePlaceholder?: string;
        filter?: (node: Node) => boolean;
    }

    const domtoimage: {
        toPng(node: Node, options?: DomToImageOptions): Promise<string>;
        toJpeg(node: Node, options?: DomToImageOptions): Promise<string>;
        toBlob(node: Node, options?: DomToImageOptions): Promise<Blob>;
        toSvg(node: Node, options?: DomToImageOptions): Promise<string>;
    };

    export = domtoimage;
}
