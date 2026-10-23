Pod::Spec.new do |s|
  s.name           = 'ZhihuAppIcon'
  s.version        = '1.0.0'
  s.summary        = 'Switches between bundled alternate app icons.'
  s.description    = 'Expo module used by Zhihu-- to select a bundled app icon.'
  s.author         = ''
  s.homepage       = 'https://github.com/huamurui/zhihu-minus-minus'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
