// frontend/src/utils/imageUtils.ts

export const resizeAndPadDataUrl = (
    dataUrl: string, 
    targetWidth: number, 
    targetHeight: number, 
    resizeMode: 'crop' | 'pad' = 'crop',
    backgroundColor: string = '#FFFFFF'
): Promise<string> => {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = targetWidth;
                canvas.height = targetHeight;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    throw new Error("Não foi possível obter o contexto do canvas.");
                }

                // Fill background
                ctx.fillStyle = backgroundColor;
                ctx.fillRect(0, 0, targetWidth, targetHeight);
                ctx.imageSmoothingQuality = 'high';

                const { naturalWidth: iw, naturalHeight: ih } = image;
                
                if (resizeMode === 'pad') {
                    // 'pad' mode: fit the image inside the canvas and pad with background color
                    const hRatio = targetWidth / iw;
                    const vRatio = targetHeight / ih;
                    const ratio = Math.min(hRatio, vRatio);
                    const destWidth = iw * ratio;
                    const destHeight = ih * ratio;
                    const destX = (targetWidth - destWidth) / 2;
                    const destY = (targetHeight - destHeight) / 2;
                    ctx.drawImage(image, 0, 0, iw, ih, destX, destY, destWidth, destHeight);
                } else { 
                    // 'crop' mode (default): center-crop the image to fill the canvas
                    const iRatio = iw / ih;
                    const tRatio = targetWidth / targetHeight;

                    let sx = 0, sy = 0, sWidth = iw, sHeight = ih;

                    if (iRatio > tRatio) { // Source is wider
                        sWidth = ih * tRatio;
                        sx = (iw - sWidth) / 2;
                    } else if (iRatio < tRatio) { // Source is taller
                        sHeight = iw / tRatio;
                        sy = (ih - sHeight) / 2;
                    }
                    
                    ctx.drawImage(image, sx, sy, sWidth, sHeight, 0, 0, targetWidth, targetHeight);
                }
                
                resolve(canvas.toDataURL('image/png'));
            } catch (err) {
                reject(err);
            }
        };
        image.onerror = (err) => {
            reject(new Error("Falha ao carregar a imagem para redimensionamento."));
        };
        image.src = dataUrl;
    });
};

export const standardizeToPNG = (dataUrl: string): Promise<string> => {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = image.naturalWidth;
                canvas.height = image.naturalHeight;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    throw new Error("Could not get canvas context");
                }
                ctx.drawImage(image, 0, 0);
                resolve(canvas.toDataURL('image/png'));
            } catch (err) {
                reject(err);
            }
        };
        image.onerror = (err) => reject(new Error("Failed to load image for PNG standardization."));
        image.src = dataUrl;
    });
};