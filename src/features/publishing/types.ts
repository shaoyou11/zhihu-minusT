import type { LocalImageAsset, UploadedImage } from '@/api/zhihu/image';
import type { PublishingDocument } from './document';

export interface PublishingDraftScope {
  accountKey: string;
  kind: 'answer' | 'article' | 'question' | 'pin';
  target: string;
  generation?: number;
}

export interface PublishingMediaItem {
  id: string;
  asset: LocalImageAsset;
  status: 'failed' | 'uploading' | 'uploaded';
  uploaded?: UploadedImage;
  inserted?: boolean;
}

export interface PublishingDraftValue {
  pinDraftId?: string;
  pinSourceData?: Record<string, unknown>;
  title: string;
  content: string;
  topics: string;
  images: UploadedImage[];
  media: PublishingMediaItem[];
  document: PublishingDocument | null;
}

export function emptyPublishingDraft(): PublishingDraftValue {
  return {
    title: '',
    content: '',
    topics: '',
    images: [],
    media: [],
    document: null,
  };
}
