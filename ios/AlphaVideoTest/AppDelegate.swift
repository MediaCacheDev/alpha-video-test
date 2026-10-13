import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)

    factory.startReactNative(
      withModuleName: "AlphaVideoTest",
      in: window,
      launchOptions: launchOptions
    )

    watchPixelTestLinks()
    return true
  }

  private var pixelTestTimer: Timer?
  private var lastPixelTestLink: String?

  /// The pixel-test driver (testing/pixels) writes each link to Documents/pixeltest/link.txt:
  /// `simctl openurl` would ask "Open in AlphaVideoTest?" every time.
  private func watchPixelTestLinks() {
    guard let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else { return }
    let folder = documents.appendingPathComponent("pixeltest")
    guard FileManager.default.fileExists(atPath: folder.path) else { return }
    let file = folder.appendingPathComponent("link.txt")
    pixelTestTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
      guard let self,
            let link = try? String(contentsOf: file, encoding: .utf8),
            link != self.lastPixelTestLink,
            let url = URL(string: link) else { return }
      self.lastPixelTestLink = link
      RCTLinkingManager.application(UIApplication.shared, open: url, options: [:])
    }
  }

  func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    RCTLinkingManager.application(app, open: url, options: options)
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
