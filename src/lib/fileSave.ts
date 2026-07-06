export async function saveBlob(blob: Blob, filename: string, ext: string, label: string): Promise<boolean> {
    const baseMime = blob.type.split(';')[0].trim() || 'application/octet-stream';
    const doAnchorDownload = () => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    };
    try {
        const w = window as unknown as { showSaveFilePicker?: (opts: unknown) => Promise<{ createWritable: () => Promise<{ write: (d: Blob) => Promise<void>; close: () => Promise<void> }> }> };
        if (w.showSaveFilePicker) {
            try {
                const handle = await w.showSaveFilePicker({
                    suggestedName: filename,
                    types: [{ description: label, accept: { [baseMime]: [ext] } }],
                });
                const writable = await handle.createWritable();
                await writable.write(blob);
                await writable.close();
                return true;
            } catch (pickerErr) {
                if (pickerErr instanceof DOMException && pickerErr.name === 'AbortError') return false;
                console.warn('showSaveFilePicker failed, falling back to anchor download:', pickerErr);
                doAnchorDownload();
                return true;
            }
        } else {
            doAnchorDownload();
        }
        return true;
    } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return false;
        throw err;
    }
}
