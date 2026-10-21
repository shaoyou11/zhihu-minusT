# 原生键盘参考线

iOS 评论浮层使用 UIKit keyboardLayoutGuide 在自身坐标内计算遮挡高度，包含半屏切换和键盘动画；不参与触摸或渲染。键盘隐藏时排除安全区。Android 继续使用页面测量。修改后必须 Expo prebuild，并由 iPhone CI 编译验证。
