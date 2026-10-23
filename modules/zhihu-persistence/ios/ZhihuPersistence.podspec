Pod::Spec.new do |s|
  s.name = 'ZhihuPersistence'
  s.version = '1.0.0'
  s.summary = 'Atomic private app file persistence.'
  s.description = 'Atomically replaces private files without exposing their contents.'
  s.author = ''
  s.homepage = 'https://github.com/huamurui/zhihu-minus-minus'
  s.platforms = { :ios => '16.4' }
  s.source = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
