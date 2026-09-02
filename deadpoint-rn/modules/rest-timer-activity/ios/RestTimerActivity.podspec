Pod::Spec.new do |s|
  s.name           = 'RestTimerActivity'
  s.version        = '1.0.0'
  s.summary        = 'A sample project summary'
  s.description    = 'A sample project description'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '16.4',
    :tvos => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  # RestTimerAttributes lives in the widget target's _shared/ folder (compiled
  # there and into the main app target by @bacons/apple-targets' _shared
  # convention). This pod is a third, separate compilation unit that also
  # needs to see that type at compile time. CocoaPods' source_files glob must
  # stay inside the pod root and Ruby's Dir.glob("**/*") won't recurse into a
  # symlinked *directory* — so `ios/TimerActivity.swift` is a symlink straight
  # to the real file (glob matches a symlinked file fine), keeping it a
  # single file on disk, not a copy.
  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
