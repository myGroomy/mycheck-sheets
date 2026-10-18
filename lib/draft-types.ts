export type ShiftDraftPoint = {
  value?: string;
  selectedOptions?: string[];
  combinedValues?: Record<string, unknown>;
  photoIds?: string[];
};

export type ShiftDraftPayload = {
  shiftInstanceId: string;
  userId: string;
  shiftDate: string;
  updatedAt: number;
  points: Record<string, ShiftDraftPoint>;
};

export type ShiftDraftRecord = ShiftDraftPayload & {
  id: string;
  createdAt: string;
  updatedAt: string;
};
