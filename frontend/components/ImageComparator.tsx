import React from 'react';

interface ImageComparatorProps {
    originalSrc: string;
    currentSrc: string;
    onImageLoad: (e: React.SyntheticEvent<HTMLImageElement>) => void;
    imgRef: React.RefObject<HTMLImageElement>;
}

const ImageComparator: React.FC<ImageComparatorProps> = ({ originalSrc, currentSrc, onImageLoad, imgRef }) => {
    return (
        <div className="flex justify-center items-center w-full h-full gap-4 p-4"> {/* Centered, side-by-side, with gap */}
            <div className="flex-1 flex justify-end"> {/* Right align original image within its flex item */}
                <img
                    src={originalSrc}
                    alt="Original"
                    className="max-h-[75vh] object-contain rounded-xl" // Removed w-full to allow natural sizing, added max-h
                />
            </div>
            <div className="flex-1 flex justify-start"> {/* Left align current image within its flex item */}
                <img
                    ref={imgRef}
                    src={currentSrc}
                    alt="Atual"
                    onLoad={onImageLoad}
                    className="max-h-[75vh] object-contain rounded-xl" // Removed w-full to allow natural sizing, added max-h
                />
            </div>
        </div>
    );
};

export default ImageComparator;
