'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { OnboardingTour } from '@/components/OnboardingTour';
import { ComponentIntro } from '@/components/ComponentIntro';
import { useAuth } from '@/lib/AuthContext';
import {
  getTourStepsForRole,
  isTourDone,
  markTourDone,
  isIntroDone,
  markIntroDone,
  markOnboardingDone,
  COMPONENT_INTRO_SLIDES,
} from '@/lib/tour';

type TourContextValue = { openTour: () => void; closeTour: () => void; isTourOpen: boolean };
const TourContext = createContext<TourContextValue | undefined>(undefined);

export function TourProvider({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  // Urutan onboarding: intro komponen dulu, lalu spotlight tour.
  const [phase, setPhase] = useState<'idle' | 'intro' | 'tour'>('idle');
  const steps = useMemo(() => getTourStepsForRole(user?.role), [user?.role]);

  useEffect(() => {
    if (loading || !user || phase !== 'idle') return;
    if (!isIntroDone()) {
      setPhase('intro');
      return;
    }
    if (!isTourDone()) {
      const timer = window.setTimeout(() => setPhase('tour'), 700);
      return () => window.clearTimeout(timer);
    }
  }, [loading, user, phase]);

  const openTour = () => setPhase(isIntroDone() ? 'tour' : 'intro');
  const closeTour = () => {
    markTourDone();
    setPhase('idle');
  };

  const finishIntro = () => {
    markIntroDone();
    setPhase('tour');
  };
  const skipAll = () => {
    markOnboardingDone();
    setPhase('idle');
  };

  return (
    <TourContext.Provider value={{ openTour, closeTour, isTourOpen: phase !== 'idle' }}>
      {children}
      {phase === 'intro' && (
        <ComponentIntro slides={COMPONENT_INTRO_SLIDES} onDone={finishIntro} onSkipAll={skipAll} />
      )}
      {phase === 'tour' && <OnboardingTour steps={steps} onClose={closeTour} />}
    </TourContext.Provider>
  );
}

export function useTour() {
  const context = useContext(TourContext);
  if (!context) throw new Error('useTour must be used within TourProvider');
  return context;
}
