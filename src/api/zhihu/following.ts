import type { ZhihuAuthor, ZhihuPaging } from '@/types/zhihu';
import apiClient from '../client';

export interface ZhihuFollowingColumnItem {
  id: string;
  title: string;
  intro: string;
  excerpt: string;
  image_url: string;
  url: string;
  type: 'column';
  column_type: string;
  updated: number;
  voteup_count: number;
  followers: number;
  articles_count: number;
  items_count: number;
  purchase_count: number;
  accept_submission: boolean;
  comment_permission: string;
  author: ZhihuAuthor;
}

export interface ZhihuFollowingColumnsResponse {
  paging: ZhihuPaging;
  data: ZhihuFollowingColumnItem[];
}

export interface ZhihuTopic {
  id: string;
  type: 'topic';
  url: string;
  name: string;
  avatar_url: string;
  meta_avatar_url: string;
  excerpt: string;
  introduction: string;
  category: string;
  is_black: boolean;
  is_vote: boolean;
  is_following: boolean;
  is_super_topic_vote: boolean;
  followers_count: number;
  questions_count: number;
  discuss_count: number;
  total_pv: number;
}

export interface ZhihuFollowingTopicContributionItem {
  topic: ZhihuTopic;
  contributions_count: number;
}

export interface ZhihuFollowingTopicsContributionsResponse {
  paging: ZhihuPaging;
  data: ZhihuFollowingTopicContributionItem[];
}

export interface ZhihuFollowingQuestionItem {
  id: string | number;
  type: 'question';
  title: string;
  url: string;
  created: number;
  updated_time: number;
  answer_count: number;
  follower_count: number;
  question_type: string;
  author: ZhihuAuthor;
}

export interface ZhihuFollowingQuestionsResponse {
  paging: ZhihuPaging;
  data: ZhihuFollowingQuestionItem[];
}

/**
 * 获取用户关注的专栏
 * GET /members/{id}/following-columns
 */
export const getMemberFollowingColumns = async (
  memberId: string | number,
  offset = 0,
  limit = 20,
): Promise<ZhihuFollowingColumnsResponse> => {
  const include =
    'data[*].intro,followers,articles_count,voteup_count,items_count';
  const res = await apiClient.get(`/members/${memberId}/following-columns`, {
    params: {
      include,
      offset,
      limit,
    },
  });
  return res.data;
};

/**
 * 获取用户关注的话题
 * GET /topics/{id}/following_topics_contributions
 * 注意：由于接口请求路径在 api/v5.1/topics，如果 client 有 baseUrl 且配置了前缀，这里可以使用绝对或相对路径
 */
export const getMemberFollowingTopics = async (
  memberId: string | number,
  offset = 0,
  limit = 20,
): Promise<ZhihuFollowingTopicsContributionsResponse> => {
  const include = 'data[*].topic.introduction';
  const res = await apiClient.get(
    `https://www.zhihu.com/api/v5.1/topics/${memberId}/following_topics_contributions`,
    {
      params: {
        include,
        offset,
        limit,
      },
    },
  );
  return res.data;
};

/**
 * 获取用户关注的问题
 * GET /members/{id}/following-questions
 */
export const getMemberFollowingQuestions = async (
  memberId: string | number,
  offset = 0,
  limit = 20,
): Promise<ZhihuFollowingQuestionsResponse> => {
  const include = 'data[*].created,answer_count,follower_count,author';
  const res = await apiClient.get(`/members/${memberId}/following-questions`, {
    params: {
      include,
      offset,
      limit,
    },
  });
  return res.data;
};

export interface ZhihuFollowingFavlistCreator {
  id: string;
  name: string;
  avatar_url: string;
  headline?: string;
  url_token: string;
}

export interface ZhihuFollowingFavlistItem {
  id: number;
  title: string;
  description: string;
  url: string;
  answer_count: number;
  follower_count: number;
  comment_count: number;
  updated_time: number;
  created_time: number;
  is_following: boolean;
  is_public: boolean;
  type: 'collection';
  creator: ZhihuFollowingFavlistCreator;
}

export interface ZhihuFollowingFavlistsResponse {
  paging: ZhihuPaging;
  data: ZhihuFollowingFavlistItem[];
}

/**
 * 获取用户关注的收藏夹
 * GET /members/{id}/following-favlists
 */
export const getMemberFollowingFavlists = async (
  memberId: string | number,
  offset = 0,
  limit = 20,
): Promise<ZhihuFollowingFavlistsResponse> => {
  const include =
    'data[*].updated_time,answer_count,follower_count,creator,description,is_following,comment_count,created_time';
  const res = await apiClient.get(`/members/${memberId}/following-favlists`, {
    params: {
      include,
      offset,
      limit,
    },
  });
  return res.data;
};
