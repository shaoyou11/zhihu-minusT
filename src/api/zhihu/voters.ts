import apiClient from '../client';
import {
  buildVotePayload,
  type NormalizedVoteResult,
  normalizeVoteMutationResponse,
  type VoteContentType,
  type ZhihuVoteType,
} from './votePayload';

export type {
  NormalizedVoteResult,
  VoteContentType,
  ZhihuVoteType,
} from './votePayload';
export {
  getContentVoteCount,
  getContentVoteState,
  getVoteSuccessMessage,
} from './votePayload';

export interface ZhihuApiErrorDetail {
  code: number;
  name: string;
  message: string;
  [key: string]: unknown;
}

export interface ZhihuErrorResponse {
  error: ZhihuApiErrorDetail;
}

export interface ZhihuVoteResponse {
  success?: boolean;
  voting?: number;
  voteup_count?: number;
  [key: string]: unknown;
}

export interface ZhihuVoter {
  id: string;
  url_token?: string;
  name: string;
  avatar_url?: string;
  headline?: string;
  is_following?: boolean;
}

export interface ZhihuVotersResponse {
  data: ZhihuVoter[];
  paging?: {
    is_end?: boolean;
    next?: string;
  };
}

export const getAnswerVoters = async (
  id: string | number,
  limit = 20,
  offset = 0,
): Promise<ZhihuVotersResponse> => {
  const res = await apiClient.get<ZhihuVotersResponse>(
    `/answers/${id}/upvoters?limit=${limit}&offset=${offset}`,
  );
  return res.data;
};

export const getPinVoters = async (
  id: string | number,
  limit = 20,
  offset = 0,
): Promise<ZhihuVotersResponse> => {
  const res = await apiClient.get<ZhihuVotersResponse>(
    `/pins/${id}/upvoters?limit=${limit}&offset=${offset}`,
  );
  return res.data;
};

export const voteContent = async (
  id: string | number,
  type: VoteContentType,
  voteType: ZhihuVoteType,
): Promise<NormalizedVoteResult> => {
  if (type === 'pins') {
    if (voteType === 'like' || voteType === 'up') {
      const res = await apiClient.post<ZhihuVoteResponse>(
        `/pins/${id}/voters/up`,
        {
          not_sync_moments: true,
        },
      );
      return normalizeVoteMutationResponse(type, voteType, res.data);
    } else {
      const res = await apiClient.delete<ZhihuVoteResponse>(
        `/pins/${id}/voters/up`,
      );
      return normalizeVoteMutationResponse(type, voteType, res.data);
    }
  } else if (type === 'comments') {
    if (voteType === 'up' || voteType === 'like') {
      const res = await apiClient.post<ZhihuVoteResponse>(
        `/comments/${encodeURIComponent(String(id))}/like`,
      );
      return normalizeVoteMutationResponse(type, voteType, res.data);
    } else {
      const res = await apiClient.delete<ZhihuVoteResponse>(
        `/comments/${encodeURIComponent(String(id))}/like`,
      );
      return normalizeVoteMutationResponse(type, voteType, res.data);
    }
  } else {
    const payload = buildVotePayload(type, voteType);
    const res = await apiClient.post<ZhihuVoteResponse>(
      `/${type}/${id}/voters`,
      payload,
    );
    return normalizeVoteMutationResponse(type, voteType, res.data);
  }
};
