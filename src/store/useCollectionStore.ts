import { create } from 'zustand';

interface CollectionState {
  toastVisible: boolean;
  toastMessage: string;
  toastContentId: string | number | null;
  toastContentType: 'answer' | 'article' | null;

  selectorVisible: boolean;
  selectorContentId: string | number | null;
  selectorContentType: 'answer' | 'article' | null;

  collectedStatusMap: Record<string, boolean>; // id -> isCollected
  collectedCountOffsetMap: Record<string, number>; // id -> offset delta

  showToast: (
    contentId: string | number,
    contentType: 'answer' | 'article',
    message: string,
  ) => void;
  hideToast: () => void;
  openSelector: (
    contentId: string | number,
    contentType: 'answer' | 'article',
  ) => void;
  closeSelector: () => void;
  setCollectedStatus: (id: string | number, status: boolean) => void;
  updateCollectedCountOffset: (id: string | number, delta: number) => void;
  resetSession: () => void;
}

const emptySession = () => ({
  toastVisible: false,
  toastMessage: '',
  toastContentId: null,
  toastContentType: null,

  selectorVisible: false,
  selectorContentId: null,
  selectorContentType: null,

  collectedStatusMap: {},
  collectedCountOffsetMap: {},
});

export const useCollectionStore = create<CollectionState>((set) => ({
  ...emptySession(),
  showToast: (contentId, contentType, message) =>
    set({
      toastVisible: true,
      toastMessage: message,
      toastContentId: contentId,
      toastContentType: contentType,
    }),
  hideToast: () => set({ toastVisible: false }),
  openSelector: (contentId, contentType) =>
    set({
      selectorVisible: true,
      selectorContentId: contentId,
      selectorContentType: contentType,
      toastVisible: false, // Close toast when showing selector
    }),
  closeSelector: () =>
    set({
      selectorVisible: false,
      selectorContentId: null,
      selectorContentType: null,
    }),
  setCollectedStatus: (id, status) =>
    set((state) => ({
      collectedStatusMap: {
        ...state.collectedStatusMap,
        [id.toString()]: status,
      },
    })),
  updateCollectedCountOffset: (id, delta) =>
    set((state) => {
      const idStr = id.toString();
      const currentOffset = state.collectedCountOffsetMap[idStr] || 0;
      return {
        collectedCountOffsetMap: {
          ...state.collectedCountOffsetMap,
          [idStr]: currentOffset + delta,
        },
      };
    }),
  resetSession: () => set(emptySession()),
}));
