import { useContentActions } from '@/hooks/useContentActions';
import type {
  ContentShareData,
  ContentShareType,
} from '@/utils/contentActions';
import { ActionSheet, type ActionSheetOption } from './overlays/ActionSheet';

export type ShareContentType = ContentShareType;

interface ShareMenuProps {
  visible: boolean;
  onClose: () => void;
  type: ShareContentType;
  data: ContentShareData | null;
  additionalOptions?: ActionSheetOption[];
}

/** Every share or copy format is an immediate action in the same content menu. */
export function ShareMenu({
  visible,
  onClose,
  type,
  data,
  additionalOptions,
}: ShareMenuProps) {
  const { actions, actionContextKey } = useContentActions({
    type,
    data,
    enabled: visible,
    additionalOptions,
  });
  if (!data) return null;
  return (
    <ActionSheet
      visible={visible}
      onClose={onClose}
      title="更多操作"
      actionContextKey={actionContextKey}
      options={actions}
    />
  );
}
