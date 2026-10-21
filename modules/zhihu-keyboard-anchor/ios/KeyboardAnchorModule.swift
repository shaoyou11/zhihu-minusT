import ExpoModulesCore
import UIKit

public final class KeyboardAnchorModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ZhihuKeyboardAnchor")
    View(KeyboardAnchorView.self) {
      Events("onOverlapChange")
    }
  }
}

/// UIKit converts the keyboard into this sheet's coordinates, including detent animations.
public final class KeyboardAnchorView: ExpoView {
  private let onOverlapChange = EventDispatcher()
  private let probe = UIView()
  private var lastOverlap: CGFloat = -1

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    isUserInteractionEnabled = false
    probe.translatesAutoresizingMaskIntoConstraints = false
    probe.isUserInteractionEnabled = false
    addSubview(probe)
    keyboardLayoutGuide.followsUndockedKeyboard = false
    NSLayoutConstraint.activate([
      probe.topAnchor.constraint(equalTo: keyboardLayoutGuide.topAnchor),
      probe.leadingAnchor.constraint(equalTo: leadingAnchor),
      probe.widthAnchor.constraint(equalToConstant: 0),
      probe.heightAnchor.constraint(equalToConstant: 0)
    ])
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    guard window != nil, bounds.height > 0 else { return }
    let frame = keyboardLayoutGuide.layoutFrame
    // With the keyboard hidden, UIKit's guide only covers the bottom safe area.
    let overlap = frame.height > safeAreaInsets.bottom + 1
      ? max(0, bounds.maxY - frame.minY) : 0
    guard abs(overlap - lastOverlap) > 0.5 else { return }
    lastOverlap = overlap
    onOverlapChange(["height": overlap])
  }
}
