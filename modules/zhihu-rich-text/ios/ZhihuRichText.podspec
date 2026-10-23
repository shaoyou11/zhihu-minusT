require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name = 'ZhihuRichText'
  s.version = package['version']
  s.summary = 'Native continuous rich text flows for Zhihu--'
  s.description = s.summary
  s.license = { :type => 'GPL-3.0' }
  s.authors = { 'Zhihu--' => 'noreply@example.invalid' }
  s.homepage = 'https://github.com/huamurui/zhihu-minus-minus'
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.9'
  s.source = { :git => 'https://github.com/huamurui/zhihu-minus-minus.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'SDWebImageSVGCoder', '~> 1.7.0'
  s.source_files = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
