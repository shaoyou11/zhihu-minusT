import type { ImageSourcePropType } from 'react-native';
import type { AppIconName } from '@/modules/zhihu-app-icon';

export interface AppIconOption {
  id: AppIconName;
  label: string;
  source: ImageSourcePropType;
}

export const APP_ICON_OPTIONS: ReadonlyArray<AppIconOption> = [
  {
    id: 'default',
    label: '知乎蓝',
    source: require('@/assets/images/app-icons/default.png'),
  },
  {
    id: 'indigo',
    label: '极客靛',
    source: require('@/assets/images/app-icons/indigo.png'),
  },
  {
    id: 'mint',
    label: '薄荷青',
    source: require('@/assets/images/app-icons/mint.png'),
  },
  {
    id: 'emerald',
    label: '翡翠绿',
    source: require('@/assets/images/app-icons/emerald.png'),
  },
  {
    id: 'sunset',
    label: '落日橙',
    source: require('@/assets/images/app-icons/sunset.png'),
  },
  {
    id: 'sakura',
    label: '樱花粉',
    source: require('@/assets/images/app-icons/sakura.png'),
  },
  {
    id: 'peach',
    label: '蜜桃粉',
    source: require('@/assets/images/app-icons/peach.png'),
  },
  {
    id: 'rose',
    label: '玫瑰红',
    source: require('@/assets/images/app-icons/rose.png'),
  },
  {
    id: 'violet',
    label: '紫罗兰',
    source: require('@/assets/images/app-icons/violet.png'),
  },
  {
    id: 'slate',
    label: '静谧灰',
    source: require('@/assets/images/app-icons/slate.png'),
  },
  {
    id: 'aurora',
    label: '极光',
    source: require('@/assets/images/app-icons/aurora.png'),
  },
  {
    id: 'rainbow',
    label: '彩虹',
    source: require('@/assets/images/app-icons/rainbow.png'),
  },
];
