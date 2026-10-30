import { Modal, type ModalProps } from 'react-native';
import {
  PaneContext,
  PaneVisibilityContext,
  usePaneVisible,
} from './PaneContext';

/** Hide retained routes' native portals without changing their open state. */
export function PaneModal({ visible = true, children, ...props }: ModalProps) {
  const paneVisible = usePaneVisible();
  const presented = visible && paneVisible;
  return (
    <Modal {...props} visible={presented}>
      <PaneVisibilityContext.Provider value={presented}>
        <PaneContext.Provider value={null}>{children}</PaneContext.Provider>
      </PaneVisibilityContext.Provider>
    </Modal>
  );
}
