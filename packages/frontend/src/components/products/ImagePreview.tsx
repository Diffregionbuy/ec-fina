import React, { useState } from 'react';
import { Package, AlertCircle } from 'lucide-react';

interface ImagePreviewProps {
  url: string;
  alt: string;
}

export const ImagePreview: React.FC<ImagePreviewProps> = ({ url, alt }) => {
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);

  const handleImageLoad = () => {
    setImageLoading(false);
    setImageError(false);
  };

  const handleImageError = () => {
    setImageLoading(false);
    setImageError(true);
  };

  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
      <h4 className="text-sm font-medium text-gray-700 mb-2">Image Preview</h4>
      
      <div className="relative w-full max-w-xs mx-auto">
        <div className="aspect-video w-full bg-white rounded border overflow-hidden">
          {imageLoading && (
            <div className="w-full h-full flex items-center justify-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            </div>
          )}
          
          {imageError ? (
            <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
              <AlertCircle className="h-8 w-8 mb-2" />
              <p className="text-xs text-center">Failed to load image</p>
              <p className="text-xs text-center mt-1">Check if the URL is valid</p>
            </div>
          ) : (
            <img
              src={url}
              alt={alt}
              onLoad={handleImageLoad}
              onError={handleImageError}
              className={`w-full h-full object-cover ${imageLoading ? 'opacity-0' : 'opacity-100'}`}
            />
          )}
        </div>
      </div>
      
      <p className="text-xs text-gray-500 mt-2 break-all">{url}</p>
    </div>
  );
};