'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { OnboardingTour } from '@/components/OnboardingTour';
import { useAuth } from '@/lib/AuthContext';
import { getTourStepsForRole, isTourDone, markTourDone } from '@/lib/tour';

type TourContextValue = { openTour: () => void; closeTour: () => void; isTourOpen: boolean };
const TourContext = createContext<TourContextValue | undefined>(undefined);

export function TourProvider({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const steps = useMemo(() => getTourStepsForRole(user?.role), [user?.role]);

  useEffect(() => {
    if (loading || !user || isTourDone()) return;
    const timer = window.setTimeout(() => setOpen(true), 700);
    return () => window.clearTimeout(timer);
  }, [loading, user]);

  const closeTour = () => {
    markTourDone();
    setOpen(false);
  };

  return (
    <TourContext.Provider value={{ openTour: () => setOpen(true), closeTour, isTourOpen: open }}>
      {children}
      {open && <OnboardingTour steps={steps} onClose={closeTour} />}
    </TourContext.Provider>
  );
}

export function useTour() {
  const context = useContext(TourContext);
  if (!context) throw new Error('useTour must be used within TourProvider');
  return context;
}

