/** Modulweiter Zustand des Plan-Editors: ist das Fenster offen, welcher Plan ist gewählt? */
import { createStore } from 'zustand/vanilla';

export interface PlanUiState { open: boolean; planId: string | null }
export const planUi = createStore<PlanUiState>(() => ({ open: false, planId: null }));
export const openPlan = (planId?: string): void => planUi.setState((s) => ({ open: true, planId: planId ?? s.planId }));
export const closePlan = (): void => planUi.setState({ open: false });
