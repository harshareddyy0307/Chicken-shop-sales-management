import React, { createContext, useContext, useState } from 'react';
import { getTodayDateString, isFutureDate } from '../utils/format';

interface DateContextType {
  selectedDate: string;
  setSelectedDate: (date: string) => boolean | void;
  resetToToday: () => void;
  isToday: boolean;
}

const DateContext = createContext<DateContextType | undefined>(undefined);

export const DateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selectedDate, setSelectedDateState] = useState<string>(getTodayDateString());

  const setSelectedDate = (date: string) => {
    if (isFutureDate(date)) {
      return false;
    }
    setSelectedDateState(date);
    return true;
  };

  const resetToToday = () => {
    setSelectedDateState(getTodayDateString());
  };

  const isToday = selectedDate === getTodayDateString();

  return (
    <DateContext.Provider value={{ selectedDate, setSelectedDate, resetToToday, isToday }}>
      {children}
    </DateContext.Provider>
  );
};

export const useBusinessDate = () => {
  const context = useContext(DateContext);
  if (!context) {
    throw new Error('useBusinessDate must be used within a DateProvider');
  }
  return context;
};
