import React from 'react';

interface DescriptionRendererProps {
  text: string;
}

const DescriptionRenderer: React.FC<DescriptionRendererProps> = ({ text }) => {
  const renderText = (text: string) => {
    return text.split('\n').map((line, index) => (
      <React.Fragment key={index}>
        {line}
        {index < text.split('\n').length - 1 && <br />}
      </React.Fragment>
    ));
  };

  return (
    <div className="text-gray-300 text-sm mb-3">
      {renderText(text)}
    </div>
  );
};

export default DescriptionRenderer;