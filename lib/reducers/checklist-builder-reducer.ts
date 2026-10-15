// lib/reducers/checklist-builder-reducer.ts
// Reducer untuk ChecklistBuilderPage — menggantikan 20+ useState hooks.

import type { AdminBranch, ChecklistPoint, ShiftDefinition, SopCategory } from '../admin/api';

export interface ChecklistBuilderState {
  // Data
  branches: AdminBranch[];
  branchId: string;
  shifts: ShiftDefinition[];
  shiftId: string;
  categories: (SopCategory & { points: ChecklistPoint[] })[];

  // Selection
  selectedCategoryId: string | null;
  selectedPointId: string | null;

  // UI State
  loading: boolean;
  categoryOpen: boolean;
  editingCategory: SopCategory | null;
  pointOpen: boolean;
  editingPoint: ChecklistPoint | null;
  previewOpen: boolean;

  // Form Drafts
  categoryName: string;
  categorySort: number;
  categoryActive: boolean;
  pointTitle: string;
  pointInstruction: string;

  // Inline Edit
  editingTitle: boolean;
  titleDraft: string;
  editingInstruction: boolean;
  instructionDraft: string;

  // Feedback
  savingCategory: boolean;
  categoryError: string | null;
  savingPoint: boolean;
  pointError: string | null;
  savingInline: boolean;
  busyId: string | null;
  showArchived: boolean;
  archiveQuery: string;

  // Delete
  deleteTarget: { kind: 'category' | 'point'; id: string; name: string } | null;
  deleteError: string | null;
  deleteLoading: boolean;
}

export const INITIAL_CHECKLIST_BUILDER_STATE: ChecklistBuilderState = {
  branches: [],
  branchId: '',
  shifts: [],
  shiftId: '',
  categories: [],
  selectedCategoryId: null,
  selectedPointId: null,
  loading: false,
  categoryOpen: false,
  editingCategory: null,
  pointOpen: false,
  editingPoint: null,
  previewOpen: false,
  categoryName: '',
  categorySort: 0,
  categoryActive: true,
  pointTitle: '',
  pointInstruction: '',
  editingTitle: false,
  titleDraft: '',
  editingInstruction: false,
  instructionDraft: '',
  savingCategory: false,
  categoryError: null,
  savingPoint: false,
  pointError: null,
  savingInline: false,
  busyId: null,
  showArchived: false,
  archiveQuery: '',
  deleteTarget: null,
  deleteError: null,
  deleteLoading: false,
};

export type ChecklistBuilderAction =
  | { type: 'SET_DATA'; payload: Partial<ChecklistBuilderState> }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SELECT_CATEGORY'; payload: string | null }
  | { type: 'SELECT_POINT'; payload: string | null }
  | { type: 'START_EDIT_CATEGORY'; payload: SopCategory }
  | { type: 'CANCEL_EDIT_CATEGORY' }
  | { type: 'START_EDIT_POINT'; payload: ChecklistPoint }
  | { type: 'CANCEL_EDIT_POINT' }
  | { type: 'UPDATE_CATEGORY_DRAFT'; payload: Partial<Pick<ChecklistBuilderState, 'categoryName' | 'categorySort' | 'categoryActive'>> }
  | { type: 'UPDATE_INLINE_DRAFT'; payload: Partial<Pick<ChecklistBuilderState, 'titleDraft' | 'instructionDraft'>> }
  | { type: 'START_INLINE_EDIT_TITLE'; payload: string }
  | { type: 'START_INLINE_EDIT_INSTRUCTION'; payload: string }
  | { type: 'CANCEL_INLINE_EDIT' }
  | { type: 'SET_SAVING'; payload: { field: 'category' | 'point' | 'inline'; value: boolean } }
  | { type: 'SET_ERROR'; payload: { field: 'category' | 'point'; value: string | null } }
  | { type: 'SET_BUSY_ID'; payload: string | null }
  | { type: 'SET_DELETE_TARGET'; payload: ChecklistBuilderState['deleteTarget'] }
  | { type: 'SET_ARCHIVE'; payload: { showArchived: boolean; query: string } }
  | { type: 'TOGGLE_CATEGORY_FORM'; payload: { open: boolean; category: SopCategory | null } }
  | { type: 'TOGGLE_POINT_FORM'; payload: { open: boolean; point: ChecklistPoint | null; categoryId: string | null } }
  | { type: 'TOGGLE_PREVIEW'; payload: boolean };

export function checklistBuilderReducer(
  state: ChecklistBuilderState,
  action: ChecklistBuilderAction,
): ChecklistBuilderState {
  switch (action.type) {
    case 'SET_DATA':
      return { ...state, ...action.payload };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SELECT_CATEGORY':
      return { ...state, selectedCategoryId: action.payload, selectedPointId: null };
    case 'SELECT_POINT':
      return { ...state, selectedPointId: action.payload };
    case 'START_EDIT_CATEGORY':
      return {
        ...state,
        categoryOpen: true,
        editingCategory: action.payload,
        categoryName: action.payload.name,
        categorySort: action.payload.sortOrder ?? 0,
        categoryActive: action.payload.isActive,
        categoryError: null,
      };
    case 'CANCEL_EDIT_CATEGORY':
      return { ...state, categoryOpen: false, editingCategory: null, categoryError: null };
    case 'START_EDIT_POINT':
      return {
        ...state,
        pointOpen: true,
        editingPoint: action.payload,
        pointTitle: action.payload.title,
        pointInstruction: action.payload.instruction ?? '',
        pointError: null,
      };
    case 'CANCEL_EDIT_POINT':
      return { ...state, pointOpen: false, editingPoint: null, pointError: null };
    case 'UPDATE_CATEGORY_DRAFT':
      return { ...state, ...action.payload, categoryError: null };
    case 'UPDATE_INLINE_DRAFT':
      return { ...state, ...action.payload };
    case 'START_INLINE_EDIT_TITLE':
      return { ...state, editingTitle: true, titleDraft: action.payload };
    case 'START_INLINE_EDIT_INSTRUCTION':
      return { ...state, editingInstruction: true, instructionDraft: action.payload };
    case 'CANCEL_INLINE_EDIT':
      return { ...state, editingTitle: false, editingInstruction: false, titleDraft: '', instructionDraft: '' };
    case 'SET_SAVING': {
      const { field, value } = action.payload;
      if (field === 'category') return { ...state, savingCategory: value };
      if (field === 'point') return { ...state, savingPoint: value };
      return { ...state, savingInline: value };
    }
    case 'SET_ERROR': {
      const { field, value } = action.payload;
      if (field === 'category') return { ...state, categoryError: value };
      return { ...state, pointError: value };
    }
    case 'SET_BUSY_ID':
      return { ...state, busyId: action.payload };
    case 'SET_DELETE_TARGET':
      return { ...state, deleteTarget: action.payload, deleteError: null };
    case 'SET_ARCHIVE':
      return { ...state, showArchived: action.payload.showArchived, archiveQuery: action.payload.query };
    case 'TOGGLE_CATEGORY_FORM': {
      const { open, category } = action.payload;
      if (open && category) {
        return {
          ...state,
          categoryOpen: true,
          editingCategory: category,
          categoryName: category.name,
          categorySort: category.sortOrder ?? 0,
          categoryActive: category.isActive,
          categoryError: null,
        };
      }
      return { ...state, categoryOpen: false, editingCategory: null, categoryError: null };
    }
    case 'TOGGLE_POINT_FORM': {
      const { open, point, categoryId } = action.payload;
      if (open && point) {
        return {
          ...state,
          pointOpen: true,
          editingPoint: point,
          pointTitle: point.title,
          pointInstruction: point.instruction ?? '',
          pointError: null,
          pointCategoryId: categoryId,
        } as ChecklistBuilderState;
      }
      return { ...state, pointOpen: false, editingPoint: null, pointError: null } as ChecklistBuilderState;
    }
    case 'TOGGLE_PREVIEW':
      return { ...state, previewOpen: action.payload };
    default:
      return state;
  }
}
