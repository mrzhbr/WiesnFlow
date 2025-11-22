import React, { createContext, useContext, useState, ReactNode } from 'react';

interface SecurityModeContextType {
  isSecurityMode: boolean;
  toggleSecurityMode: () => void;
}

const SecurityModeContext = createContext<SecurityModeContextType | undefined>(undefined);

export const SecurityModeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isSecurityMode, setIsSecurityMode] = useState(false);

  const toggleSecurityMode = () => {
    setIsSecurityMode(prev => !prev);
  };

  return (
    <SecurityModeContext.Provider value={{ isSecurityMode, toggleSecurityMode }}>
      {children}
    </SecurityModeContext.Provider>
  );
};

export const useSecurityMode = () => {
  const context = useContext(SecurityModeContext);
  if (context === undefined) {
    throw new Error('useSecurityMode must be used within a SecurityModeProvider');
  }
  return context;
};
