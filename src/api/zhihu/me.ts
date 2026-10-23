import type { ZhihuMemberRelation, ZhihuPaging } from '@/types/zhihu';
import apiClient from '../client';

export interface ZhihuMeInfo {
  id: string;
  url_token: string;
  name: string;
  use_default_avatar: boolean;
  avatar_url: string;
  avatar_url_template: string;
  is_org: boolean;
  type: string;
  url: string;
  user_type: string;
  headline: string;
  headline_render: string;
  gender: number;
  is_advertiser: boolean;
  ad_type: string;
  ip_info: string;
  vip_info: {
    is_vip: boolean;
    vip_type: number;
    rename_days: string;
    entrance_v2: null;
    rename_frequency: number;
    rename_await_days: number;
  };
  kvip_info: {
    is_vip: boolean;
  };
  account_status: Array<Record<string, string | number | boolean | null>>;
  is_force_renamed: boolean;
  is_destroy_waiting: boolean;
  answer_count: number;
  question_count: number;
  articles_count: number;
  columns_count: number;
  zvideo_count: number;
  favorite_count: number;
  pins_count: number;
  voteup_count: number;
  thanked_count: number;
  line_comment_count: number;
  line_like_count: number;
  line_comment_only_count: number;
  following_question_count: number;
  available_medals_count: number;
  org_verify_status: null;
  uid: string;
  email: string;
  renamed_fullname: string;
  default_notifications_count: number;
  follow_notifications_count: number;
  vote_thank_notifications_count: number;
  messages_count: number;
  draft_count: number;
  creation_count: number;
  is_bind_phone: boolean;
  is_realname: boolean;
  has_applying_column: boolean;
  has_add_baike_summary_permission: boolean;
  editor_info: string[];
  available_message_types: string[];
  ai_assistant_info: null;
  can_create_sub_account: boolean;
  account_type: number;
  sub_account_control_status: number;
}

export const getMe = async (): Promise<ZhihuMeInfo> => {
  const include =
    'id,ad_type,email,account_status,is_bind_phone,available_message_types,default_notifications_count,follow_notifications_count,vote_thank_notifications_count,messages_count,is_org,avatar_url,name,url_token,draft_count,following_question_count,is_realname,is_force_renamed,renamed_fullname,is_destroy_waiting';
  const res = await apiClient.get<ZhihuMeInfo>(`/me?include=${include}`);
  return res.data;
};

export const getMyLikes = async (
  type: 'answers' | 'articles',
  limit = 20,
  offset = 0,
): Promise<{ data: ZhihuMemberRelation[]; paging: ZhihuPaging }> => {
  const endpoint = type === 'answers' ? 'voted_answers' : 'voted_articles';
  const include =
    'data[*].content,voteup_count,comment_count,created_time,updated_time,excerpt,question.title,relationship.voting';
  const res = await apiClient.get<{
    data: ZhihuMemberRelation[];
    paging: ZhihuPaging;
  }>(
    `/members/me/${endpoint}?limit=${limit}&offset=${offset}&include=${include}`,
  );
  return res.data;
};
